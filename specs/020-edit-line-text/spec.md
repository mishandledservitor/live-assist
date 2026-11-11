# Feature Specification: Edit a line's text

**Feature Branch**: `020-edit-line-text`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Sometimes during a meeting I see a mistranscription I want to be able to edit in the moment. I want to be able to select a block that has already been tagged and edit the text of it."

## Clarifications

### Session 2026-11-11

- Q: How does a line open for editing? → A: A double-click on its text (owner, Q1 B). A single click and a drag keep selecting text as now.
- Q: Can a past meeting on the Transcripts screen be edited? → A: No (owner, Q2 A). Editing works in the main view while the meeting runs and after Stop until the transcript is closed; past meetings stay read-only, as they are for speaker corrections.
- Q: Is a corrected line marked? → A: Yes, a small visible `edited` mark on the line, named for screen readers (owner, Q3 A). It shows wherever the line is shown, past transcripts included.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct a mistranscribed line during the meeting (Priority: P1)

During a meeting the user sees a finished line whose text is wrong ("the cue three budget" for "the Q3 budget"). They select that line, change its text, and save. The line shows the corrected text from then on, keeps its time and speaker, and the meeting carries on without interruption: new lines keep arriving, the transcript keeps following the newest line unless the user has scrolled away, and the panel does not lose the edit when a new line arrives while the user is typing.

**Why this priority**: This is the whole request. A wrong word in a name, number or term makes the record and every answer built on it wrong, and the user notices it while the meeting is fresh.

**Independent Test**: Run a meeting from the fixture provider, wait for a line to settle, open it for editing, change a word, save, and check that the line shows the new text while further fixture lines keep arriving.

**Acceptance Scenarios**:

1. **Given** a settled line (its speaker shown, not the "…" placeholder and not the in-progress line), **When** the user double-clicks its text, **Then** the text opens for editing in place, holding the line's current text with the word the user double-clicked selected, so typing replaces it.
2. **Given** a line open for editing, **When** the user changes the text and saves (Enter or `Save`), **Then** the line shows the new text, its time and speaker are unchanged, and focus returns to the line.
3. **Given** a line open for editing, **When** the user cancels (Escape or `Cancel`), **Then** the line shows the text it had before and nothing is stored.
4. **Given** a line open for editing, **When** new lines arrive or other lines settle, **Then** the typed text, the cursor and the open editor are kept, and the transcript does not scroll the editor out of view.
5. **Given** the in-progress line or a line still showing the "…" placeholder, **When** the user double-clicks its text, **Then** nothing opens: only settled lines can be edited.
6. **Given** a settled line, **When** the user single-clicks its text or drags across text to select and copy it, **Then** the selection behaves as it does today and no editor opens.
7. **Given** a past meeting opened from the Transcripts screen, **When** the user double-clicks a line, **Then** nothing opens: past transcripts are read-only.

---

### User Story 2 - The correction is the record (Priority: P1)

Once a line's text is corrected, everything built on the transcript uses the corrected text: Ask's answers and citations (003), the meeting notes' questions (008), `Download transcript` (007, and 016's merged file), and the transcript shown again when the meeting is opened from Transcripts (012). The correction survives closing and reopening the panel and a reload of the extension.

**Why this priority**: A correction that only changes what is on screen would leave the downloaded file and Ask's answers wrong, which is the reason the user corrected the line.

**Independent Test**: Correct a line, then ask a question whose answer is in that line, download the transcript, reopen the panel and open the meeting from Transcripts (read-only there); each shows the corrected text.

**Acceptance Scenarios**:

1. **Given** a corrected line, **When** the user asks a question about the meeting, **Then** the transcript sent as context carries the corrected text, and a citation of that line points to it.
2. **Given** a corrected line in a Meet call with captions, **When** the user downloads the merged transcript (016), **Then** the line's passage carries the corrected text and is never removed as a repeated passage: a human correction outranks the repeat check, as a speaker correction does today.
3. **Given** a corrected line, **When** the panel is closed and opened again, or the meeting is opened from Transcripts, **Then** the line shows the corrected text.
4. **Given** a corrected line, **When** the user renames its speaker or overrides its speaker (002), **Then** the corrected text is kept; **and** when the user corrects the text of a line with a speaker override, **Then** the override is kept.

---

### User Story 3 - Go back to what was heard (Priority: P2)

The user corrected a line and then realises the original was right, or wants to see what the transcription first produced. The original text is kept, the line shows that it was corrected, and the user can restore the original.

**Why this priority**: A correction made in a hurry during a meeting can be wrong itself; keeping the original makes the edit safe to try. The main value (P1) works without it.

**Independent Test**: Correct a line, check it is marked as corrected, open it again, restore the original, and check the line shows the original text with no mark.

**Acceptance Scenarios**:

1. **Given** a corrected line, **When** it is shown, **Then** it carries a small mark that it was corrected, named for screen readers.
2. **Given** a corrected line open for editing, **When** the user chooses `Restore original`, **Then** the line shows the original text, the mark is gone, and every consumer in US2 uses the original text again.
3. **Given** a line open for editing, **When** the user saves text identical to the original, **Then** the line counts as not corrected.

### Edge Cases

- The user saves an empty line, or only spaces: the save is refused with an error that says what to do; the line is not deleted (deleting lines is not part of this feature).
- The user pastes text with line breaks: it is stored as one line, line breaks turned into spaces, as every export already writes a line.
- Very long text: a correction is capped at a generous length (assumption: 2,000 characters, well above any line the transcription produces); longer text is refused with an error that says so.
- Meet's late captions would split a line after it settled (002: a line can split later "if late captions show a speaker change before the line is final"): a line with a corrected text is never split, as a line with a speaker override is never split; the user's correction stands for the whole line.
- The meeting stops, fails or the call ends while a line is open for editing: the editor stays open and the user can still save or cancel; the stopped meeting's lines remain editable until the transcript is closed (014).
- The user clicks `Close transcript` (014) or opens Settings with an unsaved edit: the edit is discarded, as the label editor's edits are today.
- Storing the correction fails: the line keeps the text it had; see FR-015.
- The corrected text no longer matches the line's word timings: the line keeps its start and end time; the word timings are not used for the corrected line (nothing shown to the user depends on them once the line is settled and cannot split).
- 013's captions file and `Download originals` hold Meet's captions, not transcript lines: a correction does not change them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to open the text of a settled transcript line for editing by double-clicking it; a single click or a drag MUST keep selecting text as before. Keyboard users MUST be able to open the same editor from a focused line (the label editor's `Edit text`, plan research R3).
- **FR-002**: Only settled lines MUST be editable: not the in-progress line and not a line whose speaker still shows the pending placeholder.
- **FR-003**: Editing MUST be possible in the main view while a meeting runs and after it stops until the transcript is closed (014). A past meeting opened from the Transcripts screen MUST stay read-only.
- **FR-004**: Saving MUST store the corrected text as part of the meeting's record, in the same place as the line, so it survives the panel closing and an extension reload.
- **FR-005**: The original transcribed text MUST be kept unchanged beside the correction.
- **FR-006**: Every consumer of the transcript (the panel, Ask's context and citations, notes, `Download transcript` and 016's merged file, past transcripts) MUST use the corrected text where a line has one.
- **FR-007**: Corrected text MUST be one line of 1–2,000 characters after trimming; line breaks MUST be turned into spaces; empty text MUST be refused with an error stating what to enter.
- **FR-008**: Saving text equal to the original MUST clear the correction; `Restore original` MUST clear it too.
- **FR-009**: A corrected line MUST carry a small visible `edited` mark, named for screen readers, wherever the line is shown (main view and past transcripts); a line without a correction MUST carry none.
- **FR-010**: Editing a line MUST NOT interrupt the meeting: capture, transcription, new lines arriving and lines settling continue, and an open editor keeps its typed text and cursor through them.
- **FR-011**: While a line is open for editing, the transcript MUST NOT auto-scroll it out of view.
- **FR-012**: A text correction and a speaker correction (rename everywhere, single-line override) on the same line MUST be independent: each survives the other.
- **FR-013**: A line with corrected text MUST NOT be split by late captions.
- **FR-014**: Enter MUST save, Escape MUST cancel, and focus MUST return to the line after either; the editor MUST be reachable and usable by keyboard alone.
- **FR-015**: When a save is refused, the line MUST keep its previous text and the editor MUST stay open with the typed text and an error saying the line could not be saved. On a running meeting a store failure inside the meeting leaves the line unchanged without a message, as a speaker correction does today (plan research R6).
- **FR-016**: The correction MUST NOT be sent anywhere except as part of the transcript that already goes to the user's selected chat provider for Ask (constitution: no new network destination).
- **FR-017**: Every new user-facing string MUST pass the copy rule and be recorded in `specs/006-panel-redesign/copy-review.md`.

### Key Entities

- **Line correction**: a user-entered replacement for one transcript line's text, belonging to that line. Holds the corrected text; the line's original text, time, speaker and speaker override are unchanged. Absent on every line not corrected and on every record made before this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open a settled line, correct one word and save in under 10 seconds, without the meeting's capture or transcript pausing.
- **SC-002**: In the fixture suite, after a correction, 100% of consumers listed in FR-006 show or send the corrected text, and none shows or sends the original.
- **SC-003**: In a fixture meeting delivering a new line every second, an edit kept open for 30 seconds loses no typed character and no cursor position.
- **SC-004**: Restoring the original returns the line, Ask's context and the download to exactly their state before the correction.
- **SC-005**: Lines without a correction, and meetings stored before this feature, read, show and download exactly as before.

## Assumptions

- "A block that has already been tagged" means a settled line: its speaker is shown (a name or "Others"), as opposed to the in-progress line or one still showing "…".
- A correction is human-entered and so is not AI-generated text; it may be written into the transcript and its exports (constitution: AI-generated text never may).
- Corrections are not remembered across meetings (unlike remembered speaker names); each belongs to one line.
- Deleting a line, merging or splitting lines by hand, and editing a line's time are out of scope.
- The 2,000-character cap is generous; a transcription line is far shorter in practice.
- Corrections do not feed back to ElevenLabs as key terms (010); that may come later.
- Depends on 001 (lines), 002 (settled lines, speaker overrides, split), 003/008 (Ask context), 007/016 (downloads), 012 (past transcripts), 014 (closing the transcript).
