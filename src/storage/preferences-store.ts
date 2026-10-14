// Settings (no credentials) in chrome.storage.local only — never storage.sync (FR-003, Principle I). Shared by the
// service worker's SettingsStore and the side panel's PanelSettingsStore; nothing here reads a key.
import type { ChatProviderId } from '../core/chat/models';
import { normalizeKeyterms } from '../core/settings/keyterms';
import {
  forgetMapping,
  parseSettings,
  rememberMapping,
  type Settings,
  type SpeakerNameMapping,
} from '../core/settings/schema';

export const SETTINGS_KEY = 'settings';
/** The saved key (`{ elevenLabsApiKey }`). Read only by the service worker. */
export const CREDENTIALS_KEY = 'credentials';
/**
 * A candidate key waiting for validation (a plain string). The side panel writes it and never reads it back; the
 * service worker reads it, promotes or discards it, and removes it (red-team 2026-10-08, 001 FR-003a).
 */
export const PENDING_CREDENTIAL_KEY = 'pendingCredential';

/**
 * 003 chat keys (research R14): plain strings under their own storage keys, so replacing the ElevenLabs key never
 * touches them. `saved` is read only by the service worker; `pending` is the panel's write-only candidate slot.
 */
export const CHAT_CREDENTIAL_KEYS: Readonly<Record<ChatProviderId, { saved: string; pending: string }>> = Object.freeze(
  {
    anthropic: Object.freeze({ saved: 'anthropicCredential', pending: 'pendingAnthropicCredential' }),
    openai: Object.freeze({ saved: 'openaiCredential', pending: 'pendingOpenaiCredential' }),
  },
);

/** The subset of chrome.storage.StorageArea these stores use. */
export interface StorageAreaLike {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export type SettingsPatch = Partial<Omit<Settings, 'schemaVersion'>>;

export class PreferencesStore {
  constructor(protected readonly area: StorageAreaLike) {}

  async getSettings(): Promise<Settings> {
    const raw = await this.area.get(SETTINGS_KEY);
    return parseSettings(raw[SETTINGS_KEY]);
  }

  async saveSettings(patch: SettingsPatch): Promise<Settings> {
    const merged: Settings = { ...(await this.getSettings()), ...patch, schemaVersion: 1 };
    const next: Settings = { ...merged, keyterms: normalizeKeyterms(merged.keyterms) };
    await this.area.set({ [SETTINGS_KEY]: next });
    return next;
  }

  /** 002 Settings → Remembered names (FR-022). */
  async listSpeakerNames(): Promise<SpeakerNameMapping[]> {
    return (await this.getSettings()).speakerNameMappings;
  }

  /** Remembers caption name → display name (replacing any earlier one); equal names forget it. */
  async rememberSpeakerName(captionName: string, displayName: string, now = Date.now()): Promise<void> {
    const list = await this.listSpeakerNames();
    await this.saveSettings({ speakerNameMappings: rememberMapping(list, captionName, displayName, now) });
  }

  async forgetSpeakerName(captionName: string): Promise<void> {
    await this.saveSettings({ speakerNameMappings: forgetMapping(await this.listSpeakerNames(), captionName) });
  }

  /** Writes a candidate key for the service worker to validate: one `set`, nothing read. */
  async writePendingKey(candidate: string): Promise<void> {
    const key = candidate.trim();
    if (key === '') throw new Error('empty key');
    await this.area.set({ [PENDING_CREDENTIAL_KEY]: key });
  }

  /** Drops the candidate: one `remove`, nothing read. */
  async discardPendingKey(): Promise<void> {
    await this.area.remove(PENDING_CREDENTIAL_KEY);
  }

  /** Removes the saved key and any candidate: one `remove`, nothing read. */
  async removeKey(): Promise<void> {
    await this.area.remove([CREDENTIALS_KEY, PENDING_CREDENTIAL_KEY]);
  }

  /** 003: writes a chat-key candidate for the service worker to check: one `set`, nothing read. */
  async writePendingChatKey(provider: ChatProviderId, candidate: string): Promise<void> {
    const key = candidate.trim();
    if (key === '') throw new Error('empty key');
    await this.area.set({ [CHAT_CREDENTIAL_KEYS[provider].pending]: key });
  }

  /** 003: drops a provider's chat-key candidate: one `remove`, nothing read. */
  async discardPendingChatKey(provider: ChatProviderId): Promise<void> {
    await this.area.remove(CHAT_CREDENTIAL_KEYS[provider].pending);
  }

  /** 003: removes a provider's saved chat key and any candidate: one `remove`, nothing read. */
  async removeChatKey(provider: ChatProviderId): Promise<void> {
    const { saved, pending } = CHAT_CREDENTIAL_KEYS[provider];
    await this.area.remove([saved, pending]);
  }
}
