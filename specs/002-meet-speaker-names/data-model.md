# Data Model: Meet speaker names

**Feature**: `002-meet-speaker-names` | **Date**: 2026-10-08 (revised for one mixed stream, design decisions 28–30)

Extends [001's data model](../001-capture-live-transcript/data-model.md) as reworked for one mixed stream (decision 28): every segment comes from the single mixed session and arrives labelled "Others" (`fallback`). Only additions and changes are listed. No IndexedDB version bump: new fields are written from 002 on and v1 records are normalised on read (research R9).

## TranscriptSegment (IndexedDB `segments`) — changes

| Field | Type | Rules |
|-------|------|-------|
| `speakerLabel` | string | The attributed label: the meeting `userName` when attributed to Meet's self label; the caption name when attributed to another caption speaker; else `"Others"`. Never overwritten by a rename or override. |
| `labelSource` | `'fallback' \| 'caption' \| 'manual'` | 001's set, unchanged (001 Phase 11 removed `self`). 002 writes `caption` for every named segment, the user's own included (decision 29); the user's lines are told apart by `captionSelf`. `manual` is never stored here (manual corrections live in renames and overrides); it is the *display* source (below). |
| `captionName` | string \| null | **New.** Caption name as Meet showed it (whitespace-normalised) when `labelSource = 'caption'` — for the user's own lines this is Meet's self word ("You"); else null. |
| `captionSelf` | boolean | **New.** True when the attributed caption turn is Meet's label for the user. Default false. |
| `labelOverride` | string \| null | **New.** Single-line override (FR-019); 1–60 chars trimmed. Survives renames. |
| `schemaVersion` | `1 \| 2` | **New on segments.** Absent = 1. |
| `labelPending` | boolean (optional) | **New (real trace 2026-10-08, decision 37).** True from the segment's first write while names are active until its first resolution at `endMs + SETTLE_MS` or meeting end; the panel shows "…" for it (FR-026). Absent = false; dropped on read from storage. Never changes `speakerLabel`, which stays "Others" until named. |

Updates: a segment's `speakerLabel`, `labelSource`, `captionName`, `captionSelf` change while its attribution is pending (≤ `endMs + RESOLVE_DEADLINE_MS`), and `labelOverride` changes on user action. Each update is a `put` of the whole record (same deterministic id), stored before it is broadcast.

**Split lines (real call 2026-10-09, FR-027)**: a line spoken by more than one person is split into ordinary `TranscriptSegment`s — no new field, no schema bump. Chosen over sub-lines inside one segment because every consumer (panel, renames, overrides, 003's context and `[mm:ss]` citations, 004's export) already works on whole segments, so none of them changes. Each piece: `id` = the original id for the first piece, `${originalId}.w${k}` for a piece starting at word `k` of the original (deterministic, so a retried or repeated split writes the same records); `seq`, `meetingId`, `stream`, `language`, `timing`, `sessionId`, `createdAt`, `schemaVersion` copied; `words` = its words; `startMs`/`endMs` = its first word's start and last word's end; `text` = the original text cut at the piece's first word (whitespace trimmed); label fields from its own run; `labelOverride` null; `labelPending` false. The first piece is `put` over the original (same id); the others are `put` as new records; ordering (startMs, then seq) places them in order. A piece can be split again by a later resolution (ids stay derived from the original's word index); pieces are never merged back.

**Speaker key** (derived, not stored): `self` if `captionSelf`; `caption:${normalise(captionName)}` if `captionName`; else `others`. `normalise` = NFC, trim, collapse whitespace, lower-case.

## Meeting (IndexedDB `meetings`) — changes

| Field | Type | Rules |
|-------|------|-------|
| `source.platform` | `PlatformId` | `'meet'` for Meet calls (from the adapter). |
| `speakerRenames` | `Record<SpeakerKey, { name: string; origin: 'manual' \| 'remembered' }>` | **New.** Absent = `{}`. `name` 1–60 chars trimmed. `remembered` entries are copied from Settings the first time a caption key appears in this meeting. |
| `schemaVersion` | `1 \| 2` | 2 for meetings created from 002 on. |

## Display label (computed — `src/core/transcript/labels.ts`)

```text
displayLabel(segment, meeting) =
  segment.labelOverride                         → { text, source: 'manual' }
  else meeting.speakerRenames[key(segment)]     → { text: name, source: segment.labelSource }   (key ≠ 'others'; a stored 'others' rename is ignored — red-team 2026-10-08)
  else                                           → { text: segment.speakerLabel, source: segment.labelSource }
confirmed = source ∈ { caption, manual }
```

Used by the transcript panel, and by 003 (chat context) and 004 (export) so every consumer sees corrected names (FR-021).

## Settings (`chrome.storage.local`) — changes

| Field | Type | Rules |
|-------|------|-------|
| `speakerNameMappings` | `{ captionName: string; displayName: string; updatedAt: number }[]` | **New.** Default `[]`. Unique by `normalise(captionName)`; ≤ 500 entries (oldest by `updatedAt` dropped past that); `displayName` 1–60 chars trimmed; a mapping whose display name equals its caption name (normalised) is removed. Listed in Settings → Remembered names (view, edit, remove). |
| `showMeetCaptions` | boolean | **New (2026-10-12, design decision 61, FR-028).** Default `false`; anything but a boolean reads as `false`. Settings → `Show Meet captions`. Read by the service worker only, which passes it to the Meet page (contracts/meet-bridge.md); never sent to the offscreen document, never stored with a meeting. |

`parseSettings` keeps unknown-shaped entries out (each entry validated); `schemaVersion` stays 1 (additive fields with defaults).

## Caption turn (in memory, offscreen — `src/core/speakers/caption-turns.ts`)

| Field | Type | Rules |
|-------|------|-------|
| `turnKey` | string | From the content script; unique per caption item for the page's life (a reload gets a new prefix). |
| `speakerName` | string | Whitespace-normalised. Never the caption text (research R5; from 2026-10-12 the text is read for 013's stored captions only, never for this record). |
| `self` | boolean \| null | Adapter hint. |
| `firstSeenMs`, `lastSeenMs` | number | Meeting-relative (`observedAt − meeting.startedAt`); `lastSeenMs ≥ firstSeenMs`. |

Kept for the meeting's life (a 3-hour meeting has a few thousand turns; pruning turns older than the oldest pending segment by 60 s keeps it small). Not persisted.

## Attribution state (in memory — `src/core/speakers/speaker-attributor.ts`)

At each resolution the attributor computes the line's speaker runs (FR-027); more than one run splits the line (above), and each piece continues as its own pending entry with the original's deadline. A line with an override is not split: it resolves to one label, "Others" if its words hold more than one run.

Per segment id: `pending` (stored as "Others" with `labelPending` while names are active, shown as "…", may still change) → `final`. Transition at `endMs + SETTLE_MS` (first resolution) and re-resolution on caption activity touching its window until `endMs + RESOLVE_DEADLINE_MS`, then `final`. On meeting end every pending segment is resolved once more and finalised.

Constants (one exported, documented object; tuned by fixtures and the real trace, research R6):

| Name | Initial value |
|------|---------------|
| `LEAD_MS` | 1500 → 2000 (retest 2026-10-08, research R6) |
| `TAIL_MS` | 500 → −500 (retest 2026-10-08, research R6) |
| `ACTIVITY_GAP_MS` (caption-turns.ts) | 5000 (retest 2026-10-08): a longer quiet spell splits a turn into bursts → 5500 (real trace 2026-10-08, research R6) |
| `MIN_COVERAGE` | 0.6 |
| `DOMINANCE` | 0.8 |
| `SELF_OVERLAP` | 0.5 |
| `SETTLE_MS` | 3000 → 6000 (real trace 2026-10-08, research R6; the "…" placeholder is held until then) |
| `RESOLVE_DEADLINE_MS` | 10000 |
| `NO_CAPTIONS_MS` | 8000 |
| `LAG_MIN_MS` | 400 (real call 2026-10-09, research R6): the shortest caption lag the split model allows; a burst's speech starts no later than its first change minus this |
| `LAG_MAX_MS` | 3000 (real call 2026-10-09, research R6): the longest caption lag the split model allows; above `LEAD_MS`, which still sets whole-line windows |
| `REWRITE_MS` | 1500 (real call 2026-10-09, research R6): an older caption item still changing up to this long after a newer item started is Meet rewriting it, not that speaker still talking |

## Mute gate (in memory — `src/core/session/mute-gate.ts`)

```text
MuteGate { mode: 'unsupported' | 'awaiting-first' | 'following' | 'stale-muted' | 'unreadable'; muted: boolean | null; since: number }
```

Fail closed on Meet (design decision 34, 2026-10-08): the former `unknown` mode, which sent the mic, is replaced by `unreadable`, which keeps it silenced.

| From | Event | To | Frames |
|------|-------|----|--------|
| (Meet) start | — | `awaiting-first` | mic silenced |
| `awaiting-first` | reading `true/false` | `following` | per reading |
| `awaiting-first` | `MUTE_INITIAL_WAIT_MS` (3 s) elapses | `unreadable` | silenced |
| `following` | reading `true/false` | `following` | per reading, applied from `observedAt − MUTE_DETECT_SLACK_MS` to frames still in the guard line |
| `following` (muted) | reading `null` / port lost | `stale-muted` | silenced |
| `following` (unmuted) | reading `null` / port lost | `unreadable` | silenced from `now − MUTE_DETECT_SLACK_MS` |
| `stale-muted` | reading | `following` | per reading |
| `stale-muted` | `MUTE_STALE_GRACE_MS` (5 s) elapses | `unreadable` | silenced |
| `unreadable` | reading `true/false` | `following` | per reading |
| (non-Meet) | — | `unsupported` | sent |

Guard hold: tab and mic frames are both held `MUTE_GUARD_MS` (500 ms) before the mixer, so they stay in sync; a silenced mic frame is an all-zero `Int16Array` of the same length with the same `atMs`. The gate sits on the mic input in front of the mixer (001's mixed-stream gate), so nothing captured while muted can reach the mix, the replay buffer or the session (design-decisions carry-forward note, decision 30). Invariant tested by SC-004's suite: every mic frame handed to the mixer whose audio overlaps a muted interval (extended back by the slack) is all zeros, and the tab input is never altered.

## Status snapshot — changes

```text
speakerNames: { state: 'unavailable' | 'starting' | 'active' | 'degraded'; reason: string }
mic:          { state: 'active' | 'muted' | 'unavailable' | 'off'; reason?: string; muteFollowed: boolean }
```

New `StatusEvent`s: `{ type: 'captions'; state: CaptionsState }` and `{ type: 'mute'; muted: boolean | null }`. Mapping:

| Adapter / gate | `speakerNames` | `mic` |
|----------------|----------------|-------|
| non-Meet tab | `unavailable`, "Speaker names are available on Google Meet only — every line is labelled \"Others\"." | 001 behaviour (`muteFollowed: false`, "mute state unknown — mic is being sent") |
| captions `starting` (incl. lobby) | `starting`, "Turning on Meet captions…" / "Join the call to get speaker names" | — |
| captions `on` | `active` | — |
| captions `unavailable` / `off-by-user` / watchdog | `degraded` + reason | — |
| gate `following`, muted | — | `muted`, "Muted in Meet — not sent", `muteFollowed: true` |
| gate `following`, unmuted | — | `active`, `muteFollowed: true` |
| gate `awaiting-first` / `stale-muted` | — | `muted`, "Checking Meet's mute state — not sent" |
| gate `unreadable` (decision 34) | — | `muted`, "Not sent — can't see Meet's mute button", `muteFollowed: true` |

## Validation rules mapped to requirements

- Caption text never crosses the bridge or reaches storage as part of caption activity (FR-004): the `meet/caption` message has no text field and the validator drops unknown fields. Amended 2026-10-12 (feature 013): one other message, `meet/caption-text`, carries caption text for local storage only, under its own limits (`specs/013-captions-download/contracts/captions-capture.md`).
- A segment is shown as a name only with `labelSource = 'caption'` set by the attribution rules (FR-005, FR-006, SC-002).
- The user's name appears only on segments attributed to Meet's self label (FR-007, decision 29); without captions every segment is "Others".
- Names entered by the user: trimmed, 1–60 chars (FR-018–FR-020).
