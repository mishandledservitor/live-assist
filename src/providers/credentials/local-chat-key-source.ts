// v1 chat credentials (003 contracts/chat-provider.md, FR-021): the user's own key, read in the service worker at
// request time and handed only to the adapter. Callers get a ready provider or a hint, never the key.
import type { ChatCredentialSource, ChatProvider, ChatProviderId } from '../../core/chat/provider';
import { createChatProvider } from '../chat/factory';

export interface LocalChatKeyDeps {
  /** SettingsStore.readChatKey: the saved key, or null. */
  readKey(provider: ChatProviderId): Promise<string | null>;
  fetch: typeof fetch;
}

export class LocalChatKeySource implements ChatCredentialSource {
  readonly id = 'local-key' as const;
  readonly #deps: LocalChatKeyDeps;

  constructor(deps: LocalChatKeyDeps) {
    this.#deps = deps;
  }

  async status(provider: ChatProviderId): Promise<{ configured: boolean; hint?: string }> {
    const key = await this.#deps.readKey(provider);
    return key ? { configured: true, hint: key.slice(-4) } : { configured: false };
  }

  async providerFor(provider: ChatProviderId): Promise<ChatProvider | null> {
    const key = await this.#deps.readKey(provider);
    return key ? createChatProvider(provider, key, this.#deps.fetch) : null;
  }
}
