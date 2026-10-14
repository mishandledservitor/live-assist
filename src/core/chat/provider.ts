// Chat-model provider contract (003 contracts/chat-provider.md, constitution V). Types only, platform-free: the
// adapters in src/providers/chat/ are the only code that knows a vendor's wire format.
import type { ChatProviderId } from './models';

export type { ChatProviderId } from './models';

export const CHAT_ERROR_KINDS = [
  'missing-key',
  'invalid-key',
  'forbidden',
  'billing',
  'model-unavailable',
  'rate-limited',
  'overloaded',
  'unavailable',
  'network',
  'too-large',
  'declined',
  'empty-transcript',
  'busy',
  'unknown',
  /** No answer text started within the limit (003 FR-018a). Set by the chat session; no provider throws it. */
  'no-answer',
] as const;

export type ChatErrorKind = (typeof CHAT_ERROR_KINDS)[number];

export const isChatErrorKind = (v: unknown): v is ChatErrorKind => CHAT_ERROR_KINDS.includes(v as ChatErrorKind);

export interface ChatRequest {
  /** A curated model ID (core/chat/models.ts). */
  model: string;
  /** GROUNDING_PROMPT, byte-identical on every request. */
  system: string;
  /** Starts and ends with 'user'. */
  turns: (
    | {
        role: 'user';
        /** 008: the person's notes block, sent before the transcript block; absent when the turn carries none. */
        notes?: string;
        context: string;
        question: string;
      }
    | { role: 'assistant'; text: string }
  )[];
  maxOutputTokens: number;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type ChatEvent =
  /** The model that is answering (early; again after a server-side fallback). */
  | { type: 'model'; model: string }
  /** A delta, appended in order. */
  | { type: 'text'; text: string }
  | { type: 'done'; finish: 'complete' | 'cut-off'; usage: ChatUsage | null };

export type CheckKeyResult = { ok: true } | { ok: false; kind: 'invalid-key' | 'forbidden' | 'network' | 'unknown' };

/**
 * A provider failure. The message is a fixed text per kind and never holds a key, a header, a request body or a
 * provider's own error text (constitution I); anything that is not a known kind becomes `unknown`.
 */
export class ChatError extends Error {
  readonly kind: ChatErrorKind;

  constructor(kind: ChatErrorKind) {
    const safe: ChatErrorKind = isChatErrorKind(kind) ? kind : 'unknown';
    super(`Chat request failed: ${safe}`);
    this.name = 'ChatError';
    this.kind = safe;
  }
}

export interface ChatProvider {
  readonly id: ChatProviderId;
  /** Streams one answer. Throws ChatError; an abort ends iteration without 'done' and without an error. */
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
  /** Content-free key check (research R4). */
  checkKey(): Promise<CheckKeyResult>;
}

/**
 * Where a ready provider comes from (FR-021): v1 reads the user's saved key in the service worker; a company backend
 * can relay later. Callers never see a key.
 */
export interface ChatCredentialSource {
  readonly id: 'local-key' | 'backend';
  /** Whether a credential is configured for the provider, and its last four characters. */
  status(provider: ChatProviderId): Promise<{ configured: boolean; hint?: string }>;
  /** A ready provider for one request, or null when no credential is configured. */
  providerFor(provider: ChatProviderId): Promise<ChatProvider | null>;
}
