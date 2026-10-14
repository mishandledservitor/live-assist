// Settings and credentials in chrome.storage.local only — never storage.sync (FR-003, Principle I). This full store
// can read the key, so only the service worker uses it; the side panel uses PanelSettingsStore (001 FR-003a).
import type { ChatProviderId } from '../core/chat/models';
import { CHAT_CREDENTIAL_KEYS, PENDING_CREDENTIAL_KEY, CREDENTIALS_KEY, PreferencesStore } from './preferences-store';

export {
  CHAT_CREDENTIAL_KEYS,
  CREDENTIALS_KEY,
  PENDING_CREDENTIAL_KEY,
  SETTINGS_KEY,
  type SettingsPatch,
  type StorageAreaLike,
} from './preferences-store';

interface Credentials {
  elevenLabsApiKey?: string;
}

const nonEmpty = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export class SettingsStore extends PreferencesStore {
  static fromChrome(): SettingsStore {
    return new SettingsStore(chrome.storage.local);
  }

  /** Last four characters of the saved key, or null. The only key-derived value that may reach the UI. */
  async keyHint(): Promise<string | null> {
    const key = await this.readApiKey();
    return key === null ? null : key.slice(-4);
  }

  /** Same as writePendingKey; kept for the service worker's tests and callers. */
  async setPendingKey(candidate: string): Promise<void> {
    await this.writePendingKey(candidate);
  }

  /** Moves the candidate into the saved key; a no-op without one. */
  async promotePendingKey(): Promise<void> {
    const pending = await this.readPendingKey();
    if (pending === null) return;
    await this.area.set({ [CREDENTIALS_KEY]: { ...(await this.readCredentials()), elevenLabsApiKey: pending } });
    await this.discardPendingKey();
  }

  /** For LocalKeyCredentialSource only. */
  async readApiKey(): Promise<string | null> {
    return nonEmpty((await this.readCredentials()).elevenLabsApiKey);
  }

  /** For the key-validation path only. */
  async readPendingKey(): Promise<string | null> {
    return nonEmpty((await this.area.get(PENDING_CREDENTIAL_KEY))[PENDING_CREDENTIAL_KEY]);
  }

  /** 003: a provider's saved chat key, for LocalChatKeySource only. */
  async readChatKey(provider: ChatProviderId): Promise<string | null> {
    return this.readString(CHAT_CREDENTIAL_KEYS[provider].saved);
  }

  /** 003: a provider's chat-key candidate, for the chat-key check only. */
  async readPendingChatKey(provider: ChatProviderId): Promise<string | null> {
    return this.readString(CHAT_CREDENTIAL_KEYS[provider].pending);
  }

  /** 003: moves the candidate into the saved chat key; a no-op without one. */
  async promotePendingChatKey(provider: ChatProviderId): Promise<void> {
    const pending = await this.readPendingChatKey(provider);
    if (pending === null) return;
    await this.area.set({ [CHAT_CREDENTIAL_KEYS[provider].saved]: pending });
    await this.discardPendingChatKey(provider);
  }

  /** 003: last four characters of each saved chat key, or null. The only chat-key-derived value the UI may get. */
  async chatKeyHints(): Promise<Record<ChatProviderId, string | null>> {
    const last4 = (key: string | null) => (key === null ? null : key.slice(-4));
    return { anthropic: last4(await this.readChatKey('anthropic')), openai: last4(await this.readChatKey('openai')) };
  }

  private async readString(storageKey: string): Promise<string | null> {
    return nonEmpty((await this.area.get(storageKey))[storageKey]);
  }

  private async readCredentials(): Promise<Credentials> {
    const raw = (await this.area.get(CREDENTIALS_KEY))[CREDENTIALS_KEY];
    if (typeof raw !== 'object' || raw === null) return {};
    const key = nonEmpty((raw as Record<string, unknown>).elevenLabsApiKey);
    return key === null ? {} : { elevenLabsApiKey: key };
  }
}
