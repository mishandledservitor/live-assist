# Research: Edit a line's text (020)

## R1 Where the correction lives

- **Decision**: a new segment field `textOverride: string | null`, beside 002's `labelOverride`, on the stored `TranscriptSegment`. `text` stays what the transcription produced. Every consumer reads the line's text through one helper, `displayText(segment)` in `src/core/transcript/labels.ts` (`textOverride ?? text`), as it reads the label through `displayLabel`.
- **Rationale**: the speaker override already proves the path (panel → live port or repo → runtime → store → `live/segment-updated`); one field keeps the original for `Restore original` (FR-005, FR-008) and needs no migration: `normaliseSegment` defaults it to `null` for every older record (SC-005).
- **Alternatives**: overwrite `text` and keep the original in a side store (two writes per edit, and every reader of the side store has to know); a separate corrections store keyed by segment id (a join in every consumer, and the chat reads the repo directly).

## R2 Opening the editor: double-click, the word selected

- **Decision**: a `dblclick` on a settled line's text opens the text editor in place of the text. Before it opens, the panel reads the browser's selection inside the text (a double-click selects the word under the pointer natively) and the editor's field opens with the same range selected, so typing replaces the wrong word. The in-progress line and a line showing `…` get no handler (FR-002). A single click or a drag never opens anything (US1-6), so copying text keeps working.
- **Rationale**: owner's choice (Q1 B). Reusing the native word selection costs nothing and makes the common case (one wrong word) one double-click and the new word.
- **Alternatives**: a single click (owner chose against it; it fights text selection); a per-line edit button (another control on every line).

## R3 Keyboard path

- **Decision**: the label editor (002, opened from the line's label button, which is already a tab stop) gains a button `Edit text` that closes it and opens the text editor on the same line, with the whole text selected. Nothing else becomes focusable.
- **Rationale**: FR-014 requires a keyboard path; making each line's text a tab stop would double the tab stops of a 5,000-line transcript. The label button already is "this line" for keyboard and screen-reader users.
- **Alternatives**: `tabIndex` on each text span; a keyboard shortcut on a focused label button (not discoverable).

## R4 The editor

- **Decision**: a small inline form in the line (`role="group"`, accessible name `Edit line text`): a `textarea` named `Line text` that grows with its text, `Save`, `Restore original` (only when the line is corrected), `Cancel`. Enter saves; Shift+Enter is not special (line breaks become spaces anyway, FR-007); Escape cancels; focus returns to the line's label button (or to the line's text container when names are off, which carries `tabIndex=-1` only while returning focus). Input is normalised by `parseLineText` in `src/core/messaging/protocol.ts`: line breaks and runs of white space become one space, trimmed, 1–2,000 characters. Empty → `Enter the line's text.`; too long → `Keep the line under 2,000 characters.`. Text equal to the line's original (after the same normalisation) is saved as `null` (FR-008).
- **Rationale**: inline keeps the line's position and context; the 002 label editor's form pattern (`field-error`, `role="alert"`) is reused.

## R5 The meeting keeps running around the editor

- **Decision**: one editor state in `Transcript` (`{ id, kind: 'label' | 'text', selection }`); the memoised `Line` gets the editor element only when it is the edited line, so other lines and new lines re-render as today and the open editor's state (a component with its own `useState`) is kept across updates (FR-010). While any editor is open, the auto-follow layout effect does not scroll (FR-011); it resumes on close if the user was at the bottom. This also stops the 002 label editor being scrolled away, which was the same problem.
- **Rationale**: SC-003 (no typed character or cursor lost with a line a second).

## R6 Saving, and errors

- **Decision**: `meetingApi.overrideText(target, segmentId, text | null)` mirrors `overrideLine`: over the live port while the meeting runs (`text/override` command, parsed by `parseLabelCommand`), otherwise `MeetingRepo.setTextOverride` in one transaction that also removes `meeting.summary` (012; the file line count depends on text). The editor awaits the call: a rejection (repo path, or no port) keeps the editor open with `Couldn't save this line. Try again.`; success closes it. On the live path the runtime's store write can still fail inside the offscreen document; then nothing is broadcast and the line keeps its old text with no message, exactly as for a speaker override today. Recorded in FR-015.
- **Rationale**: the panel has no acknowledgement channel for live commands; adding one is out of proportion for a write that has not failed in any recorded run.

## R7 Splitting and relabelling

- **Decision**: a line with `textOverride` counts as overridden for splitting: the runtime's `isOverridden` (attributor) and the guard in `split()` check `labelOverride != null || textOverride != null`. `splitSegment` resets `textOverride: null` on pieces (never reached with a correction, kept for safety). `relabel` already spreads only label fields, so a correction survives a rename or caption change (FR-012, FR-013).

## R8 Consumers

- **Decision**: `displayText` replaces `segment.text` in: `Transcript.tsx` line text, `chat/context.ts` `renderLine` (earlier turns compare sent lines, so a corrected line is re-sent automatically), `chat/citations.ts` `textsAt`, `export/transcript-file.ts` (`writable` and the line), `export/merged-transcript.ts` `transcriptLines`. In the merged file a text-corrected line counts as corrected for the repeat check (never removed), as a speaker-corrected one is (decision 98's note: a human correction outranks the alignment). 013's captions file and `Download originals` carry Meet's captions, not lines, and are unchanged. `meeting-summary` gets the right count through `transcriptFileLines`.

## R9 The `edited` mark

- **Decision**: after the text, a small muted `edited` in the line (class `line-edited`), real text so screen readers read it with the line; shown in the main view and in past transcripts (owner Q3 A). Not part of any download or Ask context (consumers read data, not the DOM).
