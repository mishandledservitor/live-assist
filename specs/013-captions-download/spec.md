# Feature Specification: Captions download

**Feature Branch**: `013-captions-download`

**Created**: 2026-10-12

**Status**: Implemented 2026-10-12; the real-call check awaits the user (`manual-check.md`). Amended 2026-10-12 for design decisions 65–75, and 2026-10-13 for design decision 79 (one reminder text on every platform; supersedes decision 71); plan, research, contracts and tasks in this folder

**Input**: User description: "When you download transcript, it should download the captions file as well, as from the meeting. Not just the one we created." (user, 2026-10-12). Design decision 63. Until now live-assist deliberately never read the text of Meet's captions, only who was speaking and when (002 FR-004, research R5). This feature reverses that for one purpose: keeping Meet's own captions as a second record of the meeting, saved next to live-assist's transcript. Speaker naming keeps working from names and timing exactly as now.

## Clarifications

Three sessions on 2026-10-12. Where they disagree, the later one wins: the user's decisions (session 2) replace the first session's assumptions on the same point, and each replaced answer is marked.

### Session 2026-10-12, first (assumptions made while specifying, before the user was asked)

- Q: When are the captions read? → A: As the meeting goes, and saved locally with the meeting as they arrive, never read once at Stop. Meet rewrites a turn's text while the person speaks; the latest text of a turn replaces its earlier versions, so a turn is one line however often it was rewritten. A crash loses at most the last 10 seconds of caption changes. (Accepted by the user, session 2 "standing defaults".)
- Q: Where does the caption text go? → A: Nowhere but local browser storage and the file the user downloads. It is not sent to ElevenLabs, not sent to a chat provider, not part of what Ask is given, not shown in the panel, not logged, and not written into the transcript. It is deleted with the meeting, for real. (Confirmed for Ask by decision 72.)
- Q: What does `Download transcript` do now? → A: ~~One press saves two files when the meeting has stored captions.~~ **Superseded by decision 67**: one `.zip` holding both.
- Q: What is the captions file called? → A: `Meeting — DD-MM-YYYY at HHhMM — Meet captions.txt`. (Confirmed by decision 69, which also names the zip and renames the transcript file.)
- Q: What is in the captions file? → A: The transcript's line shape: `[mm:ss] Speaker: text`, one blank line between lines, UTF-8, no header or footer, one line per caption turn in the order the turns appeared. The time is when the turn appeared in Meet, on the meeting clock the transcript uses. The text is Meet's, unchanged apart from whitespace.
- Q: Which speaker names does it use? → A: The names the transcript uses. (Decided by the user, decision 66.)
- Q: A meeting with no stored captions? → A: The transcript is saved alone. (Decided by the user, decision 68.)
- Q: A meeting with stored captions but no transcript line to write? → A: The button is shown and saves the captions file alone. (Decided by the user, decision 75.)
- Q: Where does it work? → A: On the main view and on 012's Transcripts screen (row and single-meeting view), the same way. (Accepted, session 2 "standing defaults".)
- Q: Does the captions file go to the knowledge-base inbox? → A: Not in this feature; 004 decides. The recommendation left for 004 is no. (Accepted, session 2 "standing defaults".)
- Q: Does `Show Meet captions` matter? → A: No. Captions are kept the same way whether Meet's captions are hidden or shown. (Accepted, session 2 "standing defaults".)
- Q: Is there a setting to turn this off? → A: No. (Decided by the user, decision 65.)
- Q: Captions that were already on the page when Start was pressed? → A: Not kept. (Decided by the user, decision 73.)
- Q: A turn still being rewritten when the user downloads or presses Stop? → A: The file has the turn's text as it stands. Unlike the transcript file, nothing is held back as pending. (Accepted, session 2 "standing defaults"; how close to "that moment" is made exact in session 3.)
- Q: Does the file mark gaps (captions turned off for ten minutes, a page reload)? → A: No. The file has the turns that were captured, and the times show the gap. The panel's existing speaker-names status already says when captions are off or unreadable. (Accepted, session 2 "standing defaults".)
- Q: Is the caption time corrected for Meet's delay? → A: No. A caption appears a second or two after the words begin, so a captions line usually carries a slightly later time than the transcript line for the same words.

### Session 2026-10-12, second (the user's decisions, asked one at a time; all final)

- Q: Is keeping Meet's captions a setting? → A: No. On every Meet call live-assist transcribes, the captions are kept; there is no switch. (Decision 65.)
- Q: Which names does the captions file use? → A: The same display names as the transcript: the user's name for Meet's "You", and renames applied, remembered ones included. Single-line corrections are not applied; they belong to a line of the transcript. (Decision 66.)
- Q: How do two files reach Downloads? → A: When a meeting has both, `Download transcript` saves ONE `.zip` holding both, built in the panel: one download, no multiple-downloads prompt from Chrome, no new permission. This replaces "two files in one press" and the fallback to a second control. The user was told the cost: an unzip step before the transcript can go to the knowledge-base inbox. (Decision 67.)
- Q: And a meeting without captions? → A: The plain `.txt` transcript, as in 007. The zip appears only when there are two files. (Decision 68.)
- Q: What are the files called? → A: The zip is `Meeting — DD-MM-YYYY at HHhMM.zip`; inside are `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt` and `Meeting — DD-MM-YYYY at HHhMM — Meet captions.txt`. (Decision 69.)
- Q: Is the transcript only called `— Transcript` inside the zip? → A: No. Every transcript downloaded from the panel is named `… — Transcript.txt`, inside a zip or on its own. This changes 007 FR-004; 007 FR-010's "identical files" now means identical bodies. The knowledge-base inbox export (004, constitution Technical Constraints) keeps `Meeting — DD-MM-YYYY at HHhMM.txt`. (Decision 70.)
- Q: What does the pre-Start reminder say? → A: On Google Meet only, it gains the sentence `Meet's captions of the meeting are kept on this computer too.`; on every other platform it is unchanged. This replaces the single rewritten reminder of the first session. (Decision 71. Superseded 2026-10-13 by decision 79: see "Session 2026-10-13" below.)
- Q: May Ask use the captions? → A: Never. They are not sent to a chat provider and are not part of Ask's context. Not a roadmap item either. (Decision 72.)
- Q: Captions from before Start? → A: Not kept, even when Meet's page still holds them. The captions file begins with the first caption turn that appears after Start. (Decision 73.)
- Q: Does the main view's delete confirmation name the captions? → A: Yes, for a meeting that has them: `Delete this transcript permanently? Meet's captions of this meeting are deleted too. It cannot be recovered.`; unchanged without captions. 012's Transcripts-screen confirmation names them too when present. (Decision 74.)
- Q: A meeting with captions but no transcript line? → A: `Download transcript` is shown and saves the plain captions `.txt` alone (no zip, per decision 68). The label stays. (Decision 75.)

Standing defaults the user accepted as a set, 2026-10-12 (first-session answers that stand):

- Captions are saved as the meeting goes, never read once at Stop.
- A mid-meeting download has the captions so far, with a still-changing turn as it stands.
- The behaviour is the same with `Show Meet captions` on or off, and from the main view or the Transcripts screen.
- Captions turned off, or a Meet page reload, mid-meeting leaves a gap in the captions file, and nothing new is said about it in the panel.
- Whether the captions file ever goes to the knowledge-base inbox is 004's question.

### Session 2026-10-12, third (assumptions made while planning; each can be overruled)

- P1: "As it stands at that moment" is made measurable: the text a download or Stop sees is at most 5 seconds behind Meet's page (the text travels from the page at most once a second per turn and is stored every two seconds; research R1, R4). The 10-second bound after a crash is unchanged.
- P2: A remembered name (002 FR-022) is applied to a caption name as soon as a caption turn of that name is kept, not only when a transcript line is first attributed to it. Otherwise a person Meet captioned but whom no transcript line was named after would appear under Meet's name in the captions file while a remembered name exists (decision 66). Line labels are what they would have been (FR-006, SC-006).
- P3: Meet drops the beginning of a long turn's text from its page while the person keeps talking (seen in the real call of 2026-10-08, 002 research R6 `dropped-older-text`). The dropped beginning is kept: a turn's stored text is everything Meet showed for it, in order (FR-002).
- P4: Withdrawn 2026-10-13 (decision 79). It said the reminder's Meet sentence was decided from the tab Start will transcribe. The reminder no longer depends on the tab. What stands of it: a tab whose address cannot be read is not treated as a Meet call, and no captions are kept for it.

### Session 2026-10-13 (decided by the user)

- Q: Does the pre-Start reminder still say that Meet's captions are kept? → A: No. The user: "This reminder and consent is overkill. It should just remind if the settings is on, nothing else. The app should just store and save both." The reminder has one text on every platform, the original K1: `Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs and the transcript is kept on this computer. You can turn this reminder off in Settings.` The Meet-only sentence (C2) and the panel's check of the tab's platform before the reminder are removed. Captions are still kept on every Meet call, with the reminder on or off (decision 65); the delete confirmations that name the captions stay (decision 74). Not done, by the same decision: tying the keeping of captions to the acknowledged reminder, and a line in Settings saying captions are kept. (Decision 79, supersedes decision 71.)
- Q: Does the rule that captions must not be kept by a build whose reminder does not say so still hold? → A: No. It followed from decision 71 and is withdrawn with it (decision 79). Constitution I asks for truth about what third parties retain; captions kept on this computer are not that.
- P5: The date and time of the two files inside the zip are the moment of the download.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get Meet's captions with the transcript (Priority: P1)

After a Google Meet call the user presses `Download transcript`. One zip lands in Downloads. In it are live-assist's transcript and Meet's own captions of the same meeting, named so that each says what it is. The user opens both and compares a passage where the transcript looked wrong.

**Why this priority**: It is the request. Meet's captions are a second, independent record of what was said; having both lets the user check one against the other.

**Independent Test**: With a stored meeting fixture that has transcript lines and caption turns, press `Download transcript`: one `.zip` is saved; opened with an ordinary unzip tool it holds exactly two files with the specified names, the transcript's body byte for byte as 007 specifies and the captions body as specified here.

**Acceptance Scenarios**:

1. **Given** a stopped Meet meeting started at 14:30 on 7 October 2026 with stored captions and transcript lines, **When** the user presses `Download transcript`, **Then** exactly one file is saved, `Meeting — 07-10-2026 at 14h30.zip`, and it holds exactly `Meeting — 07-10-2026 at 14h30 — Transcript.txt` and `Meeting — 07-10-2026 at 14h30 — Meet captions.txt`, in that order.
2. **Given** that zip, **When** the transcript file in it is compared with what 007 produces for the same meeting, **Then** the body is identical byte for byte; only the name differs (`— Transcript`).
3. **Given** the captions file, **When** it is read, **Then** every line is `[mm:ss] Speaker: text`, one line per caption turn in the order the turns appeared, lines separated by exactly one blank line, no header or footer, and the text is what Meet's captions said, e.g. `[00:04] Sarah Brown: Good morning, can everyone see the roadmap slide?` followed by `[00:11] Alex: Yes, it's up.`.
4. **Given** the user's name in settings is Alex and Meet labelled the user's turns "You", **When** the captions file is read, **Then** those turns read `Alex`, never `You`.
5. **Given** the user renamed "Bob B." to "Bob Brown" everywhere (in this meeting, or remembered from an earlier one), **When** the captions file is read, **Then** that speaker's turns read `Bob Brown`, as in the transcript file, including when no transcript line was ever named after that speaker.
6. **Given** the user corrected one transcript line's speaker with "Just this line", **When** the captions file is read, **Then** no caption turn's name changed because of it.
7. **Given** Meet rewrote a turn several times while the person spoke, **When** the captions file is read, **Then** the turn is one line holding its last text.
8. **Given** a meeting in mixed Greek and English with Meet's caption language set to English, **When** the captions file is read, **Then** it holds what Meet wrote, unchanged, and Greek characters Meet did write are intact.
9. **Given** the zip, **When** it is opened with macOS Archive Utility, with `unzip`, or with Windows Explorer, **Then** both names show the em dash correctly and both files open as UTF-8 text.

---

### User Story 2 - Captions are kept as the meeting goes, on this computer only (Priority: P1)

The user records other people. Meet's captions of what they said are now kept, so the user needs the same guarantees the transcript has: the captions are saved as they arrive, they go nowhere, and deleting the meeting deletes them. The reminder before Start is the same on every platform and says nothing about captions (decision 79).

**Why this priority**: Without this the feature breaks the constitution's first principle. A captions file read once at Stop would also be lost in exactly the cases a second record is for.

**Independent Test**: Run a fixture meeting on a saved Meet page with a scripted caption sequence; interrupt it without Stop; the stored meeting has every caption turn up to at most 10 seconds before the interruption. Across the whole run, no network request and no message to a transcription or chat provider contains caption text. Delete the meeting; no caption text of it remains in local storage.

**Acceptance Scenarios**:

1. **Given** a running Meet meeting with captions on, **When** the browser is closed without Stop, **Then** the meeting stored on the computer has its caption turns up to at most 10 seconds before the browser closed, and a later download saves them.
2. **Given** a running meeting whose captions are being kept, **When** the user asks a question in Ask, **Then** what is sent to the chat provider contains the transcript (and notes, if any) and no caption text.
3. **Given** a running meeting, **When** everything sent to ElevenLabs during it is inspected, **Then** none of it contains caption text.
4. **Given** a stored meeting with captions, **When** the user presses `Delete transcript` on the main view, **Then** the confirmation reads `Delete this transcript permanently? Meet's captions of this meeting are deleted too. It cannot be recovered.`, and confirming removes its caption turns from local storage together with its transcript, labels, questions, answers and notes.
5. **Given** a stored meeting without captions, **When** the user presses `Delete transcript` on the main view, **Then** the confirmation is today's text, unchanged.
6. **Given** the reminder before Start is on, **When** the user presses Start on a Google Meet call or on any other tab, **Then** the reminder reads `Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs and the transcript is kept on this computer. You can turn this reminder off in Settings.` on both, at once, and nothing starts until it is acknowledged. (Amended 2026-10-13, decision 79.)
7. **Given** a Google Meet call, **When** the user starts with the reminder on and acknowledges it, or starts with the reminder off, **Then** the captions are kept either way (decision 65). (Amended 2026-10-13, decision 79.)
8. **Given** captions were already on before Start with earlier turns on the page, **When** the meeting runs and is downloaded, **Then** none of the turns that were on the page at Start are in the captions file, including one that was still being added to.
9. **Given** a running Meet meeting, **When** lines are named, **Then** every label and its timing is what it would have been without this feature.

---

### User Story 3 - Captions of a running or past meeting (Priority: P2)

Mid-meeting the user downloads what there is so far and gets the zip with both files. Next week they open the Transcripts screen, find Tuesday's meeting and download it; the same zip again.

**Why this priority**: The same button already works in these places for the transcript (007, 012); the captions follow it.

**Independent Test**: With a running fixture meeting, press `Download transcript`: one zip is saved, its captions file holding every turn so far including the one still being written, and capture carries on. With a stored meeting that is not the most recent, press Download on the Transcripts screen: a zip whose two files are byte for byte what the main view would save for that meeting.

**Acceptance Scenarios**:

1. **Given** a running meeting with caption turns, one still being written, **When** the user downloads, **Then** the captions file in the zip holds every turn so far, the last one with its text as it stood at most 5 seconds earlier, and transcription and caption capture carry on unchanged.
2. **Given** the same meeting a minute later, **When** the user downloads again, **Then** the captions file holds the later text of that turn and the turns since.
3. **Given** a stopped meeting with captions in the Transcripts list, **When** the user presses its Download (in the row or with its transcript), **Then** a zip is saved whose name and two files are identical to what the main view saves for that meeting.
4. **Given** a stored meeting with captions in the Transcripts list, **When** the user presses its Delete, **Then** the confirmation names Meet's captions (C4), and confirming removes them.
5. **Given** any download, **When** it completes, **Then** the panel shows no message and is otherwise unchanged.

---

### User Story 4 - Meetings without captions, and captions without a transcript (Priority: P2)

A meeting on another site, a Meet call where captions never came on, and every meeting transcribed before this feature have no stored captions. Their download is the transcript `.txt` alone, and the panel does not mention a second file. The rare meeting where Meet's captions were kept but no transcript line was written still offers the download, and saves the captions `.txt` alone.

**Why this priority**: Nothing may be lost for the meetings the user already has, an empty or placeholder captions file would be a false record, and the captions-only meeting is the case where the second record matters most.

**Independent Test**: With a stored meeting fixture without caption turns, press `Download transcript`: exactly one `.txt` is saved, named `… — Transcript.txt`, its body identical to 007's, and no text about captions appears. With a fixture that has caption turns and no transcript line, the button is present and saves exactly one `.txt`, the captions file.

**Acceptance Scenarios**:

1. **Given** a meeting transcribed on a site that is not Google Meet, started at 14:30 on 7 October 2026, **When** the user downloads it, **Then** one file is saved, `Meeting — 07-10-2026 at 14h30 — Transcript.txt`, no zip, and nothing is said about captions.
2. **Given** a Meet meeting where captions could not be turned on, **When** the user downloads it, **Then** one `.txt` is saved, the transcript.
3. **Given** a meeting stored before this feature shipped, **When** it is listed, viewed, downloaded or deleted, **Then** everything behaves as before this feature, except that its downloaded file is now named `… — Transcript.txt`.
4. **Given** a Meet meeting where captions were kept but no transcript line would be written, **When** the meeting is shown (main view, a Transcripts row, or its single-meeting view), **Then** `Download transcript` is there and saves one file, `Meeting — DD-MM-YYYY at HHhMM — Meet captions.txt`, no zip.
5. **Given** a meeting with neither a transcript line nor a caption turn, **When** it is shown, **Then** there is no `Download transcript`.

---

### Edge Cases

- The user turns Meet's captions off mid-meeting: the turns kept so far stay; nothing is captured while they are off; capture resumes if they come back on. The file holds what was captured, with no marker for the gap. The speaker-names status says "Captions were turned off", as today; nothing new is said.
- Captions never start (the control is missing, Meet changed, the user never left the lobby): no caption turns, no captions file, the transcript downloads alone as a `.txt`.
- The Meet page reloads mid-meeting: turns stored before the reload are kept. Captions are not captured while the page is away. Turns that are on the page when capture attaches again are not stored (so a turn Meet shows again is not stored a second time and gets no new time); turns that appear afterwards are captured as usual. What Meet actually does to its caption history on reload is not known and is checked in a real call before this is called done (research "Open risks").
- Meet re-creates its caption elements without a reload (a re-render): a turn that was already kept is recognised and continues as the same line, with its first time.
- Transcription reconnects: caption capture does not depend on the transcription session and continues through the reconnect, so the captions file can hold words from seconds the transcript lost.
- The user is muted in Meet: Meet does not caption what it does not transmit, so nothing the user says while muted is in the captions file.
- A very long meeting (3 hours, on the order of 1,200 turns): every turn is kept; the download is produced without a visible pause. If Meet removes old turns from its page during a long call, a removed turn keeps the last text it had; removal is never stored as an empty turn. Whether Meet prunes is not known and is checked in a long real call.
- One person talks for several minutes in a single turn: the turn is one line, with its whole text, however long, including the beginning when Meet has dropped it from the page (P3).
- Two people are captioned at once: Meet shows a turn for each; each is its own line, ordered by when it appeared, and two turns that appeared in the same second keep Meet's order on the page.
- The same person has several turns: each is its own line.
- Meet corrects an older turn after a newer one has started: the older turn's line takes the corrected text for as long as the turn is on the page and the meeting runs. This does not change which changes count as speaking activity for naming (002 FR-025).
- A turn still being rewritten at Stop or at a mid-meeting download: the file has it as it stood at most 5 seconds earlier (P1); nothing is held back.
- A turn with a name but no text yet, or whose text is empty after collapsing whitespace: not kept, and never in the file.
- A turn whose text contains a line break: written on one line, whitespace collapsed (as 007 FR-007).
- Two participants share a display name in Meet: both appear under that name, as in the transcript.
- Meet's label for the user is not recognised (unfamiliar interface language): the turns carry Meet's word until the user renames it once (002 edge case), and the rename then applies to the captions file too.
- A rename made after the meeting on the main view: the next download uses the names the transcript file uses at that moment.
- Chrome set to "Ask where to save each file": Chrome's dialog opens once, with the zip's (or the single file's) name filled in.
- The same meeting downloaded twice, or two meetings started in the same minute: Chrome adds its own numbered suffix to the repeated name; nothing is overwritten.
- A meeting cut off by a crash (012 `Interrupted`): its kept captions download like any other.
- `Show Meet captions` switched during the meeting: capture is unaffected in both directions.
- The meeting is deleted while Downloads holds a file already saved: the file is not touched.
- The meeting is deleted while a caption turn is still being written to storage (possible only around an ended or crashed meeting): nothing of it is written back.
- The stored captions cannot be read at the moment of a download: nothing is saved by that press and nothing is shown, exactly as 012 specifies for a download that cannot be read; the next press tries again. A transcript without its captions is never saved in place of the zip.

## Requirements *(mandatory)*

### Functional Requirements

**Keeping Meet's captions**

- **FR-001**: On a Google Meet call, while a meeting runs and Meet's captions are on, the system MUST keep each caption turn that appears after Start: the speaker name as Meet shows it, whether it is Meet's label for the user, when the turn appeared on the meeting clock, and its text. There is no setting for this (decision 65).
- **FR-002**: A turn's stored text MUST follow Meet's text for as long as the turn is on the page and the meeting runs; a later version replaces the earlier one, so a turn is stored once. A turn that leaves the page MUST keep its last non-empty text. A turn's text MUST be kept whole whatever its length, including a beginning that Meet has dropped from its page while the same turn continues.
- **FR-003**: Caption turns MUST be saved to local storage with the meeting as they arrive, so that when the browser or extension goes away without Stop, the stored meeting lacks at most the last 10 seconds of caption changes (constitution IV), and so that a download or Stop sees text at most 5 seconds behind Meet's page. They MUST NOT be collected by reading Meet's page once at Stop or at download.
- **FR-004**: Turns already on Meet's page when capture attaches MUST NOT be kept, including a turn that is still being added to (decision 73); this holds at Start and when capture attaches again after a page reload. Nothing is captured after the meeting stops.
- **FR-005**: Capture MUST be the same whether `Show Meet captions` is on or off, MUST continue through a reconnect of transcription, and MUST resume by itself after captions were off or the Meet page reloaded. A turn that Meet shows again after a reload or re-render MUST NOT be stored twice or given a new time.
- **FR-006**: This feature MUST NOT change speaker naming: which caption changes count as activity, the timing and throttling of that activity, line labels, splitting, the captions state, its reasons and the watchdog are as 002 specifies, and naming MUST NOT use caption text. The one addition is P2: a remembered name may be attached to a caption name when that name's first turn is kept, which changes no line's label.
- **FR-007**: A meeting on any other site, and a Meet meeting whose captions never came on, MUST simply have no caption turns. No error, status or message is added for it.

**Where the caption text may go**

- **FR-008**: Caption text MUST stay on the machine. It MUST NOT be sent to ElevenLabs, to a chat provider or to any other network destination, and MUST NOT be part of the context given to Ask (constitution I, decision 72).
- **FR-009**: Caption text MUST NOT be written into the transcript, a transcript line, the transcript file or any knowledge-base export, MUST NOT be shown in the panel, and MUST NOT appear in logs, error messages, status text or the alignment trace of the spike build.
- **FR-010**: Deleting a meeting MUST delete its caption turns in the same deletion as its transcript, labels, questions, answers and notes, completely, with no soft delete (constitution I). After a deletion no caption turn of that meeting remains in local storage, and nothing written afterwards may put one back.
- **FR-011**: Test fixtures MUST contain only invented names and invented caption text; nothing captured from a real call may be committed (constitution III; the alignment traces stay free of caption text).

**Download**

- **FR-012**: `Download transcript` MUST save exactly one file per press. For a meeting that has both a transcript line that would be written (007 FR-006) and a caption turn, that file MUST be a `.zip` holding the transcript file and the captions file, in that order, and nothing else (decision 67). The zip MUST be built in the panel from local data.
- **FR-013**: Names (decisions 69, 70): the zip is `Meeting — DD-MM-YYYY at HHhMM.zip`; the transcript file is `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt`, inside a zip or on its own; the captions file is `Meeting — DD-MM-YYYY at HHhMM — Meet captions.txt`, inside a zip or on its own. The date and time part is the local date and time the meeting started, identical in all three (as 007 FR-004 derives it). The knowledge-base inbox name `Meeting — DD-MM-YYYY at HHhMM.txt` is not used by any panel download and stays 004's.
- **FR-014**: The captions file's body MUST be one `[mm:ss] Speaker: text` line per caption turn, ordered by when the turn appeared (ties keep Meet's order), lines separated by exactly one blank line, no header or footer, the file ending with one newline, UTF-8, `\n` line breaks. `mm:ss` is the time the turn appeared since the meeting started, minutes counting past 59. Text and speaker are written on one line with runs of whitespace collapsed. The text is otherwise Meet's, not corrected, translated or cleaned.
- **FR-015**: `Speaker` in the captions file MUST be the display name the transcript uses for that caption name at the time of the download (decision 66): the user's name for Meet's label for the user, the rename-everywhere of that caption name where the meeting has one (made in this meeting, or a remembered one), otherwise the name as Meet showed it. Single-line corrections MUST NOT apply, and the captions file MUST NOT contain "Others" as a speaker.
- **FR-016**: The captions file MUST hold every stored turn at the moment of the download, including one still being rewritten in a running meeting, with its stored text (FR-003).
- **FR-017**: A meeting with a transcript line and no caption turn MUST download as one plain `.txt`, the transcript file, with 007's body; no zip, and no text anywhere about a captions file (decision 68).
- **FR-018**: A meeting with a caption turn and no transcript line that would be written MUST show `Download transcript`, which saves one plain `.txt`, the captions file; no zip (decision 75). The download control MUST be absent when the meeting has neither.
- **FR-019**: FR-012 to FR-018 MUST hold wherever a meeting's transcript can be downloaded: the main view (007) and the Transcripts screen's rows and single-meeting view (012). The same meeting MUST yield the same file name and the same file bodies from each place.
- **FR-020**: Downloading MUST NOT send anything over the network, MUST NOT need a new browser permission, MUST NOT overwrite a file (the browser's own uniquified name is accepted), and MUST NOT change the meeting, the screen or a running capture. The panel shows no message after a download. A press whose data cannot be read saves nothing.
- **FR-021**: Building the names, the captions body and the zip MUST be platform-free and separate from where the file is saved, as 007 FR-010 requires of the transcript file, so a later destination can use them without changing the rules above. The zip MUST open in macOS Archive Utility, Windows Explorer and `unzip` with both names intact.

**Disclosure and copy**

- **FR-022**: Every text that says what is kept or what is deleted MUST include Meet's captions where they are kept (constitution I): the main view's delete confirmation (decision 74) and the Transcripts screen's delete confirmation, as under "Proposed copy". The confirmations for a meeting without captions are unchanged. The reminder before Start is not one of these texts: it is K1 on every platform and is shown only when its setting is on (amended 2026-10-13, decision 79, superseding decision 71).
- **FR-023**: The only user-facing strings this feature adds or changes are those under "Proposed copy", as confirmed or amended by the copy review against `embody-dont-announce` (design decision 33). No setting, status row, badge, helper line or message is added.

### Proposed copy

For the copy review that precedes implementation. Drafted against `embody-dont-announce`. The button keeps its label: the user asked for the captions to come with `Download transcript`, and a renamed button or a line under it saying what the zip holds would explain the interface's own logic. There is no "captions kept" indicator in the panel, no message when a meeting has no captions, and no message after a download (Chrome's download indicator shows the file). C3 is the user's own wording (decision 74). C2 was withdrawn on 2026-10-13 (decision 79).

| # | String | Where | Job |
|---|--------|-------|-----|
| C1 | `Meeting — DD-MM-YYYY at HHhMM.zip`, holding `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt` and `Meeting — DD-MM-YYYY at HHhMM — Meet captions.txt` | File names (decisions 69, 70). The transcript name also replaces 007's download name for a transcript saved on its own | Names the user reads in Downloads and in the opened zip: which meeting, and which of the two records each file is. |
| C2 | Withdrawn 2026-10-13 (decision 79). It was K1 with the sentence `Meet's captions of the meeting are kept on this computer too.` added, shown on a Google Meet call | Nowhere. The reminder on Start is K1 on every platform: `Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs and the transcript is kept on this computer. You can turn this reminder off in Settings.` | None. The removed sentence must not appear in `src/` or in the built extension. |
| C3 | `Delete this transcript permanently? Meet's captions of this meeting are deleted too. It cannot be recovered.` | Main view delete confirmation, for a meeting with stored captions; K6 stays as it is for a meeting without | Irreversible-action warning. The captions are not on screen, so the warning names them. |
| C4 | `Delete the transcript of {d Mon yyyy}, {HH:MM} permanently? Its questions, answers, notes and Meet's captions are deleted too. It cannot be recovered.` | Transcripts screen delete confirmation, for a meeting with stored captions; 012 P13 stays as it is for a meeting without | The same, in 012's wording. |
| C5 | `Download transcript`, and 012's accessible name `Download transcript of {d Mon yyyy}, {HH:MM}` | Unchanged (K40, 012 P11) | Listed so the review confirms the label stays when the press saves a zip, or the captions file alone (FR-018). |

Nothing else changes. `What ElevenLabs keeps` (K14 to K16) and the chat providers' retention text (decision 47) stay as they are: no caption text reaches those providers. `Show Meet captions` (K42) and `Remembered names` (K19) are unchanged. On the Transcripts screen's single-meeting view, 012's `Nothing was transcribed.` stays for a meeting without transcript lines; with captions kept, `Download transcript` stands beside `Delete transcript` there.

### Key Entities

- **Caption turn (stored)**: one turn of Meet's captions kept with a meeting: the speaker name as Meet showed it, whether it is Meet's label for the user, when it appeared on the meeting clock, its text (everything Meet showed for the turn, latest version). Belongs to exactly one meeting and is deleted with it. Never stored without text. Distinct from 002's in-memory caption turn used for naming, which has no text and is not stored.
- **Captions file**: name (from the meeting's start time) and body (the meeting's stored caption turns with the transcript's display names). Built on demand, not stored.
- **Transcript file**: 007's body, unchanged; its download name gains `— Transcript` (decision 70).
- **Download**: what one press saves: the transcript file, the captions file, or a zip of both. Built on demand, not stored.
- **Meeting**: gains its caption turns, and a mark that it has any; a meeting may have none.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every fixture meeting with transcript lines and stored captions, one press yields exactly one `.zip` with the specified name; unpacked with an ordinary unzip tool it holds exactly the two specified names; the transcript body is byte-identical to the one produced before this feature and the captions body matches the specified line format exactly.
- **SC-002**: For every fixture meeting without stored captions, one press yields exactly one `.txt` whose body is identical to before and whose name ends `— Transcript.txt`, and the panel shows no text that was not there before. For every fixture meeting with captions and no transcript line, one press yields exactly one `.txt`, the captions file.
- **SC-003**: Across the automated suite and the real-call check, zero network requests and zero messages to a transcription or chat provider contain caption text.
- **SC-004**: After an interruption at any point of a fixture meeting, the stored captions lack no more than the last 10 seconds of caption changes before the interruption.
- **SC-005**: After deleting a meeting, zero caption turns of it remain in local storage and every other meeting's captions are intact, in 100% of the fixture cases.
- **SC-006**: On the 002 fixture suite and the recorded real traces, every line's label is identical with and without this feature.
- **SC-007**: In a real Meet call of at least 30 minutes with at least three participants, the captions file contains at least 95% of the caption turns Meet showed after Start, each with the text Meet showed last, checked by the user against Meet's own captions (`Show Meet captions` on) and recorded in this folder.
- **SC-008**: From a stopped 3-hour meeting (about 5,000 transcript lines and 1,200 caption turns), the zip is in Downloads within 2 seconds of one press, and the panel is never unresponsive for more than 200 ms.
- **SC-009**: The extension's permission list after this feature is identical to before, and no dependency is added to what ships.
- **SC-010**: The real-call check records what a Meet page reload, a call longer than an hour, and one person talking for several minutes did to the kept captions, and that the zip opened in macOS Archive Utility with both names intact.

## Constitution check (v1.2.1)

The constitution was amended to v1.2.1 on 2026-10-12 with the user's approval (wording only): Principle V's adapter bullet now reads "caption speaker and text stream", and the Storage constraint lists "transcript, labels, chat, notes, the meeting platform's captions". No sentence forbids this feature. The plan's Constitution Check (`plan.md`) goes through Principles I–VI; in short:

- **Principle I**: caption text leaves the machine to nobody (FR-008), which is stricter than the transcript. History stays local and deletion is real (FR-003, FR-010). The delete confirmations say what is deleted (FR-022); the reminder is the same on every platform (decision 79: captions kept on this computer are not something a third party retains). The mute sentence is about microphone audio and is untouched.
- **Principle II**: caption text never enters the transcript or any export (FR-009), and the zip is a download, not an inbox export; the inbox name and format are untouched (decision 70). Ask never gets the captions (decision 72). The transcript's labels are unchanged (FR-006); the captions file carries only names Meet gave, shown as the transcript shows them.
- **Principle III**: fixtures stay synthetic (FR-011); a real-call check is recorded (SC-007, SC-010).
- **Principle IV**: captions are persisted as they arrive (FR-003); a gap is visible in the existing speaker-names status.
- **Principle V**: the adapter contract gains the caption text beside the speaker stream, as the amended bullet says. Core logic still never touches Meet's page.
- **Principle VI**: no new setting, permission or shipped dependency (SC-009).

What this feature does contradict is 002's own contract, by design (decision 63); see Dependencies.

## Assumptions

- Meet's captions region holds each turn as a speaker name ("You" for the user) and a text, and kept every turn for about 30 minutes and about 200 turns in a 5-person call (live page, 2026-10-12, working notes not kept in the repo; structure only, no caption text was kept). Whether Meet removes old turns in longer calls, and what a page reload does to the history, are unknown; the requirements above hold either way, and both are observed in the real-call check (SC-010).
- The page also carries, per turn, a load time relative to the page's own load. The plan does not use it: a turn's time is when live-assist first saw it (research R2).
- Meet writes captions in the caption language set in Meet, so mixed Greek and English speech reads worse there than in live-assist's transcript. The captions file is Meet's record as Meet wrote it; this feature does not change Meet's caption language.
- A caption appears a second or two after its words begin, so caption times run slightly behind the transcript's for the same words. No correction is applied.
- The knowledge-base workflow recognises a transcript by the name `Meeting — DD-MM-YYYY at HHhMM.txt` in the inbox folder. No panel download carries that name any more (decision 70), so the user renames or 004 exports; the user accepted the unzip step (decision 67).
- Only meetings transcribed after this feature ships have captions; earlier meetings cannot get them.
- Viewing captions inside the panel or on the Transcripts screen, searching them, using them to correct the transcript or to answer questions, and captions from Zoom or Teams are out of scope. A later platform adapter can supply captions through the same contract, with its own name in the file name.
- The copy review of the strings under "Proposed copy" happens before implementation, as for 006, 007, 008 and 012.

## Dependencies

- **001 / 002**: the running meeting, the Meet adapter, captions being turned on at Start, the user's name, rename-everywhere and remembered names.
- **007**: the transcript file's body and its formatter, the download control and the way a file is saved without a new permission.
- **012**: the Transcripts screen's download and delete, and the `meetingFiles` seam built for this feature (merged on main). The screen itself is being built on `012-transcripts-screen`; this feature's work on the panel waits for it (tasks.md "Worktree groups").
- **004**: out of scope. Open question handed to 004: does the captions file ever go to the inbox folder (recommendation: no).

**Amendments made in other documents on 2026-10-12, with this plan** (each minimal and dated):

- `specs/002-meet-speaker-names/spec.md`: FR-004, FR-025, FR-030, User Story 5 scenario 7, Clarifications 2026-10-12 A5, the edge case on caption language and the Key Entity "Caption turn": naming uses only the speaker name and timing; the text is read and kept only as 013 specifies.
- `specs/002-meet-speaker-names/research.md` R5, `data-model.md`, `contracts/meet-bridge.md` (one message may carry caption text, for storage only, with its own size limit and validation), `contracts/platform-adapter.md` and `contracts/meet-dom.md`: pointers to this folder's contracts, which hold the detail.
- `specs/007-download-transcript/spec.md`: FR-002, FR-003, FR-004 and FR-010.
- `specs/012-past-transcripts/spec.md`: FR-014, FR-015, FR-018, User Story 4 scenario 1, P13 and the out-of-scope line.

**Left to implementation tasks**: `specs/006-panel-redesign/copy-review.md` (K1 gains its Meet variant, K6 its captions variant, K40's file names, K43's P13 variant; task T001), and a test that 003's context builder never includes caption text (task T050).
