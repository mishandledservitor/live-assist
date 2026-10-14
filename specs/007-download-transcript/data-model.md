# Data model: Download transcript (007)

007 stores nothing. It reads the existing 001/002 types (`Meeting`, `TranscriptSegment`, `DisplayLabel`) and derives one value.

## TranscriptFile (derived, `src/core/export/transcript-file.ts`)

| Field | Type | Rule |
|---|---|---|
| `name` | string | `Meeting — DD-MM-YYYY at HHhMM.txt`; local date/time of `meeting.startedAt`; two-digit day, month, hour (24 h) and minute; four-digit year; `—` is U+2014 with one space each side |
| `body` | string | settled lines (below) joined by `\n\n`, then `\n`; `''` when there are none |

### Line

`[{mm}:{ss}] {speaker}: {text}`

| Part | Source | Rule |
|---|---|---|
| `mm:ss` | `segment.startMs` | whole seconds since meeting start, floored; minutes zero-padded to two digits and unbounded (`[75:12]`, `[123:04]`) |
| `speaker` | `displayLabel(segment, meeting).text` | override → rename → stored label ("Others", the user's name, or a caption name); whitespace collapsed |
| `text` | `segment.text` | trimmed, runs of whitespace (incl. line breaks) → one space |

A segment is written when `labelPending` is not true and its collapsed text is not empty. Order: `sortSegments` (startMs, then seq).

Inputs: `meeting: Pick<Meeting, 'startedAt' | 'speakerRenames'>`, `segments: readonly TranscriptSegment[]`.
