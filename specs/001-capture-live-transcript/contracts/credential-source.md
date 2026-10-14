# Contract: Credential source

Constitution V: "no feature may assume keys are local". Providers ask a `CredentialSource` for what they need to connect; they never read storage.

```ts
export interface TranscriptionCredential {
  token: string;      // single-use; consumed by exactly one connection
  expiresAt: number;  // epoch ms (mint time + 15 min, minus a 60 s safety margin)
}

export type CredentialErrorKind = 'missing' | 'invalid' | 'forbidden' | 'network' | 'rate-limited' | 'unknown';

export class CredentialError extends Error {
  constructor(readonly kind: CredentialErrorKind, message: string); // message never contains the key or token
}

export interface CredentialSource {
  readonly id: 'local-key' | 'backend';
  /** A fresh single-use realtime STT token. Called once per connection, including reconnects. */
  getTranscriptionToken(): Promise<TranscriptionCredential>;
  /** Whether a credential is configured, without revealing it. */
  status(): Promise<{ configured: boolean; hint?: string }>; // hint e.g. "…a1b2" for local keys
}
```

Chat credentials (003) live beside this contract rather than in it: `ChatCredentialSource` (`src/core/chat/provider.ts`, `specs/003-ask-the-transcript/contracts/chat-provider.md`) has `status(provider)` and `providerFor(provider)`, which returns a ready chat provider (never a key), or null. The v1 implementation is `LocalChatKeySource` (`src/providers/credentials/local-chat-key-source.ts`), reading `anthropicCredential` / `openaiCredential` through `SettingsStore` in the service worker only; a company backend can supply credentials or relay chat behind the same interface.

## v1 implementation: `LocalKeyCredentialSource`

- Reads `credentials.elevenLabsApiKey` from `chrome.storage.local`.
- `getTranscriptionToken()` → `POST https://api.elevenlabs.io/v1/single-use-token/realtime_scribe` with header `xi-api-key`; response `{ "token": "sutkn_…" }`.
- HTTP 401 → `invalid`; 403 → `forbidden` (key lacks speech-to-text permission); 429 → `rate-limited`; fetch failure → `network`; no key → `missing`.
- Key validation on save (FR-002) = `getTranscriptionToken()` with the candidate key; the token is discarded.
- Never logs request headers; error messages are fixed strings plus the kind.
- Who can read the key (red-team 2026-10-08, FR-003a): only the service worker, through `SettingsStore` (`src/storage/settings-store.ts`). The side panel uses `PanelSettingsStore` (`src/storage/panel-settings-store.ts`), which can read settings, write a candidate to `pendingCredential` and remove the key, and has no method that reads either key; its hint comes from `settings/key-hint` (contracts/extension-messages.md). The offscreen document cannot read storage at all (relay below).

## Offscreen relay: `RelayCredentialSource`

Added 2026-10-08 (Phase 5). The realtime sockets live in the offscreen document, which has no `chrome.storage` and so cannot read the key. Its provider uses `RelayCredentialSource`, which asks the service worker for each token (`credentials/transcription-token`, contracts/extension-messages.md); the service worker runs `LocalKeyCredentialSource` and replies with the token or the error kind. The key never leaves the service worker. Runs the same contract suite.

## Future implementation: `BackendCredentialSource`

Same interface; fetches the token from the company backend (ROADMAP "Company backend & distribution"). No change to providers or core.

## Tests

Contract tests run the same suite against `LocalKeyCredentialSource` (stubbed `fetch`, in-memory storage) and a `StaticCredentialSource` test double: one token per call, error kinds mapped, and an assertion that no thrown error, log line or returned value contains the key string.
