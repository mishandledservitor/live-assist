// Builds the chat provider for the selected vendor with a key the caller already holds (the service worker only).
import type { ChatProvider, ChatProviderId } from '../../core/chat/provider';
import { createAnthropicProvider } from './anthropic';
import { createOpenAIProvider } from './openai';

export function createChatProvider(
  provider: ChatProviderId,
  key: string,
  fetch: typeof globalThis.fetch,
): ChatProvider {
  return provider === 'anthropic' ? createAnthropicProvider({ key, fetch }) : createOpenAIProvider({ key, fetch });
}
