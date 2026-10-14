# Feature Specification: Ask the transcript

**Feature Branch**: `003-ask-plan` (specified on `docs/specs-002-004`, updated for planning 2026-10-09)

**Created**: 2026-10-07

**Status**: Draft (updated 2026-10-09 for decisions 21, 28–29, 31–35 and features 002, 005, 006)

**Input**: User description: "ROADMAP 003 — Ask the transcript. Depends on 001 (capture & live transcript). A chat panel in the side panel where the user asks free-form questions about the meeting so far — to catch up after drifting off, or to get something explained. The full transcript so far is the context. Anthropic Claude (default Claude Sonnet 5.5) or OpenAI, chosen in settings, each with its own key. Answers stream in, cite the moments they rely on as clickable [mm:ss] timestamps that jump to the transcript, say \"not in the transcript\" when the transcript does not support an answer, and are written in the language of the question. No quick-action buttons in v1. Decisions: design-decisions.md #3, #13; constitution Principles I, II, IV, V, VI."

## Clarifications

### Session 2026-10-07

- Q: How are chat models chosen? → A: Fixed dropdown of a few curated models per provider; default Claude Sonnet 5.5; no custom model IDs; new models arrive via app updates. (Default superseded 2026-10-09 by design decision 40, below.)

### Session 2026-10-09 (user)

- Q: Where does Ask go on the 006 main view? → A: A question box pinned under the transcript; the conversation in a collapsible strip above it (at most about 40% of the panel height), so the transcript and the answer stay visible together when a citation is followed (FR-001, design decision 38).
- Q: Is the chat key asked for at first-run setup? → A: Yes. Choosing Claude or OpenAI and pasting its key is a required step of first-run setup, checked with the provider and stored by the service worker only, shown masked — the same pattern as the ElevenLabs key. Settings still allows changing provider, model and key later (FR-011a, design decision 39).
- Q: Which provider and model answer by default? → A: OpenAI GPT-6 Luna (`gpt-6-luna`). First-run setup preselects OpenAI, and OpenAI's model list defaults to GPT-6 Luna; Claude stays selectable, with Claude Sonnet 5.5 as Claude's default model (constitution v1.1.1, design decision 40; supersedes the 2026-10-07 default above).

### Session 2026-10-09 (plan-time update to later decisions)

The spec predates the single mixed stream, 002's labels, 005's key rule and 006's layout. These entries bring it in line; none changes the feature's intent.

- Decision 28 (one mixed stream): the transcript is one stream of lines, not separate mic and tab streams. Nothing in this feature depends on where a line's audio came from.
- Decisions 29 and 35, red-team trap 1: a line's speaker is a confirmed name (from Meet's captions, Meet's "You" shown as the user's name, or a manual correction) or "Others". "Others" can hold several people, the user included. The chat receives every line with its current display label, is told who the user is, and MUST NOT present an "Others" line as said by a named person (FR-002a). A line whose name is still pending (002's placeholder, decision 37 on the 002 branch) is sent as "Others".
- Decision 31 and 001 FR-003a (the side panel never reads a key): the Claude and OpenAI keys are written by the panel into a write-only pending slot and checked, stored and read only by the service worker, exactly like the ElevenLabs key. Chat requests are made by the service worker; the answer is streamed to the panel. The panel only ever sees the last four characters of a key (FR-014a).
- Decision 32 (006 layout: header, status line, transcript; Settings behind the gear; "Ask/chat is added later"): Ask is added to the main view; chat settings and the providers' retention disclosures go on the Settings screen. Placement on the main view: FR-001.
- Decision 33: every new string follows `embody-dont-announce`; the strings are listed in `contracts/ask-ui.md` and enforced by the existing copy scanner.
- Timestamps: the transcript shows `mm:ss` below an hour and `h:mm:ss` from one hour (`formatOffset`). Citations use the transcript's own format (FR-004); `[75:12]` written by a model is still recognised as 1:15:12.
- Chat is stored with its meeting in local storage as it streams and is deleted with the meeting (FR-022). Listing and reopening older meetings stays in 004.
- The user can ask about the meeting the panel is showing: the running meeting, or the last one after Stop.

### Session 2026-10-12 (user, on the eval results after the Ask fixes of 2026-10-10)

- How notes material in an answer counts as marked is 008's rule (its FR-009, FR-009b) and changed with design decision 77: the `From your notes:` label, or a sentence that itself names the user's notes as its source ("Your notes give a launch budget of 40k."). `pnpm eval:ask` (research R12) scores it that way; the summary row reads "Notes statements unmarked, cited or presented as said". Nothing else in 003 changes: transcript statements are cited, `Background:` is labelled, and citation precision (SC-002) is measured as before.
- Recorded for the user's decision, not changed: `notes-vs-said` questions such as `budget-said` have no `supports` times, so their one accepted citation (the `related` line, decision 60) counts as 0 precise of 1 in their own row, but those rows are left out of the citation-precision ratio, as are `absent` and `notes-only` rows. The 78.9% of the notes run of 2026-10-12 came from `coverage` (6 of 9) and `coverage-el` (4 of 5) alone. Options are in `specs/008-meeting-context/manual-check.md`.

### Session 2026-10-13 (user, design decision 80; after two questions hung in a real call)

In the call of 2026-10-12/13 two questions were accepted, their turns appeared in the strip, and nothing followed until the user pressed Stop: no answer text and no error. A later question, and later the same question again, were answered normally. The cause is not established. What the code showed: the provider request had no time limit of ours (the SDK's default is minutes long), and between the turn appearing and the first word the panel showed nothing that told waiting from stuck.

Decided by the user:

- Q: What does the panel show between sending a question and the first word of the answer? → A: That an answer is on its way, on the turn itself (FR-003a).
- Q: What if no answer starts? → A: After 45 seconds without a first word the request is stopped, the turn says so in plain words, and the question goes back into the box to resend (FR-018a).

Assumed (not asked; say so if any is wrong):

- A1: The 45 seconds are a limit on the wait for the first word of the answer, not on the whole answer. Once text is arriving, a long answer is never cut by it. Anything a provider sends before the first word (the model's name, a fallback notice) does not count as an answer and does not stop the clock.
- A2: Nothing is retried automatically. The person resends, so no second request (and no second charge) goes out unasked.
- A3: The message does not name the provider: `No answer came back. Ask again.` Whether the provider stalled or something on this computer did is not known at that moment, so naming one would be a guess (constitution IV says what failed, never more than is known).
- A4: The clock starts when the request is handed to the provider, after the transcript has been read and the turn stored, and runs in the service worker, so both providers behave alike and a closed panel changes nothing about it.
- A5: The question returns to the box only if the box is empty or holds only spaces. If the person has typed something else in the meantime, that is kept, and `Try again` on the failed turn still brings the question back.
- A6: A question queued behind the one that got no answer is sent as usual when that turn ends.
- A7: The turn is stored as failed with the kind `no-answer`, like any other failed turn: no answer text, never replayed to the model, kept in the conversation.
- A8: Stop pressed during the wait ends the turn as `Stopped`, with no message. Closing the panel during the wait does the same. A meeting deleted during the wait: 012's guard wins, nothing more is stored or shown for the turn.
- A9: The mark shown while waiting is three small dots, the same on every turn, with the accessible name `Waiting for the answer`; it stands still when the system asks for reduced motion. A question queued behind another keeps its `Waiting…`.
- A10: The service worker's existing `chat answer` log line gains timings and how the turn ended (FR-018b), so the next occurrence can be told apart. It holds no question, answer, transcript text or key, as before.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catch up on what I missed (Priority: P1)

During a live meeting the user loses focus for a few minutes. They type a question — "What did Jane say about the launch date?" — and an answer streams in within seconds, based on everything transcribed so far, with `[mm:ss]` timestamps pointing at the moments it relies on. Clicking a timestamp scrolls the transcript to that line and highlights it.

**Why this priority**: This is the reason the chat exists; it delivers value on its own as soon as there is a transcript.

**Independent Test**: With a recorded transcript fixture loaded and a recorded model response stream, ask a question; the answer streams into the panel, its `[mm:ss]` citations are clickable, and clicking one brings the matching transcript line into view highlighted.

**Acceptance Scenarios**:

1. **Given** a running meeting with 20 minutes of transcript, **When** the user asks "What was decided about pricing?", **Then** the answer begins appearing within 3 seconds and continues to stream until complete.
2. **Given** an answer containing `[12:40]`, **When** the user clicks it, **Then** the transcript scrolls to the line at 12:40 and highlights it, the answer stays visible, and live transcription is not interrupted.
3. **Given** a question asked at minute 20, **When** the answer is generated, **Then** it is based on the finished transcript lines up to the moment the question was sent, with speaker labels as currently shown.
4. **Given** the answer is still streaming, **When** new transcript lines arrive, **Then** the transcript keeps updating and the answer is not disrupted.
5. **Given** a previous question and answer in the chat, **When** the user asks a follow-up ("And who disagreed?"), **Then** the follow-up is answered in the context of the earlier exchange and the current transcript.
6. **Given** the meeting has stopped and its transcript is still shown, **When** the user asks a question, **Then** it is answered over that meeting's full transcript.

---

### User Story 2 - Honest answers, never invented ones (Priority: P1)

When the transcript does not contain what the user asked about, the assistant says so plainly ("That isn't in the transcript so far") instead of guessing. When it does answer, every factual claim about the meeting is tied to a cited moment.

**Why this priority**: The constitution requires grounded answers; a confident invented answer in a live meeting is worse than none.

**Independent Test**: Ask a question about a topic absent from a transcript fixture; the response states that the transcript does not cover it and contains no citations to unrelated moments.

**Acceptance Scenarios**:

1. **Given** a transcript that never mentions the budget, **When** the user asks "What is the budget?", **Then** the answer states that the transcript so far does not say, and does not invent a figure.
2. **Given** a question that is partly covered, **When** the answer is given, **Then** the covered part is answered with citations and the uncovered part is explicitly flagged as not in the transcript.
3. **Given** the user asks for an explanation of a term mentioned in the meeting ("What is SCORM?"), **When** the answer is given, **Then** it cites where the term came up and clearly separates what was said in the meeting from general background explanation.
4. **Given** an answer cites a timestamp that matches no transcript line, **When** it is displayed, **Then** that timestamp is shown as plain text, not as a working link.
5. **Given** the lines the question is about are labelled "Others", **When** the user asks "What did Jane say?", **Then** the answer does not attribute "Others" lines to Jane; it may quote them as said by someone not identified.

---

### User Story 3 - Set up the model provider from the start, change it later (Priority: P2)

First-run setup asks, next to the user's name and the ElevenLabs key, which provider answers questions — OpenAI (the default, GPT-6 Luna) or Anthropic Claude — and for that provider's key. Setup checks the key with the provider and finishes only when it works; the key is then shown only masked. Later, the Settings screen lets the user switch provider, pick a model from a short list and replace or remove either key. Setup and Settings state truthfully what the chosen provider receives and retains. The Ask area shows which model answers and whether it can.

**Why this priority**: Without a working chat key no question can be answered; setting it up at the start (design decision 39) means the first question just works. Switching providers is secondary.

**Independent Test**: On a fresh profile, complete setup choosing OpenAI with a key accepted by a recorded check; ask a question against a recorded OpenAI response stream; then in Settings switch to Claude, enter a key and ask against a recorded Claude stream. Keys are never shown in logs, errors or the panel.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** the user completes first-run setup, **Then** setup asks for the name, the ElevenLabs key, the chat provider (OpenAI preselected) and that provider's key, and shows what ElevenLabs and the chosen provider keep.
2. **Given** setup with a chat key the provider rejects (or none), **When** the user submits, **Then** setup says what is wrong with that key, keeps the other fields, and does not finish.
3. **Given** setup with keys both providers accept, **When** it finishes, **Then** each key is shown only by its last four characters, and the main view's Ask area is ready.
4. **Given** an install that completed setup before this feature, **When** the panel next opens, **Then** setup asks only for the chat provider and its key, once.
5. **Given** both providers have keys, **When** the user switches the provider in Settings, **Then** the next question goes to the newly selected provider and that answer shows which model wrote it.
6. **Given** the user removes the selected provider's key in Settings, **When** they look at the Ask area, **Then** it says to add a key in Settings and the question box is disabled; Start is unaffected.
7. **Given** the user reads the chat provider disclosure in setup or Settings, **Then** it states that the transcript so far and the chat are sent to that provider each time a question is asked, and summarises what that provider says it retains.

---

### User Story 4 - Ask in my own language (Priority: P3)

The user asks in Greek about a meeting held mostly in English (or vice versa); the answer comes back in the language of the question, with the same citations.

**Why this priority**: Inbox meetings mix Greek and English; useful but not blocking.

**Independent Test**: Ask a Greek question over an English transcript fixture; the request carries the language rule, and with a recorded Greek answer stream the citations point to the right English lines. Answer quality in each language is checked by the user-run evaluation (SC-005).

**Acceptance Scenarios**:

1. **Given** a transcript in English, **When** the user asks in Greek, **Then** the answer is in Greek.
2. **Given** a mixed Greek/English transcript, **When** the user asks in English, **Then** the answer is in English and may quote Greek lines as said.

---

### Edge Cases

- The user asks before any finished line exists: no request is sent; the Ask area says nothing has been transcribed yet.
- The transcript grows beyond what the chosen model can accept in one request: the user is told the meeting is too long to send in full to that model, before any request is sent; nothing is silently cut. A provider's own "too large" rejection gets the same message.
- The provider is unreachable, rate-limited, overloaded, or rejects the key: the chat shows an error naming the problem (without the key), the question stays in the box to retry, and transcription continues unaffected.
- A question is sent and no answer starts: the turn shows that it is waiting; after 45 seconds without a first word the request is stopped, the turn reads `No answer came back. Ask again.`, and the question is back in the box. Transcription is unaffected (FR-003a, FR-018a).
- The user sends a second question while an answer is still streaming: the second question waits until the first answer finishes or is stopped.
- The user stops an answer midway: the partial answer stays visible, marked as stopped.
- The side panel is closed while an answer streams: the answer is stopped and kept as stopped; the next open shows it.
- A label is renamed (002) after an answer was given: the existing answer text is unchanged; new questions use the new names.
- A line's speaker is named a few seconds after it appears (002 late captions): the next question sends the corrected label.
- The transcription session is reconnecting (001): questions can still be asked over the transcript collected so far; the status line already shows the reconnect, so the Ask area adds nothing.
- Meetings longer than an hour: citations use the transcript's `h:mm:ss` (e.g. `[1:15:12]`); a model's `[75:12]` resolves to the same line.
- The user asks something unrelated to the meeting ("What's the weather?"): the assistant says this is not in the transcript and does not answer from outside knowledge beyond clearly labelled background explanations of terms raised in the meeting.
- The provider declines to answer for safety reasons: the chat says the provider declined, with retry; no partial text is presented as an answer.
- The user deletes the transcript: the chat goes with it.
- The user removes the selected provider's chat key after setup: Ask says to add a key in Settings; transcription and Start are unaffected; setup does not reappear.

## Requirements *(mandatory)*

### Functional Requirements

**Asking and answering**

- **FR-001**: The side panel's main view MUST provide a question box pinned under the transcript where the user types a free-form question about the meeting shown and sends it. Once the meeting has a conversation, it shows in a collapsible strip between the transcript and the box, at most about 40% of the panel height, opening on the latest exchange with older ones scrolling inside it; the transcript keeps the rest of the height. There are no preset or quick-action buttons in v1 (design decision 38).
- **FR-002**: Each question MUST be answered using every finished transcript line of the meeting up to the moment the question was sent (the in-progress line is not included), each with its timestamp and current display label, plus the earlier questions and answers of this meeting's chat.
- **FR-002a**: The context MUST name the user (the meeting's user name) and MUST mark "Others" as unidentified speakers that may include the user; answers MUST NOT attribute an "Others" line to a named person. Lines whose name is pending are sent as "Others".
- **FR-003**: Answers MUST stream into the panel as they are generated, and the user MUST be able to stop an answer in progress.
- **FR-003a**: From the moment a question's turn appears until the first text of its answer arrives, the turn MUST show that it is waiting for the answer: a quiet mark in the place the answer will take, with an accessible name, announced to a screen reader once, still when the system asks for reduced motion, and replaced by the answer without moving anything else on the panel (design decision 80).
- **FR-004**: Answers MUST cite the transcript moments they rely on as bracketed timestamps in the transcript's own format (`[mm:ss]` below an hour, `[h:mm:ss]` from one hour).
- **FR-005**: Each cited timestamp that matches a transcript line MUST be clickable and MUST scroll the transcript to that line and highlight it, without pausing or disrupting live transcription and without hiding the answer; a timestamp matching no line MUST be shown as plain text, and so MUST a timestamp attached to a sentence whose quotation none of the cited lines contains (real call 2026-10-09).
- **FR-006**: When the transcript does not support an answer, the assistant MUST say that the information is not in the transcript (so far) rather than guess; partially supported answers MUST flag the unsupported part. A question about the chat itself (what the user asked the assistant to say, what it answered before) MUST be answered from the earlier questions and answers, without a citation, never with the not-in-transcript sentence (real call 2026-10-10).
- **FR-007**: Background explanations of terms or concepts raised in the meeting are allowed, but MUST be clearly distinguished from what was said in the meeting, and MUST NOT carry citations to moments that do not support them.
- **FR-008**: Answers MUST be written in the language of the question.
- **FR-009**: Only one question MUST be in progress at a time; a question sent while another is streaming waits until that answer completes or is stopped.
- **FR-010**: No question MUST be sent to a provider when the transcript has no finished line; the panel MUST say that nothing has been transcribed yet.

**Providers and settings**

- **FR-011**: Settings MUST let the user choose the chat provider — OpenAI (default) or Anthropic Claude — and enter a key for each; the default model MUST be OpenAI GPT-6 Luna, and Claude's default model Claude Sonnet 5.5 (design decision 40).
- **FR-011a**: First-run setup MUST include choosing the chat provider and entering its key, checked with that provider before setup completes, exactly as the ElevenLabs key is. An install that completed setup before this feature MUST be asked for the chat provider and key once. After setup, removing a chat key in Settings only disables asking; it never blocks Start.
- **FR-012**: Each provider MUST offer a fixed dropdown of a small curated set of models in Settings (no free-text model IDs). OpenAI's default is GPT-6 Luna and Claude's is Sonnet 5.5 (design decision 40); the lists are set in the plan (research R3) from the providers' then-current models. Supporting a newly released model requires an app update.
- **FR-013**: The system MUST check a key when it is saved and show whether it works, showing only the key's last four characters after saving.
- **FR-014**: Chat keys MUST be stored only on the user's machine (never synced), and MUST never appear in logs, error messages, chat content, exports or test fixtures.
- **FR-014a**: The side panel MUST NOT be able to read a chat key: it writes a candidate key once for checking and receives only the last four characters. The service worker holds the keys and makes every chat request; the answer reaches the panel as streamed text only.
- **FR-015**: The Ask area MUST show which model answers and its current state when it is not simply ready (no key, key rejected, unreachable, answering); each answer MUST show which model wrote it.
- **FR-016**: First-run setup and the Settings screen MUST state truthfully that the transcript so far and the chat are sent to the selected provider each time a question is asked, and what that provider says it retains; the app MUST NOT imply a privacy guarantee it does not have.
- **FR-017**: Transcript and chat content MUST be sent only to the selected chat provider, only when the user sends a question; nothing is sent to it in the background. Checking a key sends no transcript or chat content.

**Failure behaviour**

- **FR-018**: Provider errors (unreachable, rate-limited, overloaded, key rejected, request too large, answer cut off, declined) MUST be shown in the chat with a plain explanation and a way to retry, keeping the question text; they MUST NOT affect transcription.
- **FR-018a**: If no answer text has started within 45 seconds of the request being sent to the provider, the system MUST stop the request and end the turn as failed with the kind `no-answer`, shown as `No answer came back. Ask again.`, and the question MUST go back into the box (unless the box holds other text). The limit applies only to the wait for the first text: an answer that has started is never cut by it, and events that carry no answer text do not count as a start. It is one outcome per turn: a turn the user stopped, or whose text started, never also shows this message; text arriving after the request was stopped is discarded. Nothing is retried automatically. Both providers behave the same (design decision 80).
- **FR-018b**: The service worker's log line for each question MUST also hold the time to the provider's first event, the time to the first answer text, the total time and how the turn ended, and still no question, answer, transcript text or key.
- **FR-019**: When the transcript is too large to send in full to the selected model, the system MUST tell the user rather than silently truncating it.

**Grounding guarantees**

- **FR-020**: Chat answers MUST never be written into the transcript; they are kept separate from it (and are excluded from knowledge-base exports, per 004).
- **FR-021**: Each provider MUST sit behind a common provider contract so the provider can be swapped in Settings, and a later company backend can supply credentials (or relay chat) instead of local keys, without changing the chat behaviour described here.
- **FR-022**: A meeting's chat MUST be stored locally with that meeting as it streams, survive closing and reopening the panel, and be deleted (really deleted) with the meeting.

### Key Entities

- **Chat conversation**: the questions and answers belonging to one meeting, in order.
- **Question**: text the user sent, the time it was sent, and the transcript extent it was asked against (the exact transcript text added to the conversation with it).
- **Answer**: streamed text from the provider, the provider/model that produced it, its status (streaming, complete, stopped, cut off, failed) and, when failed, the kind of failure, and the citations it contains.
- **Citation**: a bracketed timestamp in an answer, linked to the transcript line at that time when one exists.
- **Chat provider setting**: selected provider, per-provider model, per-provider key (held by the service worker), key check result, whether the setup step for chat is done.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a 30-minute meeting, the first words of an answer appear within 3 seconds of sending a question in at least 90% of attempts on a normal connection.
- **SC-002**: In an evaluation set of questions over recorded transcripts, at least 95% of citations point to a line that supports the claim they are attached to.
- **SC-003**: For questions whose answer is absent from the transcript, the assistant says so in at least 95% of cases and invents an answer in none of the evaluation set's "absent" questions.
- **SC-004**: Clicking a citation brings the cited line into view within half a second, every time, during live transcription.
- **SC-005**: Answers are in the question's language for 100% of Greek and English questions in the evaluation set.
- **SC-006**: A user can go from a fresh install to a first answered question (choose provider, paste key, ask) in under 2 minutes.

## Assumptions

- **Depends on 001, 002, 005, 006 (all merged)**: this feature reads the stored transcript — one mixed stream of lines, each with an offset from meeting start and a display label (002's names, renames, overrides, or "Others") — and adds an Ask area to 006's main view, a chat step to first-run setup and a chat section to 006's Settings screen. It does not change capture, transcription or labelling.
- Reopening a past meeting from a history list belongs to 004 (history), which reuses this chat and its storage.
- Free-form questions only (design decision #13); summaries, action-item extraction and similar are just questions the user can type.
- The full transcript so far is sent with each question (design decision #3 / constitution Technical Constraints). Every model in the curated lists accepts about 900,000 input tokens or more; a three-hour meeting is roughly 60,000 tokens, so no summarisation or retrieval step is introduced in v1 and FR-019 is a guard, not an expected path.
- "Clearly distinguished" background explanations (FR-007) are allowed because explaining something said in the meeting is one of the two stated purposes of the chat.
- The evaluation set for SC-002/003/005 is built from recorded or redacted transcripts; automated tests use recorded provider streams and need no live key (constitution Principle III); the live quality check is a user-run evaluation and part of the real-meeting verification recorded in this folder.
- Gemini and generic OpenAI-compatible providers are out of scope (design decision #3).
