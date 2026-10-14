import { defineBackground } from 'wxt/utils/define-background';
import { parseAttach } from '../../core/messaging/meet-bridge';
import {
  createReceiver,
  parseCommand,
  parseOffscreenNotice,
  parseOffscreenRequest,
} from '../../core/messaging/protocol';
import type { ChatCredentialSource } from '../../core/chat/provider';
import { createLogger } from '../../core/log';
import { createChatProvider } from '../../providers/chat/factory';
import { LocalChatKeySource } from '../../providers/credentials/local-chat-key-source';
import { validatePendingKey } from '../../providers/credentials/validate-key';
import { ChatRepo } from '../../storage/chat-repo';
import { ContextRepo } from '../../storage/context-repo';
import { openLiveAssistDb, type LiveAssistDb } from '../../storage/db';
import { MeetingRepo } from '../../storage/meeting-repo';
import { SettingsStore } from '../../storage/settings-store';
import { answerAccountUsage } from './account';
import { answerChatKeyHints, validatePendingChatKey, type ValidateChatKeyDeps } from './chat-keys';
import { acceptChatPort, createChatSession, FIRST_TEXT_LIMIT_MS, type ChatSessionDeps } from './chat-session';
import { handleContextCommand } from './context-commands';
import { createForeignPorts } from './foreign-ports';
import { answerCredentialRequest, isOffscreenSender } from './credentials';
import {
  chromeTabCapture,
  createMeetingControl,
  isOffscreenOpen,
  onOffscreenClosed,
  showCaptionsSwitch,
  type MeetingSource,
  type TabCapture,
} from './meeting-control';

/** Side panel → service worker commands, validated at this boundary (contracts/extension-messages.md). */
const commands = createReceiver(parseCommand);

/**
 * e2e builds cannot click the toolbar icon, so no tab can be captured; the offscreen document there reads Chrome's
 * fake audio device instead of the tab and ignores this id (tasks T067).
 */
const e2eTabCapture: TabCapture = { streamIdFor: () => Promise.resolve('e2e-fake-tab-stream') };

/**
 * e2e builds only: the scenario a test stored as `e2eScenario` travels to the offscreen document as the meeting's
 * title, where the fixture provider picks its scripts by it (src/entrypoints/offscreen/e2e-provider.ts).
 */
async function e2eSource(tab: chrome.tabs.Tab): Promise<MeetingSource> {
  const { e2eScenario } = await chrome.storage.local.get('e2eScenario');
  const title = typeof e2eScenario === 'string' && e2eScenario !== '' ? e2eScenario : (tab.title ?? '');
  return { url: tab.url ?? '', title };
}

/**
 * 003: where chat providers come from. Production: the user's saved key (LocalChatKeySource). e2e builds: the scripted
 * fixture provider, imported only in that mode so it never reaches a production bundle.
 */
async function chatCredentials(): Promise<ChatCredentialSource> {
  const store = SettingsStore.fromChrome();
  if (import.meta.env.MODE === 'e2e') {
    const { e2eChatSource } = await import('./e2e-chat-source');
    return e2eChatSource(store, chrome.storage.local);
  }
  return new LocalChatKeySource({ readKey: (p) => store.readChatKey(p), fetch: (input, init) => fetch(input, init) });
}

/**
 * 003: the adapter a candidate chat key is checked with. e2e builds: the fixture provider's `checkKey` (by the
 * `e2eScenario` storage value), so no test reaches the network.
 */
async function chatKeyChecker(): Promise<ValidateChatKeyDeps['providerWithKey']> {
  if (import.meta.env.MODE === 'e2e') {
    const { e2eChatKeyChecker } = await import('./e2e-chat-source');
    return e2eChatKeyChecker(chrome.storage.local);
  }
  return (provider, key) => createChatProvider(provider, key, (input, init) => fetch(input, init));
}

let db: Promise<LiveAssistDb> | null = null;
const repos = async () => {
  const opened = await (db ??= openLiveAssistDb());
  return { meetings: new MeetingRepo(opened), chats: new ChatRepo(opened), contexts: new ContextRepo(opened) };
};

/** The chat session reads meetings and reads/writes chat turns; the database opens on first use. */
const chatStorage: Pick<ChatSessionDeps, 'meetings' | 'chats' | 'contexts'> = {
  contexts: { get: async (id) => (await repos()).contexts.get(id) },
  meetings: {
    getMeeting: async (id) => (await repos()).meetings.getMeeting(id),
    listSegments: async (id) => (await repos()).meetings.listSegments(id),
  },
  chats: {
    listTurns: async (id) => (await repos()).chats.listTurns(id),
    putTurn: async (turn) => (await repos()).chats.putTurn(turn),
    nextSeq: async (id) => (await repos()).chats.nextSeq(id),
    markStaleStreaming: async (now) => (await repos()).chats.markStaleStreaming(now),
  },
};

const chatLogger = createLogger('chat');
const notesLogger = createLogger('notes');

export default defineBackground(() => {
  // 003: the side panel's `chat` port (contracts/chat-messages.md). Other port names belong to the offscreen document.
  const foreignPorts = createForeignPorts({ offscreenOpen: isOffscreenOpen });
  onOffscreenClosed(() => foreignPorts.releaseAll());
  chrome.runtime.onConnect.addListener((port) => {
    acceptChatPort(port, {
      foreign: (p) => void foreignPorts.hold(p),
      runtimeId: chrome.runtime.id,
      sidePanelUrl: chrome.runtime.getURL('/sidepanel.html'),
      createSession: (post) => {
        let source: Promise<ChatCredentialSource> | null = null;
        return createChatSession({
          ...chatStorage,
          chatSettings: async () => (await SettingsStore.fromChrome().getSettings()).chat,
          credentials: {
            id: 'local-key',
            status: async (p) => (await (source ??= chatCredentials())).status(p),
            providerFor: async (p) => (await (source ??= chatCredentials())).providerFor(p),
          },
          now: () => Date.now(),
          logger: chatLogger,
          post,
          // e2e builds only: a test sets a short first-text limit (003 FR-018a). Production always uses the constant.
          ...(import.meta.env.MODE === 'e2e'
            ? {
                firstTextLimitMs: async () =>
                  (await import('./e2e-chat-source')).e2eFirstTextLimitMs(chrome.storage.local, FIRST_TEXT_LIMIT_MS),
              }
            : {}),
        });
      },
    });
  });

  // 008: pending notes move to the meeting that just started (research N1).
  const startHooks = {
    afterStart: async (meetingId: string) => {
      try {
        await (await repos()).contexts.applyPending(meetingId, Date.now());
      } catch {
        notesLogger.warn('pending notes not applied');
      }
    },
  };
  const meetings =
    import.meta.env.MODE === 'e2e'
      ? createMeetingControl(e2eTabCapture, e2eSource, startHooks)
      : createMeetingControl(chromeTabCapture, undefined, startHooks);

  // openPanelOnActionClick does not grant activeTab (T012, 2026-10-08), so tabCapture would fail.
  // Handling the click ourselves grants activeTab for the clicked tab; sidePanel.open must be
  // called synchronously here to keep the user gesture.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  chrome.action.onClicked.addListener((tab) => {
    void chrome.sidePanel.open(tab.id !== undefined ? { tabId: tab.id } : { windowId: tab.windowId });
  });

  // FR-023: the captured tab closing or leaving its site ends the meeting.
  chrome.tabs.onRemoved.addListener((tabId) => void meetings.onTabRemoved(tabId));
  chrome.tabs.onUpdated.addListener((tabId, change) => void meetings.onTabUpdated(tabId, change.url));

  // 002 FR-029: switching Settings → Show Meet captions shows or hides Meet's captions in a running meeting at once.
  chrome.storage.onChanged.addListener((changes, area) => {
    const show = showCaptionsSwitch(changes, area);
    if (show !== null) void meetings.showCaptions(show);
  });

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const fromOffscreen = isOffscreenSender(sender);
    const credentialRequest = fromOffscreen ? parseOffscreenRequest(message) : null;
    if (credentialRequest) {
      void answerCredentialRequest(credentialRequest).then(sendResponse);
      return true;
    }
    if (fromOffscreen && parseOffscreenNotice(message)) {
      void meetings.ended().then(sendResponse);
      return true;
    }
    // Spike builds only (retest 2026-10-08, T100): the meeting's alignment trace, saved when it ends. Compiled out of
    // production and e2e builds with the import.
    if (import.meta.env.MODE === 'spike' && fromOffscreen) {
      void import('./spike-trace-save')
        .then((m) =>
          m.saveTrace(message, {
            download: (f) => chrome.downloads.download({ ...f, saveAs: false }),
            now: () => new Date(),
          }),
        )
        .then(sendResponse, () => sendResponse(false));
      return true;
    }

    // The Meet content script asks on every load whether its tab is the running meeting's (002 meet-bridge.md).
    if (sender.tab?.id !== undefined && parseAttach(message)?.type === 'meet/ready') {
      void meetings.ready(sender.tab.id).then(sendResponse);
      return true;
    }

    const command = commands.accept(message);
    switch (command?.type) {
      case 'settings/validate-key':
        void validatePendingKey({
          store: SettingsStore.fromChrome(),
          fetch: (input, init) => fetch(input, init),
          now: () => Date.now(),
        }).then(sendResponse);
        return true;
      case 'settings/key-hint':
        // The panel never reads credentials (001 FR-003a): it gets only the last four characters, from here.
        void SettingsStore.fromChrome()
          .keyHint()
          .then((hint) => sendResponse({ hint }));
        return true;
      case 'settings/chat-key-hints':
        // FR-014a: last four characters only.
        void chatCredentials().then(answerChatKeyHints).then(sendResponse);
        return true;
      case 'settings/validate-chat-key':
        // FR-013: content-free check with the candidate; promote or discard; reply a hint or a kind.
        void chatKeyChecker()
          .then((providerWithKey) =>
            validatePendingChatKey(command.provider, { store: SettingsStore.fromChrome(), providerWithKey }),
          )
          .then(sendResponse, () => sendResponse({ ok: false, kind: 'unknown' }));
        return true;
      case 'account/usage':
        void answerAccountUsage({ store: SettingsStore.fromChrome(), fetch: (input, init) => fetch(input, init) }).then(
          sendResponse,
        );
        return true;
      case 'context/set':
      case 'context/remove':
        // 008: the service worker is the only writer of notes (research N1).
        void repos()
          .then(({ contexts, meetings: stored }) =>
            handleContextCommand(command, { contexts, meetings: stored, now: () => Date.now(), logger: notesLogger }),
          )
          .then(sendResponse, () => sendResponse({ ok: false, kind: 'save-failed' }));
        return true;
      case 'meeting/start':
        void meetings.start(command.tabId, command.language).then(sendResponse);
        return true;
      case 'meeting/stop':
        void meetings.stop().then(sendResponse);
        return true;
      default:
        return false;
    }
  });
});
