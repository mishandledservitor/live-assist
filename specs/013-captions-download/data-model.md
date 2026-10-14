# Data model: Captions download (013)

## Stored caption turn (IndexedDB `captionTurns`, new in `DB_VERSION` 4)

`src/core/captions/model.ts`. Key path `['meetingId', 'seq']`; no index.

| Field | Type | Rule |
|---|---|---|
| `meetingId` | string | The meeting it belongs to; exactly one. |
| `seq` | number | Integer from 1, assigned by `CaptionLog` in the order turns are first received; never reused in a meeting. |
| `startMs` | number | `max(0, firstSeenAt − meeting.startedAt)`: when the turn first appeared, on the meeting clock. Never changes after the first write. |
| `speakerName` | string | As Meet showed it, whitespace collapsed, 1–200 characters. Never a display name: renames are applied when a file is built. |
| `self` | boolean | Meet labelled the turn as the user's own. `null` from the page (cannot tell) is stored as `false`. |
| `text` | string | Everything Meet showed for the turn, latest version, whitespace collapsed. Never empty: a turn is first written when it has text. At most 1,000,000 characters (the bridge's bound). |
| `schemaVersion` | 1 | |

Lifecycle: created at the first flush after the turn has text; replaced (same key) at each later flush in which its text changed; never changed after the meeting ends; deleted with the meeting, in the meeting's own delete transaction. There is no state field: a turn has no "final" mark (research R1).

Invariants, each with a test:

- A row exists only for a meeting that exists and had not ended when the row was written (`putCaptionTurns` guard, research R7).
- No row has empty `text`; every row would produce a line in the captions file. So "the meeting has a caption turn that would be written" (FR-018) is the same as "the meeting has a row", which is `Meeting.hasCaptions`.
- Rows of one meeting read in key order are in `seq` order; the file orders by `startMs`, then `seq`.

## Meeting (IndexedDB `meetings`) — change

| Field | Type | Rule |
|---|---|---|
| `hasCaptions` | `true`, optional | Set by `putCaptionTurns` in the transaction that writes the meeting's first caption turn; never unset; absent on every meeting without stored captions, so on every meeting stored before 013. Removed with the record. |

No other field changes. `speakerRenames` may now hold a `remembered` rename for a caption name that no line carries (spec P2); `displayLabel` only ever looks a key up from a line, so nothing reads it but the captions file. 012's `summary` is untouched: `setSpeakerRename` already drops it, and it holds nothing about captions.

`schemaVersion` of meetings and segments stays as it is.

## Caption text event (adapter → core, in memory)

`src/core/platform/adapter.ts`, contract revision 3.

```ts
export interface CaptionText {
  turnKey: string;          // as CaptionActivity.turnKey
  speakerName: string;
  self: boolean | null;
  firstSeenAt: number;      // epoch ms, when the turn first appeared
  text: string;             // the turn's whole text now; may be '' before the first words
}
```

## Caption log (in memory, offscreen — `src/core/captions/caption-log.ts`)

| State | Type | Notes |
|---|---|---|
| `turns` | `Map<turnKey, StoredCaptionTurn>` | The meeting's turns as last received. |
| `dirty` | `Set<turnKey>` | Changed since the last flush. |
| `nextSeq` | number | |
| `seenNames` | `Set<string>` | Normalised caption names already reported through `onSpeaker` (spec P2). |
| `closed` | boolean | Set by `close()` and when the store answers `false`. |

Transitions: `update(event)` → new key with non-empty text: assign `seq`, compute `startMs`, mark dirty, report a first-seen non-self name; known key with different text: replace text, mark dirty; empty text for an unknown key: ignored; empty text for a known key: ignored (a kept turn keeps its last non-empty text, FR-002). A timer flushes every `CAPTION_STORE_FLUSH_MS` while anything is dirty. `close()` flushes once and stops. More than `MAX_CAPTION_TURNS` (20,000) turns in one meeting: further new turns are dropped and counted (a bound against a misbehaving page, 16 times the spec's 3-hour figure).

## Page-side turn (in memory, Meet content script — `src/platforms/meet/caption-observer.ts`)

The existing `Turn` gains, for kept turns only: `kept` and `shown` (research R1), `sent` (the text the offscreen side has), `firstSeenAt`, `order` (sequence on this page), `textDirty` and its throttle timer. Turns registered as history at adoption have `keptTurn: false` and none of these. Nothing here is persisted; a reload starts empty.

## Files (built on demand, never stored)

`src/core/export/`.

```ts
// download-names.ts
meetingBaseName(startedAt)        // 'Meeting — 07-10-2026 at 14h30'      local date and time, as 007
transcriptFileName(startedAt)     // base + '.txt'                         004's inbox name; unchanged, no panel download uses it
transcriptDownloadName(startedAt) // base + ' — Transcript.txt'
captionsFileName(startedAt)       // base + ' — Meet captions.txt'
downloadZipName(startedAt)        // base + '.zip'

// meeting-files.ts
interface MeetingFile { kind: 'transcript' | 'captions'; name: string; body: string }
interface MeetingFileSource {
  meeting: Pick<Meeting, 'startedAt' | 'userName' | 'speakerRenames'>;
  segments: readonly TranscriptSegment[];
  captionTurns?: readonly StoredCaptionTurn[];   // absent or [] = none
}

// meeting-download.ts
interface MeetingDownload { name: string; type: 'text/plain;charset=utf-8' | 'application/zip'; data: string | Uint8Array }
```

| Transcript lines that would be written | Caption turns | `meetingFiles` | `meetingDownload` |
|---|---|---|---|
| ≥ 1 | ≥ 1 | transcript, captions | `base.zip`, `application/zip`, both files in that order |
| ≥ 1 | 0 | transcript | `base — Transcript.txt`, text |
| 0 | ≥ 1 | captions | `base — Meet captions.txt`, text |
| 0 | 0 | `[]` | `null` (no button) |

Captions body: `[mm:ss] Speaker: text` per turn, `mm:ss` from `exportTimestamp(startMs)` (minutes past 59), `Speaker` from `captionSpeaker` (research R8), both collapsed to one line, lines joined by `\n\n`, one `\n` at the end, `''` when there is no turn. The transcript body is `transcriptFile(meeting, segments).body`, unchanged.

## Validation rules mapped to requirements

- FR-001, FR-002: `CaptionLog.update` rules; `mergeCaptionText`; one row per turn.
- FR-003: flush interval and bridge throttle constants; `close()` before `endMeeting`.
- FR-004, FR-005: history at adoption is never sent; re-binding keeps key and time; `ended` drops events.
- FR-008, FR-009: caption text exists only in `captionTurns`, in the offscreen `CaptionLog`/adapter, in the Meet page, and in the panel for the duration of one download; it is in no `LiveEvent`, no chat type and no log call.
- FR-010: `deleteMeeting` range delete; `putCaptionTurns` guard.
- FR-012–FR-018: the table above.
