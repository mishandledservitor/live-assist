# Data model: Past transcripts (012)

012 adds no object store and no IndexedDB version (`DB_VERSION` stays 3). It adds one optional field to the stored `Meeting`, one key in `chrome.storage.local`, and several derived values that are never stored.

## Stored

### `Meeting.summary` (new, optional; `src/core/transcript/model.ts`)

A cache of what a list row needs from the meeting's lines (research R3). Part of the meeting's record, so `deleteMeeting` removes it with the record.

| Field | Type | Rule |
|---|---|---|
| `v` | `1` | `SUMMARY_VERSION`; any other value reads as no summary |
| `names` | `string[]` | Confirmed display labels in order of first appearance over `sortSegments(segments)`, via `displayLabel(segment, meeting)`; exact duplicates dropped; "Others" never appears (it is a fallback); all of them, the row cuts to four |
| `fileLines` | `number` | `transcriptFileLines(meeting, segments).length` (007); `0` means no `Download transcript` |
| `lastLineEndMs` | `number \| null` | Largest `endMs` among the segments, relative to the meeting start; `null` with no segment |

Rules:

- Written only by `MeetingRepo.summarise`, only when the meeting has `endedAt !== null`, in one transaction with the read of its segments.
- Dropped by `setSpeakerRename` and `setLabelOverride` in the transaction that makes the edit.
- Absent on meetings stored before 012 and on running or not-yet-closed meetings; `normaliseMeeting` leaves it as it is.
- Never sent anywhere, never logged, never in a file.

### `mainViewClearedAt` (new key in `chrome.storage.local`; `src/storage/main-view-store.ts`)

| Value | Meaning |
|---|---|
| absent, or not a finite number | never cleared: the main view shows the most recent stored meeting |
| epoch ms | the moment the main view was last cleared by deleting the meeting it showed |

Written by the side panel only, never removed, overwritten by the next clear. It identifies no meeting (research R5). The service worker and the offscreen document never read it.

### Unchanged

`segments`, `chatTurns`, `meetingContexts`, `settings`, credentials. What deleting a meeting removes from each: research R6.

## Derived (never stored)

### MeetingState (`src/core/history/meeting-summary.ts`)

`meetingState(meeting, runningId)`:

| State | When |
|---|---|
| `in-progress` | `meeting.id === runningId` |
| `interrupted` | `meeting.endReason === 'crashed'`, or `meeting.endedAt === null` and it is not the running meeting |
| `stopped` | otherwise |

Transitions the list can see while open: `in-progress` → `stopped` (Stop, the call ended, the tab closed, a transcription failure) when `runningId` changes; any state → gone (deleted).

### Display title (`displayTitle(source)`, `src/core/history/meeting-title.ts`; design decision 76)

`displayTitle(meeting.source)` → `string | null`. Reads `source.title` (the tab's title at Start, as stored since 001), `source.platform` and `source.url`; stores nothing. `Meeting.summary` has no title field and `SUMMARY_VERSION` stays 1: the title is already on the meeting's record and needs no line to be read.

| Step | Rule |
|---|---|
| 1 | Runs of white space become one space; the ends are trimmed |
| 2 | On a Meet call (`platform === 'meet'`, or `url` is on `https://meet.google.com`): a leading `Meet`, white space, one of `-` `–` `—`, then white space or the end, is removed |
| 3 | On a Meet call: three letters, a hyphen, four letters, a hyphen, three letters (any case) → `null` |
| 4 | Empty, or exactly `Meet`, `Google Meet`, `Zoom` or `Microsoft Teams` in any case → `null` |
| 5 | Otherwise the text from steps 1 and 2 |

The forms and examples are listed in spec.md Clarifications E2.

### Row (`rowOf(meeting, state, summary)`)

| Field | Source | Rule |
|---|---|---|
| `title` | `displayTitle(meeting.source)` | the row's first line; `null` → no title line |
| `date` | `meeting.startedAt`, local time | `{d} {Mon} {yyyy}`: day without a leading zero, English three-letter month (`Jan` … `Dec`), four-digit year |
| `time` | `meeting.startedAt`, local time | `HH:MM`, 24-hour, zero-padded |
| `durationMs` | `stopped`: `endedAt − startedAt`; `interrupted`: `summary.lastLineEndMs`; `in-progress`: `null` | `null` → no duration shown (also an interrupted meeting with no line, or one whose summary is not ready) |
| `duration` | `formatDuration(durationMs)` | `< 60 s` → `under 1 min`; `< 60 min` → `{n} min`; whole hours → `{h} h`; else `{h} h {m} min`; minutes floored; negative reads as zero |
| `names` | `summary.names` | first four, then `more = names.length − 4` shown as `+{more} more` when positive; empty list → nothing in their place, except `fileLines === 0` and no segment → `Nothing was transcribed.` |
| `canDownload` | `state !== 'in-progress' && summary.fileLines > 0` | unknown (no summary yet) counts as false |
| `canDelete` | `state !== 'in-progress'` | |

`Nothing was transcribed.` is shown when the summary is known and `lastLineEndMs === null` (the meeting has no line at all). A meeting with lines but no confirmed name shows no names and nothing in their place.

### MeetingFile (`src/core/export/meeting-files.ts`)

| Field | Type | Rule |
|---|---|---|
| `kind` | `'transcript'` | the only kind in 012; a later feature widens the union |
| `name` | `string` | 007's `transcriptFileName` |
| `body` | `string` | 007's body |

`meetingFiles({ meeting, segments })` → `[]` when `transcriptFile` has an empty body, else one `MeetingFile`. Order of the list is the order files are saved in.

### Main view rule (`src/core/history/main-view.ts`)

`showsOnMain(meeting, clearedAt)` → `clearedAt === null || meeting.startedAt > clearedAt`. Applied to the most recent stored meeting only; the running meeting comes from the live port and never passes through it.

### Panel state (React, not persisted)

| State | Where | Values |
|---|---|---|
| Screen | `Panel` in `App.tsx` | `'main' \| 'settings' \| 'transcripts'`; always `'main'` when the panel opens |
| View inside Transcripts | `TranscriptsScreen` | `{ kind: 'list' }` or `{ kind: 'meeting', id }` |
| List | `TranscriptsScreen` | `loading`, `{ meetings, summaries: Map<id, MeetingSummary> }`, or `failed` |
| Open confirmation | `TranscriptsScreen` | a meeting id or `null` (at most one) |
| Failed deletion | `DeleteTranscript` (per instance) | shown inside the open confirmation; cleared by the next attempt or Cancel |
| Announcement | `TranscriptsScreen` | `''` or `Transcript deleted.` |
