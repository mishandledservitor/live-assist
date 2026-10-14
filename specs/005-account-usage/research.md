# Research: Account & usage in panel

## R1. Endpoint and fields

- **Decision**: `GET https://api.elevenlabs.io/v1/user/subscription` with header `xi-api-key`. Use `tier` (string), `character_count` (integer, used in the current period), `character_limit` (integer, allowed in the current period) and `next_character_count_reset_unix` (integer seconds, optional and nullable). Ignore every other field.
- **Rationale**: Verified against the API reference (elevenlabs.io/docs/api-reference/user/subscription/get, read 2026-10-08): the four fields exist with these types; the reset field is the only optional one. The same endpoint and fields are what another tool the author uses reads. On current plans the "character" fields count credits.
- **Alternatives**: `GET /v1/user` (includes the subscription nested, but more personal data than needed); the usage-stats endpoint (per-day character usage, needs date ranges, not a balance).

## R2. How realtime transcription is billed, and the minutes estimate

- **Findings (2026-10-08)**:
  - elevenlabs.io/pricing (plans page) FAQ: "Speech to Text 330 credits per minute", all products drawing from one shared monthly credit pool. It does not mention realtime Scribe or say whether the realtime model costs the same.
  - elevenlabs.io/pricing/api (API pricing page) FAQ: "API usage is billed in US dollars, not credits"; Scribe v2 Realtime is listed at $0.39 per hour (batch Scribe $0.22), so realtime costs more than batch per minute.
  - Third-party write-ups repeat 330 credits/minute for speech to text but none gives a realtime figure, and some say API calls draw from the credit pool, contradicting the API page.
- **Decision**: The rate cannot be determined from ElevenLabs' own documents: the only credit figure is for speech to text in general (and realtime is priced higher than batch in dollars), and the API page says API usage is not billed in credits at all. live-assist uses the API. So `REALTIME_STT_CREDITS_PER_MINUTE = null`, with both citations in its doc comment; the line shows the percentage only, and the detail says the percentage is of the plan's credits, shared by everything on the account, and why there is no minutes estimate (spec FR-006).
- **Open question for the user**: Does realtime transcription through the API draw from `character_count` on your plan, and at what rate? The manual check (manual-check.md step 3) measures it: note credits used before and after a timed meeting. If it draws credits at a steady rate, set the constant to that measured rate (citing the measurement and the pricing page) and the line gains "≈ N min of transcription" with no other code change.
- **Alternatives rejected**: using 330 credits/minute (not stated for realtime, and possibly not applicable to API usage at all — an invented figure on a screen the user budgets by); converting dollars to credits (no published exchange).

## R3. Error detection

- **Decision**: Map in this order: fetch throws → `network`; body detail (string, or `detail.message`, or `detail.status`) mentions `user_read` or `missing_permissions` → `missing-permission` (any status, because ElevenLabs answers scoped keys with 401 and a `missing_permissions` detail); 401 → `invalid`; 429 → `rate-limited`; other non-2xx → `unknown`; 2xx with `character_count`/`character_limit` not non-negative finite numbers → `unknown`; no key saved → `missing` (no request made).
- **Rationale**: Another tool the author uses detects the permission case by `user_read` in the detail message; ElevenLabs' missing-permission errors have `detail.status = "missing_permissions"` and a message naming the permission. Checking the body before the status keeps a scoped key from being reported as "rejected".
- **Alternatives**: status-only mapping (would call a working, scoped key "rejected", sending the user to replace a key that is fine).

## R4. Message design

- **Decision**: New command `{ type: 'account/usage' }` in the existing `Command` union, validated by `parseCommand`. Reply `{ ok: true; usage: AccountUsage } | { ok: false; kind: AccountErrorKind }`, validated in the panel by `parseAccountUsageReply` in `protocol.ts` (numbers finite and non-negative, tier string or null, resetAt number or null, kind from the fixed list; anything else → treated as `unknown`).
- **Rationale**: Same pattern as `settings/validate-key`: the panel asks, the service worker holds the key, only derived values come back. The reply goes through `containsSecretField` like everything else.

## R5. When to refresh

- **Decision**: `AccountStatus` fetches on mount (panel open), when its `meetingRunning` prop goes from true to false (Stop, or the meeting ending on its own — both arrive through the live snapshot the workspace already tracks), and on the refresh button. No timer.
- **Rationale**: The workspace already derives `running`; watching its falling edge covers every way a meeting ends without touching meeting control. Fetching in the service worker after `meeting/stop` would miss meetings that end on their own and would need a push channel to the panel.

## R6. Formatting

- **Decision**: Percentage left = floor(100 × (limit − used) / limit), clamped 0–100; "<1%" for a non-zero remainder under 1%. Days to renewal = ceil((reset − now) / 1 day), at least 0; 0 → "renews today", 1 → "1 day". Date as "Oct 20" (`en-US`, short month, local time zone; time zone injectable for tests). Tier: underscores to spaces, first letter capitalised, "plan" appended; missing → "Unknown plan". Numbers in the detail with `en-US` thousands separators. The line uses " · " between parts.
- **Rationale**: Rounding down never overstates what is left; the renewal format matches another tool the author uses ("renews in 12 days (Oct 20)"), which the user already reads. English formatting matches the rest of the UI.
