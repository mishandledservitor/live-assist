# Feature Specification: Meeting context

**Feature Branch**: `008-meeting-context`

**Created**: 2026-10-09

**Status**: Draft (specified, planned and tasked 2026-10-09; implementation waits for `003-fix-real-call` to merge, because both change the grounding prompt and citation handling)

**Input**: User description: "008 Meeting context: the user can attach a context file to a meeting to inform the Ask feature. Answers may use the context, but anything drawn from it is labelled (e.g. 'From your notes: …', in the answer's language) and carries no [mm:ss] citation. Questions about what was said still come only from the transcript; 'That isn't in the transcript so far.' still applies to those. The context is never presented as something said in the meeting. Inputs: .txt and .md files plus a paste box; no PDF, Word or URLs. One context per meeting, added or replaced before Start (applied when the meeting starts) or at any time during it, stored with that meeting, used by questions after the meeting, shown as a small chip with the file name and a way to remove it, deleted with the meeting. Sent only to the selected chat provider, never to ElevenLabs; the chat provider's retention text covers it. Decisions: design-decisions.md #49–#54; builds on 003 (Ask the transcript)."

## Clarifications

### Session 2026-10-09 (user)

- Q: What is 008? → A: The user can attach a context file to a meeting to inform Ask (design decision 49).
- Q: How do answers use the context? → A: As a separate, labelled source. The model may use it, but anything drawn from it is labelled ("From your notes: …", in the answer's language) and carries no `[mm:ss]` citation. Questions about what was said come only from the transcript, and "That isn't in the transcript so far." still applies to them. The context is never presented as something said in the meeting (design decision 50). 003's rules stay: transcript citations, `Background:` for general explanations, "Others" never named, the full conversation replayed.
- Q: Which inputs? → A: `.txt` and `.md` files, plus a paste box. No PDF, Word or URLs (design decision 51).
- Q: Lifecycle? → A: One context per meeting. Added or replaced before Start (held as pending and applied to the meeting when it starts) or at any time during it. Stored with that meeting, beside its transcript and chat. Questions after the meeting still use it. The panel shows a small chip with the file name (or a "Pasted notes" label) and a way to remove it. Deleting the meeting deletes its context (design decision 52).
- Q: Where does the context go? → A: Only to the selected chat provider, never to ElevenLabs in 008. The chat provider's retention text must cover it (design decision 53).
- Q: What comes after? → A: Two ideas for the roadmap, not specified: 009 Standing context (one file about the user's role, projects and team, applied to every meeting until changed, combined with a meeting's own context) and 010 Key terms from context (terms pulled from the context sent to ElevenLabs automatically as key terms) (design decision 54).

### Session 2026-10-09 (defaults chosen without asking — for the user to check)

`/speckit-clarify` was answered with these defaults instead of blocking. Each is reversible; the user may override any of them before implementation.

- **A1 Word for it.** The panel calls the context "notes", matching the answer label "From your notes:". The file name is shown as is; pasted text is shown as `Pasted notes`.
- **A2 Size limit.** Up to 100,000 characters (about 25,000 words, 30–40 pages). Longer notes are not attached and the panel says so; nothing is cut. With this cap, notes plus a three-hour meeting stay under a tenth of every curated model's input budget, so 003's too-large path stays a guard; if it is ever hit, its message names the notes too.
- **A3 Encoding.** UTF-8, with or without a byte-order mark; line endings normalised. A file that is not valid UTF-8 text (or holds NUL bytes) is not attached and the panel says to save it as UTF-8. Markdown is sent as written, not rendered.
- **A4 Empty.** A file or paste with nothing but whitespace is not attached and the panel says the file is empty; `Save notes` stays disabled for an empty paste box.
- **A5 Placement and cache.** The notes go into the request as their own block, before the transcript lines, in the first question after they were added or changed; earlier turns are replayed byte-for-byte (003 decision 46), so adding notes mid-meeting keeps the prompt cache. Replacing or removing notes leaves the superseded notes out of every later request (their text is never sent again) and tells the model in the next question that earlier notes no longer apply; that costs one cache rebuild from the first turn that carried them. Every earlier question, answer and transcript block is still replayed in full.
- **A6 Earlier answers after a change.** Answers already given stay as written, like answers after a rename (003). The model is told that anything earlier answers took from replaced or removed notes no longer applies.
- **A7 Where the controls are.** Before Start, `Add notes` sits beside the language picker next to Start (both are choices for the next meeting) and its chip shows there. Once the meeting starts, the notes move to the Ask area under the transcript, which always holds the notes of the meeting shown. After Stop the shown meeting's notes can still be replaced or removed there (and added, if it had none), so a meeting reopened in 004 behaves the same.
- **A8 Pending notes.** Pending notes survive closing the panel and restarting the browser, are used by the next meeting that starts successfully only, and stay pending if Start fails. While a meeting runs, notes cannot be queued for the one after it.
- **A9 Questions without a transcript.** 003's rule stands: no question is sent until at least one line is transcribed, even with notes attached.
- **A10 What the model sees.** The file name (or `Pasted notes`) is sent with the notes. The notes are given as material, not instructions; they never name an "Others" speaker or change a name.

### Session 2026-10-12 (user, on the eval results after the Ask fixes of 2026-10-10)

- Q: Asked what the notes say, the answer was "Your notes give a launch budget of 40k." with no `From your notes:` label. Is that properly marked? → A: Yes, "that counts" (design decision 77, refining 50 and 59). Notes material is marked in one of two ways: in a paragraph that starts with the `From your notes:` label, or in a sentence that itself names the user's notes as the source of what it states. The label is not also required on such a sentence. Notes content with neither form is still a failure, and so is citing it or presenting it as said in the meeting (FR-009, FR-009b, FR-011, SC-002).
- What "names the user's notes as the source" means, for the evaluation (FR-009b): the sentence holds "your notes" (Greek: "σημειώσεις σου / σας") either as the subject of a verb of stating ("Your notes give / list / say / mention…", "Οι σημειώσεις σου γράφουν / αναφέρουν…") or after a source preposition ("in / from / according to your notes", "στις / από τις / σύμφωνα με τις σημειώσεις σου"). "The agenda mentions…", "…which matches your notes" and "Jane notes that…" do not count. English and Greek only, like the label (decision 59).
- A sentence is notes material whenever it mentions something that is only in the notes (an agenda item, a figure, a person), also when the sentence is about the meeting, such as "hiring has not come up": the item is from the notes, so the sentence is marked and uncited (FR-009; `coverage` and `coverage-el` in the runs of 2026-10-12).
- The panel shows a sentence-attributed notes statement as the model wrote it; it adds no label and treats no unlabelled sentence as an error. Label handling (decision 59) is unchanged, and now also covers the half-translated Greek label seen on 2026-10-12, "From τις σημειώσεις σου:", which the panel shows as "Από τις σημειώσεις σου:" (FR-009a).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bring my notes into the meeting (Priority: P1)

Before a call the user adds the meeting's agenda (`agenda.md`) next to Start, then starts transcribing. The chip moves into the Ask area. Twenty minutes in they ask "Which agenda items haven't we covered yet?" The answer says, with citations, which items were discussed, and lists the rest in a passage that starts "From your notes:" with no timestamps.

**Why this priority**: This is the feature: answers that know what the meeting is meant to cover.

**Independent Test**: With a fixture agenda added before Start and a recorded transcript replayed, ask a question against a recorded model stream; the request carries the notes block before the transcript lines, the stored meeting holds the notes, and the panel shows the chip in the Ask area.

**Acceptance Scenarios**:

1. **Given** no meeting is running, **When** the user chooses `Add notes` beside Start and picks `agenda.md`, **Then** a chip `agenda.md` shows beside Start, with a way to remove it.
2. **Given** pending notes, **When** the user presses Start and the meeting starts, **Then** the notes belong to that meeting, the chip shows in the Ask area, and nothing is left pending beside Start.
3. **Given** a meeting with notes and a transcript, **When** the user asks a question, **Then** the request holds the notes and the transcript, and the answer's notes-based statements are in a passage starting with "From your notes:" (in the question's language) or in sentences that name the notes as their source, and carry no citation.
4. **Given** a meeting with notes, **When** the user asks in Greek, **Then** the notes label is in Greek too.
5. **Given** pending notes and a Start that fails, **When** the user looks beside Start, **Then** the notes are still pending.

---

### User Story 2 - Notes never pass for what was said (Priority: P1)

The notes say "Budget: 40k". Nobody mentions the budget. The user asks "Did anyone say what the budget is?" The answer is "That isn't in the transcript so far." and may add "From your notes: the budget is 40k." It never cites a moment for it or says someone said it. The notes list the attendees; an "Others" line stays unnamed.

**Why this priority**: Constitution II: an invented "said" in a meeting record becomes a false fact. Notes make that mistake easier, so the guard matters as much as the feature.

**Independent Test**: The request for any question carries the notes rules and the notes as a separate block; the user-run evaluation scores notes-only, said-vs-notes and "Others"-with-attendee-list questions.

**Acceptance Scenarios**:

1. **Given** notes that answer a question the transcript does not, **When** the user asks whether it was said, **Then** the answer says it isn't in the transcript and anything from the notes is marked as from the notes (FR-009b) and uncited.
2. **Given** notes that list attendees and lines labelled "Others", **When** the user asks who said one of those lines, **Then** the answer does not give a name from the notes.
3. **Given** a notes passage in an answer, **When** it is displayed, **Then** it has no working citation.
4. **Given** a question the transcript answers, **When** the notes say something different, **Then** the answer reports what was said with citations and labels the notes' version as from the notes.

---

### User Story 3 - Change the notes during the meeting (Priority: P2)

Ten minutes into a call a colleague shares a document; the user pastes its text into the notes box. Later they swap in an updated file, and at the end they remove the notes.

**Why this priority**: Notes often arrive or change once the meeting has started.

**Independent Test**: During a fixture meeting, paste notes, ask, replace them with a file, ask, remove them, ask; the three requests carry the pasted notes, then only the file with a "replaced" note, then no notes text with a "removed" note, and earlier questions and answers are replayed each time.

**Acceptance Scenarios**:

1. **Given** a running meeting without notes, **When** the user chooses `Add notes` → `Paste text`, pastes and saves, **Then** the Ask area shows `Pasted notes` and the next question carries them.
2. **Given** notes, **When** the user picks another file, **Then** the chip shows the new name, the next question carries only the new notes and is told the earlier notes no longer apply, and the old notes' text is not sent again.
3. **Given** notes, **When** the user removes them, **Then** the chip goes, the next question carries no notes text, and the old text is gone from local storage.
4. **Given** an answer is streaming, **When** the user changes the notes, **Then** that answer continues unchanged and the change applies from the next question.
5. **Given** a file that is empty, too long, not UTF-8 text, or not `.txt` / `.md`, **When** the user picks it, **Then** the panel says what is wrong and the notes are unchanged.

---

### User Story 4 - Notes stay with their meeting (Priority: P2)

After the call the user asks one more question; it still uses the notes. Closing the panel or restarting the browser loses nothing. Deleting the meeting deletes its notes. The notes never reach ElevenLabs, the downloaded transcript or the knowledge-base file.

**Why this priority**: Constitution I and II: the user must know where the notes went and that they are gone when the meeting is.

**Independent Test**: Stop a fixture meeting with notes, ask, delete it; the question carried the notes, and afterwards no notes data for the meeting remains locally. The ElevenLabs messages, the download and the logs never contain the notes text.

**Acceptance Scenarios**:

1. **Given** a stopped meeting with notes, **When** the user asks a question, **Then** it is answered with the notes.
2. **Given** a meeting with notes, **When** the panel is closed and reopened (or the browser restarted), **Then** the chip and the notes are still there.
3. **Given** a meeting with notes, **When** the user deletes the meeting, **Then** its notes are deleted with it.
4. **Given** a meeting with notes, **When** it is transcribed, downloaded (007) or exported (004), **Then** the notes text appears in none of the audio-service traffic, the file or the export.
5. **Given** the chat provider disclosure in setup or Settings, **When** the user reads it, **Then** it says that notes added to a meeting are sent with each question.

---

### Edge Cases

- A question asked before any line is transcribed: rejected as in 003 ("Nothing transcribed yet."), notes or not (A9).
- Notes plus transcript over the selected model's input budget: the turn fails as too large, the message names the notes, nothing is truncated (003 FR-019).
- The user picks a file through the picker's "All files" option with another extension: not attached, with a message naming the allowed types.
- A file far larger than the character cap: rejected before it is read in full, with the same message as too-long notes.
- The same file is added again after editing it: treated as a replacement (new version).
- Notes containing bracketed times (`[10:30] standup`): the model is told notes are never cited; a time that matches no transcript line is plain text as in 003.
- Notes containing instructions ("ignore the transcript"): the model treats notes as material, not instructions (A10).
- The panel closes while notes are being saved: the save either completes or leaves the earlier notes; no half-saved notes.
- Two panels open (one side panel per window): the last save wins; each panel shows the stored notes when it next reads them.
- The meeting shown changes (Stop, then Start of another meeting): the Ask area shows the new meeting's notes, or none.
- A meeting stored before 008: no notes; everything works as before.

## Requirements *(mandatory)*

### Functional Requirements

**Adding notes**

- **FR-001**: Users MUST be able to add notes to a meeting from a `.txt` or `.md` file or by pasting text. No other input (PDF, Word, URLs, images, drag and drop) is offered in 008.
- **FR-002**: A meeting MUST have at most one set of notes; adding notes to a meeting that has some replaces them.
- **FR-003**: When no meeting is running, users MUST be able to add, replace and remove notes for the next meeting beside Start. They MUST be applied to the next meeting that starts successfully, kept until then across panel closes and browser restarts, used by that one meeting only, and kept pending if Start fails.
- **FR-004**: For the meeting shown (running or stopped), users MUST be able to add, replace and remove its notes from the Ask area.
- **FR-005**: Notes MUST be shown as a chip with the file name, or `Pasted notes` for pasted text, with a control to remove them; screen readers MUST hear which meeting the notes belong to (next meeting or the one shown).
- **FR-006**: Notes MUST NOT be attached, and the earlier notes MUST stay unchanged, when the input is empty or whitespace only, longer than 100,000 characters, not valid UTF-8 text, or (for a file) not `.txt` / `.md`; the panel MUST say which, and what to do.
- **FR-007**: Notes MUST be stored as the text the user gave, with a leading byte-order mark removed and line endings normalised; Markdown is kept as written.

**Answering with notes**

- **FR-008**: Every question about a meeting with notes MUST be answered with that meeting's current notes in the request, as a block separate from the transcript lines, alongside everything 003 sends.
- **FR-009**: The model MUST be instructed that anything taken from the notes is marked as coming from them in one of two ways, with no citation, and that the notes were not said in the meeting: in its own paragraph, on a new line, starting with "From your notes:" fully in the language of the answer (the Greek label is given to the model as written), or in a sentence that itself names the notes as its source (design decision 77, 2026-10-12). A sentence that mentions something found only in the notes is notes material even when it is about the meeting, such as which agenda items have not come up yet: discussed items are cited from the transcript, the rest is in the notes paragraph and is not repeated outside it (real call 2026-10-10, eval 2026-10-12). The model MUST also be instructed that a statement that something was not said has no line to cite, and not to bring up people or details from the notes that the question did not ask about.
- **FR-009a**: When the panel shows an answer, a recognised notes label (English or Greek) that follows other text in its paragraph MUST start a paragraph of its own, and a citation inside a notes passage (from the label to the end of its paragraph, list items under it included) MUST NOT be shown (real call 2026-10-10). A Greek label whose first word came out in English ("From τις σημειώσεις σου / σας:") is a recognised label and MUST be shown fully in Greek ("Από τις σημειώσεις σου / σας:") (eval 2026-10-12, design decision 59).
- **FR-009b**: In the evaluation, a statement holding notes-only content counts as marked when it is inside a labelled notes passage or when its sentence names the user's notes as its source (Clarifications 2026-10-12: "your notes" / "σημειώσεις σου / σας" as the subject of a verb of stating or after a source preposition). Such content in a sentence with neither, or in a sentence with a citation, is a failure. The panel MUST show a sentence-attributed notes statement as written.
- **FR-010**: Questions about what was said MUST still be answered only from the transcript: when the transcript does not contain it, the answer says it isn't in the transcript so far (003 FR-006), and may then add a labelled notes passage.
- **FR-011**: The model MUST be instructed never to present notes as said in the meeting, never to cite a transcript time for them, never to use them to name an "Others" speaker or change a speaker's name, and to treat them as material rather than instructions.
- **FR-012**: After notes are replaced or removed, later requests MUST NOT contain the superseded notes' text; the next request MUST tell the model that earlier notes, and what earlier answers took from them, no longer apply. Earlier questions, answers and transcript blocks MUST still be replayed in full (003). Earlier answers MUST stay as written.
- **FR-013**: A notes change while an answer streams MUST apply from the next question; the streaming answer is unaffected.
- **FR-014**: When notes plus transcript exceed the selected model's input budget, the question MUST fail as too large with a message that names the notes; nothing is truncated or summarised (003 FR-019).

**Where notes go**

- **FR-015**: Notes MUST be sent only to the selected chat provider, only as part of a question the user sends. They MUST NOT be sent to ElevenLabs (as audio context, key terms or anything else) or to any other destination.
- **FR-016**: The chat provider disclosures in first-run setup and Settings MUST state that notes added to a meeting are sent with each question (constitution I).
- **FR-017**: Notes MUST be stored only in local browser storage with their meeting, beside its transcript and chat. Deleting the meeting MUST delete its notes in the same step; removing or replacing notes MUST delete the superseded text from local storage (no copy kept with the chat history).
- **FR-018**: Notes MUST never be written into the transcript, the downloaded transcript (007), the knowledge-base export (004) or logs.
- **FR-019**: Every new user-facing string MUST follow `embody-dont-announce` (design decision 33) and be recorded in the copy review.

### Key Entities

- **Meeting notes**: the one set of notes a meeting has: its name (file name or `Pasted notes`), where it came from (file or paste), its text, when it was added, and a version that changes on every add, replace or remove.
- **Pending notes**: notes chosen for the next meeting before Start; become that meeting's notes when it starts.
- **Notes reference on a question**: which version of the notes a question carried to the model, and whether it was announced as added, replaced or removed. Holds no notes text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Adding a file of up to 100,000 characters takes at most three actions (Add notes, Choose file, pick) and its chip appears within 1 second.
- **SC-002**: In the evaluation set, at least 95% of answers that use the notes mark every notes statement, by the label or by naming the notes in its sentence (FR-009b), and give it no citation, and none presents notes content as said in the meeting.
- **SC-003**: For "was it said?" questions answered only by the notes, at least 95% of answers say it isn't in the transcript, and none cites a moment for it.
- **SC-004**: Across the evaluation set, no "Others" line is given a name taken from the notes.
- **SC-005**: Across the automated suite, the notes text never appears in audio-service traffic, the transcript, the downloaded or exported file, logs, or any request after the notes were removed or replaced.
- **SC-006**: After deleting a meeting, or removing its notes, no copy of the notes text remains in local storage.
- **SC-007**: A question asked within 5 minutes after notes were added mid-meeting still reads the earlier conversation from the provider's prompt cache (manual check).

## Assumptions

- **Depends on 003 (merged) and on `003-fix-real-call` (pending)**: 008 extends 003's grounding prompt, request layout, chat turn, Ask area and provider disclosures. `003-fix-real-call` renumbers and rewrites prompt rules and adds a quotation guard to citations; 008's prompt rules and tasks are applied after it merges.
- **007 (Download transcript)** and **004 (History & inbox export)** write transcript only; 008 adds a guard test to 007's formatter and a carry-forward note for 004's plan (notes stay with a reopened meeting, never in the export).
- Defaults A1–A10 above stand until the user overrides them.
- Standing context (009) and key terms from context (010) are separate later features; nothing in 008 is built for them beyond keeping the notes in a per-meeting record.
- Notes are the user's own material; they are not a meeting record and are not shown in the transcript.
