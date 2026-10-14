# Feature Specification: History & inbox export

> 2026-10-12: the history list, viewing a past transcript, deleting and downloading one moved to `specs/012-past-transcripts/spec.md`; this spec keeps the inbox folder export, periodic saves and reopening a meeting to continue its chat.

**Feature Branch**: `004-history-inbox-export` (specified on `docs/specs-002-004`)

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "ROADMAP 004 — History & inbox export. Depends on 001 (capture & live transcript). Every meeting is persisted locally as it arrives — transcript, speaker labels, chat — with no automatic deletion. A history list lets the user reopen a past meeting, continue chatting with it, export it, and delete it. The user grants access to a folder once (target: knowledge-base/05-inbox/); during the meeting the transcript is saved there every few minutes, overwriting the same file, and saved a final time on Stop. The file is named `Meeting — DD-MM-YYYY at HHhMM.txt` and contains lines `[mm:ss] Speaker: text` separated by blank lines — transcript only, never the chat. Decisions: design-decisions.md #6, #7, #8, #9, #10; constitution Principles I, II, IV, V, VI."

## Clarifications

### Session 2026-10-07

- Q: Re-export when the meeting's inbox file exists? → A: Overwrite the meeting's own file; never overwrite another meeting's file.
- Q: Does deleting a meeting also delete its inbox file? → A: No; local history only, and the confirmation says so.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The transcript lands in the knowledge-base inbox automatically (Priority: P1)

The user grants the extension access to the knowledge base's `05-inbox` folder once. From then on, every meeting they transcribe appears in that folder as a text file in the same format as the existing inbox drops, updated every few minutes during the meeting and finalised when they press Stop. They never have to remember to export.

**Why this priority**: Feeding the company knowledge base is the main downstream use of the transcript, and the periodic save is the constitution's guarantee that a crash loses at most a few minutes.

**Independent Test**: With a folder granted and a recorded transcript fixture replayed as a live meeting, the folder contains one file with the expected name whose content grows at each periodic save and matches the full transcript byte-for-byte in the expected format after Stop.

**Acceptance Scenarios**:

1. **Given** no folder has been granted, **When** the user opens export settings and chooses a folder, **Then** the folder is remembered, its name is shown, and the panel's export indicator shows it as ready.
2. **Given** a granted folder and a meeting started at 14:30 on 7 October 2026, **When** the first periodic save happens, **Then** a file named `Meeting — 07-10-2026 at 14h30.txt` exists in the folder containing the transcript so far.
3. **Given** the meeting continues, **When** later periodic saves happen, **Then** the same file is overwritten with the longer transcript; no second file is created for the same meeting.
4. **Given** the user presses Stop, **When** the final save completes, **Then** the file contains the complete transcript and the panel confirms "Saved to inbox" with the file name.
5. **Given** the file content, **When** it is read, **Then** every line is `[mm:ss] Speaker: text`, lines are separated by one blank line, there is no header, no chat content and no AI-generated text, and speakers appear by their current labels (names where known, the user's name, or "Others").
6. **Given** the browser crashes 25 minutes into a meeting, **When** the user looks in the folder, **Then** the file contains the transcript up to the last periodic save, no more than the save interval behind.

---

### User Story 2 - Nothing is lost: every meeting is kept locally (Priority: P1)

Every meeting is saved on the user's machine as it happens — transcript lines, speaker labels (including renames and overrides), and the chat. Closing the panel, reloading the extension or restarting the browser loses nothing that had already appeared on screen.

**Why this priority**: The constitution requires that the transcript is never lost; export and history both rest on this local record.

**Independent Test**: Replay a recorded meeting, interrupt it (close the panel / restart the extension context), and verify that every line shown before the interruption, its labels, and the chat are present when the meeting is reopened.

**Acceptance Scenarios**:

1. **Given** a running meeting, **When** a transcript line appears in the panel, **Then** it is already saved locally (no batching that could lose shown lines).
2. **Given** the user renamed a speaker or overrode a line, **When** the meeting is reopened later, **Then** the rename and override are still applied.
3. **Given** the user chatted during the meeting, **When** the meeting is reopened, **Then** the full chat is shown with working citations.
4. **Given** the extension is closed unexpectedly mid-meeting, **When** the user opens the panel again, **Then** the interrupted meeting appears in history, marked as interrupted, with everything up to the interruption.
5. **Given** meetings accumulate over months, **When** time passes, **Then** none are deleted automatically.

---

### User Story 3 - Reopen a past meeting and keep asking questions (Priority: P2)

The user opens the history list, sees past meetings newest first (date, time, duration, site, participants), opens one, reads its transcript, and asks new questions about it in the chat, which continues from where the previous chat left off.

**Why this priority**: Valuable after the meeting ("what did we agree last Tuesday?"), but the live meeting and the inbox file come first.

**Independent Test**: With stored meetings loaded from fixtures, open the history list, open one meeting, ask a question against a recorded provider stream; the answer cites that meeting's timestamps and is added to that meeting's saved chat.

**Acceptance Scenarios**:

1. **Given** several stored meetings, **When** the user opens history, **Then** they are listed newest first with date, start time, duration, site and the speaker names that appeared.
2. **Given** the user opens a past meeting, **When** it loads, **Then** its transcript, labels and chat are shown read-only for the transcript and open for new questions.
3. **Given** a reopened meeting, **When** the user asks a question, **Then** it is answered over that meeting's full transcript (not the live one) and the new question and answer are saved with that meeting.
4. **Given** a reopened meeting, **When** the user renames a speaker or overrides a line, **Then** the change is saved with that meeting.

---

### User Story 4 - Export or re-export a past meeting on demand (Priority: P2)

From a meeting in history, the user exports it to the granted folder — for example after fixing speaker names, or after the inbox copy was processed and removed.

**Why this priority**: Covers corrections after the meeting and meetings recorded before a folder was granted; automatic export (Story 1) handles the usual case.

**Independent Test**: From a stored meeting fixture, press Export; the folder contains the meeting's file in the expected name and format, reflecting the current labels.

**Acceptance Scenarios**:

1. **Given** a past meeting whose labels were corrected after Stop, **When** the user presses Export, **Then** the meeting's file is written with the corrected names.
2. **Given** a past meeting recorded while no folder was granted, **When** the user grants a folder and presses Export, **Then** its file is written.
3. **Given** the meeting's file already exists in the folder, **When** the user exports again, **Then** the meeting's own file is overwritten with the current version (e.g. corrected speaker names); a file belonging to a different meeting is never overwritten, and if the meeting's file was already removed from the folder it is simply written again

---

### User Story 5 - Delete a meeting for real (Priority: P2)

The user deletes a meeting from history after a confirmation; its transcript, labels and chat are gone from the machine, with no recycle bin.

**Why this priority**: Required by the constitution (real per-meeting deletion), and the user records other people.

**Independent Test**: Delete a stored meeting fixture; it disappears from history, and no transcript, label or chat data for it remains in local storage.

**Acceptance Scenarios**:

1. **Given** a meeting in history, **When** the user chooses Delete, **Then** a confirmation states what will be removed and that this cannot be undone, and says what happens to the inbox file.
2. **Given** the user confirms, **When** deletion completes, **Then** the meeting is gone from history and none of its data remains locally.
3. **Given** the meeting being deleted is the one currently being transcribed, **When** the user tries to delete it, **Then** deletion is unavailable until the meeting is stopped.
4. **Given** the meeting's file exists in the inbox folder, **When** the meeting is deleted, **Then** only the local history is deleted; the inbox file is left untouched, and the delete confirmation states that the exported file in the inbox folder is not affected

---

### Edge Cases

- Folder access lapses (browser restart, permission revoked, folder moved or deleted): the panel shows export as needing attention with the reason, offers a one-click re-grant, keeps saving locally, and writes the file as soon as access returns — including the final save if Stop happened meanwhile.
- No folder granted at all: transcription and history work normally; the export indicator says no folder is set; Stop shows that the meeting was kept in history only.
- Two meetings start in the same minute (same file name): the second meeting's file gets a distinguishing suffix (e.g. `Meeting — 07-10-2026 at 14h30 (2).txt`) so neither overwrites the other.
- A file with the meeting's name already exists but belongs to another meeting (e.g. a manual drop): it is never overwritten; the suffix rule applies.
- The inbox copy is processed and deleted by the knowledge-base workflow while the meeting is still running: the next periodic save recreates it.
- Meetings longer than 60 minutes: timestamps keep counting total minutes (`[75:12]`), keeping the `[mm:ss]` shape of the existing inbox files.
- Speaker text containing line breaks: written as a single line so every line keeps the `[mm:ss] Speaker: text` shape.
- Unconfirmed/fallback labels are exported as their visible label ("Others"); no confirmation markers or other annotations appear in the file.
- A meeting with no transcript lines (started and stopped in silence): kept in history; no inbox file is written.
- Local storage is close to full: the panel warns visibly before saving fails; it never silently drops lines.
- A partial save is still being written when the next one is due, or when Stop is pressed: saves never interleave; the final save always reflects the complete transcript.
- The meeting date/time in the file name uses the local time zone and the moment transcription started.

## Requirements *(mandatory)*

### Functional Requirements

**Local persistence**

- **FR-001**: Every transcript line MUST be saved on the user's machine as soon as it appears in the panel, together with its timestamp, speaker label and label source.
- **FR-002**: Speaker renames, line overrides and the chat (questions, answers, status, citations) MUST be saved with the meeting as they happen.
- **FR-003**: Each meeting record MUST include start date and time, duration, the site/platform it was recorded on, and whether it ended normally or was interrupted.
- **FR-004**: Meetings MUST be kept until the user deletes them; there MUST be no automatic deletion or expiry.
- **FR-005**: Meeting data MUST stay in local browser storage on the user's machine and MUST NOT be sent anywhere except as described in 001 (transcription) and 003 (chat questions).

**History**

- **FR-006**: The side panel MUST offer a history list of all stored meetings, newest first, showing date, start time, duration, site and speaker names.
- **FR-007**: Users MUST be able to open a stored meeting and see its full transcript with labels and its chat, with working `[mm:ss]` citations.
- **FR-008**: Users MUST be able to ask new questions about a reopened meeting; questions are answered over that meeting's full transcript and the exchange is added to that meeting's saved chat (reusing 003's chat behaviour).
- **FR-009**: Users MUST be able to rename speakers and override lines in a reopened meeting (where 002 is present), with changes saved.
- **FR-010**: A meeting interrupted by a crash or closed extension MUST appear in history marked as interrupted, with all lines saved before the interruption.

**Deletion**

- **FR-011**: Users MUST be able to delete any stopped meeting after a confirmation that says the deletion is permanent.
- **FR-012**: Deletion MUST remove the meeting's transcript, labels and chat from local storage completely (no soft delete, no recycle bin).
- **FR-013**: What deleting a meeting does to its inbox file MUST follow the answer to User Story 5 scenario 4, and the delete confirmation MUST say which applies.

**Folder grant**

- **FR-014**: Users MUST be able to choose an export folder once in settings; the choice MUST be remembered across sessions and its name shown.
- **FR-015**: The panel MUST show the export state at all times during a meeting: ready, not set, needs re-grant (with reason), saving, last saved at a time, or failed (with reason).
- **FR-016**: When folder access has lapsed, the user MUST be able to restore it with a single action, after which pending saves are written.

**Inbox file**

- **FR-017**: The file MUST be named `Meeting — DD-MM-YYYY at HHhMM.txt` using the local date and time at which transcription of the meeting started (e.g. `Meeting — 07-10-2026 at 14h30.txt`).
- **FR-018**: The file body MUST consist only of transcript lines, each formatted `[mm:ss] Speaker: text`, in time order, with exactly one blank line between consecutive lines, and no header, footer, chat, summary or other AI-generated text.
- **FR-019**: `mm:ss` MUST be the time since the meeting started, with minutes counting past 59 for long meetings; `Speaker` MUST be the line's current visible label (participant name, user's name, manual label, or "Others").
- **FR-020**: During a meeting with a granted folder, the system MUST save the file every 2 minutes when there are new or changed lines since the last save, overwriting the meeting's own file.
- **FR-021**: When the user presses Stop, the system MUST write a final save containing the complete transcript and confirm it in the panel with the file name.
- **FR-022**: The system MUST never overwrite a file that does not belong to the current meeting; on a name collision it MUST add a distinguishing suffix and keep using that name for the meeting.
- **FR-023**: Users MUST be able to export any stored meeting on demand from history, using the same name and format rules, reflecting its current labels; behaviour when the meeting's file already exists follows User Story 4 scenario 3.
- **FR-024**: No inbox file MUST be written for a meeting with no transcript lines.
- **FR-025**: Writing to the folder MUST sit behind an export-destination contract so a later "push to knowledge base" destination can replace or join it without changing the file content rules above.

### Key Entities

- **Meeting record**: one transcription session — start date/time, duration, site, status (live, stopped, interrupted), transcript lines, label renames and line overrides, chat, and its export file name and last export time.
- **Transcript line**: timestamp from meeting start, speaker label and its source, text.
- **Chat conversation**: the meeting's questions and answers (defined in 003), stored with the meeting.
- **Export folder grant**: the user-chosen folder, its display name, and current access state.
- **Inbox file**: the text file in the granted folder for one meeting; its name is fixed when first written and reused for every later save of that meeting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a simulated crash at any point in a meeting, the inbox file is never more than 2 minutes of transcript behind what was on screen, and the local history copy is missing nothing that was shown.
- **SC-002**: 100% of exported files in the fixture suite match the existing inbox format exactly (name pattern, line pattern, blank-line separation, no extra content), and the knowledge-base workflow can process them like existing inbox drops without manual edits.
- **SC-003**: Zero chat or AI-generated text appears in any exported file across the fixture suite.
- **SC-004**: The user grants the folder once and, across browser restarts, exports keep working, or the panel shows the re-grant prompt before the next save is due.
- **SC-005**: A past meeting from the history list opens with its transcript visible within 2 seconds for a 2-hour meeting.
- **SC-006**: After deletion, no data for the deleted meeting can be found in local storage.
- **SC-007**: A user can find a meeting from last week in history and ask it a question in under 30 seconds.

## Assumptions

- **Depends on 001**: this feature persists and exports 001's live transcript — segments from the mic and tab-audio streams with `[mm:ss]` timestamps from meeting start and speaker labels — and hooks into 001's Start/Stop and status indicators. It does not change capture or transcription. Where 002 (speaker names, renames, overrides) and 003 (chat) are present, their data is stored and their behaviour reused; the history list and export work without them (labels are then the user's name vs "Others", and there is no chat to store).
- The save interval is 2 minutes, which satisfies the constitution's "a crash loses at most a few minutes"; it is a constant, not a setting (Principle VI).
- The file content matches the existing inbox drops observed in `05-inbox` on 2026-10-07: no header line, `[mm:ss] Speaker: text`, one blank line between lines; real names replace `Speaker N` where known (design decision #8).
- The knowledge-base inbox is routinely processed and emptied by its own workflow; the app treats the inbox file as a write-only drop and never reads it back.
- Folder access is granted through the browser's own folder picker; browsers may require the grant to be confirmed again after a restart, which is why the re-grant state and one-click restore exist.
- Search and filtering within history are out of scope for v1; the list is newest first.
- Pushing exports directly to the knowledge-base repository is a later feature (design decision #7).
