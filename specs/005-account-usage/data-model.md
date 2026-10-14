# Data model: Account & usage in panel

Nothing is stored. All types live in `src/core/account/usage.ts`.

## AccountUsage (service worker → panel, derived)

| Field | Type | From ElevenLabs | Rules |
|-------|------|-----------------|-------|
| `tier` | `string \| null` | `tier` | null when missing, empty or not a string |
| `creditsUsed` | `number` | `character_count` | finite, ≥ 0; otherwise the whole answer is `unknown` |
| `creditsLimit` | `number` | `character_limit` | finite, ≥ 0; 0 means "no credit allowance reported" |
| `resetAt` | `number \| null` | `next_character_count_reset_unix` × 1000 | epoch ms; null when missing, null or not a positive number |

No other field of the ElevenLabs answer leaves the provider module.

## AccountErrorKind

`'missing' | 'missing-permission' | 'invalid' | 'network' | 'rate-limited' | 'unknown'` — mapping in research R3. Each has one fixed sentence (`ACCOUNT_ERROR_MESSAGES`); `missing-permission` is exactly "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io".

## AccountUsageReply

`{ ok: true; usage: AccountUsage } | { ok: false; kind: AccountErrorKind }`.

## REALTIME_STT_CREDITS_PER_MINUTE

`number | null`, currently `null` (research R2). When set, minutes left = floor((limit − used) / rate), shown as "≈ 2,150 min of transcription".

## AccountSummary (panel, from `describeAccount(usage, now, options)`)

| Field | Meaning |
|-------|---------|
| `line` | the one line, parts joined by " · " |
| `detail` | sentences for the expandable detail: exact numbers, what the percentage covers, why there is or is no minutes estimate |

## AccountStatus component state

`loading` (first fetch, no data yet) → `shown` (summary) or `failed` (sentence). A refresh keeps the current state visible and sets `busy`; the button is disabled while `busy`.
