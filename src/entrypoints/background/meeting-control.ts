// Start/stop orchestration in the service worker (contracts/extension-messages.md, research R5 revised 2026-10-08).
// The service worker holds no audio: it checks settings, gets a tab-capture stream id, makes sure the offscreen
// document exists and hands the meeting to it. The running meeting is remembered in chrome.storage.session so a
// suspended-and-woken service worker still knows which tab to watch (FR-023) and what to refuse (one at a time).
import type { AttachMessage, ReadyReply } from '../../core/messaging/meet-bridge';
import type { BeginResult, StartError, StartResult, StopResult } from '../../core/messaging/protocol';
import { isMeetCallUrl } from '../../core/platform/meet-url';
import { planKeyterms } from '../../core/settings/keyterms';
import { isReadyToStart, parseSettings } from '../../core/settings/schema';
import type { EndReason, LanguageMode } from '../../core/transcript/model';
import { SETTINGS_KEY, SettingsStore } from '../../storage/settings-store';

export const OFFSCREEN_PATH = 'offscreen.html';
/**
 * After the offscreen document ends a meeting by itself, it stays open this long so a panel that connects late
 * still gets the final status with the reason (FR-022). A Start in the meantime reuses it.
 */
export const OFFSCREEN_LINGER_MS = 30_000;
const ACTIVE_KEY = 'activeMeeting';

interface ActiveMeeting {
  meetingId: string;
  tabId: number;
  title: string;
  /** Origin of the tab when Start was pressed; '' when Chrome did not tell us. */
  origin: string;
  /** A Meet call tab: its content script is attached to the meeting (002 contracts/meet-bridge.md). */
  bridged?: boolean;
}

/** Gets a stream id for a tab, or throws a StartFailure. Swapped for a fake in e2e builds (no toolbar click there). */
export interface TabCapture {
  streamIdFor(tab: chrome.tabs.Tab): Promise<string>;
}

export class StartFailure extends Error {
  constructor(readonly error: StartError) {
    super(error);
  }
}

const RESTRICTED_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'chrome-search:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'about:',
  'view-source:',
];

/** Pages Chrome never lets an extension capture (spec edge case: browser internal pages, the Web Store). */
export function isRestrictedUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (RESTRICTED_SCHEMES.includes(u.protocol)) return true;
  if (u.hostname === 'chromewebstore.google.com') return true;
  return u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore');
}

export const chromeTabCapture: TabCapture = {
  async streamIdFor(tab) {
    if (tab.url !== undefined && isRestrictedUrl(tab.url)) throw new StartFailure('tab-not-capturable');
    try {
      return await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id! });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Chrome's text names activeTab: the toolbar icon was not clicked on this tab (research R5, T012).
      if (/not been invoked/i.test(message)) throw new StartFailure('not-invoked');
      throw new StartFailure('tab-not-capturable');
    }
  },
};

const originOf = (url: string | undefined): string => {
  try {
    return url ? new URL(url).origin : '';
  } catch {
    return '';
  }
};

async function offscreenExists(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  return contexts.length > 0;
}

async function ensureOffscreen(): Promise<void> {
  if (await offscreenExists()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification:
      'Capture the meeting tab and microphone, keep the tab audible, and transcribe them mixed as one stream.',
  });
}

const closedListeners = new Set<() => void>();

/** 003: called after this module closes the offscreen document (foreign-ports.ts lets go of ports meant for it). */
export function onOffscreenClosed(listener: () => void): () => void {
  closedListeners.add(listener);
  return () => void closedListeners.delete(listener);
}

/** Whether the offscreen document is open now. */
export const isOffscreenOpen = (): Promise<boolean> => offscreenExists();

async function closeOffscreen(): Promise<void> {
  if (!(await offscreenExists())) return;
  await chrome.offscreen.closeDocument();
  for (const l of closedListeners) l();
}

async function getActive(): Promise<ActiveMeeting | null> {
  const raw = (await chrome.storage.session.get(ACTIVE_KEY))[ACTIVE_KEY] as ActiveMeeting | undefined;
  return raw ?? null;
}

const setActive = (m: ActiveMeeting) => chrome.storage.session.set({ [ACTIVE_KEY]: m });
const clearActive = () => chrome.storage.session.remove(ACTIVE_KEY);

/** Tells the Meet page's content script to attach or detach. A tab without one (closed, reloading) is not an error. */
async function tellMeetPage(tabId: number, message: AttachMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // No receiver: the page will ask with meet/ready when its content script loads.
  }
}

/**
 * 002 FR-029: the new value of Settings → Show Meet captions when a chrome.storage change switched it, else null
 * (another area, another key, another setting, or the same value stored again).
 */
export function showCaptionsSwitch(
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  area: string,
): boolean | null {
  const change = area === 'local' ? changes[SETTINGS_KEY] : undefined;
  if (!change) return null;
  const show = parseSettings(change.newValue).showMeetCaptions;
  return show === parseSettings(change.oldValue).showMeetCaptions ? null : show;
}

export type MeetingSource = { url: string; title: string };

const tabSource = (tab: chrome.tabs.Tab): Promise<MeetingSource> =>
  Promise.resolve({ url: tab.url ?? '', title: tab.title ?? '' });

/** `sourceOf` describes the captured tab for the meeting record; e2e builds swap it to pass a test scenario. */
export function createMeetingControl(
  capture: TabCapture,
  sourceOf: (tab: chrome.tabs.Tab) => Promise<MeetingSource> = tabSource,
  hooks: {
    /** 008: runs once a meeting has started (pending notes move to it); a failure never fails Start. */
    afterStart?: (meetingId: string) => Promise<void>;
  } = {},
) {
  let lingerTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelLinger = () => {
    if (lingerTimer !== null) clearTimeout(lingerTimer);
    lingerTimer = null;
  };

  /** Serialises start/stop/tab events so two of them never interleave. */
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  async function start(tabId: number, language: LanguageMode): Promise<StartResult> {
    cancelLinger();
    const store = SettingsStore.fromChrome();
    const settings = await store.getSettings();
    if (!isReadyToStart(settings, (await store.keyHint()) !== null)) return { ok: false, error: 'settings-incomplete' };

    const active = await getActive();
    if (active) {
      if (await offscreenExists()) return { ok: false, error: 'already-running', runningTabTitle: active.title };
      await clearActive(); // stale: the offscreen document is gone
    }

    let tab: chrome.tabs.Tab;
    let tabStreamId: string;
    try {
      tab = await chrome.tabs.get(tabId);
      tabStreamId = await capture.streamIdFor(tab);
    } catch (e) {
      return { ok: false, error: e instanceof StartFailure ? e.error : 'tab-not-capturable' };
    }

    const meetingId = crypto.randomUUID();
    let reply: BeginResult | undefined;
    try {
      await ensureOffscreen();
      reply = await chrome.runtime.sendMessage<unknown, BeginResult>({
        type: 'offscreen/begin',
        meetingId,
        tabStreamId,
        language,
        keyterms: planKeyterms(settings.keyterms).send,
        userName: settings.userName.trim(),
        source: await sourceOf(tab),
        // 002 FR-022: the offscreen document cannot read chrome.storage.
        speakerNameMappings: settings.speakerNameMappings,
        // Design decision 41: clean transcript, on by default.
        cleanTranscript: settings.cleanTranscript,
      });
    } catch {
      reply = undefined;
    }
    if (!reply?.ok) {
      await closeOffscreen().catch(() => undefined);
      return { ok: false, error: 'offscreen-failed' };
    }
    const bridged = tab.url !== undefined && isMeetCallUrl(tab.url);
    await setActive({ meetingId, tabId, title: tab.title ?? '', origin: originOf(tab.url), bridged });
    // 002 FR-028: the page is told whether to leave Meet's captions visible; the offscreen document is not.
    if (bridged) await tellMeetPage(tabId, { type: 'meet/attach', meetingId, showCaptions: settings.showMeetCaptions });
    // 008: pending notes become this meeting's; on failure they stay pending (visible beside Start after Stop).
    await hooks.afterStart?.(meetingId).catch(() => undefined);
    return { ok: true, meetingId };
  }

  async function end(reason: EndReason): Promise<StopResult> {
    cancelLinger();
    const active = await getActive();
    if (!active && !(await offscreenExists())) return { ok: true };
    try {
      await chrome.runtime.sendMessage({ type: 'offscreen/end', reason });
    } catch {
      // The document may already be gone; closing below is what matters.
    }
    await closeOffscreen().catch(() => undefined);
    await clearActive();
    if (active?.bridged) await tellMeetPage(active.tabId, { type: 'meet/detach' });
    return { ok: true };
  }

  async function endIfCaptured(tabId: number, reason: EndReason, check: (a: ActiveMeeting) => boolean = () => true) {
    const active = await getActive();
    if (active?.tabId === tabId && check(active)) await end(reason);
  }

  /** The offscreen document already ended the meeting itself: forget it now, close the document a little later. */
  async function ended(): Promise<StopResult> {
    const active = await getActive();
    await clearActive();
    if (active?.bridged) await tellMeetPage(active.tabId, { type: 'meet/detach' });
    cancelLinger();
    lingerTimer = setTimeout(() => {
      lingerTimer = null;
      void serial(async () => {
        if (!(await getActive())) await closeOffscreen().catch(() => undefined);
      });
    }, OFFSCREEN_LINGER_MS);
    return { ok: true };
  }

  /** A Meet page's content script loaded (or reloaded): attach it if its tab is the running meeting's. */
  async function ready(tabId: number): Promise<ReadyReply> {
    const active = await getActive();
    if (!active?.bridged || active.tabId !== tabId) return { attach: false };
    const { showMeetCaptions } = await SettingsStore.fromChrome().getSettings();
    return { attach: true, meetingId: active.meetingId, showCaptions: showMeetCaptions };
  }

  /** 002 FR-029: Settings → Show Meet captions was switched; a running meeting's Meet page follows at once. */
  async function showCaptions(show: boolean): Promise<void> {
    const active = await getActive();
    if (active?.bridged) await tellMeetPage(active.tabId, { type: 'meet/show-captions', show });
  }

  return {
    ready,
    /** Queued behind a Start in progress, so its attach never outlives a newer value. */
    showCaptions: (show: boolean) => serial(() => showCaptions(show)),
    ended: () => serial(ended),
    start: (tabId: number, language: LanguageMode) => serial(() => start(tabId, language)),
    stop: () => serial(() => end('user-stop')),
    onTabRemoved: (tabId: number) => serial(() => endIfCaptured(tabId, 'tab-closed')),
    onTabUpdated: (tabId: number, url: string | undefined) => {
      if (url === undefined) return Promise.resolve();
      return serial(() => endIfCaptured(tabId, 'tab-navigated', (a) => a.origin !== '' && originOf(url) !== a.origin));
    },
  };
}
