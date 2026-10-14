---

description: "Task list for 012 Past transcripts"
---

# Tasks: Past transcripts (012)

**Input**: Design documents from `specs/012-past-transcripts/`

**Prerequisites**: spec.md (amended 2026-10-12, decision 64), plan.md, research.md, data-model.md, contracts/transcripts-ui.md, contracts/internal-api.md, quickstart.md.

**Tests**: Required. Constitution III and CLAUDE.md rule 9: every test task is written first, run, and seen failing for the right reason before the implementation task after it is started. No automated test uses the network, a microphone, a live meeting or a real key. Three test tasks pin behaviour that should already hold when they are written (T022, T024, T048); each says so, and none is followed by production code unless it turns out red.

**Copy rule**: the only strings this feature may show are P1–P18 of spec.md "Proposed copy", as entered in `specs/006-panel-redesign/copy-review.md` (K43) by T001. If a task seems to need another string, stop and ask. `contracts/transcripts-ui.md` "Never add" lists what must not appear.

**Do not touch**: `.env` files; `CLAUDE.md` outside T050; `.specify/memory/design-decisions.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with its neighbours (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md
- **WG-x**: the worktree group that owns the task (see "Worktree groups" at the end)

---

## Phase 1: Setup

- [X] T001 (WG-E) Copy review before any UI work: add K43 to `specs/006-panel-redesign/copy-review.md` with every string of spec.md "Proposed copy" P1–P18 (exact text, where it shows, its job), reviewed against the `embody-dont-announce` skill ("When reviewing someone else's work": Delete / Rewrite / Keep / Do not add), plus a dated "Reviewed 2026-10-… on `012-past-transcripts`" line at the top and the "Never add" list of `specs/012-past-transcripts/contracts/transcripts-ui.md`. Record that the clean main view adds no string. Add the Transcripts control, the failure alert and a pointer to `specs/012-past-transcripts/contracts/transcripts-ui.md` to `specs/006-panel-redesign/contracts/panel-ui.md`. If the review rewrites or deletes a proposed string, change spec.md's table and `contracts/transcripts-ui.md` in the same commit — done on `012-foundations`: K43 keeps all eighteen strings, no Delete or Rewrite, so spec.md and `contracts/transcripts-ui.md` are unchanged
- [X] T002 [P] (WG-A) Types and test support, no behaviour: add `MeetingSummary` and the optional `Meeting.summary` to `src/core/transcript/model.ts` exactly as `contracts/internal-api.md`; create `tests/support/stored-meetings.ts` with builders `storedMeeting(overrides)`, `storedSegment(meetingId, seq, overrides)` and `longTranscript(meetingId, lines)` for unit, integration and dom tests. `pnpm typecheck` passes — builders also export `STORED_START`, `spokenBy(name)` and `spokenBySelf()`

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the pure rules, the storage reads and the panel's API for stored meetings.

- [X] T003 [P] (WG-A) Test `tests/unit/core/history/meeting-summary.test.ts`: `summariseMeeting` (names = confirmed display labels in first-appearance order over sorted segments; renames and single-line overrides applied; "Others" never listed, a hand-corrected "Others" line is; duplicates dropped; `fileLines` equals `transcriptFileLines(...).length`; `lastLineEndMs` is the largest `endMs`, `null` with no segment; input not mutated; 5,000 segments under 200 ms); `currentSummary` (missing or wrong `v` → `null`); `meetingState` (running id → `in-progress`; `endReason: 'crashed'` → `interrupted`; `endedAt: null` and not running → `interrupted`; else `stopped`); `meetingDurationMs` (stopped: `endedAt − startedAt`; interrupted: `lastLineEndMs`, `null` without a summary or a line; in-progress: `null`); `formatDuration` (`under 1 min`, `1 min`, `45 min`, `1 h`, `2 h`, `1 h 15 min`, floors, negative → `under 1 min`); `formatMeetingDate` / `formatMeetingTime` from local components (`new Date(2026, 9, 7, 14, 30)` → `7 Oct 2026`, `14:30`; `09:05`; all twelve months); `rowNames` (four shown, `more` counted)
- [X] T004 (WG-A) Implement `src/core/history/meeting-summary.ts` until T003 passes; `pnpm lint` confirms the `src/core/**` boundary holds
- [X] T005 [P] (WG-A) Test `tests/unit/core/export/meeting-files.test.ts`: `meetingFiles` returns one file of kind `transcript` whose `name` and `body` equal `transcriptFile(meeting, segments)` for meetings with renames, overrides, "Others" and Greek text; returns `[]` when no line would be written (no segments; only empty-text segments); never includes chat or notes text (the source type has no such field)
- [X] T006 (WG-A) Implement `src/core/export/meeting-files.ts` until T005 passes
- [X] T007 [P] (WG-B) Test `tests/integration/storage/meeting-list.test.ts` (fake-indexeddb): `listMeetings` returns every meeting newest first, records stored before 002 normalised, `[]` when empty; `summarise(id, compute)` passes the normalised meeting and its sorted segments to `compute`, stores the result on the record when `endedAt !== null`, does not store it for an open record, resolves `null` for an unknown id, and leaves every other field of the record as it was; `setSpeakerRename` and `setLabelOverride` remove a stored `summary` (and still do what they did); `endMeeting` and `markOrphanedCrashed` keep unrelated fields; `deleteMeeting` removes a record that carries a summary; 200 meetings list in under 100 ms
- [X] T008 (WG-B) Implement `listMeetings`, `summarise` and the summary invalidation in `src/storage/meeting-repo.ts` until T007 passes, with `tests/integration/storage/meeting-repo.test.ts` and `crash-recovery.test.ts` still green
- [X] T009 (WG-D) Test `tests/unit/sidepanel/transcripts-api.test.ts`: `createTranscriptsApi` — `list` returns the repo's list and rejects when the repo rejects; `summarise` calls `repo.summarise(id, summariseMeeting)`; `open` returns the meeting with its segments, `null` when the meeting is gone; `remove` calls `deleteMeeting(id)` once. Create `tests/unit/sidepanel/fake-transcripts-api.ts` (in-memory meetings and segments, `vi.fn` members, `failNextList()`, `failNextRemove()`, a `summarise` that can be held back to test rows before their details are ready)
- [X] T010 (WG-D) Implement `src/entrypoints/sidepanel/transcripts-api.ts` until T009 passes

**Checkpoint**: `pnpm lint && pnpm typecheck && pnpm test` green; no UI has changed.

---

## Phase 3: User Story 1 — see every stored transcript and read one (P1)

**Goal**: a header control opens the Transcripts screen; every stored meeting is listed newest first with date, time, duration, names and markers; a stopped meeting's transcript can be read there, read-only; Back and Escape work with the right focus; a running meeting is undisturbed.

**Independent test**: spec US1 "Independent Test" (four stored fixtures: four rows in order, one opened and read, Back twice).

- [X] T011 [US1] (WG-D) E2E first: create `tests/e2e/transcripts-helpers.ts` (`seedStoredMeetings(panel, meetings)` writing settings that are ready to start and the given meetings, segments, chat turns and notes into IndexedDB `live-assist` version 3 with the same upgrade as `src/storage/db.ts`, as `seedAskMeeting` does; `readAllStores(panel)` returning every object store's records by store name) and `tests/e2e/transcripts.spec.ts` with the US1 block: four seeded meetings (one interrupted, one with six names, one with no lines) → `Transcripts` button opens the screen, title focused, four rows newest first with the expected `{date} · {time} · {duration}`, names, `+2 more`, `Interrupted`, `Nothing was transcribed.`; open one → title `{date}, {time}` focused, every line with time and label, no label is a button, no question box, first line in view; Back → same row focused, same scroll position; Back → main view, `Transcripts` button focused; Escape does the same; with a running fixture meeting the first row is `In progress` with no Download or Delete, selecting it returns to the main view, and every line that arrived meanwhile is there (SC-008); no stored meeting → `No transcripts stored.`. Run after `pnpm build:e2e` and see it fail because the control does not exist
- [X] T012 [P] [US1] (WG-C) Test in `tests/unit/sidepanel/transcript.test.tsx`: with `follow={false}` the scroller has role `group` named `Transcript lines`, is focusable, is not scrolled to the bottom on mount or when props change, and labels are text; without the prop everything is as before (`log`, sticks to the bottom)
- [X] T013 [US1] (WG-C) Implement the `follow` prop in `src/entrypoints/sidepanel/components/Transcript.tsx` until T012 passes, with `transcript-cite.test.tsx` and `transcript-perf.test.tsx` still green
- [X] T014 [P] [US1] (WG-D) Test `tests/unit/sidepanel/meeting-row.test.tsx` (US1 parts): a stopped meeting renders `7 Oct 2026 · 14:30 · 45 min` in a `button` named `Open transcript of 7 Oct 2026, 14:30` described by its names `Jane, Alex`; six names → four and `+2 more`; only "Others" lines → no names element; no lines → `Nothing was transcribed.`; interrupted → `Interrupted` and the duration from the last line, no duration without lines; in-progress → `In progress`, no duration, no Download, no Delete; no summary yet → date, time, (stopped) duration and the opening control, no names; pressing the opening control calls `onOpen`; the row carries `data-meeting-id` and `data-state`
- [X] T015 [US1] (WG-D) Implement `src/entrypoints/sidepanel/components/MeetingRow.tsx` and the row styles in a new `src/entrypoints/sidepanel/components/transcripts.css` (date line on one line at 320 px, names and actions wrapping beneath) until T014 passes
- [X] T016 [US1] (WG-D) Test `tests/unit/sidepanel/past-transcript.test.tsx` (US1 parts): given a meeting and its segments it renders the `Transcript` region with every line in order, confirmed and fallback labels told apart as on the main view, no label button, no in-progress line, no footer, no question box; no segments → `Nothing was transcribed.`; an interrupted meeting shows `Interrupted` in the actions row; a 5,000-line meeting renders within the 100 ms jsdom budget of `transcript-perf.test.tsx` — the 5,000-line budget case sits in `tests/unit/sidepanel/transcript-perf.test.tsx`, beside the main view's, so the two heavy renders do not run in parallel workers
- [X] T017 [US1] (WG-D) Implement `src/entrypoints/sidepanel/components/PastTranscript.tsx` (actions row under the title, then `Transcript` with `follow={false}`) until T016 passes
- [X] T018 [US1] (WG-D) Test `tests/unit/sidepanel/transcripts-screen.test.tsx` (US1 parts) with the fake API: rows in the API's order with the running meeting first; two meetings started in the same minute are two rows, each acting on its own id; rows appear before their summaries resolve and fill in afterwards without reordering; summaries are requested only for meetings whose stored summary is missing or outdated, newest first, one at a time; `list()` rejecting → `alert` with P18 and no empty state; empty list → `No transcripts stored.`; selecting a stopped row calls `open(id)` and shows `PastTranscript` under a heading `{date}, {time}` that receives focus, with the list still mounted and hidden; Back and Escape from a meeting → list, focus on that row's opening control; Back and Escape from the list → `onBack`; selecting the running row → `onGoToRunning`; a change of `runningId` reloads the list (a meeting that stopped gains its actions); the list scroller and the screen are the only scroll containers and carry the classes of `contracts/transcripts-ui.md` — the running meeting's row details are not worked out while it runs (its row shows no names); the list scroller is focusable only when it holds rows
- [X] T019 [US1] (WG-D) Implement `src/entrypoints/sidepanel/components/TranscriptsScreen.tsx` and the screen styles in `transcripts.css` (flex column, `min-height: 0`, `.transcripts-list` positioned and scrolling, the bar outside the scroller) until T018 passes
- [X] T020 [US1] (WG-D) Tests: in `tests/unit/sidepanel/panel-header.test.tsx`, a `button` `Transcripts` with `title` `Transcripts` before the gear when `onOpenTranscripts` is given, absent otherwise; new `tests/unit/sidepanel/app-transcripts.test.tsx`: pressing it shows the Transcripts screen with its title focused and hides (does not unmount) the main view; Back returns with focus on the `Transcripts` button; the screen is unmounted while not shown, so reopening reads the list again; an open consent reminder is cancelled when the screen opens and nothing starts; during setup there is no `Transcripts` button; without a `transcripts` API the header is as before; live segments delivered while the screen shows are on the main view after Back (FR-003)
- [X] T021 [US1] (WG-D) Implement the control and the third screen: `components/PanelHeader.tsx`, `components/StartControls.tsx` (pass-through), `App.tsx` (`Screen` gains `'transcripts'`, focus moves, `runningId`), `main.tsx` (create the `TranscriptsApi` over the shared `MeetingRepo`), `style.css` (the header stays on one line at 320 px) until T020 passes, with `app-screens.test.tsx`, `app-layout.test.tsx` and `tests/e2e/panel-layout.spec.ts` still green — `style.css` changed with T048 (the notes label stays on one line in the header)
- [X] T022 [US1] (WG-D) Pinning test `tests/unit/sidepanel/transcripts-perf.test.tsx` (expected green; if red, fix per research R4 before going on): 200 rows render under 100 ms in jsdom; the screen with 200 summarised meetings never calls `summarise`. Then `pnpm build:e2e` and run T011's block until it passes

**Checkpoint**: US1 works alone: the screen lists and shows transcripts; nothing can be deleted or downloaded from it yet.

---

## Phase 4: User Story 2 — delete a past transcript for real (P1)

**Goal**: per-meeting Delete on the screen with a confirmation that names the meeting and its questions, answers and notes; nothing of the meeting remains in any store, and nothing written late can put it back.

**Independent test**: spec US2 "Independent Test" (three fixtures, one with chat and notes; delete it; scan local storage).

- [X] T023 [US2] (WG-D) E2E first, US2 block in `tests/e2e/transcripts.spec.ts`: three seeded meetings, the middle one with two chat turns and notes → its row's `Delete transcript` opens `group` `Confirm delete` with P13 naming its date and time, `Delete permanently` focused; Cancel → nothing deleted, focus on the row's Delete; Escape with it open closes it only; confirming → the row is gone, the `status` holds `Transcript deleted.`, focus is on the next row's opening control, and `readAllStores` finds the meeting's id and its planted sentinel strings in no store while both other meetings are intact (SC-003); opening the confirmation on a second row closes the first; deleting from a meeting's transcript returns to the list without it; deleting the last one shows `No transcripts stored.` with the title focused; the running meeting's row has no Delete. See it fail (no Delete on a row)
- [X] T024 [P] [US2] (WG-B) Pinning test `tests/integration/storage/real-deletion.test.ts` (expected green; a red result is a real-deletion bug to fix in `deleteMeeting` first): two meetings, each with segments (one overridden), renames, a stored summary, three chat turns with `contextBlock` and `sentLines`, and notes (one of them a tombstone); pending `next` notes too. After `deleteMeeting(a)`: iterate **every** name in `db.objectStoreNames`, read all records, and assert that neither `a`'s id nor any sentinel string planted in its lines, labels, question, answer and notes occurs anywhere; meeting `b` and the `next` notes are complete. The test names no store, so a store added later is covered — green as written: `deleteMeeting` already removed everything; run for both a meeting with notes and one with a tombstone
- [X] T025 [P] [US2] (WG-B) Test `tests/integration/storage/late-writers.test.ts`: `ChatRepo.putTurn` resolves `true` and writes while the meeting exists; after `deleteMeeting` it resolves `false` and `chatTurns` stays empty for that meeting, also for an update of a turn that existed before the delete; `ContextRepo.set` resolves `null` and writes nothing for a deleted or unknown meeting id, and still writes for `next`; `applyPending` and `remove` behave as before. Update the expectations in `tests/integration/storage/chat-repo.test.ts` and `context-repo.test.ts` that write turns or notes without a meeting record
- [X] T026 [US2] (WG-B) Implement the guards in `src/storage/chat-repo.ts` (`putTurn` in one transaction over `meetings` and `chatTurns`) and `src/storage/context-repo.ts` (`set` in one transaction over `meetings` and `meetingContexts`) until T025 passes, with `tests/integration/privacy/notes-leak.test.ts` still green
- [X] T027 [US2] (WG-B) Test `tests/unit/background/chat-session-deleted.test.ts`: a question whose first `putTurn` resolves `false` posts `chat/rejected` `unknown-meeting` and never calls the provider; when a later `putTurn` resolves `false` mid-stream the provider's signal is aborted, no further `chat/delta` or `chat/end` is posted for the turn and no write follows; a normal answer is unchanged. In the existing context-command tests: `context/set` replies `{ ok: false, kind: 'unknown-meeting' }` when `set` resolves `null` — the context-command cases are in `tests/integration/background/context-commands.test.ts`
- [X] T028 [US2] (WG-B) Implement in `src/entrypoints/background/chat-session.ts` and `src/entrypoints/background/context-commands.ts` until T027 passes, with the existing chat-session and context-command tests still green
- [X] T029 [P] [US2] (WG-C) Test in `tests/unit/sidepanel/delete-transcript.test.tsx`: default prompt is K6's text unchanged; a `prompt` prop replaces it; `accessibleName` names the button while its text stays `Delete transcript`; `remove()` resolving calls `onDeleted` once; `remove()` rejecting keeps the confirmation open, shows `alert` `Couldn't delete this transcript. Try again.`, does not call `onDeleted`, and a second attempt clears the alert; controlled mode (`confirming`, `onConfirmingChange`) opens and closes only through the props; Cancel and Escape close and return focus to the button; `Delete permanently` has focus when the confirmation opens — also: focus returns to `Delete permanently` after a failure; a confirmation closed from outside does not take focus
- [X] T030 [US2] (WG-C) Implement in `src/entrypoints/sidepanel/components/DeleteTranscript.tsx` and adapt its one call site in `App.tsx` (`remove={() => meetings.deleteMeeting(meetingId)}`, `onDeleted={live.refresh}`; behaviour on the main view otherwise unchanged) until T029 passes, with the K6 test in `tests/unit/copy/keep-strings.test.tsx` still green — P17 on the main view comes with it (spec D2)
- [X] T031 [US2] (WG-D) Tests (US2 parts) in `meeting-row.test.tsx`, `past-transcript.test.tsx` and `transcripts-screen.test.tsx`: a stopped or interrupted row has `button` `Delete transcript of {date}, {time}`; its confirmation shows P13 with that date and time; at most one confirmation is open in the list; Escape with a confirmation open closes it and does not call `onBack`, a second Escape does; after `remove` resolves the row disappears without a new `list()` call, the `status` region reads `Transcript deleted.`, focus goes to the next row's opening control, else the previous row's, else the title, and `onDeleted(id)` is called; deleting the last row shows `No transcripts stored.`; `remove` rejecting leaves the row with P17 shown; `PastTranscript` has `Delete transcript`, and confirming there returns to the list without the meeting, with the same announcement and focus rule
- [X] T032 [US2] (WG-D) Implement in `MeetingRow.tsx`, `PastTranscript.tsx`, `TranscriptsScreen.tsx` and `transcripts.css` (the visually hidden `status` region sits inside a positioned container) until T031 passes; then `pnpm build:e2e` and run T023's block until it passes

**Checkpoint**: US1 and US2 work; the main view still falls back to the next meeting after its own delete.

---

## Phase 5: User Story 3 — deleting on the main view leaves it clean and leads to the rest (P1)

**Goal**: after the meeting the main view shows is deleted, there or on the Transcripts screen, the main view is clean until the next Start, across reopening the panel; a main-view delete opens the Transcripts screen (decision 64).

**Independent test**: spec US3 "Independent Test".

- [X] T033 [US3] (WG-D) E2E first, US3 block in `tests/e2e/transcripts.spec.ts`: three seeded meetings, none running → `Delete transcript` on the main view, confirm → Transcripts screen with the two remaining rows and its title focused (SC-004); Back → `No transcript yet.`, no `Download transcript`, no `Delete transcript`, focus on the `Transcripts` button; reload the panel page → still clean, and the screen still lists two (SC-011); Cancel on the main view's confirmation → no screen change; with one seeded meeting the delete ends on `No transcripts stored.`; with the main view showing meeting A, delete older meeting B on the screen → Back shows A (FR-027); delete A on the screen → Back shows a clean main view; then Start a fixture meeting, let two lines arrive, Stop → that meeting is on the main view with Download and Delete, also after a reload. See it fail (the main view shows the next meeting)
- [X] T034 [P] [US3] (WG-A) Test `tests/unit/core/history/main-view.test.ts`: `showsOnMain` — `clearedAt: null` → true; `startedAt` later than `clearedAt` → true; equal or earlier → false
- [X] T035 [US3] (WG-A) Implement `src/core/history/main-view.ts` until T034 passes
- [X] T036 [P] [US3] (WG-B) Test `tests/unit/storage/main-view-store.test.ts` with `tests/support/fake-chrome-storage.ts`: `clearedAt()` is `null` when the key is absent, not a number, `NaN` or infinite; `clear(at)` stores the number under `mainViewClearedAt` and touches no other key; a later `clear` overwrites; `onChange` fires for that key only and its unsubscriber stops it; without a `changes` source `onChange` is a no-op
- [X] T037 [US3] (WG-B) Implement `src/storage/main-view-store.ts` until T036 passes
- [X] T038 [US3] (WG-D) Test in `tests/unit/sidepanel/meeting-api.test.ts`: `latestStored()` returns the latest meeting when the marker is absent or earlier than its `startedAt`; returns `null` when the marker is later, without reading its segments; returns the meeting when `clearedAt()` rejects; `clearMainView()` calls `mainView.clear(now())`; `onMainViewCleared` passes through `mainView.onChange`; `deleteMeeting` does not touch the marker. Add `clearMainView` and `onMainViewCleared` to `tests/unit/sidepanel/fake-meeting-api.ts` (with a `cleared` switch that makes `latestStored` resolve `null`)
- [X] T039 [US3] (WG-D) Implement in `src/entrypoints/sidepanel/meeting-api.ts` and wire `MainViewStore` over `chrome.storage.local` and `chrome.storage.onChanged` in `main.tsx` until T038 passes
- [X] T040 [US3] (WG-D) Test `tests/unit/sidepanel/app-clean-main.test.tsx`: confirming the main view's delete calls `deleteMeeting`, then `clearMainView`, then shows the Transcripts screen with its title focused; Back shows `No transcript yet.` with no Download or Delete and the question box as with no meeting, focus on the `Transcripts` button; a rejected `deleteMeeting` shows P17, calls neither `clearMainView` nor the screen switch; Cancel changes nothing; a rejected `clearMainView` still opens the screen; deleting on the Transcripts screen the meeting the main view shows (not running) calls `clearMainView` and refreshes; deleting another meeting there calls neither (FR-027); while a meeting runs, deleting an older one calls neither and the running meeting stays; `onMainViewCleared` firing refreshes the main view when nothing runs
- [X] T041 [US3] (WG-D) Implement in `src/entrypoints/sidepanel/App.tsx` until T040 passes, with `delete-transcript.test.tsx`, `app.test.tsx` and `app-ask.test.tsx` still green; then `pnpm build:e2e` and run T033's block until it passes

**Checkpoint**: US1–US3 work; the three P1 stories are the MVP.

---

## Phase 6: User Story 4 — download any past transcript (P2)

**Goal**: `Download transcript` in a row and with a meeting's transcript saves exactly 007's file; the main view's button goes through the same seam.

**Independent test**: spec US4 "Independent Test".

- [X] T042 [US4] (WG-D) E2E first, US4 block in `tests/e2e/transcripts.spec.ts`: seed one meeting alone, press the main view's `Download transcript` and keep the bytes; then seed two newer meetings beside it, open Transcripts and press `Download transcript of {date}, {time}` in its row → `suggestedFilename()` is `Meeting — 07-10-2026 at 14h30.txt` for a 14:30, 7 October 2026 start and the saved bytes equal the main view's download byte for byte (SC-005); the same from its transcript in the screen; a seeded chat turn's text is not in the file; a meeting with no lines has no Download; after a download the list, its scroll position and the focused element are unchanged and no text was added. See it fail (no Download on a row)
- [X] T043 [P] [US4] (WG-C) Tests: in `tests/unit/sidepanel/save-file.test.tsx`, `saveFiles` calls `save` once per file in order and not at all for an empty list; in `tests/unit/sidepanel/download-transcript.test.tsx`, the button is absent when `available` is false; a press calls `load()` once and saves each returned file; `load` may be asynchronous; `accessibleName` names the button while its text stays `Download transcript`; nothing is rendered or announced after a save; on the main view (`App`) the file saved is `meetingFiles({ meeting, segments })[0]` and every existing 007 case (running, stopped, no settled line, a later label change) still holds
- [X] T044 [US4] (WG-C) Implement `saveFiles` in `src/entrypoints/sidepanel/save-file.ts`, the `available` / `load` props in `components/DownloadTranscript.tsx`, and its main-view call site in `App.tsx` (`available={hasTranscriptFileLines(live.segments)}`, `load={() => meetingFiles({ meeting, segments })}`) until T043 passes, with K40 in `tests/unit/copy/keep-strings.test.tsx` and `tests/e2e/download.spec.ts` still green — a `load` that rejects or returns no file saves nothing and shows nothing
- [X] T045 [US4] (WG-D) Tests (US4 parts) in `meeting-row.test.tsx`, `past-transcript.test.tsx` and `transcripts-screen.test.tsx`: a stopped or interrupted row whose summary has `fileLines > 0` has `button` `Download transcript of {date}, {time}`; `fileLines === 0`, no summary yet, or in-progress → none; pressing it calls `api.open(id)` and saves `meetingFiles` of the result through the injected `save`; a meeting that vanished (`open` → `null`) saves nothing and shows nothing; the list is not reloaded and the row keeps focus; `PastTranscript` has the same button fed from the segments it already holds
- [X] T046 [US4] (WG-D) Implement in `MeetingRow.tsx`, `PastTranscript.tsx` and `TranscriptsScreen.tsx` until T045 passes; then `pnpm build:e2e` and run T042's block until it passes

**Checkpoint**: all four stories work.

---

## Phase 7: Polish and cross-cutting

- [X] T047 (WG-D) Copy check: add the K43 cases to `tests/unit/copy/keep-strings.test.tsx` (every P-string asserted on the rendered list, row states, single meeting, confirmation, failure, empty and read-failure states; the clean main view shows only K27) and raise the range in its header comment; run the copy scan (`tests/unit/copy/copy-review.test.ts`, `tests/support/copy-scan.ts`) and search `src/entrypoints/sidepanel/` for any user-facing string of this feature that is not in K43; add a "Re-scanned … on `012-past-transcripts`" line to `specs/006-panel-redesign/copy-review.md`. A string outside K43 is removed, not added to the list
- [X] T048 (WG-D) Pinning e2e, cross-cutting block in `tests/e2e/transcripts.spec.ts` (expected green; fix what is red): axe (WCAG 2.1 A/AA) with no violations on the list, one meeting's transcript, an open confirmation and the empty state, in light and dark (SC-009); at 400 × 870 with 200 seeded meetings and with a 1,500-line transcript open, `document.documentElement.scrollHeight === window.innerHeight` (SC-010); with 200 seeded meetings the 200th row's date line is attached within 1 s of pressing `Transcripts`, and on a second opening the names too; a seeded 5,000-line transcript is shown within 2 s of selecting it and a click on Back is answered within 200 ms (SC-006); at 320 px wide the header and every row's date line stay on one line and no control is clipped; from opening the screen through viewing, downloading and deleting, the page makes no request to anything but its own `chrome-extension://` origin and blob URLs (SC-007); `tests/unit/manifest/permissions.test.ts` is unchanged and green — green as written except one layout fault found on the 320 px screenshot and then pinned: with the Transcripts control in the header, the `Add notes` label wrapped onto two lines; fixed in `style.css` (the language picker gives way instead). `tests/e2e/a11y.spec.ts` now expects `Transcripts` before `Settings` in the header's focus order
- [X] T049 [P] (WG-E) Write `specs/012-past-transcripts/manual-check.md` for the user's real check, in the form of `specs/007-download-transcript/manual-check.md`: build and reload steps, then numbered steps with what to expect, from `quickstart.md` "By hand" (list after real meetings, an interrupted meeting made by closing the browser mid-call, reading a long transcript, download compared with the main view's file, delete from the list with chat and notes present, delete on the main view → Transcripts screen → Back to a clean main view → close and reopen the panel → next Start shows the new meeting, a running meeting's row), a results table left empty, and the list of automated coverage
- [X] T050 [P] (WG-E) `CHANGELOG.md` entry; `ROADMAP.md` row 012 → `implemented — real check awaits the user` with decision 64's clean main view in its text; `CLAUDE.md` "Current status" and "Structure" (`src/core/history/`); `specs/006-panel-redesign/contracts/panel-ui.md` final wording; `codegraph sync` — done on `012-transcripts-screen` except `CLAUDE.md` ("Current status", "Structure"), left to the orchestrating session, and `codegraph sync`, not run in the worktree (the index is local to the main checkout)
- [X] T051 (all groups merged) Gates: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build:e2e && pnpm test:e2e`

---

## Phase 8: Amendment — a row shows the meeting's title (design decision 76, FR-028 to FR-031)

One agent, in order, on branch `012-row-title`; each test is written and seen failing before its implementation.

- [X] T052 Spec amendment: spec.md Clarifications session four (E1–E9), US1 scenarios 9–11, edge cases, FR-028 to FR-031, P3a and the amended P9 and P10; `contracts/transcripts-ui.md` (row, single-meeting heading, layout, Never add); `data-model.md` "Display title" and the row's `title`; the plan note; `specs/006-panel-redesign/copy-review.md` K43 re-reviewed with `embody-dont-announce`
- [X] T053 Test (red): `tests/unit/core/history/meeting-title.test.ts` — every form of Clarifications E2, one case each
- [X] T054 `src/core/history/meeting-title.ts` `displayTitle(source)` (green)
- [X] T055 `tests/support/stored-meetings.ts`: the shared meeting is an untitled Meet call (`Meet - abc-defg-hij`)
- [X] T056 Test (red): `tests/unit/sidepanel/meeting-row.test.tsx` — a titled meeting's title line above the date line, its accessible name, the `title` attribute, no title line for an untitled Meet call, the running meeting's title, a title with markup characters shown as text
- [X] T057 `MeetingRow.tsx` and `transcripts.css`: the opening control (`.meeting-open`) holds `.meeting-title` and `.meeting-when` (green); `TranscriptsScreen.tsx` finds a row's opening control by `.meeting-open`
- [X] T058 Test (red): `tests/unit/sidepanel/transcripts-screen.test.tsx` — the single-meeting heading shows the title above the date and time, and the date and time alone without one
- [X] T059 `TranscriptsScreen.tsx`: the heading's two spans (green)
- [X] T060 Copy check: `tests/unit/copy/keep-strings.test.tsx` K43 — a titled row's text and accessible names, the titled heading, and no placeholder on an untitled one
- [X] T061 e2e in `tests/e2e/transcripts.spec.ts`: a titled meeting and an untitled Meet call in the list and opened; a long title at 320 px on one line with an ellipsis, the page not scrolling sideways (006 FR-023), in the row and in the heading; axe on a titled row
- [X] T062 `manual-check.md` step 10, `CHANGELOG.md`, gates as T051

---

## Dependencies

- T001 and T002 first. T002 blocks T003–T008.
- Foundational: T003→T004; T005→T006; T007→T008 (the three pairs are independent of each other). T009→T010 need T004 and T008.
- US1 (T011–T022) needs Phase 2. Inside: T012→T013 before T016; T014→T015; T016→T017; T018→T019 needs T015 and T017; T020→T021 needs T019; T022 last.
- US2 (T023–T032) needs US1. T024 is independent. T025→T026→T027→T028. T029→T030. T031→T032 needs T030 and T019.
- US3 (T033–T041) needs US2 (the screen's `onDeleted`, T032, and T030's `onDeleted`). T034→T035, T036→T037, T038→T039 needs T035 and T037, T040→T041 needs T039.
- US4 (T042–T046) needs US1; T043→T044 needs T006; T045→T046 needs T044 and T019. US4 does not need US2 or US3, but it edits the same files, so it runs after them.
- Polish: T047 and T048 after T046; T049 any time after T001; T050 and T051 last.

Story order: US1 → US2 → US3 → US4. The stories are independently testable in that order but not independently buildable: US2, US3 and US4 all extend files US1 creates.

## Worktree groups

Groups that can be built by separate worktree agents at the same time, because no two of them write the same file:

| Group | Tasks | Files it owns | Starts after |
|---|---|---|---|
| WG-A core rules | T002, T003–T006, T034–T035 | `src/core/transcript/model.ts` (one type), `src/core/history/*`, `src/core/export/meeting-files.ts`, `tests/support/stored-meetings.ts`, `tests/unit/core/history/*`, `tests/unit/core/export/meeting-files.test.ts` | nothing |
| WG-B storage and background | T007–T008, T024–T028, T036–T037 | `src/storage/{meeting-repo,chat-repo,context-repo,main-view-store}.ts`, `src/entrypoints/background/{chat-session,context-commands}.ts`, `tests/integration/storage/*`, `tests/unit/storage/*`, `tests/unit/background/chat-session-deleted.test.ts` | T002 merged (the `MeetingSummary` type and the test builders); independent of the rest of WG-A because `summarise` takes its compute function as an argument |
| WG-E documents | T001, T049, T050 | `specs/**`, `CHANGELOG.md`, `ROADMAP.md`, `CLAUDE.md` status | T001 at once; T049 after T001; T050 at the end |

Groups that cannot run alongside each other:

| Group | Tasks | Why not independent |
|---|---|---|
| WG-C existing components | T012–T013, T029–T030, T043–T044 | Edits `Transcript.tsx`, `DeleteTranscript.tsx`, `DownloadTranscript.tsx`, `save-file.ts` and their call sites in `App.tsx`. It can run in parallel with WG-A's tail and WG-B, but it must be merged **before** WG-D touches `App.tsx` (T021), and T044 needs T006. One agent, in task order. |
| WG-D the screen and the panel wiring | T009–T011, T014–T023, T031–T033, T038–T042, T045–T048 | `App.tsx`, `main.tsx`, `meeting-api.ts`, `PanelHeader.tsx`, `StartControls.tsx`, `style.css`, the three new components, `transcripts.css`, `transcripts-api.ts`, `tests/e2e/transcripts.spec.ts` and the shared fakes are edited by every story. One agent, sequentially, US1 → US2 → US3 → US4, after WG-A, WG-B and WG-C are merged. Splitting it by story would have each agent rewriting `TranscriptsScreen.tsx`, `MeetingRow.tsx` and `App.tsx`. |

Suggested run: WG-E's T001 and WG-A's T002 first; then WG-A, WG-B in parallel; WG-C as soon as T006 is merged; then WG-D alone; T051 on the merged result.

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001, FR-002 | T011, T020, T021, T048 |
| FR-003 | T011, T020, T021 |
| FR-004 | T030, T040, T041, T043, T044 |
| FR-005, FR-006 | T003, T004, T007, T008, T014, T015, T018, T019 |
| FR-007 | T003, T004, T014–T017 |
| FR-008 | T011, T014, T015, T018, T019 |
| FR-009 | T009, T010, T018, T019, T022 |
| FR-010 | T011, T018, T019 |
| FR-011, FR-012, FR-013 | T011–T013, T016–T019 |
| FR-014, FR-015, FR-016 | T005, T006, T042–T046 |
| FR-017 | T023, T029–T032 |
| FR-018 | T023–T028 |
| FR-019, FR-020 | T033, T038–T041 |
| FR-021 | T023, T029–T032, T040 |
| FR-022 | T031 (one confirmation, no bulk control), T047 |
| FR-023 | T048 |
| FR-024 | T018, T019, T032, T048 |
| FR-025 | T001, T047 |
| FR-026 | T033–T041 |
| FR-028, FR-030 | T056–T061 |
| FR-029 | T053, T054 |
| FR-031 | T056, T057, T060, T061 |
| FR-027 | T033, T040, T041 |
| SC-001 | T011 |
| SC-002 | T042 (the path), T049 (timed by the user in the real check) |
| SC-003 | T023, T024 |
| SC-004, SC-011 | T033 |
| SC-005 | T005, T042 |
| SC-006, SC-010 | T003, T007, T016, T022, T048 |
| SC-007, SC-009 | T048 |
| SC-008 | T011, T020 |

## Implementation strategy

MVP is the three P1 stories (Phases 1–5): the list and reading, real deletion, and the clean main view. US4 adds download from the list; until then the main view's `Download transcript` still covers the most recent meeting. Each story ends with its own e2e block green on the built extension before the next begins, and the full gate (T051) runs once on everything.
