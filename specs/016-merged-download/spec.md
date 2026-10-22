# Feature Specification: Merged download

**Feature Branch**: `016-merged-download`

**Created**: 2026-10-22

**Status**: Draft (design decisions 93–99, decided by the user 2026-10-22; the points no one was available to decide are under Assumptions)

**Input**: User, 2026-10-22 (design decisions 93–99): after the meeting, `Download transcript` saves one merged plain `.txt`: the realtime transcript's words, with speakers taken from Meet's captions by word-level alignment done at download time. It is the most accurate version of the meeting live-assist can give and is the point of the feature, for anyone who uses the extension. It replaces the 013 zip on `Download transcript`. The live mechanism is untouched; no audio is kept and nothing is re-transcribed. Passages the realtime transcript wrote twice are removed from the merged file. The two original files stay available on the Transcripts screen's single-meeting view only, through a secondary control. Words the alignment cannot place are `Others`.

Why: in tests on six real Meet calls (35,469 words; the user's own recordings, kept off this repo, decision 82) the live transcript left 17.4% of its words under "Others", and a word-by-word merge with Meet's captions left 4.5% without a name; where both named someone they agreed on 98.6% of words. Most of the merge's unnamed words (1,274 of 1,610) were passages the realtime transcript had written twice, which Meet's captions show were said once. Without them about 1% of words would be unnamed.

## Clarifications

### Session 2026-10-22 (decided by the user, in conversation)

- Q: What does `Download transcript` save after the meeting? → A: One merged plain `.txt`: the realtime transcript's words, with each word's speaker taken from Meet's captions by aligning the two word by word when the download is built. It replaces the 013 zip on that button (supersedes decision 67 for `Download transcript`, and 013's rule that the captions are never merged with the transcript, for the download). It is for anyone using the extension: no list of names from outside the extension is used. (Decision 93.)
- Q: Does any of this change the live transcript? → A: No. The streamed transcript, the caption-timing names in the panel, line splits, "Others" and everything that produces them behave exactly as today. Merging happens only when the download is built after Stop. (Decision 94.)
- Q: Should the audio be kept and transcribed again after the meeting? → A: No. No audio is kept and nothing is re-transcribed. (Decision 95.)
- Q: The realtime transcript sometimes writes a passage twice, seconds apart, often under another speaker's name. What happens to it? → A: The repeat is removed from the merged file. Why it happens is not investigated or fixed here. A genuine repetition by a person must survive. (Decision 96.)
- Q: Can the two original files still be had? → A: Yes, only on the Transcripts screen's single-meeting view, through a secondary control, `Download originals` (working label, put through the copy rule). The main view keeps one download button. (Decision 97.)
- Q: What is written for words the alignment cannot place, and which names are used? → A: `Others`, the product's existing term; a guess is never shown as a name. Names are the display names the transcript uses: the user's name for Meet's label for the user, and renames applied (as 013 FR-015). (Decision 98.)
- Q: A meeting without captions, or with captions and no transcript line? → A: Both download exactly as today: the plain transcript, or the plain captions file (013 FR-017, FR-018). The merged file is named as decision 70 names every panel transcript, `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt`. (Decision 99.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One file with the right names (Priority: P1)

The call has ended. The user presses `Download transcript` and gets one `.txt` in Downloads. It reads like the transcript they know, line by line, `[mm:ss] Name: text`, but the names are right far more often: a passage the live panel left under "Others" now carries the speaker's name, and a stretch where two people spoke in one line is cut where the speaker changes. The words are the transcript's words.

**Why this priority**: It is the request. The merged file is the most accurate record of the meeting live-assist can produce without keeping audio, and it is what the user takes to their notes or knowledge base.

**Independent Test**: With a stored, stopped meeting fixture that has transcript lines (some labelled "Others") and kept caption turns whose words overlap them, press `Download transcript`: one `.txt` is saved under the transcript's name; its words, in order, are the transcript file's words; lines the captions cover carry the captions' speaker; every timestamp in it is one the transcript file also carries.

**Acceptance Scenarios**:

1. **Given** a stopped Meet meeting started at 14:30 on 7 October 2026 with transcript lines and kept captions, **When** the user presses `Download transcript` on the main view, **Then** exactly one file is saved, `Meeting — 07-10-2026 at 14h30 — Transcript.txt`, plain text, no zip.
2. **Given** that file, **When** its words are read in order, **Then** they are the words of the transcript file 007 writes for the meeting, in the same order and spelled exactly the same, apart from passages removed as repeats (User Story 2).
3. **Given** a transcript line labelled "Others" live whose words Meet captioned under Sarah Brown, **When** the merged file is read, **Then** those words are under `Sarah Brown`.
4. **Given** a transcript line that holds the end of Sarah's sentence and the start of Alex's reply, with Meet's captions showing the change, **When** the merged file is read, **Then** Sarah's sentence and Alex's reply are on separate lines, each under its own name, cut where Sarah's sentence ends.
5. **Given** a stretch of the transcript that Meet's captions do not carry at all (captions were off, or speech the captions missed), **When** the merged file is read, **Then** those words are under `Others`.
6. **Given** the user's name in settings is Alex and Meet labelled the user's turns "You", **When** the merged file is read, **Then** the user's words are under `Alex`, never `You`.
7. **Given** the user renamed "Bob B." to "Bob Brown" everywhere in this meeting (or a remembered rename applied to it), **When** the merged file is read, **Then** Bob's words are under `Bob Brown`.
8. **Given** the user corrected one line's speaker with "Just this line", **When** the merged file is read, **Then** that line's words are under the corrected name.
9. **Given** the merged file, **When** it is read, **Then** every line is `[mm:ss] Name: text`, lines separated by exactly one blank line, no header or footer, UTF-8, one newline at the end, and each `[mm:ss]` is the start time of a transcript line, the one the merged line's first word belongs to.
10. **Given** the same stopped meeting, **When** the user downloads it from its row on the Transcripts screen and from its single-meeting view, **Then** each saves a file with the same name and byte for byte the same body as the main view.

---

### User Story 2 - A passage written twice appears once (Priority: P1)

The realtime transcript sometimes writes a passage again a few seconds after it first wrote it, often under another speaker's name. Meet's captions show the passage was said once. The merged file has it once, where it was first written. When a person really does say the same thing twice, both stay.

**Why this priority**: Repeated passages are most of what the merge would otherwise leave unnamed, and a passage written twice under two names is a false record of who said what.

**Independent Test**: With a fixture whose transcript writes a passage of twenty words twice, twenty seconds apart, and whose captions hold it once, the merged file holds it once, at its first place. With a fixture where a person says the same twelve words twice and the captions hold them twice, both stay.

**Acceptance Scenarios**:

1. **Given** a transcript in which a whole line repeats, word for word, at least eight words the transcript wrote shortly before, and the captions carry those words once, **When** the merged file is built, **Then** the later line is not in it and the earlier one is, at its own time, under the captions' speaker.
2. **Given** a person who says the same sentence of eight or more words twice, and Meet's captions carry it twice, **When** the merged file is built, **Then** both are in it.
3. **Given** a repeat of fewer than eight words, **When** the merged file is built, **Then** it stays.
4. **Given** a line that only partly repeats earlier text, **When** the merged file is built, **Then** the whole line stays.
5. **Given** a repeated passage where the captions carry neither copy (captions were off), **When** the merged file is built, **Then** both stay: without the captions there is nothing to show it was said once.
6. **Given** a repeated line the user corrected by hand with "Just this line", **When** the merged file is built, **Then** it stays.
7. **Given** the same text appears again long after it was first written (more than about 400 words later), **When** the merged file is built, **Then** it stays.

---

### User Story 3 - The original files, out of the way (Priority: P2)

The user wants to check the merged file against what live-assist wrote during the call and what Meet captioned. On the Transcripts screen they open the meeting and press `Download originals`, which saves the two original files exactly as `Download transcript` saved them before this feature.

**Why this priority**: The originals are evidence the merged file is built from; the user wants them kept available but not in the way of the one file most people need.

**Independent Test**: With a stored meeting fixture that has transcript lines and captions, open it on the Transcripts screen and press `Download originals`: one `.zip` is saved, byte for byte what 013's `Download transcript` saved for that meeting. The main view and the meeting's row offer no such control.

**Acceptance Scenarios**:

1. **Given** a stopped meeting with transcript lines and kept captions opened on the Transcripts screen, **When** the user presses `Download originals`, **Then** one file is saved, `Meeting — DD-MM-YYYY at HHhMM.zip`, holding `… — Transcript.txt` (007's body, live labels) and `… — Meet captions.txt` (013's body), as 013 specifies.
2. **Given** the same meeting, **When** the user looks at the main view's footer and at its row on the Transcripts screen, **Then** there is one download control in each, `Download transcript`, and no `Download originals`.
3. **Given** a meeting without kept captions, or with captions and no transcript line, opened on the Transcripts screen, **When** the user looks at its actions, **Then** there is no `Download originals`: `Download transcript` already saves the one original file there is.
4. **Given** the single-meeting view of a meeting with both, **When** the user reads its actions, **Then** they are in the order `Download transcript`, `Download originals`, `Delete transcript`.

---

### User Story 4 - Everything else downloads as before (Priority: P2)

A meeting on Zoom or Teams, a Meet call where captions never came on, every meeting transcribed before 013, a meeting with captions and no transcript line, and a meeting still running: each downloads exactly as it does today.

**Why this priority**: The merge needs both records. Without them there is nothing to merge, and nothing the user already has may change.

**Independent Test**: For fixture meetings of each kind, press `Download transcript`: the file saved is byte for byte what the build before this feature saves.

**Acceptance Scenarios**:

1. **Given** a stopped meeting with transcript lines and no kept captions, **When** the user downloads it from any of the three places, **Then** one `.txt` is saved, `… — Transcript.txt`, with 007's body, live labels, unchanged.
2. **Given** a stopped meeting with kept captions and no transcript line, **When** the user downloads it, **Then** one `.txt` is saved, `… — Meet captions.txt`, as 013 FR-018.
3. **Given** a meeting that is still running, with transcript lines and kept captions, **When** the user presses `Download transcript` on the main view, **Then** the 013 zip is saved, as today; nothing is merged while the meeting runs.
4. **Given** a meeting interrupted by a crash (`Interrupted` on the Transcripts screen) with transcript lines and captions, **When** the user downloads it, **Then** the merged file is saved: the meeting is no longer running.

### Edge Cases

- A meeting whose captions cover only part of it (captions turned on late, off for ten minutes, a Meet page reload): words in the uncovered stretches are `Others`, apart from a few words next to a covered line that the live transcript had already named (assumption A8). Nothing marks the gap.
- Meet's caption language differs from what was spoken (Greek speech, English captions): words that cannot be matched take the speaker of the caption words around them when the captions hold words at that point, else `Others`. Words in any script are compared, not only Latin letters (assumption A11).
- One person talks for several minutes: one merged line per run of sentences by that person; a transcript line is never joined to the next across a speaker change.
- A line holds speech by two people with no sentence end between them: the line goes to whoever said most of that sentence; a line is only cut at a sentence end (assumption A7).
- Two people share a display name: both appear under that name, as in the transcript and the captions file.
- A rename made after the meeting, on the main view: the next download uses the names the transcript shows at that moment.
- A single-line correction of a line the merge would otherwise cut: the whole line stays under the corrected name and is not cut.
- A meeting whose captions name someone the transcript never named: their words are named in the merged file by the captions' name (with any rename of that caption name applied).
- A repeated passage that spans several transcript lines: the lines are removed together only when every one of them is a repeat; one line that is not keeps the whole run.
- A passage written three times: each later copy is judged against the first one on its own and removed if it meets the rule.
- The same meeting downloaded twice, or downloaded as merged and as originals: Chrome numbers a repeated name as today. The merged file and the transcript inside the originals zip share a name; macOS Archive Utility unpacks the zip into its own folder, so the two do not collide (assumption A12).
- The stored captions or lines cannot be read at the press: nothing is saved and nothing is shown, as 013 FR-020; the next press tries again. The original transcript is never saved in place of the merged file.
- A very long meeting (3 hours, about 45,000 words): the file is in Downloads within the time SC-005 sets.
- The meeting is deleted while Downloads holds a merged file: the file is not touched.

## Requirements *(mandatory)*

### Functional Requirements

**When the merged file is saved**

- **FR-001**: For a meeting that is not running (stopped, or interrupted) and has both a transcript line that would be written (007 FR-006) and a kept caption turn, `Download transcript` MUST save exactly one file: the merged transcript, a plain `.txt` named `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt` (decisions 70, 93, 99). No zip.
- **FR-002**: FR-001 MUST hold wherever `Download transcript` stands for that meeting: the main view after Stop, its row on the Transcripts screen and its single-meeting view, with the same name and byte-identical body from each (013 FR-019).
- **FR-003**: A running meeting's `Download transcript` MUST save what it saves today (013 FR-012 to FR-018). A meeting with no kept caption turn, and one with captions but no transcript line, MUST download exactly as today from every place (decision 99).
- **FR-004**: The merged file MUST be built at the press, in the panel, from the meeting's stored transcript lines, its kept caption turns and its current names, and MUST NOT be stored. Building it MUST NOT change the meeting, its lines, labels, captions or anything the panel shows.

**What the merged file holds**

- **FR-005**: The merged file's words MUST be the words of the transcript file 007 writes for the meeting (settled lines only, 007 FR-006), in the same order and spelled exactly as there, except whole lines removed as repeats (FR-012). No word MAY be added, changed, reordered or taken from the captions.
- **FR-006**: Each word's speaker MUST come from Meet's captions: the transcript's words are aligned with the caption words in order, and a word takes the speaker of the caption word it is matched with. Words between two matched words take speakers from the caption words between those matches, when the captions hold such words at that point; a short stretch the captions do not hold takes the live transcript's own name for that line when that name is one of the captions' speakers; a short stretch between two matches of the same speaker takes that speaker unless it is only short replies ("yeah", "okay"); everything else is unplaced. (The exact rule is research R2.)
- **FR-007**: Within each transcript line, the words MUST be grouped into sentences, and each sentence MUST take the speaker with the most weight among its words: a word matched to a caption word weighs most, a word placed from the caption words around it or from the line's own name less, and unplaced words count together for `Others` (research R2 gives the weights). A sentence of punctuation only takes a neighbour's speaker. A new line MUST start where the speaker changes. Consecutive sentences of the same speaker MUST be on one line when they come from the same transcript line, or when the transcript cut a sentence in two across lines; otherwise each transcript line keeps its own line.
- **FR-008**: A line the user corrected with a single-line correction MUST keep the corrected name for all its words, and MUST NOT be cut (a human correction outranks the alignment; assumption A1).
- **FR-009**: Names MUST be the display names the transcript uses at the time of the download (decision 98): the user's name (or its rename) for Meet's label for the user; a caption name's rename-everywhere where the meeting has one; otherwise the name as Meet showed it. Words that are unplaced MUST be written under `Others`. A guess MUST NOT be written as a name (constitution II).
- **FR-010**: Each line MUST be `[mm:ss] Name: text`, where `mm:ss` is the start time of the transcript line its first word belongs to (minutes past 59 as 007), text and name on one line with runs of whitespace collapsed, lines separated by exactly one blank line, no header or footer, UTF-8, `\n` line breaks, one newline at the end. Every `[mm:ss]` in the merged file MUST be a time the transcript file also carries.
- **FR-011**: The merged file MUST NOT contain caption text: the captions decide speakers only. It MUST NOT contain chat, notes, status text or AI-generated text (constitution II).

**Repeated passages**

- **FR-012**: A run of one or more consecutive transcript lines MUST be left out of the merged file when all of these hold: (a) every word of the run is part of a stretch of at least eight words that repeats, word for word (compared as in FR-006), text the transcript wrote before the run, starting no more than 400 words earlier and ending before the run begins; (b) the run has at least eight words; (c) Meet's captions do not carry the passage twice: of the two copies, at most one has at least half its words matched to caption words; (d) the captions carry it at least once: one of the two copies has at least half its words matched; (e) no line of the run has a single-line correction. Only whole lines are left out; the earlier copy always stays. (Research R3 gives the rule and its numbers.)
- **FR-013**: A repetition that fails any condition of FR-012 MUST stay in the merged file, under the speaker the merge gives it.
- **FR-014**: The speakers of the remaining words MUST be decided as if the removed lines had never been written, so a passage left once is matched to the captions where it was said.

**The originals**

- **FR-015**: The Transcripts screen's single-meeting view of a meeting with both a transcript line and a kept caption turn MUST offer `Download originals`, after `Download transcript` and before `Delete transcript`. One press MUST save exactly what 013 FR-012 to FR-016 specify for that meeting: one `.zip` holding the transcript file (live labels) and the captions file (decision 97).
- **FR-016**: `Download originals` MUST NOT appear anywhere else: not on the main view, not in a Transcripts row, and not for a meeting without both records.
- **FR-017**: `Download originals` MUST follow 013 FR-020: no network, no new permission, no message after the press, nothing saved when the data cannot be read.

**Unchanged**

- **FR-018**: Live behaviour MUST NOT change: the streamed transcript, in-progress text, the caption-timing names in the panel, pending placeholders, line splits, "Others", renames, overrides, the captions state and watchdog, what is stored and when. Every existing test of live behaviour MUST pass unchanged (decision 94).
- **FR-019**: No audio MAY be kept for this feature, and nothing MAY be transcribed again (decision 95). Nothing about the meeting MAY be sent anywhere to build the merged file: it is built from local data, in the panel, with no network request (constitution I).
- **FR-020**: Ask MUST NOT change: it is given the live transcript as today and never the captions or the merged file (decision 72).
- **FR-021**: Building the merged file MUST be platform-free and separate from where the file is saved (as 007 FR-010 and 013 FR-021), so a later destination (004's inbox export) can use it without changing the rules above. Whether 004 exports the merged file is 004's question.
- **FR-022**: The only user-facing string this feature adds is the label `Download originals`, as confirmed or amended by the copy review against `embody-dont-announce`. `Download transcript` keeps its label. No message, badge, line or tooltip says the file is merged, how, or what was removed.

### Proposed copy

| # | String | Where | Job |
|---|--------|-------|-----|
| M1 | `Download originals` | Transcripts screen, single-meeting view, between `Download transcript` and `Delete transcript`, for a meeting with transcript lines and kept captions | A control label naming its action in the user's words: the two files the merged one is made from. |
| M2 | `Download transcript` (K40, 012 P11, 013 C5), unchanged | Wherever it stands today | Listed so the review confirms the label stays when the press saves the merged file. |

Nothing else. The merged file has no header or note saying it is merged; the panel says nothing after a download (Chrome's indicator shows the file).

### Key Entities

- **Merged transcript**: name (decision 70's transcript name) and body (the transcript's words, in its lines' order minus repeats, regrouped into speaker lines named from the captions). Built on demand from the stored lines, the kept caption turns and the meeting's names; never stored, never sent.
- **Repeated passage**: a run of whole transcript lines that FR-012 leaves out of the merged file. Never removed from the stored transcript, the panel, Ask or the originals.
- **Originals**: the 013 download of a meeting with both records: a zip of the transcript file and the captions file.
- **Transcript line, caption turn, meeting**: as 001, 002, 012 and 013 define them; nothing new is stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every fixture meeting with transcript lines and captions, one press after Stop yields exactly one `.txt` named `… — Transcript.txt`; its words equal the transcript file's words in order minus the removed lines, and every timestamp in it occurs in the transcript file. Checked automatically on every fixture.
- **SC-002**: For every fixture meeting without captions, with captions only, or still running, the saved file is byte for byte what the build before this feature saves.
- **SC-003**: Every existing automated test of live behaviour (naming, splitting, pending, renames, overrides, captions capture) passes without being edited.
- **SC-004**: On the six recorded real Meet calls (local only, never committed), the merged file names a speaker for at least 98% of the words where the reference merge also names one, with the same speaker; and after repeats are removed, `Others` holds about 1% of words (at most 2%), against 17.4% in the live transcript. Recorded in research.md as metrics only.
- **SC-005**: For a stopped meeting of 15,000 words with captions, the merged file is handed to the browser within 1 second of the press; for a 3-hour meeting (about 45,000 words), within 2 seconds (013 SC-008's bound), on the development machine, whatever the text (a meeting of one phrase repeated thousands of times included). The panel may be busy while the file is built; 013 SC-008's 200 ms bound on that holds up to about 15,000 words (research R5).
- **SC-006**: In fixtures, a passage written twice with captions carrying it once is in the merged file once; each of the genuine-repetition cases of User Story 2 (scenarios 2–7) keeps both copies.
- **SC-007**: The extension's permission list and shipped dependencies are unchanged, and no network request is made by a download.
- **SC-008**: In a real Meet call of at least 20 minutes with at least three people, the user reads the merged file against the live panel and finds its names right at least as often, and checks `Download originals` on the Transcripts screen; recorded in `manual-check.md`.

## Constitution check (v1.2.2)

- **Principle I**: Nothing leaves the machine: the merged file is built in the panel from local storage and saved through a browser download (FR-019). No audio is kept (decision 95). Deletion is unchanged: the merged file is never stored.
- **Principle II**: No AI-generated text and no caption text enters the file (FR-011); its words are the transcript's. Every name in it is taken from Meet's captions for those words or their immediate surroundings, or from a correction the user made; words without caption evidence are `Others` (FR-009). The file is a download, not the knowledge-base export, whose name and format are untouched. Ask is untouched (FR-020).
- **Principle III**: Fixtures are synthetic with invented names (FR test plan); the real-call comparison stays local (SC-004, decision 82); a real-call check is recorded (SC-008).
- **Principle IV**: Live persistence and degradation are untouched (FR-018).
- **Principle V**: The merge is platform-free logic beside the other file builders (FR-021); it reads caption turns through the stored model, never Meet's page.
- **Principle VI**: No setting, no permission, no dependency (SC-007). One control, required by decision 97.

## Assumptions

Taken without the user, who was not available to answer; each can be overruled.

- **A1**: A line the user corrected with "Just this line" keeps the corrected name for its words, and is neither cut nor removed as a repeat: a human correction outranks the alignment. (Stated as a default by the user's brief, not a user decision.)
- **A2**: "After Stop" means the meeting is not running: a stopped meeting and an interrupted one. A running meeting's download is 013's, unchanged (follows from decision 94).
- **A3**: `Download originals` is offered only when it saves something `Download transcript` does not, that is, for a meeting with both a transcript line and a kept caption turn. Elsewhere `Download transcript` already saves the one original.
- **A4**: `Download originals` saves 013's download for the meeting byte for byte (the zip with both files, live labels and Meet's captions), stamped with the moment of the press as 013 P5.
- **A5**: Its place is between `Download transcript` and `Delete transcript` in the single-meeting view's action row, so the permanent action stays last (as 014 placed `Close transcript`).
- **A6**: A merged line's time is the start of the transcript line its first word is in, even when the merged line starts part-way through that line. Every time in the merged file is then a time in the transcript file, and two consecutive merged lines may carry the same time.
- **A7**: A transcript line is cut only at a sentence end (`.`, `?`, `!`, `…`, optionally followed by a closing quote or bracket, or a trailing dash), as the reference merge does. A speaker change mid-sentence is not cut; the sentence goes to whoever has most of it.
- **A8**: The alignment rule, its thresholds and its tie-breaks are the reference merge's (research R2), so the measured numbers carry over: matching is a longest-common-blocks alignment of normalised words; a single short matched word (under four letters) is ignored as chance; the live line's own name is used for a gap of at most 12 words when it is a caption speaker; a gap of at most 20 words between two matches of the same speaker takes that speaker unless it is only short replies.
- **A9**: The repeat rule's numbers (eight words, a window of 400 words, half the words matched) are research R3's, set from the six recorded calls, and are conservative on purpose: in those calls they removed 3.8% of words and kept one repetition the captions carried twice and one the captions did not carry.
- **A10**: Lines whose name is still pending, and in-progress text, are not in the merged file, as in the transcript file (007 FR-006); after Stop there are none in practice.
- **A11**: Words are compared ignoring case, accents and punctuation, in any script (the reference merge compares only `a`–`z` and digits, so Greek words never match); this changes nothing for English text.
- **A12**: The merged file keeps decision 70's name. The zip from `Download originals` also holds a `… — Transcript.txt` (the live one); the two never meet in one folder when the zip is unpacked by macOS Archive Utility, which unpacks into a folder of the zip's name. No reason was found to name the merged file differently.
- **A13**: The 013 rule that a press whose captions cannot be read saves nothing applies to the merged file too: the live transcript is never saved in its place.
- **A14**: Whether the knowledge-base inbox export (004) writes the merged file is left to 004.
- **A15**: The merged file is built in the panel when the button is pressed, so the panel pauses while it is built: under 0.2 s up to about 15,000 words, about 1 s for a 3-hour meeting. No progress mark is shown (the copy rule, and the file arrives within SC-005's bounds); the pause is accepted and no worker is added (decision 100).
- **A16**: For text unlike speech, where nearly every word recurs thousands of times (a test meeting of one repeated sentence), the alignment uses difflib's own shortcut (autojunk) instead of taking minutes; names there may differ slightly from the exact alignment's. Recorded speech never comes near the point where this happens (research R5).

## Dependencies

- **007 / 012 / 013**: the transcript file's body, the download control in its three places, the kept caption turns and the captions file's names, and 013's download (which becomes the originals).
- **002**: the transcript's display names, renames and single-line corrections, read as they are.
- **Reference algorithm**: the merge script the user ran on the six calls (outside this repo); this feature ports its alignment and leaves out its parts that only served one knowledge base (a names list, moving files, a second caption format).

**Amendments made in other documents with this spec** (each dated 2026-10-22): `.specify/memory/design-decisions.md` decisions 93–99, and notes on 66 and 67; `ROADMAP.md` row 016. Left to implementation tasks: `specs/013-captions-download/spec.md` and `contracts/download-ui.md` (the zip on `Download transcript` after Stop is replaced; "a second button" leaves the never-add list for the single-meeting view), `specs/007-download-transcript/spec.md` FR-003, `specs/012-past-transcripts/spec.md` FR-014, and `specs/006-panel-redesign/copy-review.md` (K47).
