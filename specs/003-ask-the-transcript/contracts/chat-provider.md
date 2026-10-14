# Contract: chat provider

`src/core/chat/provider.ts` (types only, platform-free). Implementations in `src/providers/chat/` are the only code that knows a vendor's wire format (constitution V). One shared contract suite, `tests/contract/chat-provider.contract.ts`, runs against the Anthropic adapter, the OpenAI adapter and the fixture provider, each fed recorded SSE fixtures through an injected `fetch`.

```ts
interface ChatRequest {
  model: string;                       // a curated model ID (core/chat/models.ts)
  system: string;                      // GROUNDING_PROMPT, byte-identical on every request
  turns: Array<
    | { role: 'user'; notes?: string; context: string; question: string }   // 008: notes block first, when present
    | { role: 'assistant'; text: string }
  >;                                   // starts and ends with 'user'
  maxOutputTokens: number;             // 4000
}

type ChatEvent =
  | { type: 'model'; model: string }   // the model that is answering (once, early; may differ after a fallback)
  | { type: 'text'; text: string }     // a delta, appended in order
  | { type: 'done'; finish: 'complete' | 'cut-off'; usage: ChatUsage | null };

interface ChatUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }

class ChatError extends Error {        // message: fixed text per kind, never a key, header or request body
  constructor(readonly kind: ChatErrorKind) {}
}

interface ChatProvider {
  readonly id: ChatProviderId;
  /** Streams one answer. Rejects (or throws from the iterator) with ChatError; abort ends iteration without 'done'. */
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
  /** Content-free key check (R4): resolves { ok: true } or { ok: false, kind }. */
  checkKey(): Promise<{ ok: true } | { ok: false; kind: 'invalid-key' | 'forbidden' | 'network' | 'unknown' }>;
}

interface ChatCredentialSource {
  readonly id: 'local-key' | 'backend';
  /** Whether a credential is configured for the provider, and its last four characters. */
  status(provider: ChatProviderId): Promise<{ configured: boolean; hint?: string }>;
  /** A ready provider for one request, or null when no credential is configured. Callers never see a key. */
  providerFor(provider: ChatProviderId): Promise<ChatProvider | null>;
}
```

v1's `LocalChatKeySource` (`src/providers/credentials/local-chat-key-source.ts`) reads the saved key from `SettingsStore` at request time and returns `createChatProvider(provider, key, fetch)`; the chat session and the hints command depend only on `ChatCredentialSource`. A future company backend implements `providerFor` as a relay provider and `status` from its own state, with no change to callers (FR-021). In the e2e build a fixture source returns the fixture provider.

## Contract cases (each adapter, recorded fixtures)

| # | Fixture | Expected |
|---|---|---|
| C1 | text stream, normal end | `model`, then `text` deltas concatenating to the recorded answer, then `done{complete}` with usage |
| C2 | stops at output limit | deltas, then `done{cut-off}` |
| C3 | safety decline (Anthropic `stop_reason: refusal`; OpenAI refusal / `content_filter`) | throws `ChatError('declined')`; no `done` |
| C4 | server-side fallback (Anthropic) | `model` reports the fallback model; `done{complete}` |
| C5 | HTTP 401 | `invalid-key` |
| C6 | HTTP 403 | `forbidden` |
| C7 | HTTP 429 (OpenAI `insufficient_quota` → `billing`) | `rate-limited` / `billing` |
| C8 | HTTP 529 / OpenAI 503 | `overloaded` / `unavailable` |
| C9 | HTTP 413, or 400 prompt-too-long / `context_length_exceeded` | `too-large` |
| C10 | network failure (fetch rejects) | `network` |
| C11 | abort after two deltas | iteration ends, no `done`, no error |
| C12 | mid-stream `error` event | mapped kind (`overloaded` for `overloaded_error`) |
| C13 | any error | `error.message` and `String(error)` contain neither the key nor any request header |
| C14 | `checkKey` 200 / 401 / 403 / network | ok / invalid-key / forbidden / network; the request carries no transcript or chat |

`no-answer` (FR-018a, design decision 80) is a `ChatErrorKind` no adapter throws: the chat session sets it when no answer text started within the limit and it aborted the request. For an adapter that abort is an ordinary abort (C11): iteration ends, no `done`, no error. The fixture provider's `silent` scenario yields the model's name and then nothing until it is aborted.

## Request assertions (adapter unit tests, captured `fetch` input)

- Anthropic: URL `https://api.anthropic.com/v1/messages`; `x-api-key` header; `anthropic-dangerous-direct-browser-access: true`; `stream: true`; `system` equals `GROUNDING_PROMPT`; top-level `cache_control: {type:'ephemeral'}`; per-model thinking/effort/fallback options per research R4 (and the `server-side-fallback-2026-07-01` beta header exactly when `fallbacks` is sent); user turns are two text blocks (context, then `Question: …`).
- OpenAI: URL `https://api.openai.com/v1/responses`; `Authorization: Bearer`; `stream: true`; `store: false`; `instructions` equals `GROUNDING_PROMPT`; `reasoning.effort` per model; no `prompt_cache_key`, no `metadata`, no `user`.
- Both: `maxRetries` 0 (exactly one fetch per request); the same `ChatRequest` produces a byte-identical body twice (deterministic key order — cache stability).
