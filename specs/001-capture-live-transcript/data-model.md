# Data Model: Capture & Live Transcript

**Feature**: `001-capture-live-transcript` | **Date**: 2026-10-07

This model is the foundation 002 (speaker names), 003 (chat) and 004 (history & export) build on. Fields those features will need are defined now where they cost nothing; nothing is built for them.

## Settings (`chrome.storage.local`, key `settings`)

| Field | Type | Rules |
|-------|------|-------|
| `schemaVersion` | `1` | For migrations. |
| `userName` | string | Required before Start. Trimmed, 1–60 chars. Snapshotted into each meeting; 002 shows it for Meet's "You" caption label. Not used as a label in 001 (revised 2026-10-08, superseded: the mic stream's label). |
| `keyterms` | string[] | ≤ 50 entries, each 1–20 chars after trimming, de-duplicated case-insensitively (ElevenLabs realtime limits, research R2). Over-limit entries are kept in settings but flagged and not sent (spec edge case). |
| `consentReminder` | boolean | Default `true`. |
| `firstRunComplete` | boolean | `true` once name and a validated key are saved. |
| `headphonesNoticeDismissed` | boolean | Default `false`. Set when the user ticks "Don't show again" on the headphones notice (FR-028). |

**Credentials** are stored separately (key `credentials`), read only by `LocalKeyCredentialSource`:

| Field | Type | Rules |
|-------|------|-------|
| `elevenLabsApiKey` | string | Never logged, never sent to the UI after save; the UI gets `{ present: boolean, last4: string }` only. |
| (moved) `pendingCredential` | top-level string \| absent | Candidate key awaiting validation, in its own `chrome.storage.local` key (red-team 2026-10-08: was `credentials.pendingElevenLabsApiKey`, which made the panel read the saved key to merge it). The panel writes it and never reads it; the service worker promotes it to `elevenLabsApiKey` on success and removes it either way. |

## Meeting (IndexedDB store `meetings`, keyPath `id`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | string (UUID v4) | |
| `startedAt` | number (epoch ms) | Meeting clock zero: every segment offset is relative to this. |
| `endedAt` | number \| null | Set on Stop or terminal failure. |
| `endReason` | `'user-stop' \| 'tab-closed' \| 'tab-navigated' \| 'failed' \| 'crashed'` \| null | `crashed` is assigned on next start-up to a meeting with `endedAt = null` and no live session. |
| `source` | `{ url: string; title: string; platform: PlatformId }` | `PlatformId` = `'generic'` in 001; `'meet'` from 002. |
| `languageMode` | `{ kind: 'auto' } \| { kind: 'fixed'; code: string }` | Chosen before Start; immutable for the meeting. |
| `userName` | string | Snapshot of settings at Start, so later renames do not rewrite history. |
| `schemaVersion` | `1` | |

Indexes: `startedAt` (004's history list).

## TranscriptSegment (IndexedDB store `segments`, keyPath `id`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | `${meetingId}:${stream}:${seq}` — deterministic, so a retried write is idempotent. In 001 `stream` is always `mixed`. |
| `meetingId` | string | FK → Meeting. |
| `stream` | `'mixed'` | The audio the line came from: always the single mixed stream (tab + gated mic). Revised 2026-10-08 (superseded: `'mic' \| 'tab'`); a record written by a pre-2026-10-08 development build may still carry `mic`/`tab` and is displayed unchanged (nothing branches on it). |
| `seq` | number | Per meeting, strictly increasing from 0. |
| `startMs` | number | Offset from `Meeting.startedAt`, ≥ 0. |
| `endMs` | number | ≥ `startMs`. |
| `text` | string | Non-empty after trim (empty commits are dropped). Exactly as received — never AI-edited (Principle II). |
| `language` | string \| null | ISO code from `committed_transcript_with_timestamps.language_code`, else the fixed language, else null. |
| `speakerLabel` | string | 001: always `"Others"` (constitution v1.1.0 IV; revised 2026-10-08, superseded: `mic` → `userName`). 002 replaces it from captions. |
| `labelSource` | `'fallback' \| 'caption' \| 'manual'` | 001 writes `fallback` only. 002 adds `caption` (including Meet's "You" label shown as the user's name) and `manual`. Confirmed = `caption \| manual`; fallback = `fallback` (Principle II). `self` removed 2026-10-08 (no own-mic attribution with one mixed stream). |
| `words` | `{ text: string; startMs: number; endMs: number }[]` | Meeting-relative word timings; used by 002 for caption alignment. May be empty when timing is estimated. |
| `timing` | `'words' \| 'estimated'` | `estimated` when the timestamps message never arrived (research R3). |
| `sessionId` | string | Provider session that produced it (diagnostics, reconnect tests). |
| `createdAt` | number (epoch ms) | |

Indexes: `meetingId`, `[meetingId, startMs]` (ordered transcript reads for 003/004).

Ordering rule (FR-013): sort by `startMs`, ties by `seq` (revised 2026-10-08; superseded: ties by stream, `tab` before `mic`).

Display time: `mm:ss` below one hour, `h:mm:ss` from one hour (`formatOffset(ms)`); matches the `[mm:ss]` citations 003 and 004 use.

## Partial line (in memory only)

`{ stream; text }` — at most one (the mixed stream), replaced on each `partial_transcript`, cleared on commit or Stop. Never persisted (spec edge case).

## Status snapshot (in memory, broadcast to the panel)

```text
StatusSnapshot {
  capture:       { state: 'idle'|'starting'|'active'|'stopped'|'failed'; reason?: string }
  transcription: StreamStatus   // the one mixed stream (revised 2026-10-08; superseded: { mic; tab })
  speakerNames:  { state: 'unavailable'|'active'|'degraded'; reason: string }   // 001: unavailable, "no adapter for this site — every line is labelled Others"
  mic:           { state: 'active'|'unavailable'|'off'; reason?: string; muteFollowed: boolean }   // mic input into the mix. 001: muteFollowed false, "mute state unknown — mic is being sent"; unavailable → reason says only the tab is transcribed
  retention:     { provider: 'elevenlabs'; summary: string; helpUrl: string }   // static truthful text (design decision 19)
}
StreamStatus { state: 'idle'|'connecting'|'active'|'reconnecting'|'failed'|'stopped'; reason?: string; reconnects: number }
```

The 003 chat-provider status is added as another key later; consumers must ignore unknown keys.

## State transitions

**Meeting / capture**

```text
idle ──Start (settings ok, consent ack)──► starting ──mixed source up (tab, plus mic or mic unavailable) and session started──► active
starting ──tab not capturable / not invoked──► failed (reason) ──► idle
active ──Stop──► stopped (endReason user-stop)
active ──tab closed / navigated──► stopped (endReason tab-closed / tab-navigated)
active ──transcription failed terminally──► failed (endReason failed); transcript kept
```

**Transcription (the one mixed stream)**

```text
idle → connecting → active
active → reconnecting (drop / recoverable error / session_time_limit_exceeded)
reconnecting → active (new session_started)
connecting → reconnecting (the first session drops before session_started; added 2026-10-08)
reconnecting → failed (retries exhausted)
connecting|active|reconnecting → failed (auth_error, quota_exceeded, unaccepted_terms, invalid_request)
any → stopped (Stop)
```

A mic that cannot be opened does not stop the meeting (the mix runs on the tab alone); a transcription that fails for good ends it, keeping everything recorded. (Revised 2026-10-08; superseded: per-stream failure rules.)

## Validation rules mapped to requirements

- Start disabled unless `userName` set, key present, `firstRunComplete` (FR-001).
- Keyterms validated against R2 limits; rejected terms listed in the UI (edge case).
- `text` stored only from committed events (FR-011).
- Segment write before UI broadcast; broadcast carries the stored segment (FR-016).
