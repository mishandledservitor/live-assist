// Chat-key commands answered by the service worker (003 contracts/chat-messages.md). The panel never reads a chat key
// (FR-014a): it gets the last four characters of each, or null, and a check result.
import { CHAT_PROVIDERS } from '../../core/chat/models';
import type { ChatCredentialSource, ChatProvider, ChatProviderId } from '../../core/chat/provider';
import type { ChatKeyHintsReply, ValidateChatKeyReply } from '../../core/messaging/protocol';
import type { SettingsStore } from '../../storage/settings-store';

export async function answerChatKeyHints(source: ChatCredentialSource): Promise<ChatKeyHintsReply> {
  const reply: ChatKeyHintsReply = { anthropic: null, openai: null };
  for (const provider of CHAT_PROVIDERS) {
    const status = await source.status(provider);
    reply[provider] = status.configured && status.hint ? status.hint.slice(-4) : null;
  }
  return reply;
}

export interface ValidateChatKeyDeps {
  store: Pick<SettingsStore, 'readPendingChatKey' | 'promotePendingChatKey' | 'discardPendingChatKey' | 'chatKeyHints'>;
  /** An adapter holding the candidate key, used only for its content-free `checkKey` (FR-013, FR-017). */
  providerWithKey(provider: ChatProviderId, key: string): ChatProvider;
}

/**
 * `settings/validate-chat-key`: checks the panel's candidate with the provider; promotes it on success, discards it on
 * failure (a saved key stays as it was). Same shape as 001's ElevenLabs check.
 */
export async function validatePendingChatKey(
  provider: ChatProviderId,
  deps: ValidateChatKeyDeps,
): Promise<ValidateChatKeyReply> {
  const candidate = await deps.store.readPendingChatKey(provider);
  if (candidate === null) return { ok: false, kind: 'missing-key' };
  let result: Awaited<ReturnType<ChatProvider['checkKey']>>;
  try {
    result = await deps.providerWithKey(provider, candidate).checkKey();
  } catch {
    result = { ok: false, kind: 'unknown' };
  }
  if (!result.ok) {
    await deps.store.discardPendingChatKey(provider);
    return { ok: false, kind: result.kind };
  }
  await deps.store.promotePendingChatKey(provider);
  return { ok: true, hint: (await deps.store.chatKeyHints())[provider] ?? '' };
}
