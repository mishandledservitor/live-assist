// What the side panel's settings UI needs, behind one interface so components are tested with a fake.
// The panel never reads the key (red-team 2026-10-08, 001 FR-003a): it writes a candidate to a write-only pending slot
// that only the service worker reads, and the hint (last four characters) comes from the service worker through a
// validated `settings/key-hint` reply (contracts/extension-messages.md).
import { isModelOf, type ChatProviderId } from '../../core/chat/models';
import {
  parseChatKeyHintsReply,
  parseKeyHintReply,
  parseValidateChatKeyReply,
  type ChatKeyHintsReply,
  type Command,
  type ValidateChatKeyReply,
  type ValidateKeyResult,
} from '../../core/messaging/protocol';
import type { Settings, SpeakerNameMapping } from '../../core/settings/schema';
import type { PanelSettingsStore, SettingsPatch } from '../../storage/panel-settings-store';

export interface LoadedSettings {
  settings: Settings;
  keyHint: string | null;
  /** 003: each chat key's last four characters, or null (FR-014a). */
  chatKeyHints: ChatKeyHintsReply;
}

/** 003 Settings → Questions: the selected provider, optionally its model, and the first-run chat step. */
export interface ChatSettingsChange {
  provider: ChatProviderId;
  /** A model of `provider`; any other ID is ignored. */
  model?: string;
  setupComplete?: boolean;
}

export interface SettingsApi {
  load(): Promise<LoadedSettings>;
  saveSettings(patch: SettingsPatch): Promise<Settings>;
  /** Stores the candidate as pending and asks the service worker to validate it (promote or discard). */
  validateKey(candidate: string): Promise<ValidateKeyResult>;
  removeKey(): Promise<void>;
  /** 003: writes a chat-key candidate and asks the service worker to check it (promote or discard). */
  replaceChatKey(provider: ChatProviderId, candidate: string): Promise<ValidateChatKeyReply>;
  removeChatKey(provider: ChatProviderId): Promise<void>;
  /** 003: changes chat settings, keeping each provider's own model choice. */
  saveChatSettings(change: ChatSettingsChange): Promise<Settings>;
  /** Opens the one-time microphone permission page in a tab. */
  openMicPermission(): Promise<void>;
  /** 002 Settings → Remembered names (FR-022). */
  listSpeakerNames(): Promise<SpeakerNameMapping[]>;
  /** Equal names (after normalisation) forget the mapping. */
  rememberSpeakerName(captionName: string, displayName: string): Promise<void>;
  forgetSpeakerName(captionName: string): Promise<void>;
  /**
   * Called after every remember or forget made through this api, wherever it came from (Settings, or a rename in the
   * transcript through MeetingApi), so Settings → Remembered names stays current (T083). Returns an unsubscribe.
   */
  onSpeakerNamesChanged(listener: () => void): () => void;
}

export interface SettingsApiDeps {
  store: PanelSettingsStore;
  sendCommand(command: Command): Promise<unknown>;
  openTab(path: string): Promise<void>;
}

export const MIC_PERMISSION_PAGE = '/mic-permission.html';

function isValidateResult(v: unknown): v is ValidateKeyResult {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (r.ok === true && typeof r.hint === 'string') || (r.ok === false && typeof r.kind === 'string');
}

export function createSettingsApi(deps: SettingsApiDeps): SettingsApi {
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return {
    async load() {
      const settings = await deps.store.getSettings();
      let reply: unknown;
      try {
        reply = await deps.sendCommand({ type: 'settings/key-hint' });
      } catch {
        reply = null;
      }
      let chatReply: unknown;
      try {
        chatReply = await deps.sendCommand({ type: 'settings/chat-key-hints' });
      } catch {
        chatReply = null;
      }
      return { settings, keyHint: parseKeyHintReply(reply).hint, chatKeyHints: parseChatKeyHintsReply(chatReply) };
    },
    saveSettings: (patch) => deps.store.saveSettings(patch),
    async validateKey(candidate) {
      await deps.store.writePendingKey(candidate);
      let reply: unknown;
      try {
        reply = await deps.sendCommand({ type: 'settings/validate-key' });
      } catch {
        await deps.store.discardPendingKey();
        return { ok: false, kind: 'unknown' };
      }
      if (isValidateResult(reply)) return reply;
      await deps.store.discardPendingKey();
      return { ok: false, kind: 'unknown' };
    },
    removeKey: () => deps.store.removeKey(),
    async replaceChatKey(provider, candidate) {
      if (candidate.trim() === '') return { ok: false, kind: 'missing-key' };
      await deps.store.writePendingChatKey(provider, candidate);
      let reply: ValidateChatKeyReply;
      try {
        reply = parseValidateChatKeyReply(await deps.sendCommand({ type: 'settings/validate-chat-key', provider }));
      } catch {
        reply = { ok: false, kind: 'unknown' };
      }
      // The service worker discards a failed candidate itself; this covers a reply that never came or made no sense.
      if (!reply.ok) await deps.store.discardPendingChatKey(provider);
      return reply;
    },
    removeChatKey: (provider) => deps.store.removeChatKey(provider),
    async saveChatSettings({ provider, model, setupComplete }) {
      const { chat } = await deps.store.getSettings();
      return deps.store.saveSettings({
        chat: {
          provider,
          models:
            model !== undefined && isModelOf(provider, model) ? { ...chat.models, [provider]: model } : chat.models,
          setupComplete: setupComplete ?? chat.setupComplete,
        },
      });
    },
    openMicPermission: () => deps.openTab(MIC_PERMISSION_PAGE),
    listSpeakerNames: () => deps.store.listSpeakerNames(),
    async rememberSpeakerName(captionName, displayName) {
      await deps.store.rememberSpeakerName(captionName, displayName);
      changed();
    },
    async forgetSpeakerName(captionName) {
      await deps.store.forgetSpeakerName(captionName);
      changed();
    },
    onSpeakerNamesChanged(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export function chromeSettingsApi(store: PanelSettingsStore): SettingsApi {
  return createSettingsApi({
    store,
    sendCommand: (command) => chrome.runtime.sendMessage(command),
    openTab: async (path) => {
      await chrome.tabs.create({ url: chrome.runtime.getURL(path) });
    },
  });
}
