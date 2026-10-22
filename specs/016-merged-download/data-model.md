# Data model: Merged download (016)

Nothing is stored and no stored shape changes. The merge reads what 013's download reads and builds a file on demand.

## Read (unchanged, from 001, 002, 012, 013)

| Record | Fields the merge uses | Notes |
|---|---|---|
| `Meeting` | `startedAt` (file name), `userName`, `speakerRenames` | Names as the transcript shows them at the press (FR-009). |
| `TranscriptSegment` | `startMs`, `seq` (order, via `sortSegments`), `text`, `labelPending` (left out when true), `labelOverride`, `labelSource`, `captionName`, `captionSelf`, `speakerLabel` | The written lines of 007's transcript file, in its order. `displayLabel` gives the line's live name (the hint, research R4). |
| `StoredCaptionTurn` | `startMs`, `seq` (order), `speakerName`, `self`, `text` | Turns with non-empty one-line text, in the captions file's order. `captionSpeaker` gives each turn's display name. The text decides speakers only and is never written (FR-011). |

## Built on demand (not stored)

**Word** (transcript side): the token as written (never changed), its line, its normalised form (`''` when it has no letter or digit: it takes no part in the alignment), and after alignment a speaker with a weight (anchor 2, proportional 1, hint 0.75, same-speaker fill 0.5, unplaced 1 for `Others`).

**Caption word**: normalised form and its turn's display name.

**Repeat run**: consecutive written lines without a correction whose every normalised word repeats an 8-word run the transcript wrote earlier (research R3); with the shares of its words and of their sources that are anchors. Removed when exactly one share is at least 0.5 and the run has at least 8 normalised words.

**Sentence**: consecutive tokens of one line ending at a sentence end or the line's end; a speaker (weighted majority, or the line's correction).

**Merged line**: time (the start of the transcript line of its first token), speaker (display name or `Others`), tokens. Written `[mm:ss] Speaker: tokens joined by one space`.

**Merged transcript** (`MergedTranscript`): the merged lines, plus, for tests and the local parity check, which written lines were removed. Its file: decision 70's transcript name and the lines' bodies, one blank line apart, one newline at the end; `''` when nothing would be written.

## Validation rules (from the spec)

- The tokens of the merged lines, in order, equal the tokens of the written lines that were not removed, in order (FR-005).
- Every merged line's time is a written line's start time (FR-010).
- A line with a correction is never removed and every token of it is under the corrected name (FR-008, FR-012 e).
- The merged file holds no token that came from a caption turn (FR-011).
