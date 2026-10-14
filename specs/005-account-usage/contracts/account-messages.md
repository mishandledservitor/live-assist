# Contract: account status message (side panel ↔ service worker)

Extends 001's `contracts/extension-messages.md` (same validation rules: unknown or malformed messages are dropped and counted; no key or token in any message).

## Command (side panel → service worker)

| Message | Payload | Result |
|---------|---------|--------|
| `account/usage` | `{}` | `{ ok: true; usage: { tier: string \| null; creditsUsed: number; creditsLimit: number; resetAt: number \| null } } \| { ok: false; kind: 'missing' \| 'missing-permission' \| 'invalid' \| 'network' \| 'rate-limited' \| 'unknown' }` |

- The service worker reads the saved key with `SettingsStore`; with no key it answers `{ ok: false, kind: 'missing' }` without a request.
- Otherwise it sends `GET https://api.elevenlabs.io/v1/user/subscription` with header `xi-api-key` and maps the answer (research R3). The raw answer never leaves the service worker.
- Failures are logged once through `createLogger('account')` with the kind and HTTP status only.
- The panel validates the reply with `parseAccountUsageReply`; an invalid reply, or a rejected `sendMessage`, is shown as `unknown`.

## Upstream (service worker → ElevenLabs)

`GET /v1/user/subscription`, 200 body fields used: `tier`, `character_count`, `character_limit`, `next_character_count_reset_unix` (data-model.md). Error bodies: `{ "detail": string | { "status"?: string, "message"?: string } }`.
