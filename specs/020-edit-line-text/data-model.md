# Data model: Edit a line's text (020)

## TranscriptSegment (IndexedDB `segments`, `src/core/transcript/model.ts`)

New field:

| Field | Type | Rule |
|-------|------|------|
| `textOverride` | `string \| null` | The user's correction of `text`: one line, trimmed, 1–2,000 characters. `null` = not corrected. Never equal to `text` after normalisation (saving the original clears it). Absent on records before 020; `normaliseSegment` reads it as `null`. Reset to `null` on split pieces. |

Unchanged: `text` (what the transcription produced, kept for `Restore original`), times, words, labels, `labelOverride`. No schema version bump: the field is optional on read.

## Derived

- `displayText(segment) = segment.textOverride ?? segment.text` (`src/core/transcript/labels.ts`). Every consumer of a line's text uses it (research R8).
- A line is **corrected** when `textOverride !== null`; it shows the `edited` mark, is never split and is never removed as a repeat in the merged file.
- A line is **editable** in the main view when it is stored (not the in-progress line), `labelPending !== true`, and the panel is showing the live or stopped-but-not-closed meeting (not a past transcript).

## Meeting (IndexedDB `meetings`)

`summary` is removed in the same transaction as a text correction on the repo path (012 rule: lines changed → summary rebuilt on next listing).

## Messages (`src/core/messaging/protocol.ts`)

`LabelCommand` gains `{ type: 'text/override'; meetingId: string; segmentId: string; text: string | null }`, parsed by `parseLabelCommand` with `parseLineText` (non-null text must parse; `null` clears). `isSegment` accepts `textOverride` absent, `null` or a string. `live/segment-updated` is unchanged and carries the corrected segment.
