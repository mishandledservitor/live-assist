# Feature Specification: Past transcripts

**Feature Branch**: `012-past-transcripts`

**Created**: 2026-10-12

**Status**: Planned (2026-10-12; the three open choices settled by design decision 64)

**Input**: User description: "We need a management pane to view, delete, and download past transcripts, rather than trying to manage that in the main pane. After a call, the last transcript stays, but if you choose to delete transcript, thereafter it takes you to the management pane to view the rest." (user, 2026-10-12). Takes the history list, viewing and deleting out of 004 (specified, never planned) so they ship on their own; 004 keeps the inbox folder export, periodic saves and reopening a meeting to continue its chat.

## Clarifications

### Session 2026-10-12 (assumptions, resolved without the user — the user prefers sensible defaults; each can be overruled)

Three of these were put to the user the same day; the next session records the answers. Where an answer below is marked superseded, the later session wins.

- Q: Where does the pane live? → A: A separate screen in the side panel, like Settings (design decision 32), opened from one control in the main view's header. Back returns to the main view. The main view keeps showing the running or most recent meeting as now, except after the meeting it shows is deleted (next session).
- Q: What does the screen list? → A: Every stored meeting, newest first: date, start time, duration, the speaker names that appear in it, and a marker on a meeting that was interrupted. The running meeting is listed with its own marker.
- Q: What can be done with the running meeting from the list? → A: (Agreed by the user, decision 64.) Nothing but going to it. Its row has no Delete (a meeting cannot be deleted while it runs) and no Download, and selecting it returns to the main view, where it is live and where `Download transcript` already saves it. This keeps one live view and one place whose download follows 007's rule for lines whose name is still settling.
- Q: What does viewing a meeting mean? → A: Selecting a stopped meeting shows its full transcript inside this screen, read-only: no renaming, no line corrections, no Ask, no notes. Asking questions of a past meeting, and its earlier questions and answers, stay in 004.
- Q: What does Download save? → A: Per meeting, the same file as 007 (same name, same body, same rules). Nothing new leaves the machine and no new permission is needed.
- Q: How does Delete work? → A: Per meeting, permanent, after a confirmation. It removes the transcript, its labels, its questions and answers and its notes (constitution I). No multi-select and no "delete all" in this version. (That this screen's confirmation names the questions, answers and notes, and the main view's does not, was agreed by the user, decision 64.)
- Q: Does `Delete transcript` stay on the main view? → A: Yes. After it succeeds, the panel opens this screen showing the meetings that remain, or the screen's empty state when none remain.
- Q: What does the main view show after that, when the user goes Back? → A: **Superseded by the user's answer in the next session.** The assumption was the most recent meeting that remains; the user chose a clean main view instead.
- Q: Does `Download transcript` stay on the main view? → A: Yes, for the meeting shown there, unchanged from 007.
- Q: Which meetings count as interrupted? → A: Those whose record was never closed because the browser or the extension went away mid-meeting (004 FR-010). A meeting ended by Stop, by leaving the call, by closing or navigating the meeting tab, or by a transcription failure carries no marker.
- Q: How long was an interrupted meeting? → A: From its start to the end of its last transcript line. Its record is only closed when the next meeting starts (Clarifications D1), which can be hours or days later, so that closing time is never shown as the duration.
- Q: Which names does a row show? → A: The confirmed names in the meeting as the panel shows them now (after renames and single-line corrections), in order of first appearance. "Others" is not a name and is left out. At most four are shown; the rest are counted (`+2 more`).
- Q: Is the site or the tab title shown? → A: (Superseded for the tab title by design decision 76, session four below: a row's first line is the meeting's title. The site is still not shown.) No. The user asked for date, time, duration and names; v1 has one platform with names (Meet), so the site would read the same on almost every row.
- Q: A later feature will let a meeting have a second downloadable file (the platform's own captions). → A: Not specified here. Requirements speak of a meeting's downloadable files, of which this version has one, the transcript file.

### Session 2026-10-12 (the user's answers to the three open choices — design decision 64)

Decided by the user:

- Q: After `Delete transcript` on the main view, does the main view fall back to the most recent meeting that remains? → A: **No (the recommendation was overruled).** "After a delete from main, I want to see a clean main." The main view is then clean: no transcript, exactly as before any meeting was transcribed (`No transcript yet.`, no `Download transcript`, no `Delete transcript`, Ask as it is with no meeting). The Transcripts screen still opens right after the delete and shows what remains; Back leads to the clean main view.
- Q: Does the running meeting's row offer Download or Delete? → A: **No (agreed).** It has neither, and selecting it returns to the main view.
- Q: Which delete confirmation names the questions, answers and notes? → A: **The Transcripts screen's (agreed).** The main view's confirmation stays as it is.

Assumed, not asked (each can be overruled):

- C1: The main view stays clean until the next Start. Closing and reopening the panel, or restarting the browser, does not bring an older transcript back.
- C2: The same happens when the meeting the main view is showing is deleted from the Transcripts screen (from its row or from its transcript there): the main view is clean afterwards.
- C3: Deleting any other meeting on the Transcripts screen leaves the main view as it was: the meeting it showed is still shown, a clean main view stays clean, a running meeting stays in view.
- C4: A clean main view hides nothing for good. Every remaining meeting stays on the Transcripts screen, one activation away, and the next meeting that is started shows on the main view as always, also after it stops.
- C5: What the panel remembers for this is one moment in time (when the main view was cleared), kept on this machine beside the settings. It is not a meeting's data: it names no meeting, and nothing of a deleted meeting is kept to make it work.

### Session 2026-10-12 (planning: what reading the code settled)

Assumed, not asked (each can be overruled):

- D1: A meeting cut off by a crash keeps an open record until the next meeting starts (not until the extension next starts, as first written). Until then it has no end time and no end reason. The list treats every stored meeting that has no end time and is not the running one as `Interrupted`, the same as one already marked as cut off.
- D2: The main view showed nothing when its `Delete transcript` failed (the confirmation simply stayed open). It now says `Couldn't delete this transcript. Try again.` (P17), so US3 scenario 5 has an error to show.
- D3: A meeting of exactly one or two hours reads `1 h`, `2 h` (P4 gains `{h} h`), not `1 h 0 min`.
- D4: To open the list quickly with hundreds of meetings, each stopped meeting's row details (names, how many lines its file would hold, the end of its last line) are worked out once and kept on that meeting's own stored record. They are derived from the meeting, recalculated whenever a label in it changes, never leave the machine, and are deleted with the meeting because they are part of its record. Until a meeting's details are worked out (the first time the list opens after this feature ships, for meetings stored before it), its row shows date, time and duration first and the names and `Download transcript` a moment later.
- D5: Real deletion also covers anything written late. A question whose answer is still arriving, or notes being saved, when its meeting is deleted must not put anything of that meeting back into storage; the answer is stopped.
- D6: Names remembered across meetings (002, Settings → Remembered names) are not a meeting's data and are not removed by deleting a meeting. They are removed in Settings.
- D7: The `Interrupted` marker is also shown with the transcript of such a meeting in this screen, not only in its row, since that is where the user reads to where it stops.
- D8: In this screen a meeting's `Download transcript` and `Delete transcript` sit under the title, above the transcript, so they are in view when a long transcript opens. The transcript opens at its first line, not its last.

### Session 2026-10-12 (a row shows the meeting's title — design decision 76)

Decided by the user: on the Transcripts screen a row's first line is the meeting's stored title, with date, time and duration under it, then the names. When the title is empty or only a meeting code, the row has no title line. File names are unchanged. This supersedes the first session's answer that the tab title is not shown. Everything else in this session (E1 to E9) was assumed without the user and can be overruled.

- E1 (read from the code): `Meeting.source.title` is the meeting tab's title exactly as Chrome reported it when Start was pressed (`tab.title` in `src/entrypoints/background/meeting-control.ts`). It is not the title Meet's page agent reports later, and it does not follow a title that changes during the call. On Google Meet the tab reads `Meet - {name}` for a call with a name and `Meet - {code}` for a call without one (the two saved real Meet pages in `tests/fixtures/meet/` both read `Meet - abc-defg-hij` after anonymising; 002's research records both a hyphen and an en dash as the separator). On any other site it is whatever the page calls itself.
- E2: The display title is worked out from the stored title each time it is shown; nothing new is stored and `Meeting.summary` is unchanged. A meeting counts as a Meet call when its record says so (`source.platform` is `meet`) or its address is on `https://meet.google.com`. The forms handled, with invented examples, are exactly these:

  | Stored title | Site | Shown as |
  |---|---|---|
  | `Meet - Weekly sync` | Meet | `Weekly sync` |
  | `Meet – Budget review`, `Meet — Budget review` (en dash, em dash) | Meet | `Budget review` |
  | `Meet - abc-defg-hij`, `Meet – ABC-DEFG-HIJ` (three, four and three letters) | Meet | no title line |
  | `abc-defg-hij` | Meet | no title line |
  | `Meet`, `Google Meet`, `Meet -` | Meet | no title line |
  | `Weekly sync` (no `Meet` in front) | Meet | `Weekly sync` |
  | `Meet-up planning`, `Meeting notes - Q4` (no space, separator, space after `Meet`) | Meet | as stored |
  | empty, or only spaces | any | no title line |
  | `  Design   review ` | any | `Design review` (spaces at the ends removed, runs of spaces and line breaks reduced to one space) |
  | `Zoom`, `Microsoft Teams`, `Meet`, `Google Meet`, in any letter case | any | no title line |
  | `Quarterly planning - Zoom`, `Standup \| Microsoft Teams` | not Meet | as stored |
  | `abc-defg-hij` | not Meet | as stored |

  Only Meet's decoration is removed, because only Meet's is known from a real page. A title from any other site is shown as stored (trimmed as above) unless it is empty or only one of the four site names. Nothing is cut from the end of a title, and no length limit is applied to what is kept.
- E3: The single-meeting view's heading shows the title too, on a line above its date and time. With no title it is the date and time alone, as before.
- E4: A long title stays on one line and ends in an ellipsis, in a row and in the heading. The whole title is in the control's accessible name (and the heading's text) for screen readers, and appears on hover.
- E5: The row's opening control is named `Open transcript of {title}, {date}, {time}` when the meeting has a title, and `Open transcript of {date}, {time}` when it has none. The title line is part of that control: selecting it opens the meeting.
- E6: The running meeting's row shows its title as well, above its date line.
- E7: A title is the user's content from a web page. It is rendered as text, never as markup.
- E8: Download and Delete in a row keep their accessible names by date and time, and the delete confirmation still names the meeting by date and time: those two already tell every meeting apart, and a long title in the warning would push its second and third sentences away.
- E9: Rows are not sorted, grouped or searched by title.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every stored transcript and read one (Priority: P1)

The user had four meetings this week. Today the panel only ever shows the last one. They press the transcripts control in the header and get a list of all four, newest first, each with its date, start time, how long it ran and who spoke. They select Tuesday's and read its transcript, then go back to the list, then back to the main view.

**Why this priority**: Every meeting is already stored, but all except the most recent are unreachable. Without the list there is nothing to download or delete from.

**Independent Test**: With four stored meeting fixtures, open the screen: four rows, newest first, each with the expected date, time, duration and names. Select one: its full transcript shows with the labels the panel would show, and offers no rename, correction or question box. Back returns to the list, Back again to the main view.

**Acceptance Scenarios**:

1. **Given** the main view, **When** the user activates the transcripts control in the header, **Then** the Transcripts screen replaces the main view, its title is focused, and every stored meeting is listed newest first.
2. **Given** a stopped meeting started at 14:30 on 7 October 2026 that ran 45 minutes with lines from Jane, the user (Alex) and "Others", **When** its row is shown, **Then** it reads `7 Oct 2026 · 14:30 · 45 min` with the names `Jane, Alex`.
3. **Given** the list, **When** the user selects a stopped meeting, **Then** its whole transcript is shown in this screen with timestamps and current labels (renames and single-line corrections applied, confirmed names and "Others" distinguished as on the main view), under a title giving its date and start time, and nothing in it can be edited.
4. **Given** a meeting's transcript is shown in this screen, **When** the user activates Back or presses Escape, **Then** the list returns with focus on that meeting's row; from the list, Back or Escape returns to the main view with focus on the transcripts control.
5. **Given** a meeting is running, **When** the user opens the screen, looks around and goes back, **Then** capture never paused and the main view shows every line, including those that arrived meanwhile.
6. **Given** a meeting is running, **When** the list is shown, **Then** its row is first, is marked `In progress`, has no Download and no Delete, and selecting it returns to the main view.
7. **Given** a meeting that was cut off when the browser closed, **When** its row is shown, **Then** it is marked `Interrupted` and its duration is the time from its start to the end of its last line.
8. **Given** no meeting is stored, **When** the screen opens, **Then** it shows `No transcripts stored.` and nothing else but its title and Back.
9. **Given** a stopped Meet call whose tab was titled `Meet - Weekly sync` at Start, **When** its row is shown, **Then** its first line reads `Weekly sync`, the line under it reads `7 Oct 2026 · 14:30 · 45 min`, the names follow, and its opening control is named `Open transcript of Weekly sync, 7 Oct 2026, 14:30` (decision 76).
10. **Given** a Meet call without a name, whose tab was titled `Meet - abc-defg-hij`, **When** its row is shown, **Then** it has no title line and reads as in scenario 2.
11. **Given** a meeting with a title, **When** the user selects it, **Then** the heading over its transcript shows the title with the date and start time under it.

---

### User Story 2 - Delete a past transcript for real (Priority: P1)

The user recorded a meeting they should not keep. They find it in the list, choose Delete, confirm, and it is gone from the machine: transcript, labels, questions and answers, notes. The other meetings are untouched.

**Why this priority**: The constitution requires real deletion per meeting, and today only the most recent meeting can be deleted. The user records other people.

**Independent Test**: With three stored meeting fixtures, one with chat and notes, delete that one from the list and confirm: its row is gone, the other two remain, and no transcript line, label, chat turn or note of the deleted meeting can be found in local storage.

**Acceptance Scenarios**:

1. **Given** a stopped meeting in the list, **When** the user chooses Delete, **Then** a confirmation appears in that row naming the meeting's date and time, saying its questions, answers and notes are deleted too and that it cannot be recovered, with focus on the confirming button.
2. **Given** the confirmation, **When** the user confirms, **Then** the meeting disappears from the list, none of its data remains in local storage, the deletion is announced to screen readers, and focus moves to the next row (or the previous one, or the screen title when the list is now empty).
3. **Given** the confirmation, **When** the user cancels or presses Escape, **Then** nothing is deleted and focus returns to that row's Delete.
4. **Given** a meeting's transcript is shown in this screen, **When** the user deletes it there and confirms, **Then** the list returns without that meeting.
5. **Given** the meeting the main view was showing (stopped) is deleted from this screen, **When** the user goes Back, **Then** the main view is clean: `No transcript yet.`, no `Download transcript`, no `Delete transcript`, and it does not show an older meeting.
6. **Given** the last stored meeting is deleted, **When** the list updates, **Then** the screen shows `No transcripts stored.`.
7. **Given** two meetings in the list, **When** the user opens the confirmation on one and then chooses Delete on the other, **Then** only one confirmation is open, on the second.
8. **Given** the main view is showing a stopped meeting and the user deletes a different, older meeting from this screen, **When** they go Back, **Then** the main view still shows the meeting it showed before.
9. **Given** a question about a stopped meeting is still being answered, **When** that meeting is deleted, **Then** the answer stops and no question, answer or transcript text of that meeting is in local storage afterwards.

---

### User Story 3 - Deleting on the main view leaves it clean and leads to the rest (Priority: P1)

After a call the last transcript stays on the main view, as now. The user presses `Delete transcript` there and confirms. No older transcript takes its place: the panel opens the Transcripts screen, where they see what is left, and when they go Back the main view is clean, as it was before any meeting was transcribed. It stays clean until they press Start again.

**Why this priority**: It is the second half of the user's request, and it removes today's surprise: after a delete the main view shows an older transcript with nothing saying which meeting it is. The user's words: "after a delete from main, I want to see a clean main" (decision 64).

**Independent Test**: With three stored meetings and none running, delete the one on the main view and confirm: the Transcripts screen is shown with the two remaining rows and its title focused. Back: the main view shows `No transcript yet.` and neither transcript action. Close and reopen the panel: the same. Start and stop a meeting: that meeting is shown. With one stored meeting, the first steps end on the empty state.

**Acceptance Scenarios**:

1. **Given** a stopped meeting on the main view and two older stored meetings, **When** the user presses `Delete transcript` and confirms, **Then** the Transcripts screen opens, lists the two remaining meetings, and its title is focused.
2. **Given** the only stored meeting is on the main view, **When** the user deletes it, **Then** the Transcripts screen opens on `No transcripts stored.`.
3. **Given** the screen was opened this way, **When** the user goes Back, **Then** the main view is clean, whether or not other meetings remain: `No transcript yet.`, no `Download transcript`, no `Delete transcript`, the question box as it is when there is no meeting, and focus is on the transcripts control.
4. **Given** the user cancels the main view's delete confirmation, **When** it closes, **Then** the main view is unchanged and the Transcripts screen does not open.
5. **Given** the deletion on the main view fails, **When** `Couldn't delete this transcript. Try again.` is shown, **Then** the panel stays on the main view with the transcript still shown.
6. **Given** the main view is clean after a delete and older meetings remain, **When** the panel is closed and opened again, or the browser is restarted, **Then** the main view is still clean and the Transcripts screen still lists the older meetings.
7. **Given** the main view is clean after a delete, **When** the user presses Start, **Then** the new meeting shows on the main view while it runs and after it stops, with `Download transcript` and `Delete transcript` as always.
8. **Given** the main view is clean after a delete, **When** the user opens the Transcripts screen and selects one of the remaining meetings, **Then** its transcript is shown in that screen; the main view stays clean.

---

### User Story 4 - Download any past transcript (Priority: P2)

The user wants last Tuesday's transcript as a file for the knowledge-base inbox. They find it in the list and press Download; the same file the main view would have saved for it lands in Downloads.

**Why this priority**: The file format already exists (007) and the most recent meeting can already be downloaded from the main view; this extends it to the others.

**Independent Test**: With a stored meeting fixture that is not the most recent, press Download in its row: one file is saved whose name and body are identical to what 007 produces for that meeting.

**Acceptance Scenarios**:

1. **Given** a stopped meeting started at 14:30 on 7 October 2026 in the list, **When** the user presses its Download, **Then** one file named `Meeting — 07-10-2026 at 14h30.txt` is saved, byte for byte what 007 specifies for that meeting with its current labels. (Amended 2026-10-12, feature 013, decisions 67–70: the file is named `Meeting — 07-10-2026 at 14h30 — Transcript.txt`, body unchanged; for a meeting with kept Meet captions the one file is `Meeting — 07-10-2026 at 14h30.zip` holding it and the captions file.)
2. **Given** a meeting's transcript is shown in this screen, **When** the user presses Download there, **Then** the same file is saved.
3. **Given** a stored meeting with no lines that would be written to the file, **When** its row is shown, **Then** it has no Download.
4. **Given** a download from this screen, **When** it completes, **Then** the screen is unchanged: same list, same position, no message from the panel.

---

### Edge Cases

- A meeting stops (Stop, the call ends, the tab closes) while the screen is open: its row loses `In progress` and gains Download and Delete without the user leaving the screen.
- A meeting with no transcript lines (started and stopped in silence): listed with its date, time and duration and `Nothing was transcribed.` where the names would be; it can be deleted, has no Download, and selecting it shows the same sentence.
- A meeting in which every line is "Others": the row shows no names; nothing takes their place.
- More than four names: the first four in order of first appearance, then the count of the rest (`+2 more`). The full transcript shows them all.
- An interrupted meeting with no lines: marked `Interrupted`, no duration shown.
- The running meeting's row shows its date and start time and `In progress`, and no duration: a length that is out of date as soon as it is drawn is left out.
- Meetings shorter than a minute read `under 1 min`; from an hour, `1 h 15 min`.
- Two meetings started in the same minute: two rows with the same date and time, told apart by duration and names; each downloads and deletes separately.
- A long history (hundreds of meetings): the list scrolls inside the screen; the screen's title and Back stay in view.
- A very long transcript (3 hours, about 5,000 lines) opened from the list: it scrolls inside the screen, and the page itself never scrolls (006 FR-023 applies to this screen too).
- Deletion fails (storage error): the row stays, and it says `Couldn't delete this transcript. Try again.`. On the main view the transcript stays and the same sentence is shown by the confirmation.
- The main view is clean and the user deletes another meeting on the Transcripts screen: the main view stays clean.
- A meeting is running and the user deletes an older one on the Transcripts screen: the main view keeps showing the running meeting, and after Stop it shows that meeting.
- The main view was cleaned, then the panel was closed for days and other panels or windows were opened: every panel shows a clean main view until the next Start.
- The cleared marker cannot be read (storage error): the main view shows the most recent stored meeting, as before this feature. A transcript is never hidden because of a read failure.
- The cleared marker cannot be written after a successful delete: the deletion stands, the Transcripts screen opens, and the main view shows the most recent meeting that remains.
- A meeting whose row details are not worked out yet (first opening after this feature ships): the row shows date, time and duration, `Delete transcript` and the control that opens it; names and `Download transcript` appear when ready, without the list jumping to another scroll position.
- A meeting cut off by a crash and not yet followed by another Start: listed as `Interrupted`, with Download and Delete, like any interrupted meeting.
- The stored meetings cannot be read: the screen says `Couldn't read the stored transcripts. Close the panel and open it again.` instead of the empty state, so a read failure never looks like an empty history.
- The user opens the screen while the consent reminder is showing: the reminder is cancelled and nothing starts, as when opening Settings (006).
- Escape with a delete confirmation open closes the confirmation only; a second Escape goes back.
- Narrow panel (320 px): a row's date, time and duration stay on one line; names and actions wrap beneath; no control is hidden.
- A title longer than the panel is wide (320 px): one line ending in an ellipsis, in the row and in the single-meeting heading; the page does not scroll sideways and the date line under it is whole. The full title is read by a screen reader and shown on hover.
- A meeting whose stored title is empty, only a Meet code, or only the site's name: no title line, and nothing in its place (no `Untitled`).
- Two meetings with the same title (a weekly call): two rows with the same first line, told apart by the date line under it.
- A title containing markup characters (`<b>Roadmap</b>`): shown as those characters.
- A meeting on a site other than Meet: its tab title as stored, with nothing removed from it.
- The running meeting: its title above its date line, with `In progress`.
- Setup not complete: there is no header and so no way to this screen, as with Settings.
- Dark mode and contrast follow 006 FR-020.
- Dates and times use the local time zone and the moment transcription started, the same moment the file name uses.

## Requirements *(mandatory)*

### Functional Requirements

**Reaching the screen**

- **FR-001**: The main view's header MUST have one control that opens the Transcripts screen in the same panel, on one line with the existing header controls at 320 px width and wider. Its accessible name and tooltip are `Transcripts`.
- **FR-002**: Opening the screen MUST move focus to its title. Back (accessible name `Back`) and Escape MUST return from the list to the main view with focus on the control that opened it.
- **FR-003**: Opening, using or leaving the screen MUST NOT stop, pause or restart a running meeting and MUST NOT lose transcript lines that arrive meanwhile.
- **FR-004**: Apart from the new header control, FR-019, FR-020, FR-026 and the failure message of FR-021, the main view MUST be unchanged: it shows the running meeting, or else the most recent stored one, with `Download transcript` and, once stopped, `Delete transcript` after the last line (006 FR-013, 007 FR-001).

**The list**

- **FR-005**: The screen MUST list every stored meeting, newest first by start time, including meetings stored before this feature shipped.
- **FR-006**: Each row MUST show the meeting's date, start time and duration, and the confirmed speaker names in it as currently displayed (after renames and single-line corrections), in order of first appearance, at most four followed by a count of the rest. "Others" MUST NOT be listed as a name.
- **FR-007**: A meeting whose record was never closed because the browser or extension went away MUST be marked `Interrupted`, in its row and with its transcript in this screen, and its duration MUST be measured to the end of its last transcript line, never to the time its record was closed afterwards. A stored meeting that has no end time and is not the running meeting counts as interrupted.
- **FR-008**: The running meeting MUST be listed first and marked `In progress`. Its row MUST offer neither Delete nor Download, and selecting it MUST return to the main view.
- **FR-009**: The list MUST reflect storage as it is when the screen opens and MUST follow changes while it is open: a deleted meeting leaves it, and a meeting that stops gains its actions. A row MAY show its names and `Download transcript` shortly after its date, time and duration when they have not been worked out before; the list MUST NOT wait for them.
- **FR-010**: With no stored meeting the screen MUST show `No transcripts stored.`. When stored meetings cannot be read it MUST say so and what to do, and MUST NOT show the empty state.

**Viewing**

- **FR-011**: Selecting a stopped meeting MUST show its full transcript inside this screen: every stored line in the main view's order, with its timestamp and current display label, keeping the main view's distinction between confirmed names and "Others" (constitution II), under a title giving the meeting's date and start time. It MUST open at its first line.
- **FR-012**: The transcript shown here MUST be read-only: no speaker rename, no line correction, no question box, no notes control, and the meeting's earlier questions and answers are not shown. Viewing MUST NOT change the stored meeting.
- **FR-013**: From a meeting's transcript, Back and Escape MUST return to the list at the same scroll position with focus on that meeting's row.

**Download**

- **FR-014**: Each stopped meeting's downloadable files MUST be offered both in its row and with its transcript in this screen. In this version a meeting has one such file, the transcript file. (Amended 2026-10-12, feature 013: a meeting may also have a captions file; one press still saves one file, a `.zip` of both when there are two, decision 67.) One `Download transcript` press saves every downloadable file the meeting has, and the main view's `Download transcript` MUST go through the same path, so a later feature can add a file in one place. (Amended 2026-10-22, feature 016, decision 93: after Stop, the one file for a meeting with both records is the merged `.txt`; the single-meeting view also offers `Download originals`, which saves 013's zip, decision 97.)
- **FR-015**: The transcript file MUST be exactly the file 007 produces for that meeting (007 FR-004 to FR-009): same name, same body, current labels, transcript only, never questions, answers, notes or other AI-generated text. The action MUST be absent for a meeting with no line that would be written (007 FR-002). (Amended 2026-10-12, feature 013: the name is `… — Transcript.txt`, decision 70; the action is present for a meeting with kept Meet captions even without such a line, decision 75.)
- **FR-016**: Downloading MUST save to the browser's download location, MUST NOT send anything over the network, MUST NOT need a new browser permission, and MUST NOT change the meeting or the screen.

**Delete**

- **FR-017**: Each stopped meeting MUST have a Delete action, both in its row and with its transcript in this screen, that asks for confirmation first. The confirmation MUST name the meeting by date and start time, say that its questions, answers and notes are deleted with it and that it cannot be recovered, and offer a confirming action and a cancelling one. At most one confirmation is open at a time.
- **FR-018**: Confirming MUST remove the meeting's record, every transcript line, its label changes, its questions and answers (with the transcript text that was sent with them), its notes, its kept Meet captions (013, from 2026-10-12) and the row details kept for the list from local storage completely, with no soft delete and no recycle bin (constitution I). Nothing written afterwards may put any of it back: an answer still arriving for that meeting is stopped and not stored, and notes being saved for it are not stored. A meeting cannot be deleted while it runs, so no line can arrive for a deleted meeting. No other meeting is affected. Files already downloaded are not touched. Names remembered across meetings (002) and notes waiting for the next meeting (008) are not a meeting's data and stay.
- **FR-019**: After `Delete transcript` on the main view succeeds, the panel MUST open the Transcripts screen showing the meetings that remain, or its empty state, with its title focused. It MUST NOT open when the deletion is cancelled or fails.
- **FR-020**: After the meeting shown on the main view is deleted, from the main view or from the Transcripts screen, the main view MUST be clean: no transcript, `No transcript yet.`, no `Download transcript`, no `Delete transcript`, and the question box as it is when there is no meeting. It MUST NOT show an older stored meeting (decision 64).
- **FR-021**: A completed deletion on the Transcripts screen MUST be announced to screen readers, and focus MUST move to the next row, else the previous row, else the screen title. A failed deletion MUST leave the meeting where it was (listed, or shown on the main view) and say what happened and what to do, with the same sentence in both places.
- **FR-022**: There MUST be no multi-select and no way to delete several or all meetings in one action.
- **FR-026**: A clean main view (FR-020) MUST stay clean until the next meeting is started: across going to other screens and back, closing and reopening the panel, other panels and windows, and a browser restart. A meeting started afterwards MUST show on the main view while it runs and after it stops. What is remembered for this MUST be kept on this machine only, MUST NOT contain or identify any meeting's data, and when it cannot be read the main view MUST show the most recent stored meeting rather than hide one.
- **FR-027**: Deleting a meeting other than the one the main view shows MUST leave the main view as it was: the meeting it showed, a clean main view, or the running meeting.

**Meeting title (design decision 76)**

- **FR-028**: When a meeting has a display title (FR-029), its row's first line MUST be that title, with the date, start time and duration on the line under it and the names after that. When it has none, the row MUST have no title line and nothing in its place. This applies to the running meeting's row too.
- **FR-029**: A meeting's display title MUST be worked out from its stored title by the rule in Clarifications E2 and from nothing else: Meet's own `Meet` prefix and separator removed on a Meet call; no title when what remains is empty, is a Meet meeting code, or is only a site's name; any other title as stored with surrounding and repeated spaces removed. It MUST NOT be stored, and file names MUST NOT change.
- **FR-030**: The single-meeting view's heading MUST show the display title on a line above the date and start time when the meeting has one.
- **FR-031**: A title MUST be rendered as text, never as markup. A title too long for its line MUST stay on one line and end in an ellipsis without widening the page (006 FR-023), with the full title in the opening control's accessible name and shown on hover. The opening control's accessible name MUST include the title when there is one.

**Privacy, layout and copy**

- **FR-023**: The screen MUST read only local storage. It MUST NOT cause any network request and MUST NOT send transcript, chat or notes content anywhere (constitution I).
- **FR-024**: On this screen the panel page itself MUST NOT scroll: the list, or the transcript being viewed, scrolls inside it, and the screen's title and Back stay in view (006 FR-023). Colours and contrast follow 006 FR-020 and FR-021.
- **FR-025**: Every user-facing string this feature adds MUST be one of the strings under "Proposed copy" below, as confirmed or amended by the copy review against `embody-dont-announce` (design decision 33), and the panel MUST add no other text for this feature.

### Proposed copy

For the copy review that precedes implementation. Each string was drafted against `embody-dont-announce`: titles, control names, states the reader cannot otherwise see, what happened and what to do, and the irreversible-action warning. There is no intro line under the title, no row count, no helper text about where files go, no "Downloaded" or visible "Deleted" confirmation (Chrome's download indicator and the row's disappearance show them), and no explanation of why the running meeting has no actions.

| # | String | Where | Job |
|---|--------|-------|-----|
| P1 | `Transcripts` | Accessible name and tooltip of the header control; title of the screen | Names the control and the screen in the user's words, as the gear and `Settings` do. Not "Past transcripts", because the running meeting is listed too. |
| P2 | `Back` | Screen bar, list and single-meeting view | Existing string (006). |
| P3 | `{d Mon yyyy} · {HH:MM} · {duration}`, e.g. `7 Oct 2026 · 14:30 · 45 min`; `{d Mon yyyy} · {HH:MM}` where no duration is shown | Row | The meeting's identity. Day, month, year order and 24-hour time, as in the file name. |
| P3a | `{title}`, e.g. `Weekly sync` (added 2026-10-12, design decision 76) | Row, the line above the date line; absent when the meeting has no title | The meeting's own name, as its tab showed it. Content, not interface copy: no label in front of it and no placeholder when it is missing. |
| P4 | `{n} min`, `{h} h {m} min`, `{h} h` (whole hours), `under 1 min` | Duration in a row | Content. |
| P5 | `{name}, {name}` and `+{n} more` | Row, under the date line | Who spoke. |
| P6 | `In progress` | Marker on the running meeting's row | A state the row does not otherwise show; it also accounts for the missing actions without explaining them. |
| P7 | `Interrupted` | Marker on a meeting cut off by a crash or closed browser, in its row and beside the actions of its transcript in this screen | Tells the user the transcript may stop mid-meeting (constitution IV). |
| P8 | `Nothing was transcribed.` | In place of names on a meeting with no lines, and as that meeting's transcript | Empty state for one meeting. |
| P9 | `Open transcript of {d Mon yyyy}, {HH:MM}`; with a title `Open transcript of {title}, {d Mon yyyy}, {HH:MM}` (amended 2026-10-12, decision 76) | Accessible name of the row's selecting control | Accessible equivalent; the visible row is the control. |
| P10 | `{d Mon yyyy}, {HH:MM}`; with a title, `{title}` on a line above it (amended 2026-10-12, decision 76) | Title of the single-meeting view | Which meeting this is. |
| P11 | `Download transcript`; accessible name `Download transcript of {d Mon yyyy}, {HH:MM}` in a row | Row and single-meeting view | Existing label (K40); the accessible name tells rows apart. |
| P12 | `Delete transcript`; accessible name `Delete transcript of {d Mon yyyy}, {HH:MM}` in a row | Row and single-meeting view | Existing label (K6); the accessible name tells rows apart. |
| P13 | `Delete the transcript of {d Mon yyyy}, {HH:MM} permanently? Its questions, answers and notes are deleted too. It cannot be recovered.` | Delete confirmation on this screen | Irreversible-action warning (constitution I). Names the meeting because several are in view, and names the questions, answers and notes because this screen does not show them. Amended 2026-10-12 (feature 013, C4): for a meeting with kept Meet captions the middle sentence reads `Its questions, answers, notes and Meet's captions are deleted too.` |
| P14 | `Delete permanently` / `Cancel` / group name `Confirm delete` | Delete confirmation | Existing strings (K6). |
| P15 | `Transcript deleted.` | Screen-reader announcement only, not visible | Accessible equivalent of the row disappearing. |
| P16 | `No transcripts stored.` | Empty list | Empty state. No instruction is added: Start is one Back away and the main view already says `No transcript yet.` (K27). |
| P17 | `Couldn't delete this transcript. Try again.` | In the row, or in the main view's confirmation, after a failed deletion | What happened and what to do. |
| P18 | `Couldn't read the stored transcripts. Close the panel and open it again.` | In place of the list when storage cannot be read | What happened and what to do. |

The main view's own delete confirmation (K6) is unchanged, as the user agreed (decision 64): there the questions and answers are on screen next to the transcript being deleted. It gains only P17 when a deletion fails. The clean main view adds no string: it shows `No transcript yet.` (K27), which is already there, and nothing says that a transcript was deleted or where the others are (the Transcripts screen has just shown them).

### Key Entities

- **Stored meeting**: one transcription session already kept in local storage by 001, 002, 003 and 008: when it started, when and how it ended, its transcript lines, label renames and single-line corrections, its questions and answers, its notes. This feature adds no new kind of record; it keeps a stopped meeting's row details on the meeting's own record (below).
- **Meeting summary**: what a row shows, derived from a stored meeting: date and start time, duration, confirmed speaker names, state (in progress, stopped, interrupted), and whether it has any line a transcript file would contain. The parts that need every line (names, the number of file lines, the end of the last line) are kept on the stopped meeting's record once worked out, recalculated when a label changes, and deleted with the meeting.
- **Downloadable file**: a file built on demand from a stored meeting. One kind exists in this version, the transcript file defined by 007; nothing is stored for it.
- **Screen position**: whether the panel shows the main view, Settings or Transcripts, and within Transcripts the list or one meeting. Not persisted: the panel always opens on the main view.
- **Main view cleared marker**: the moment the main view was last cleared by deleting the meeting it showed. The main view shows the running meeting, else the most recent stored meeting started after that moment, else nothing. Kept on this machine beside the settings; it is not part of any meeting and survives closing the panel and restarting the browser.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every stored meeting is reachable from the main view in one activation, and its transcript in two.
- **SC-002**: A user can find a meeting from last week and have its transcript file in Downloads in under 20 seconds.
- **SC-003**: After a deletion from this screen or from the main view, no transcript line, label change, question, answer or note of that meeting can be found in local storage, and every other meeting is intact, in 100% of the fixture suite's cases.
- **SC-004**: In 100% of successful main-view deletions the panel ends on the Transcripts screen showing exactly the meetings that remain, and Back leads to a main view with no transcript.
- **SC-005**: 100% of files downloaded from this screen are identical, name and body, to what the main view's `Download transcript` produces for the same meeting.
- **SC-006**: With 200 stored meetings every row's date, time and duration is shown within 1 second of opening the screen, and from the second opening on the names too; a 3-hour transcript (about 5,000 lines) is shown within 2 seconds of selecting it, and the panel answers a click within 200 ms once it is shown.
- **SC-007**: Opening the screen, viewing, downloading and deleting cause zero network requests, and the extension's permission list is identical to before.
- **SC-008**: Going to the screen and back during a running meeting loses zero transcript lines.
- **SC-009**: The automated accessibility check reports no violations on the list, the single-meeting view, the delete confirmation and the empty state, in light and dark mode.
- **SC-010**: At 400 px × 870 px with 200 stored meetings, and with a 1,500-line transcript open, the page's scroll height equals the panel's height.
- **SC-011**: After the meeting shown on the main view is deleted, the main view shows no transcript in 100% of cases until the next Start, including after the panel is closed and reopened; and after the next Start it shows that meeting in 100% of cases.

## Assumptions

- Meetings, their lines, labels, questions and answers and notes are already stored as they arrive (001, 002, 003, 008), and one complete per-meeting deletion already exists for the main view's `Delete transcript`. This feature adds a way to list and read stored meetings and reuses that deletion; it changes neither capture nor transcription, and stores only two new things: a stopped meeting's row details on its own record (Clarifications D4) and the moment the main view was cleared (C5).
- The screen follows the Settings screen's pattern (006 US3): same panel, a title and Back, the main view kept alive underneath so a running meeting is undisturbed.
- The transcript file comes from 007's formatter unchanged. A stopped meeting read from storage has no line whose name is still pending (002), so its file holds every finished line.
- Out of scope, staying in 004: asking questions of a past meeting and showing its earlier questions and answers, renaming speakers or correcting lines in a past meeting, the granted inbox folder, automatic and periodic saves to it, and export to it on demand. When 004 adds the inbox folder, what deleting does to an inbox file follows 004 (design decision 23).
- Out of scope for this version: search, filtering or sorting of the list, multi-select, "delete all", automatic expiry, the site's name or address in a row (the tab's title is shown since design decision 76), sorting or searching by title, and a second downloadable file per meeting (the platform's own captions; specified since as feature 013, which adds it to this screen once both are built).
- Nothing is deleted automatically; meetings stay until the user deletes them (design decision 6).
- The copy review of the strings under "Proposed copy" happens before implementation, as for 006, 007 and 008; the list above is a proposal, not the final text.
- Dates in the list are written day, month, year with a 24-hour time in the local time zone, matching the order the file name uses; the user works in that convention.
- No new settings, permissions or dependencies.
- The clean main view is not a setting and has no control of its own: it follows from deleting the meeting shown there and ends with the next Start (decision 64, Clarifications C1 to C5).
