# Feature Specification: Close transcript

**Feature Branch**: `014-close-transcript`

**Created**: 2026-10-14

**Status**: Specified (2026-10-14; design decisions 91 and 92; edge cases decided without the owner, listed under Clarifications)

**Input**: Owner, 2026-10-14 (design decisions 91, 92): after Stop, the main view can be cleared without deleting the meeting, in two ways: a button `Close transcript` under the last line beside `Download transcript` and `Delete transcript` clears it at once; and the next time the side panel is opened after the meeting stopped, the main view opens clean by itself. Clean is the same state as after a delete on the main view (decision 64). The meeting stays on the Transcripts screen to read, download or delete. A running meeting is never cleared. Once cleared, the meeting cannot be asked about (past meetings are read-only, decision 62) until reopening a meeting (004) is built; notes attached to it stay with it.

## Clarifications

### Session 2026-10-14 (decided without the owner; each can be overruled)

- Q: What exactly is "clean"? → A: The state 012 shows after a delete on the main view (012 FR-020): `No transcript yet.`, no `Download transcript`, no `Delete transcript`, no `Close transcript`, no older transcript in its place, no conversation strip, and the question box as it is when there is no meeting. The next Start works as always and its meeting shows on the main view while it runs and after it stops.
- Q: What does the panel remember, and where? → A: The one thing 012 already remembers: the moment the main view was last cleared, kept on this machine beside the settings (012 Clarifications C5). Closing a transcript, and the clean opening, set that moment just as a delete does. Nothing new is stored and nothing about the meeting is changed, so the clean state survives closing the panel and restarting the browser exactly as 012's does.
- Q: The panel stays open across Stop. Does the main view clear by itself? → A: No. The transcript stays, now with `Close transcript` beside `Download transcript` and `Delete transcript`, and Ask keeps working on it, as today. It clears when the user presses `Close transcript`, or the next time the panel is opened.
- Q: The panel is closed and opened again a few seconds after Stop. → A: It opens clean (the owner's choice in decision 91: the next opening after the meeting stopped, however soon). The meeting is on the Transcripts screen.
- Q: What counts as "opening the panel"? → A: Each time the side panel's page is loaded: opening it from the toolbar, a browser restart that brings it back, and finishing setup. Moving between the main view, Settings and Transcripts is not an opening, and neither is anything that happens while the panel stays open.
- Q: A meeting is running when the panel is opened. → A: It shows live, as today; nothing is cleared. When it stops while the panel stays open, it stays on the main view (previous answer).
- Q: An interrupted meeting (cut off by a browser or extension crash, 012 FR-007) is the most recent one when the panel is opened. → A: The main view opens clean as for any stopped meeting: the meeting stopped, and the next opening clears it. It is on the Transcripts screen marked `Interrupted`, which is where the interruption is shown (012 D7); the main view has no such marker.
- Q: The main view was just cleared (by `Close transcript` or a delete), and the panel is opened again. → A: Still clean; the opening has nothing to clear and remembers nothing new.
- Q: `Close transcript`, then the Transcripts screen, then Back. → A: The main view is still clean. The closed meeting is listed (at the top, as the newest); opening it there shows it read-only; downloading or deleting it there leaves the main view clean.
- Q: An answer is still arriving when Stop is pressed. → A: Stop does not touch it, as today: the answer finishes on the main view. If the user presses `Close transcript` while an answer is still arriving, that answer is stopped as if its own Stop had been pressed (what arrived is kept with the meeting) and a question waiting to be sent after it is dropped: nothing keeps running for a meeting that is no longer on screen. If the panel is closed while an answer arrives, it is stopped as closing the panel stops it today, and the next opening is clean.
- Q: Where does the button go, and what happens to focus? → A: In the row under the last line, in the order `Download transcript`, `Close transcript`, `Delete transcript`, so the permanent action stays at the end. After pressing it, focus moves to the header's Transcripts control (where the meeting now is, and where focus lands after a delete from the main view and Back, 012 US3), or to the Settings gear when there is no Transcripts control.
- Q: `Delete transcript`'s confirmation is open and the user presses `Close transcript`. → A: The main view clears; the confirmation goes with the transcript and nothing is deleted.
- Q: What if the clear cannot be remembered (storage write fails)? → A: For `Close transcript`: the transcript stays and the row says `Couldn't close this transcript. Try again.` (the pattern of 012 P17). For the clean opening: the main view shows the most recent stopped meeting as before this feature; a transcript is never hidden because of a storage failure (012 FR-026).
- Q: A panel is open in a second window when the main view is cleared in the first (by the button or by an opening). → A: The second window's panel clears too, unless a meeting is running there, as 012 already does for a delete: the clean state is one remembered moment for every panel.
- Q: Does anything about the meeting record change? → A: No. It is not marked, moved or edited. Its transcript, labels, questions and answers, notes and kept captions stay with it, and delete still removes them all.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Close a stopped transcript (Priority: P1)

The call has ended and the user has what they need from it. They press `Close transcript` under the last line. The main view is clean at once, ready for the next meeting; the transcript is not deleted and is on the Transcripts screen.

**Why this priority**: It is the owner's explicit control (decisions 91, 92) and the only way to clear the main view without leaving it or deleting.

**Independent Test**: Start and stop a meeting with a fixture, press `Close transcript`, and check the main view is clean, the meeting is listed and readable on the Transcripts screen, and the stored meeting is unchanged.

**Acceptance Scenarios**:

1. **Given** a stopped meeting on the main view, **When** the user looks under the last line, **Then** they see `Download transcript` (when the meeting has something to download), `Close transcript` and `Delete transcript`, in that order.
2. **Given** a stopped meeting on the main view, **When** the user presses `Close transcript`, **Then** the main view is clean (`No transcript yet.`, no `Download transcript`, `Close transcript` or `Delete transcript`, no conversation strip, the question box as with no meeting) and focus is on the Transcripts control.
3. **Given** the main view was cleared with `Close transcript`, **When** the user opens the Transcripts screen, **Then** the meeting is listed as before and can be read, downloaded and deleted there; **When** they go Back, **Then** the main view is still clean.
4. **Given** the main view was cleared with `Close transcript`, **When** the panel is closed and opened again, or the browser is restarted, **Then** the main view is still clean.
5. **Given** the main view was cleared with `Close transcript`, **When** the user presses Start, **Then** the new meeting shows on the main view while it runs and after it stops, with its controls as always.
6. **Given** a meeting is running, **When** the user looks under the last line, **Then** there is no `Close transcript` (and no `Delete transcript`), as today.
7. **Given** an answer is still arriving for the stopped meeting, **When** the user presses `Close transcript`, **Then** that answer stops, the main view is clean, and a question waiting behind it is not sent.
8. **Given** the clear cannot be remembered, **When** the user presses `Close transcript`, **Then** the transcript stays and `Couldn't close this transcript. Try again.` is shown beside the controls.

---

### User Story 2 - The panel opens clean after a meeting stopped (Priority: P1)

The user stops a call and closes the side panel. Later (seconds or days) they open the panel again: the main view is clean, ready for the next meeting. The previous meeting is on the Transcripts screen.

**Why this priority**: The owner chose the automatic clear alongside the button (decision 91); without it the last meeting greets every opening of the panel.

**Independent Test**: Seed or record a stopped meeting, open the panel, and check the main view is clean while the meeting is listed on the Transcripts screen; open the panel during a running meeting and check it shows live.

**Acceptance Scenarios**:

1. **Given** the most recent meeting stopped and no meeting is running, **When** the panel is opened, **Then** the main view is clean and the meeting is on the Transcripts screen.
2. **Given** the panel stays open when the user presses Stop, **When** the meeting stops, **Then** the transcript stays on the main view with `Download transcript`, `Close transcript` and `Delete transcript`, and Ask still works on it, until the user presses `Close transcript` or the panel is next opened.
3. **Given** a meeting is running, **When** the panel is opened, **Then** the running meeting shows live and nothing is cleared.
4. **Given** the most recent meeting was interrupted by a crash, **When** the panel is opened, **Then** the main view is clean and the meeting is on the Transcripts screen marked `Interrupted`.
5. **Given** the main view is already clean, **When** the panel is opened, **Then** it stays clean.
6. **Given** the clean opening cannot be remembered, **When** the panel is opened, **Then** the main view shows the most recent meeting as before this feature.

### Edge Cases

- No meeting has ever been stored: the panel opens with `No transcript yet.` as today; nothing is remembered.
- The panel is opened, the clean state is set, and a second panel was already open in another window showing the stopped meeting: that panel clears too (012's change notification), unless a meeting is running there.
- The user finishes first-run setup with a stored meeting present (e.g. after reinstalling over kept data): the main view opens clean; it is an opening.
- Close, then delete the same meeting on the Transcripts screen: the deletion is complete as always; the main view stays clean.
- Close, then delete a different meeting on the Transcripts screen: the main view stays clean.
- The system clock is set back between Close and the next Start, so the new meeting starts "before" the remembered moment: it shows while it runs, and after it stops the main view is clean; it is on the Transcripts screen (accepted in 012 research R5).
- Notes were attached to the closed meeting: they stay with it; the header's notes control for the next meeting is unaffected.
- Meet's captions were kept for the closed meeting: they stay with it and download with it from the Transcripts screen.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Under the last line of a stopped meeting on the main view, the panel MUST show `Close transcript` beside `Download transcript` and `Delete transcript`, ordered `Download transcript`, `Close transcript`, `Delete transcript` (decision 92). It MUST NOT be shown while the meeting shown is running.
- **FR-002**: Pressing `Close transcript` MUST make the main view clean at once, as 012 FR-020 defines clean, and MUST move focus to the header's Transcripts control (the Settings gear if there is none).
- **FR-003**: Closing MUST NOT delete, mark or change the meeting or anything stored with it (lines, labels, questions and answers, notes, kept captions). The meeting MUST stay listed on the Transcripts screen and be readable, downloadable and deletable there.
- **FR-004**: Each time the side panel is opened, if no meeting is running and the main view would show a stopped meeting (ended by Stop or any other end, or interrupted), the main view MUST open clean instead.
- **FR-005**: A meeting that stops while the panel stays open MUST stay on the main view, with Ask working on it, until `Close transcript` is pressed or the panel is next opened. A running meeting MUST never be cleared.
- **FR-006**: A clean main view, however it came about, MUST stay clean until the next Start, across other screens, closing and reopening the panel, other panels and windows and a browser restart (012 FR-026). The next meeting started MUST show on the main view while it runs and after it stops.
- **FR-007**: What is remembered MUST be 012's single cleared moment and nothing else: kept on this machine only, naming no meeting.
- **FR-008**: Once the main view is clean, Ask MUST NOT be usable on the closed meeting from the main view (decision 62). Pressing `Close transcript` while an answer is arriving MUST stop that answer and MUST drop a question waiting to be sent after it.
- **FR-009**: If the clear cannot be remembered when `Close transcript` is pressed, the transcript MUST stay and the panel MUST show `Couldn't close this transcript. Try again.` beside the controls; the next press tries again. If it cannot be remembered on opening, the main view MUST show the most recent meeting as before this feature.
- **FR-010**: New user-facing strings MUST be exactly those under "Proposed copy" and MUST be recorded in `specs/006-panel-redesign/copy-review.md`.

### Proposed copy

| # | String | Where | Why it stays (copy rule) |
|---|--------|-------|--------------------------|
| X1 | `Close transcript` | Main view, under the last line of a stopped meeting, between `Download transcript` and `Delete transcript` | A control label naming its action in the user's words, the verb + "transcript" pattern of K40 and K6 (decision 92). |
| X2 | `Couldn't close this transcript. Try again.` | Beside the controls after a failed close | Error state: what happened and what to do, the pattern of 012 P17. |

The clean main view adds no string: it shows `No transcript yet.` (K27). Never add: a `Transcript closed` or `Saved to Transcripts` message; a line on the clean main view pointing at the Transcripts screen; a tooltip or helper line explaining that closing does not delete; a confirmation before closing; a line saying the panel cleared itself on opening; an `Undo`.

### Key Entities

- **Main view cleared moment** (from 012, unchanged): the moment the main view was last cleared. The main view shows the running meeting, else the most recent stored meeting started after that moment, else nothing. 014 sets it in two more cases: `Close transcript`, and a panel opening that finds a stopped meeting to show.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a meeting stops, the main view can be made clean with one press, and it is clean within the same screen update (no visible delay).
- **SC-002**: In 100% of openings of the panel after a meeting stopped with no meeting running, the main view opens clean; in 100% of openings during a running meeting it shows the meeting live.
- **SC-003**: After closing, 100% of the meeting's stored data is unchanged, and the meeting is on the Transcripts screen in the same place it would have been without closing.
- **SC-004**: The two new strings pass the copy review and no "Never add" string appears in the panel.

## Assumptions

- The clean state reuses 012's remembered moment and the main view's existing rule; this feature adds ways to set it, not a new state.
- "Opening the panel" is a load of the side panel's page. In Chrome the panel is tied to the meeting tab; whether switching tabs and back reloads the panel is to be seen in the real-call check (if it does, that counts as an opening).
- Ask on past meetings, and reopening a past meeting on the main view, stay in 004 (decision 62); nothing here makes the closed meeting askable.
- No setting turns the automatic clear off (decision 91 chose both ways together; constitution VI).
