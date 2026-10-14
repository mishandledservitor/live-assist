---

description: "Task list for 008 Meeting context"
---

# Tasks: Meeting context

**Input**: Design documents from `specs/008-meeting-context/`

**Prerequisites**: plan.md, spec.md (decisions 49–54, defaults A1–A10), research.md (N1–N11), data-model.md, contracts/notes-messages.md, contracts/notes-ui.md, quickstart.md; 003 merged on main. **Do not start before `003-fix-real-call` has merged to `main`** (it rewrites `src/core/chat/prompt.ts`, `citations.ts` and the eval scorer that this feature extends). 007 (`007-download-transcript`) is needed only for T050's download assertion.

**Tests**: Required. Constitution III and CLAUDE.md rule 9: every "Write failing tests" task is written first and run, and must fail for the right reason (missing module, wrong value — not a typo or a broken fixture) before the implementation task after it. No automated test uses the network or a real key; chat answers come from the fixture provider or recorded fixtures.

**Concurrency note**: keep notes UI in its own components and `notes.css`; change `prompt.ts`, `context.ts`, `protocol.ts`, `db.ts`, `meeting-control.ts`, `index.ts`, `StartControls.tsx`, `AskArea.tsx`, `App.tsx` and `main.tsx` by small additive edits. A meeting without notes must produce request bodies byte-identical to 003's.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup

- [X] T001 Merge `origin/main` (with `003-fix-real-call`, and 007 if merged) into `008-meeting-context` (merge, never rebase); run `pnpm lint && pnpm typecheck && pnpm test` and record the green baseline. Re-read the merged `src/core/chat/prompt.ts`, `citations.ts`, `spikes/lib/ask-eval.ts` and the merged 003 `research.md` R7; if rule numbering differs from research N5's assumption (rules 1–9), update N5 and T024 before writing tests
- [X] T002 [P] Add notes file fixtures in `tests/fixtures/notes/`: `agenda.md` (UTF-8, includes the sentinel `NOTES-SENTINEL-7Q`, a bracketed `[10:30]` agenda time and an attendee list), `agenda-bom-crlf.txt` (BOM + CRLF), `greek.md` (UTF-8 Greek), `windows-1253.txt` (invalid UTF-8), `nul.txt` (contains a NUL byte), `empty.txt`, `whitespace.txt`, `long.txt` (100,001 characters), `notes.pdf` (any bytes, wrong extension); a `tests/support/notes.ts` helper that loads them as `Uint8Array`
- [X] T003 [P] Add `tests/fixtures/chat/meetings/notes-standup.json`: the 003 `standup-en.json` meeting plus a `notes` record (`agenda.md` content) and "Others" lines whose speakers appear in the notes' attendee list

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: notes types and validation, turn field, protocol, storage and the service-worker commands every story uses.

- [X] T004 [P] Write failing tests in `tests/unit/core/chat/notes.test.ts` for `decodeNotesFile(name, bytes)`, `notesFromPaste(text)` and `validateNotes(input)` per research N7 and data-model "Validation", using T002's fixtures: `.md`/`.txt` accepted (case-insensitive), BOM dropped, CRLF and lone CR → LF, Markdown unchanged; `windows-1253.txt` and `nul.txt` → `not-text`; `empty.txt`, `whitespace.txt` → `empty`; `long.txt` → `too-long`; bytes over 400,000 → `too-long` without decoding (spy); `notes.pdf` → `wrong-type`; paste uses the name `Pasted notes` and source `paste`; `validateNotes` rejects non-objects, names over 255 characters and file names without `.txt`/`.md`
- [X] T005 Implement the types, limits (`MAX_NOTES_CHARS`, `MAX_NOTES_FILE_BYTES`, `NEXT_MEETING_KEY`) and the three functions in `src/core/chat/notes.ts` so T004 passes
- [X] T006 [P] Write failing tests in `tests/unit/core/chat/turn.test.ts`: `ChatTurn.notesSent` absent on a 003 record reads as `null` (`normaliseTurn`); `toTurnView` omits `notesSent` with `contextBlock` and `sentLines`
- [X] T007 Add `NotesSent`, `notesSent` and `normaliseTurn` to `src/core/chat/turn.ts` and use `normaliseTurn` in `ChatRepo.listTurns` (`src/storage/chat-repo.ts`) so T006 passes
- [X] T008 [P] Write failing tests in `tests/unit/core/messaging/notes-protocol.test.ts` per `contracts/notes-messages.md`: `parseCommand` accepts `context/set` (both targets, both sources) and `context/remove`, rejects text over 100,000 characters, empty names, file names without `.txt`/`.md`, unknown targets; reply parsers accept the listed shapes and reject any reply carrying `text`
- [X] T009 Add the commands, reply types and parsers to `src/core/messaging/protocol.ts` so T008 passes
- [X] T010 [P] Write failing tests in `tests/integration/storage/context-repo.test.ts` (fake-indexeddb; the upgrade case sits beside 003's v1→v2 case pattern in `chat-repo.test.ts`): a v2 database (meetings, segments, chat turns) upgrades to v3 with data kept and `meetingContexts` created; `ContextRepo.get/set/remove/applyPending` per data-model "Rules" (version 1 on first set, +1 on replace and remove, tombstone on meeting remove, `next` deleted on remove, `applyPending` moves `next` to the meeting with version 1 in one transaction and does nothing without pending notes)
- [X] T011 Implement schema v3 in `src/storage/db.ts` (header comment: the service worker writes notes) and `src/storage/context-repo.ts` so T010 passes
- [X] T012 [P] Write a failing test in `tests/integration/storage/meeting-repo.test.ts`: `deleteMeeting(id)` deletes that meeting's notes record in the same transaction as its segments and chat turns, leaving another meeting's record and `next`
- [X] T013 Extend `MeetingRepo.deleteMeeting` in `src/storage/meeting-repo.ts` so T012 passes
- [X] T014 [P] Write failing tests in `tests/integration/background/context-commands.test.ts` for `handleContextCommand(command, deps)`: `context/set` re-validates with `validateNotes` and stores (reply `{ok, version}`), returns the error kind on invalid input without storing, `unknown-meeting` for a missing meeting, `save-failed` when the repo throws (earlier notes unchanged); `context/remove` for both targets; no reply carries notes text; the logger gets no name or text
- [X] T015 Implement `src/entrypoints/background/context-commands.ts` and route both commands in `src/entrypoints/background/index.ts` so T014 passes

**Checkpoint**: notes can be stored, replaced, removed and deleted through the service worker; nothing reads them yet.

---

## Phase 3: User Story 1 — Bring my notes into the meeting (Priority: P1) — MVP

**Goal**: add notes beside Start, have them applied at Start, and ask with them.

**Independent test**: with `agenda.md` added for the next meeting, Start (e2e build) moves the chip to the Ask area; a question's request (recorded by the fixture provider) holds one `added` notes block before the transcript block.

- [X] T016 [P] [US1] Write failing tests in `tests/unit/core/chat/notes.test.ts` for `notesBlock(kind, notes)` (the three research N4 texts exactly, `{name}` substituted) and `buildNotes(record, earlier)` / `replayNotes(turn, record)` for the add path: no record → no block, `sent: null`; notes and no earlier turn → `added` block with the record's version; notes already carried by a replayable earlier turn of the same version → no new block and that turn's replay returns the identical string; a failed or empty earlier turn does not count as carrying
- [X] T017 [US1] Implement `notesBlock`, `buildNotes` and `replayNotes` (add path) in `src/core/chat/notes.ts` so T016 passes
- [X] T018 [P] [US1] Write failing tests in `tests/unit/core/chat/context.test.ts`: `buildRequest` with a notes record puts the new block as `notes` on the new user turn and the replayed block on earlier turns; without a record the request deep-equals 003's (existing expectations unchanged); two builds from the same input are deep-equal; `estimateTokens` counts notes characters
- [X] T019 [US1] Extend `buildRequest` and `estimateTokens` in `src/core/chat/context.ts` and the user turn type (`notes?: string`) in `src/core/chat/provider.ts` so T018 passes
- [X] T020 [P] [US1] Write failing tests in `tests/unit/providers/chat/anthropic.test.ts` and `tests/unit/providers/chat/openai.test.ts`: a user turn with `notes` is sent as text blocks notes → context → question; without `notes` the captured body is byte-identical to the 003 expectation; bodies stay deterministic; extend `tests/unit/providers/chat/fixture-provider.test.ts` so the fixture provider records the last request it received (for e2e assertions)
- [X] T021 [US1] Add the notes block to `src/providers/chat/anthropic.ts` and `src/providers/chat/openai.ts`, and request recording to `src/providers/chat/fixture-provider.ts` (readable by Playwright from the service worker, as `tests/e2e/helpers.ts` already reads it), so T020 passes
- [X] T022 [P] [US1] Write failing tests in `tests/integration/background/chat-session.test.ts` (fake-indexeddb, fake provider): a meeting with a notes record sends the `added` block on the first question and stores `notesSent {version, kind: 'added'}`; the second question replays it and sends none; the stored turn and every `chat/*` message contain no notes text (sentinel); the log line has `notes: 'added'` then `'kept'` and never the name or text; a meeting without notes behaves exactly as before
- [X] T023 [US1] Load the record with `ContextRepo.get` in `src/entrypoints/background/chat-session.ts`, pass it to `buildNotes`/`buildRequest`, store `notesSent`, add the log flag, and wire the repo in `src/entrypoints/background/index.ts` so T022 passes
- [X] T024 [P] [US1] Write failing tests in `tests/unit/core/chat/prompt.test.ts`: rule 1 now names the person's notes; rules N-a–N-e of research N5 are present (material not instructions; "From your notes:" translated, no citation, never presented as said; what was said only from the transcript and the not-in-transcript sentence still applies; notes never name "Others" or change a name; only the latest notes apply); `Background:` rule unchanged; the prompt is still one constant
- [X] T025 [US1] Add the notes rules to `src/core/chat/prompt.ts` (after the merged 003-fix rules) and update 003 `research.md` R7 with a pointer to 008 N5 so T024 passes
- [X] T026 [P] [US1] Write failing tests in `tests/unit/background/meeting-control-notes.test.ts` (fakes for chrome, offscreen and repos): after `offscreen/begin` replies ok, `applyPending(meetingId)` runs once; on a failed begin it does not run and `next` stays; an `applyPending` failure is logged by kind and Start still returns ok; the `offscreen/begin` message never contains notes text (sentinel)
- [X] T027 [US1] Call `applyPending` in `start()` in `src/entrypoints/background/meeting-control.ts` so T026 passes
- [X] T028 [P] [US1] Write failing tests in `tests/unit/sidepanel/notes-api.test.ts` for `createNotesApi(deps)`: `get(target)` reads `ContextRepo` (key `next` or the meeting id) and returns name, source and (pasted only) text; `addFile(target, file)` reads the file, runs `decodeNotesFile`, sends `context/set` only when valid, maps a read failure to `unreadable`; `paste(target, text)`; `remove(target)`; malformed replies → `save-failed`
- [X] T029 [US1] Implement `src/entrypoints/sidepanel/notes-api.ts` so T028 passes
- [X] T030 [P] [US1] Write failing tests in `tests/unit/sidepanel/use-meeting-notes.test.tsx` for `useMeetingNotes(api, target)`: loads on target change, reloads after each command, exposes `busy` and `error`, clears `error` on the next action, reloads `next` when the shown meeting id changes (Start moved the pending notes)
- [X] T031 [US1] Implement `src/entrypoints/sidepanel/hooks/useMeetingNotes.ts` so T030 passes
- [X] T032 [P] [US1] Write failing tests in `tests/unit/sidepanel/notes-control.test.tsx` per `contracts/notes-ui.md` "Controls": `Add notes` opens a `menu` with `Choose file…` and `Paste text`; choosing a file calls `addFile`; the chip shows the name (and `Pasted notes`), accessible name `Notes: {name}`, opens the menu with `Remove notes`; the `×` button is named `Remove notes`; with `target: next` the names are `Add notes for the next meeting`, `Notes for the next meeting: {name}`, `Remove notes for the next meeting` and no visible "next meeting" text; each error kind shows its contract text in an `alert`; the file input has the contract `accept`
- [X] T033 [US1] Implement `src/entrypoints/sidepanel/components/NotesControl.tsx`, the notes error texts in `src/core/chat/messages.ts`, and `src/entrypoints/sidepanel/components/notes.css` so T032 passes
- [X] T034 [P] [US1] Write failing tests in `tests/unit/sidepanel/start-controls-notes.test.tsx` and `tests/unit/sidepanel/ask-area-notes.test.tsx`: the next-meeting control renders after the language picker only while no meeting runs; the Ask area renders the control for the meeting shown (running or stopped) and none without a meeting; without a notes API both render exactly as before
- [X] T035 [US1] Add the notes slot to `src/entrypoints/sidepanel/components/StartControls.tsx` and `AskArea.tsx`, and wire `notesApi` in `src/entrypoints/sidepanel/App.tsx` and `main.tsx`, so T034 passes
- [X] T036 [US1] Write a failing Playwright test `tests/e2e/notes.spec.ts` (e2e build, fixture chat provider, seeded settings, and Start driven by the e2e transcription fixture as in `tests/e2e/transcribe.spec.ts`): `Add notes for the next meeting` → `Choose file…` → `agenda.md` → chip beside Start; Start → chip in the Ask area, none beside Start; ask → the answer streams and the fixture provider's recorded request has one notes block before the transcript block
- [X] T037 [US1] Make T036 pass (wiring only; no new behaviour)

**Checkpoint**: US1 works end to end against fixtures.

---

## Phase 4: User Story 2 — Notes never pass for what was said (Priority: P1)

**Goal**: honesty with notes is instructed (T024–T025) and measured; the too-large path names the notes.

**Independent test**: `pnpm eval:ask --set notes-agenda` scores the three notes tags; a too-large turn in a meeting with notes shows the notes wording.

- [X] T038 [P] [US2] Add the evaluation set `tests/fixtures/chat/eval/notes-agenda.json` (over `notes-standup.json`; English and Greek questions tagged `notes-only`, `notes-vs-said`, `notes-others`, plus a few `supported` controls) and write failing tests in `tests/unit/spikes/ask-eval.test.ts` for the scorer: `notes-only` passes with the localised "From your notes" label family and no citation in that passage; `notes-vs-said` passes with the not-in-transcript phrase family and no citation attached to the notes fact; `notes-others` fails when a notes attendee name is attached to the "Others" line; the runner builds requests with the notes through `buildRequest`
- [X] T039 [US2] Extend `spikes/lib/ask-eval.ts`, `spikes/ask-eval.ts` (`--set`) and `spikes/README.md` so T038 passes
- [X] T040 [P] [US2] Write failing tests: in `tests/unit/core/chat/messages.test.ts` (new file), `chatErrorText('too-large', …, { hasNotes: true })` returns the notes wording of `contracts/notes-ui.md` and 003's text without notes; in `tests/unit/sidepanel/chat-thread.test.tsx`, a failed `too-large` turn in a meeting with notes shows the notes wording
- [X] T041 [US2] Implement the variant in `src/core/chat/messages.ts` and pass `hasNotes` from `AskArea` to `ChatThread` so T040 passes

**Checkpoint**: US1 + US2 are the grounded MVP with notes.

---

## Phase 5: User Story 3 — Change the notes during the meeting (Priority: P2)

**Goal**: paste, replace and remove at any time; superseded notes never sent again.

**Independent test**: paste → ask → replace with a file → ask → remove → ask; the three recorded requests carry the pasted notes, then only the file's notes with a `replaced` block, then no notes text with a `removed` block, with every earlier question and answer replayed.

- [X] T042 [P] [US3] Write failing tests in `tests/unit/core/chat/notes.test.ts`, `tests/unit/core/chat/context.test.ts` and `tests/integration/background/chat-session.test.ts` for replace and remove (research N4): an earlier turn carrying version 1 is replayed without its block once the record is at version 2; the new turn carries `replaced` (notes present) or `removed` (tombstone); the superseded sentinel text appears nowhere in the request; a tombstone no turn ever announced yields no block; transcript blocks, questions and answers of earlier turns are unchanged; a notes change while an answer streams leaves that turn's `notesSent` and request as they were, and applies to the next question; log flags `replaced` / `removed`
- [X] T043 [US3] Complete `buildNotes`/`replayNotes` for replace and remove in `src/core/chat/notes.ts` (and any session change) so T042 passes
- [X] T044 [P] [US3] Write failing tests in `tests/unit/sidepanel/notes-paste-dialog.test.tsx` per `contracts/notes-ui.md` "Paste dialog": modal `dialog` `Notes`, `textbox` `Notes` prefilled only when the current notes were pasted, `Save notes` disabled for whitespace, Escape and `Cancel` close without a command, an over-limit paste shows the paste too-long text and keeps the dialog open, focus returns to the control on close
- [X] T045 [US3] Implement `src/entrypoints/sidepanel/components/NotesPasteDialog.tsx` and open it from `Paste text` in `NotesControl.tsx` so T044 passes
- [X] T046 [P] [US3] Write failing tests in `tests/unit/sidepanel/notes-control.test.tsx`: with notes present, choosing another file replaces them (chip shows the new name); `Remove notes` from the menu and from `×` both call `remove`; a rejected file shows its error and the chip still shows the earlier notes
- [X] T047 [US3] Make T046 pass in `src/entrypoints/sidepanel/components/NotesControl.tsx`
- [X] T048 [US3] Write a failing Playwright scenario in `tests/e2e/notes.spec.ts`: during a running fixture meeting, `Add notes` → `Paste text` → save → ask; replace with `greek.md` → ask; remove → ask; the recorded requests match the independent test above
- [X] T049 [US3] Make T048 pass (wiring only)

---

## Phase 6: User Story 4 — Notes stay with their meeting (Priority: P2)

**Goal**: notes persist with the meeting, are deleted with it, never leak, and the disclosure covers them.

**Independent test**: stop a fixture meeting with notes, ask (notes used), delete it (no record left); the privacy guard finds the sentinel nowhere it must not be.

- [X] T050 [P] [US4] Write failing tests in `tests/unit/privacy/notes-leak.test.ts` with the `NOTES-SENTINEL-7Q` fixture: absent from `offscreen/begin`, the planned keyterms, every `live` port message and stored segment of a fixture meeting run with notes; absent from the 007 `formatTranscriptFile` output for that meeting (skip with a note if 007 is not on `main`); absent from every logger call in the chat session and context commands; after `remove` and after `deleteMeeting`, absent from every IndexedDB store (scan all values); in `tests/integration/background/chat-session.test.ts`, a stopped meeting with notes is answered with them
- [X] T051 [US4] Fix whatever T050 finds (expected: nothing beyond Phase 2–5 code; any leak is fixed at its source)
- [X] T052 [P] [US4] Write failing tests in `tests/unit/sidepanel/chat-retention.test.tsx` and `tests/unit/sidepanel/setup-chat.test.tsx`: both disclosures read as R30/R31 (`contracts/notes-ui.md`) in Settings and in first-run setup; the old sentence `Each question sends the transcript so far and this meeting` is gone
- [X] T053 [US4] Update `src/entrypoints/sidepanel/components/ChatRetention.tsx` and the disclosure lines in `specs/003-ask-the-transcript/contracts/ask-ui.md` so T052 passes
- [X] T054 [US4] Write a failing Playwright scenario in `tests/e2e/notes.spec.ts`: a meeting with notes is stopped; close and reopen the panel → the chip is in the Ask area; ask → the recorded request has the notes; `Delete transcript` → reopen → no chip, and an IndexedDB read in the page finds no `meetingContexts` record for it
- [X] T055 [US4] Make T054 pass (wiring only)

---

## Phase 7: Polish & cross-cutting

- [X] T056 [P] Write failing copy checks: add entries to `tests/fixtures/copy/copy-review.json` for K41 (every `contracts/notes-ui.md` string `present`; every Delete / never-add string `absent`) and R30/R31 (old sentence `absent`, new sentences `present`), and K41 strings to `tests/unit/copy/keep-strings.test.tsx`; fix any string that fails
- [X] T057 [P] Extend `tests/e2e/a11y.spec.ts`: axe passes with the notes menu open, a chip beside Start and in the Ask area, and the paste dialog open, in light and dark
- [X] T058 [P] Update contract docs touched by 008: `specs/003-ask-the-transcript/contracts/chat-provider.md` (user turn `notes?`, request assertions), `specs/003-ask-the-transcript/contracts/chat-messages.md` (pointer to `notes-messages.md`, chat-session steps 2a/4–6), `specs/003-ask-the-transcript/data-model.md` (`notesSent`), `specs/006-panel-redesign/contracts/panel-ui.md` (header notes slot, Ask dock notes row)
- [X] T059 Create `specs/008-meeting-context/manual-check.md` from `quickstart.md` "Manual check" (steps 1–9 with SC references and result fields; step 1 also times the chip for a ~100,000-character file, SC-001) and the `pnpm eval:ask --set notes-agenda` summary table
- [ ] T060 Record the plan defaults the user confirmed (spec A1–A10, research N1–N10) in `.specify/memory/design-decisions.md` under the next free numbers; update ROADMAP 008 status and `CHANGELOG.md`; leave `CLAUDE.md` "Current status" to the main session
- [X] T061 Run `quickstart.md` "Automated" end to end (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:e2e`, `pnpm test:e2e`) and fix anything red
- [ ] T062 Real-meeting check and `pnpm eval:ask --set notes-agenda` run by the user; results into `manual-check.md` (constitution III: required before 008 is called done)

---

## Implementation notes (2026-10-09)

- T001: merged `origin/main` (003-fix-real-call, 007, decisions 55–56) and later constitution v1.2.0, whose Principle II allows marked, uncited `From your notes:` content; the plan's Constitution Check now passes without an exception. Prompt rules 1–9 were as research N5 assumed.
- T003: the meeting with notes is built in `tests/support/notes.ts` (`notesStandup()`, 003's standup meeting plus `agenda.md`) instead of a duplicated JSON fixture; the eval set `notes-agenda.json` carries its own notes inline.
- T020: the fixture provider takes `onRequest`; the e2e build stores each request's notes and transcript blocks under `e2eLastChatRequest` in `chrome.storage.local`, which `tests/e2e/notes.spec.ts` reads.
- T035: the meeting's notes control sits on the line under the question box beside the model label, not above the box: a row of its own pushed the transcript under 70% of a 700 px panel (`panel-layout.spec.ts`). Contract and research updated. The header's focus order gains `Add notes for the next meeting` after the language picker (`a11y.spec.ts` updated).
- e2e seed helpers (`helpers.ts` `seedAskMeeting`, `panel-layout.spec.ts`) open IndexedDB at v3 with the `meetingContexts` upgrade, or the panel's v3 open would fail on a v2 database they created.
- TDD deviations, all guard tests that passed on first run because earlier tasks had already built the behaviour: T046 (replace by picking another file, a rejected file keeps the notes; written with T032 and green after T033), T048 (e2e paste/replace/remove, green on first run, T049 needed nothing), T050 (leak guard, as T051 expected), T056 (copy entries for strings written in T033/T053). Every other task's test was seen failing for the right reason first.
- T060: ROADMAP and CHANGELOG updated. The defaults A1–A10 and plan decisions N1–N10 are not yet recorded as design decisions: the user has not confirmed them; record them under the next free numbers when they do. `CLAUDE.md` is left to the main session.

---

## Fixes after real call 2026-10-10

Real Meet call with `agenda.md` attached and `pnpm eval:ask --set notes-agenda` (OpenAI GPT-6 Luna) of 2026-10-10. "Which agenda items haven't we covered?" gave a notes-derived sentence ("It also hasn't covered the glossary terms beyond DSM-5, or the next-year budget.") unlabelled and cited, in English and in Greek; the user asked for "From your notes:" to start its own paragraph like "Background:". Eval: one Greek label came out half translated ("From τις σημειώσεις σου:"); the 40% citation precision came only from the notes-others fixture listing no supported times; the two notes-vs-said failures were correct partial answers (approval cited [02:00], "no amount was mentioned") that the scorer did not recognise. The asked-for-word failure is 003 T093–T094; its eval case is here, with notes attached. Test data is synthetic.

- [X] T063 Write failing prompt tests (`tests/unit/core/chat/prompt-notes.test.ts`): a notes passage is its own paragraph starting on a new line; the label is translated whole; comparisons with the notes ("not covered yet") are notes passages, discussed items cited from the transcript
- [X] T064 Reword the notes rule of `GROUNDING_PROMPT` to pass T063; FR-009 updated
- [X] T065 Write failing guard tests (`tests/unit/core/chat/notes-passages.test.ts`): a mid-paragraph English or Greek label starts its own paragraph (after a sentence end, a citation group or a single line break); a label already at a paragraph start, `From your notes,` without a colon and a label inside a quotation stay as written; a passage runs to the end of its paragraph with list items; `parseAnswer` drops a citation inside a notes passage and keeps the links of the next paragraph
- [X] T066 Implement `src/core/chat/notes-passages.ts` and use it in `parseAnswer` (`src/core/chat/citations.ts`); FR-009a and `contracts/notes-ui.md` updated
- [X] T067 Write failing eval tests (`tests/unit/spikes/ask-eval-notes.test.ts`): new tag `notes-coverage` (covered items cited and precise, the rest only in an uncited labelled passage or a sentence naming the notes); every sentence holding a notes fact is uncited and labelled or names the notes; notes-vs-said accepts a `related` line and a "not mentioned" denial; a mixed-language label is no passage; with earlier turns the notes go with the first question, as the app sends notes added before Start
- [X] T068 Implement T067 in `spikes/lib/ask-eval.ts`; `notes-agenda` set: `supports` on notes-others, `related` on budget-said, coverage questions in English and Greek, the asked-for-word questions (also after a wrong refusal) with notes attached
- [ ] T069 User: `pnpm eval:ask --set notes-agenda` and steps 3, 4 and 7 in a real call; results into `manual-check.md`

## Fixes after the eval runs of 2026-10-12 (design decision 77)

Both runs on main after the Ask fixes of 2026-10-10 (OpenAI GPT-6 Luna) missed only the notes measure: 3 failures of 42 questions, 4 of 14 in `--set notes-agenda`. Two were the scorer's rule, not the answer (`budget-figure`, `budget-figure-el`: "Your notes give a launch budget of 40k." counts as marked, decision 77). The rest were real: `coverage-el` stated the uncovered agenda item in a plain sentence before the labelled paragraph (both runs) and once wrote the label as "From τις σημειώσεις σου:"; `coverage` (notes run) put "Hiring a second support engineer hasn't come up in the transcript so far." in a plain bullet and added an unasked bullet about Emma and Mike from the notes with the two "Others" lines cited. The panel had no rule that needed changing for decision 77; it did not recognise the half-translated label.

- [X] T070 Amend `spec.md` (Clarifications 2026-10-12, FR-009, FR-009a, FR-009b, SC-002, US1/US2 scenarios), `research.md` N5 and N8, `contracts/notes-ui.md`, `quickstart.md` and 003 `spec.md` (Clarifications 2026-10-12) for decision 77
- [X] T071 Write failing scorer tests (`tests/unit/spikes/ask-eval-notes.test.ts`): `namesNotesAsSource` accepts "your notes" / "σημειώσεις σου, σας" as the subject of a verb of stating or after a source preposition and rejects near misses ("The agenda mentions…", "…matches your notes", "Jane notes that…", "Check your notes: …"); `notes-only` and `notes-coverage` pass with a sentence-attributed fact and no label (the two real `budget-figure` answers); they fail on the two real `coverage` shapes (a plain "has not come up" sentence or bullet, a notes item before the labelled paragraph), on an attributed sentence with a citation, on a citation group written after the sentence's full stop, and when the fact is missing; `notesAlso` content (people only in the notes) is held to the same rule; a time such as `[00:40]` is not read as the fact "40"; the summary row is renamed
- [X] T072 Implement T071 in `spikes/lib/ask-eval.ts` (sentence ranges that keep a trailing citation group, `namesNotesAsSource`, `notesAlso`); `notes-agenda` set: `notesAlso` on the coverage questions, new questions `agenda-left`, `attendees`, `attendees-el`
- [X] T073 Write panel tests (`tests/unit/core/chat/notes-passages.test.ts`, `tests/unit/sidepanel/answer-text.test.tsx`): failing — "From τις σημειώσεις σου:" / "σας:" in a label position is shown as the Greek label, starts its own paragraph and loses its citations, and the same words inside a quotation or mid-sentence stay as written; guard (expected green, nothing in the panel enforces the label) — a sentence-attributed notes statement, English and Greek, is shown as written with no label added and no citation, and the links of the transcript sentence beside it stay
- [X] T074 Implement T073: `normaliseNotesLabels` in `src/core/chat/notes-passages.ts`, applied first in `parseAnswer` (`src/core/chat/citations.ts`)
- [X] T075 Write failing prompt tests (`tests/unit/core/chat/prompt-notes.test.ts`): two ways to mark notes material (labelled paragraph, or a sentence naming the notes as its source), neither cited; the Greek label written out; a sentence mentioning something only in the notes is notes material even when it is about the meeting, and is not repeated outside the labelled paragraph; a statement that something was not said has no line to cite; no unasked people or details from the notes, and no name from the notes beside an "Others" line
- [X] T076 Reword the notes rules of `GROUNDING_PROMPT` (`src/core/chat/prompt.ts`) to pass T075
- [X] T077 `manual-check.md` (008 and 003): what changed, the exact re-run commands, and the `budget-said` / decision 60 finding with options; `spikes/README.md`; `CHANGELOG.md`; all gates
- [ ] T078 User: re-run `pnpm eval:ask --provider openai --model gpt-6-luna` and `pnpm eval:ask --provider openai --model gpt-6-luna --set notes-agenda`; tables into the two `manual-check.md` files; decide on the `budget-said` options

## Dependencies & execution order

- T001 first, and only after `003-fix-real-call` is on `main`. T002/T003 alongside T001.
- Phase 2: T004–T005, T006–T007, T008–T009 independent; T010–T011 need T005; T012–T013 need T011; T014–T015 need T005, T009, T011.
- US1 needs Phase 2. T016–T017 first; T018–T019 need T017; T020–T021 need T019; T022–T023 need T019, T011; T036 needs T021's request recording; T024–T025 independent of the rest (prompt only); T026–T027 need T011; panel T028–T035 need T009, T011, T015; T036–T037 last.
- US2 needs T019 (eval requests) and T023; T040–T041 need T033.
- US3 needs US1. US4 needs US1; T050 needs T023, T027 and (for its 007 part) 007 on `main`.
- Polish after the stories it covers; T062 last.

## Parallel examples

- Phase 2: T004, T006, T008 together; then T010, T012, T014.
- US1: T016, T024, T026, T028 together; then T018, T030, T032; then T020, T022, T034.
- US3/US4 after US1: T042, T044, T050, T052 together.

## Implementation strategy

- **MVP**: Phases 1–4 (US1 + US2): notes added before Start, applied at Start, used and labelled in answers, measured by the eval.
- **Increment 2**: US3 (change during the meeting, paste) and US4 (persistence, deletion, leak guard, disclosure). US4's disclosure task (T052–T053) must ship with the MVP if the MVP is released to the user, because constitution I requires the disclosure to be true as soon as notes are sent.
- **Worktree split** (CLAUDE.md rule 6): Phase 2 storage and commands (T008–T015) and the core/provider tasks (T016–T025) can run as separate worktree subagents; the panel tasks (T028–T035, T044–T047) share `NotesControl.tsx` and `App.tsx` and run on one branch.
