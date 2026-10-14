---

description: "Task list for 013 Captions download"
---

# Tasks: Captions download (013)

**Input**: Design documents from `specs/013-captions-download/`

**Prerequisites**: spec.md (amended 2026-10-12, decisions 65–75), plan.md, research.md, data-model.md, contracts/captions-capture.md, contracts/files-and-storage.md, contracts/download-ui.md, quickstart.md, manual-check.md.

**Tests**: Required. Constitution III and CLAUDE.md rule 9: every test task is written first, run, and seen failing for the right reason before the implementation task after it is started. No automated test uses the network, a microphone, a live meeting or a real key. Eight test tasks pin behaviour that should already hold when they are written (T024, T049, T050, T051, T053, T054, T055, T056); each says so, and none is followed by production code unless it turns out red.

**No real speech**: every name and every caption sentence in a fixture, snapshot, seed or test is invented (FR-011). Nothing from a real call, the user's Downloads or a trace's names key is copied into the repo. Tests that look for leaks use the marker sentence from `tests/support/caption-marker.ts`.

**Copy rule**: the only strings this feature may show or change are C1–C5 of spec.md "Proposed copy", as entered in `specs/006-panel-redesign/copy-review.md` by T001. If a task seems to need another string, stop and ask. `contracts/download-ui.md` "Never add" lists what must not appear.

**Do not touch**: `.env` files; `CLAUDE.md` outside T057; `.specify/memory/design-decisions.md`; `.specify/memory/constitution.md`.

**Waits for 012**: tasks marked **(after 012)** must not start until branch `012-transcripts-screen` is merged to main (plan.md "Dependency on 012").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with its neighbours (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md
- **WG-x**: the worktree group that owns the task (see "Worktree groups" at the end)

Phases follow what can be built first: US2 (keeping the captions) comes before US1 (downloading them), because US1's panel work waits for 012 while US2 does not. Both are P1; each is testable on its own (US2 by reading storage, US1 from seeded storage).

---

## Phase 1: Setup

- [X] T001 (WG-E) Copy review before any UI work: in `specs/006-panel-redesign/copy-review.md` add K44 with C1–C5 of spec.md "Proposed copy" (exact text, where it shows, its job), reviewed against the `embody-dont-announce` skill ("When reviewing someone else's work"), and a dated note on K1 (Meet variant C2; K1 itself unchanged elsewhere), K6 (captions variant C3), K40 (the download names of decision 70) and K43 (P13's captions variant C4); add the "Never add" list of `contracts/download-ui.md` to "Do not add"; update `tests/fixtures/copy/copy-review.json` if the scanner reads strings from it. If the review changes a string, change spec.md's table and `contracts/download-ui.md` in the same commit
- [X] T002 [P] (WG-A) Types and test support, no behaviour: create `src/core/captions/model.ts` (`StoredCaptionTurn`); add optional `hasCaptions?: true` to `Meeting` in `src/core/transcript/model.ts`; add the `CaptionText` interface to `src/core/platform/adapter.ts` (not yet part of the capability); add the `meet/caption-text` variant to the `FromPage` type in `src/core/messaging/meet-bridge.ts` (the parser still returns null for it); add builders `storedCaptionTurn(...)` and `meetingWithCaptions(...)` to `tests/support/stored-meetings.ts`; create `tests/support/caption-marker.ts` (one invented marker sentence in English and one in Greek, and `expectNoMarker(value)` that searches strings, objects and byte arrays). `pnpm typecheck` and `pnpm test` stay green

---

## Phase 2: Foundational (blocks every story)

**Storage**

- [X] T003 [P] (WG-S) Test `tests/integration/storage/migration-v4.test.ts` (fake-indexeddb): a database created at version 3 with meetings (one pre-002 record), segments, chat turns and notes, then opened with `openLiveAssistDb`, is at version 4, has an empty `captionTurns` store with key path `['meetingId', 'seq']`, and every pre-existing record in every other store is deep-equal to what was seeded; a fresh database has all five stores; an older open connection is closed by `versionchange` and does not block the upgrade
- [X] T004 (WG-S) Implement in `src/storage/db.ts` (`DB_VERSION` 4, schema entry, `oldVersion < 4` branch) until T003 passes, with every existing storage test green
- [X] T005 [P] (WG-S) Test `tests/integration/storage/caption-turns.test.ts`: `putCaptionTurns` writes rows and resolves `true` for an open meeting, sets `hasCaptions` on the meeting with the first write and leaves every other field (renames, a stored summary) as it was; a second put of the same `seq` replaces the row; an empty list resolves `true` and writes nothing, not even `hasCaptions`; for an unknown meeting and for an ended meeting it resolves `false` and both stores are unchanged; `listCaptionTurns` returns one meeting's rows in `seq` order and `[]` for a meeting without rows, never another meeting's; `endMeeting`, `setSpeakerRename`, `setLabelOverride` and `summarise` keep `hasCaptions`
- [X] T006 (WG-S) Implement `putCaptionTurns` and `listCaptionTurns` in `src/storage/meeting-repo.ts` (one transaction over `meetings` and `captionTurns`) until T005 passes

**Bridge and adapter**

- [X] T007 [P] (WG-C) Test in `tests/unit/core/messaging/meet-bridge.test.ts` (existing tests unchanged, including "a message with a `text` field is dropped"): `parseFromPage` accepts a well-formed `meet/caption-text` and rebuilds it from its seven fields only (an extra field is not carried over); rejects, each on its own, a missing or wrong-typed field, `keep` negative, fractional or above `MAX_TURN_CHARS`, `append` longer than `MAX_APPEND_CHARS`, a message over `MAX_CAPTION_TEXT_MESSAGE`, `firstSeenAt` more than an hour off, a secret-looking field, and a `text` field; accepts an empty `append`, Greek text and a surrogate pair; every other message type with an `append` field is dropped; `parseToPage` and `parseAttach` drop anything carrying `append` or `text`
- [X] T008 (WG-C) Implement in `src/core/messaging/meet-bridge.ts` exactly as `contracts/captions-capture.md` "Bridge message" until T007 passes
- [X] T009 (WG-C) Tests: in `tests/contract/platform-adapter.contract.ts`, a supported captions capability has `subscribeText` returning an unsubscriber that stops delivery, never replays earlier text to a new listener, and an unsupported capability has none; in `tests/unit/core/platform/meet-bridge-adapter.test.ts`, over a fake port: `keep: 0` then growing `keep`/`append` messages give listeners the whole text each time; a rewrite of the tail (`keep` smaller than the current length) replaces it; `keep` beyond the current length is dropped, counted and leaves the turn as it was, and a later `keep: 0` recovers it; text is cut at `MAX_TURN_CHARS`; two turns do not mix; a second port continues the same turns; `meet/caption-text` never reaches `subscribe` listeners and `meet/caption` never reaches `subscribeText` listeners; `dispose()` drops the texts. Extend `tests/support/fake-meet-adapter.ts` with `emitText(...)` (the fake must satisfy the contract suite)
- [X] T010 (WG-C) Implement revision 3 in `src/core/platform/adapter.ts` (`subscribeText` on the supported capability) and `src/core/platform/meet-bridge-adapter.ts` until T009 passes; `src/core/platform/generic-adapter.ts` stays `Unsupported`

**Caption log**

- [X] T011 [P] (WG-A) Test `tests/unit/core/captions/caption-log.test.ts` with fake timers and a recording `put`: a new turn with text gets `seq` 1, 2, … in arrival order and `startMs = firstSeenAt − startedAt` (never below 0); a turn with empty text is not created; a known turn's changed text is written at the next flush and unchanged text is not written again; an empty text for a known turn changes nothing; `self: null` is stored as `false`; nothing is written until `CAPTION_STORE_FLUSH_MS` has passed, then one `put` holds every changed turn; flushes never overlap, and a turn changed during a write goes into the next; a rejected `put` leaves the turns dirty and the next flush writes them; `put` resolving `false` closes the log (no further `put`); `close()` flushes once and later updates are ignored; `onSpeaker` fires once per distinct normalised non-self name and never for a self turn; `onKept` fires once, after the first `put` that resolved `true`; beyond `MAX_CAPTION_TURNS` new turns are dropped and known ones still update; with a recording log sink, a failing `put` logs nothing that `expectNoMarker` rejects
- [X] T012 (WG-A) Implement `src/core/captions/caption-log.ts` until T011 passes; `pnpm lint` confirms the `src/core/**` boundary holds

**Checkpoint**: storage, bridge, adapter and log exist and are tested in isolation; nothing is wired yet, so the extension behaves exactly as before.

---

## Phase 3: User Story 2 — captions are kept as the meeting goes, on this computer only (P1)

**Goal**: on a Meet call every caption turn after Start is in `captionTurns` within seconds, with Meet's last text; nothing of it leaves the machine; deleting the meeting deletes it; the main view's delete confirmation says so. (The reminder said so too until 2026-10-13: decision 79, Phase 8.)

**Independent test**: `tests/e2e/captions-capture.spec.ts` on the built extension with a routed saved Meet page, then reading IndexedDB.

- [X] T013 [US2] (WG-I) E2E first: create `tests/e2e/captions-helpers.ts` (`captionInMeet(page, name, versions, stepMs)` adding a turn whose text goes through the given invented versions; `rewriteCaption(page, index, text)`; `readCaptionTurns(panel, meetingId)` reading IndexedDB; `watchForMarker(context)` failing on any request whose URL or body holds the marker and on any request to a non-local origin) and `tests/e2e/captions-capture.spec.ts`: on `in-call-captions-on` (three turns already on the page) Start, then script three speakers including "You", one turn rewritten four times and an older turn corrected after a newer one began → `captionTurns` holds exactly the scripted turns in order, each with its last text, `self` true for "You", `startMs` within 2 s of when each appeared, none of the three pre-Start turns, and the meeting has `hasCaptions`; the panel's text never contains a caption sentence; end the offscreen document abruptly, without Stop, 4 s after a change (the way `resilience.spec.ts` simulates a crash) → the change is stored (SC-004); a second run: Stop, `Delete transcript`, confirm → no row of that meeting in `captionTurns`. `pnpm build:e2e`, run, and see it fail because nothing is captured
- [X] T014 [P] [US2] (WG-B) Test in `tests/unit/platforms/meet/locators.test.ts`: `captionTextOf` returns the invented sentence of each turn in `in-call-captions-on`, `greek-ui` (Greek letters intact) and `real-dom-captions-on`, whitespace collapsed, never including the speaker name; `''` for an item with no text element, with an empty one, and for any item of `changed-page` (D8, D9); it never throws; the notifications chip of `real-dom-captions-on` is not a caption item (D10, existing behaviour pinned). Add to `tests/support/meet-snapshot.ts`: `setCaptionText(item, text)`, `removeCaptionItem(item)`, `recreateCaptionItems(doc)` (replace every turn element with a fresh clone, as a re-render does) and `replaceCaptionsRegion(doc)`; add the expected texts to the synthetic snapshots' table in `tests/fixtures/meet/README.md`
- [X] T015 [US2] (WG-B) Implement `captionTextOf` in `src/platforms/meet/locators.ts` until T014 passes, with `real-snapshots.test.ts` and `real-dom.test.ts` still green
- [X] T016 [P] [US2] (WG-B) Test `tests/unit/platforms/meet/caption-text.test.ts`: `mergeCaptionText` rules 1–5 of `contracts/captions-capture.md`, each with invented text: growth; a rewrite of the last words; an empty read keeps the text; a dropped beginning (the next text starts inside the shown one) keeps what was dropped, repeatedly over a 20-step monologue so that `fullText` holds every sentence once and in order; a restart (more than 250 characters shorter, no overlap) appends after a space; a shrink of 250 or fewer without overlap replaces; Greek text and surrogate pairs survive
- [X] T017 [US2] (WG-B) Implement `src/platforms/meet/caption-text.ts` until T016 passes
- [X] T018 [US2] (WG-B) Test `tests/unit/platforms/meet/caption-text-observer.test.ts` on loaded snapshots with fake timers: without `onText` no text element is ever read (spy on `captionTextOf`); with it, turns on the page when the region is adopted are never reported, however they change; a turn appended later is reported with its text, `firstSeenAt` = the clock when it appeared, and a `turnKey` from `nextTurnNumber`; ten changes inside one second cause one read and one report, the last change always reported; a change in one turn reads that turn only, with 300 turns on the page; a correction to an older kept turn after a newer one started is reported, also after `TURN_CLOSE_MS`; a turn with a name and no text reports nothing until it has text; a removed turn reports nothing and a later re-render does not bring it back as new; `recreateCaptionItems` (all elements replaced) reports no new turn and later changes continue under the old `turnKey` and `firstSeenAt`; a kept turn removed from the top while a new turn by the same speaker starting with the same words is appended gives a new turn, not a take-over; a region replaced after captions were off treats what it holds as history unless it re-binds; `stop()` reports each dirty turn once; two observers created one after the other with a shared `nextTurnNumber` never share a `turnKey`. Then the activity path: `caption-observer.test.ts` and `page-timelines.test.ts` run unchanged and green with `onText` supplied (FR-006)
- [X] T019 [US2] (WG-B) Implement the text path in `src/platforms/meet/caption-observer.ts` (kept or history, dirty marking, per-turn trailing throttle, read and merge, re-binding, `nextTurnNumber`, flush on `stop`) until T018 passes; the activity path's code is not changed
- [X] T020 [US2] (WG-B) Test in `tests/unit/platforms/meet/page-agent.test.ts`: after `meet/enable-captions`, a kept turn's first text is posted as `meet/caption-text` with `keep: 0`; a later text posts only the changed tail with the right `keep`; an unchanged text posts nothing; a 20,000-character change is posted as three messages of at most `MAX_APPEND_CHARS`, in order, that rebuild the text; no message splits a surrogate pair; every posted message passes `parseFromPage`; after the port is replaced the next message for each turn has `keep: 0`; `meet/restore-captions` and `meet/detach` flush before the observer stops; a second enable on the same page continues the turn numbers; `meet/caption` messages are exactly what they were (existing tests unchanged)
- [X] T021 [US2] (WG-B) Implement in `src/platforms/meet/page-agent.ts` until T020 passes
- [X] T022 [US2] (WG-C) Test `tests/integration/core/meeting-runtime-captions.test.ts` with the fake adapter, a fake store and fake timers: text events during a meeting reach `store.putCaptionTurns` within `CAPTION_STORE_FLUSH_MS` with the meeting's id, `seq` and `startMs`; killed at any moment (no `end()`), what the store holds lacks at most 3 s of changes; after `end()` no event is stored and the last flush happened before `store.endMeeting`; events are stored while the captions state is `off-by-user` or `unavailable` too (the page decides what it sends); `live/captions-kept` is emitted once, after the first stored write, and the snapshot's meeting then has `hasCaptions`; the first kept turn of a caption name with a remembered mapping stores a `remembered` rename through `setSpeakerRename` and emits `live/labels`, never over an existing rename, never for a self turn; a rejected `putCaptionTurns` does not delay or break `appendSegment` for transcript lines; a `false` stops further caption writes and the meeting runs on; `expectNoMarker` holds for every `LiveEvent`, every argument the fake transcription provider received, and every log call. On a generic adapter no caption log exists
- [X] T023 [US2] (WG-C) Implement in `src/core/session/meeting-runtime.ts` (`MeetingStore.putCaptionTurns`, `CaptionLog` wiring, remembered name on `onSpeaker`, `close()` before `endMeeting`) and add `live/captions-kept` to `LiveEvent` in `src/core/messaging/protocol.ts` (and to whatever validates live events there) until T022 passes, with `tests/integration/core/meeting-runtime.test.ts` green
- [X] T024 [US2] (WG-C) Pinning test `tests/unit/core/speakers/timelines-with-captions-text.test.ts` (expected green; a red result means naming changed and is fixed in T023's code first): every timeline fixture in `tests/fixtures/meet/timelines/` and every trace in `tests/fixtures/meet/traces/` is replayed through `MeetingRuntime` twice, once as today and once with an invented text event for every caption activity; every line's stored label fields are identical in both runs (SC-006), and so are the renames except `remembered` entries for caption names no line carries
- [X] T025 [US2] (WG-I) Tests: in `tests/unit/offscreen/host.test.ts`, the host's store is asked to `putCaptionTurns` when a Meet meeting receives text and never for a generic meeting; new `tests/unit/offscreen/spike-trace-captions.test.ts`: `installAlignmentTrace` fed `meet/caption` and `meet/caption-text` messages exports a trace for which `expectNoMarker` holds, and `e2e-bridge-stats` counts are unchanged by text messages
- [X] T026 [US2] (WG-I) Implement the store wiring in `src/entrypoints/offscreen/main.ts` (`putCaptionTurns` → the repo) until T025 passes; then `pnpm build:e2e` and run T013 until its capture and interruption parts pass
- [X] T027 [P] [US2] (WG-S) Tests: extend `tests/integration/storage/real-deletion.test.ts` (two meetings with caption turns carrying the marker; after `deleteMeeting` of one, the scan of every object store by name finds no marker of it, the other meeting's turns are intact, and its `hasCaptions` stands) and `tests/integration/storage/late-writers.test.ts` (`putCaptionTurns` after `deleteMeeting` resolves `false` and `captionTurns` has no row of that meeting; the same after `endMeeting` and after `markOrphanedCrashed`)
- [X] T028 [US2] (WG-S) Implement the range delete in `deleteMeeting` in `src/storage/meeting-repo.ts` until T027 passes; then T013's deletion part passes on the built extension
- [X] T029 [US2] (WG-P) **(after 012)** Tests: in `tests/unit/sidepanel/consent.test.tsx`, `platform="meet"` shows C2 exactly and `platform="generic"` shows K1 exactly, same role, buttons and focus; in `tests/unit/sidepanel/start-controls.test.tsx`, Start with the reminder on asks `api.startPlatform()` once and shows the matching text, a rejection shows K1, Start stays disabled while it is asked, and with the reminder off `startPlatform` is not called; in `tests/unit/sidepanel/meeting-api.test.ts`, `startPlatform` resolves `meet` for a Meet call address, `generic` for the Meet landing page, any other address and an unreadable tab. Extend `tests/unit/sidepanel/fake-meeting-api.ts`
- [X] T030 [US2] (WG-P) **(after 012)** Implement in `components/ConsentDialog.tsx`, `components/StartControls.tsx`, `meeting-api.ts` and `main.tsx` (the active tab's address through `isMeetCallUrl`) under `src/entrypoints/sidepanel/` until T029 passes
- [X] T031 [US2] (WG-P) **(after 012)** Tests: in `tests/unit/sidepanel/use-live.test.tsx`, `live/captions-kept` for the meeting shown sets `hasCaptions` on it, for another meeting changes nothing; new `tests/unit/sidepanel/app-captions.test.tsx` (US2 part): a stopped meeting with `hasCaptions` shows C3 in the confirmation and one without shows K6 unchanged; confirming calls `deleteMeeting` as before
- [X] T032 [US2] (WG-P) **(after 012)** Implement in `src/entrypoints/sidepanel/hooks/useLive.ts` and `src/entrypoints/sidepanel/App.tsx` (`prompt` for `DeleteTranscript`) until T031 passes

**Checkpoint**: captions are kept, bounded, deletable and disclosed. Nothing downloads them yet.

---

## Phase 4: User Story 1 — get Meet's captions with the transcript (P1)

**Goal**: one press saves one zip with the two named files for a meeting that has both.

**Independent test**: `tests/e2e/captions-download.spec.ts` US1 block from seeded storage, unpacking the saved zip.

- [X] T033 [P] [US1] (WG-A) Known-good archive and test: write `tests/fixtures/zip/make-known-good.py` (Python 3 standard library only; inputs and settings exactly as `contracts/files-and-storage.md` "Known-good archive"; invented Greek and English bodies), run it by hand, check the result with `unzip -t` and `ditto -x -k` into an empty scratch directory, commit `tests/fixtures/zip/known-good.zip`. Then `tests/unit/core/export/zip.test.ts`: `crc32` of `123456789` is `0xCBF43926` and of an empty array is 0; `zipStored` on the fixture's inputs equals the fixture byte for byte; flags `0x0800` in both records of each entry; offsets, sizes and counts of the end record are right for one, two and three entries; a 1 MB entry round-trips through a test-side reader of the central directory; an ASCII-only name still carries the UTF-8 flag; an empty name, a name with `/` or `\` throws; the function does not mutate its inputs
- [X] T034 [US1] (WG-A) Implement `src/core/export/zip.ts` until T033 passes
- [X] T035 [P] [US1] (WG-A) Test `tests/unit/core/export/download-names.test.ts`: for a `startedAt` built from local components, `meetingBaseName` is `Meeting — 07-10-2026 at 14h30`, and the three download names are the base plus ` — Transcript.txt`, ` — Meet captions.txt` and `.zip`; `transcriptFileName` (in `transcript-file.test.ts`, unchanged expectations) is still the base plus `.txt`; the dash is U+2014
- [X] T036 [US1] (WG-A) Implement `src/core/export/download-names.ts` and build `transcriptFileName` on it in `src/core/export/transcript-file.ts` until T035 passes, with `transcript-file.test.ts` unchanged and green
- [X] T037 [P] [US1] (WG-A) Test `tests/unit/core/export/captions-file.test.ts`: the body for the spec's example is `[00:04] Sarah Brown: Good morning, can everyone see the roadmap slide?\n\n[00:11] Alex: Yes, it's up.\n`; a self turn reads the meeting's `userName`, or the `self` rename when there is one; a caption name with a rename (manual or remembered) reads the rename, compared by normalised name; a single-line override on a transcript line changes nothing; a caption name literally unrecognised as self stays Meet's word; order is `startMs` then `seq`; minutes count past 59; line breaks and runs of spaces collapse to one space in name and text; a turn with empty text is skipped; a 9,000-character turn is one line; Greek text is unchanged; no line has the speaker `Others`; no turns → body `''`; the name is `captionsFileName(startedAt)`; inputs are not mutated
- [X] T038 [US1] (WG-A) Implement `src/core/export/captions-file.ts` until T037 passes
- [X] T039 [US1] (WG-P) **(after 012)** E2E first, US1 block of new `tests/e2e/captions-download.spec.ts`: seed (with 012's `seedStoredMeetings`, extended to write `captionTurns` at version 4) one stopped Meet meeting with transcript lines and six caption turns, including a self turn, a renamed speaker, a remembered-renamed speaker without any transcript line, a Greek turn and a transcript line with a single-line override → press `Download transcript` on the main view → exactly one download, suggested name `Meeting — DD-MM-YYYY at HHhMM.zip`; unpack it with the system `unzip` into an empty temporary directory → exactly the two specified names (compared after NFC), in the archive's order transcript then captions (`unzip -Z1`); the transcript's bytes equal the body 007's formatter gives for that seed, and the captions file's bytes equal the expected body written out in the test; no second download within 2 s; the panel shows no new text. Fail with a clear message when `unzip` is not on the PATH. Run it and see it fail on the name
- [X] T040 [US1] (WG-P) **(after 012)** Tests: rewrite `tests/unit/core/export/meeting-files.test.ts` for the new contract (transcript only → one file of kind `transcript` named `… — Transcript.txt` whose body equals `transcriptFile(...).body`; both → transcript then `captions`; captions only → one `captions` file; neither → `[]`; chat turns and notes cannot be passed) and add `tests/unit/core/export/meeting-download.test.ts` (the four rows of data-model.md's table: `null`; text with the transcript name; text with the captions name; `application/zip` named `….zip` whose bytes equal `zipStored` of the two UTF-8 bodies in order with the given date; same input, same bytes)
- [X] T041 [US1] (WG-P) **(after 012)** Implement in `src/core/export/meeting-files.ts` and new `src/core/export/meeting-download.ts` until T040 passes
- [X] T042 [US1] (WG-P) **(after 012)** Tests: in `tests/unit/sidepanel/save-file.test.tsx`, `saveDownload` saves a text download as a `text/plain;charset=utf-8` blob and a zip as an `application/zip` blob whose bytes are the download's, each through one anchor with the download's name, revoking the URL later; in `tests/unit/sidepanel/download-transcript.test.tsx`, a `load` returning a download saves it once, `null` saves nothing, a promise is awaited, a rejection saves nothing and shows nothing; label and accessible name unchanged
- [X] T043 [US1] (WG-P) **(after 012)** Implement in `src/entrypoints/sidepanel/save-file.ts` (`saveDownload`; remove `saveFiles` with its last caller) and `components/DownloadTranscript.tsx` until T042 passes
- [X] T044 [US1] (WG-P) **(after 012)** Test in `tests/unit/sidepanel/app-captions.test.tsx` (US1 part) and `tests/unit/sidepanel/meeting-api.test.ts`: a meeting with lines and `hasCaptions` → pressing Download calls `meetings.captionTurns(id)` once, at the press and not before, and saves a zip download; without `hasCaptions` `captionTurns` is never called and a text download named `… — Transcript.txt` is saved; `captionTurns` rejecting saves nothing; the rendered panel never contains a caption sentence before or after a download (`expectNoMarker` on the document text); `MeetingApi.captionTurns` returns the repo's rows and rejects when the repo rejects
- [X] T045 [US1] (WG-P) **(after 012)** Implement in `src/entrypoints/sidepanel/App.tsx`, `meeting-api.ts` and `main.tsx` until T044 passes; update the expected names in `tests/e2e/download.spec.ts` (and 012's `tests/e2e/transcripts.spec.ts` download block) to `… — Transcript.txt`; `pnpm build:e2e` and run T039's block until it passes

**Checkpoint**: the request is met for a stopped meeting on the main view.

---

## Phase 5: User Story 3 — captions of a running or past meeting (P2)

- [X] T046 [US3] (WG-P) **(after 012)** E2E first, US3 block in `tests/e2e/captions-download.spec.ts`: (a) a running fixture meeting on the saved Meet page with scripted turns, one still changing → Download saves a zip whose captions file holds every turn so far, the changing one with a text it had in the last 5 s; a second Download a few seconds later holds its later text and a newer turn; lines keep arriving and `captionTurns` keeps growing after both; (b) three seeded meetings, the middle one with captions → its row's Download on the Transcripts screen saves a zip whose name and two entries are byte for byte what the main view saved for the same seed in T039's helper; the single-meeting view's Download the same; its Delete shows C4 with its date and time, and after confirming `captionTurns` has no row of it while the newest meeting's rows are intact; a row without captions shows P13 unchanged. Run it and see it fail
- [X] T047 [US3] (WG-P) **(after 012)** Tests in `tests/unit/sidepanel/transcripts-api.test.ts`, `meeting-row.test.tsx`, `past-transcript.test.tsx` and `transcripts-screen.test.tsx`: `open(id)` returns the meeting's caption turns (`[]` without `hasCaptions`, without reading the store); a row and the single-meeting view offer Download when `fileLines > 0` or `hasCaptions`; their `load` builds `meetingDownload` from the opened meeting; the confirmation is C4 when `hasCaptions`, P13 otherwise; no caption sentence is ever rendered
- [X] T048 [US3] (WG-P) **(after 012)** Implement in `src/entrypoints/sidepanel/transcripts-api.ts`, `components/MeetingRow.tsx`, `components/PastTranscript.tsx` and `components/TranscriptsScreen.tsx` until T047 passes; `pnpm build:e2e` and run T046 until it passes

---

## Phase 6: User Story 4 — meetings without captions, and captions without a transcript (P2)

- [X] T049 [US4] (WG-P) **(after 012)** Pinning tests (expected green after T045 and T048; fix what is red in the file that owns it): US4 block in `tests/e2e/captions-download.spec.ts` — a fixture meeting on a non-Meet tab → one download, `… — Transcript.txt`, body as before 013, and `captionTurns` empty; a seeded Meet meeting with caption turns and no transcript line → `Download transcript` is present on the main view, in its Transcripts row and in its single-meeting view (beside `Nothing was transcribed.`), and saves one `.txt` named `… — Meet captions.txt` with the expected bytes; a seeded meeting with neither has no Download anywhere; a database seeded at version 3 (before 013) lists, opens, downloads (`… — Transcript.txt`) and deletes as before, with P13 and K6 unchanged. Unit, in `app-captions.test.tsx`: `available` is true for captions only and false for neither

---

## Phase 7: Polish and cross-cutting

- [X] T050 [P] (WG-C) Pinning tests, Ask never sees captions (decision 72): in `tests/unit/core/chat/` a test builds a question's context for a meeting whose caption store holds the marker and asserts `expectNoMarker` on the whole request; in `tests/unit/background/` the chat session for that meeting sends nothing with the marker to the fixture provider; in `tests/unit/lint/boundaries.test.ts`, a probe in `src/core/chat/`, `src/core/speakers/` or `src/core/transcript/` importing `src/core/captions/` is rejected (add the `no-restricted-imports` pattern to `eslint.config.js` if it is not; that rule is the one non-test change this task may make)
- [X] T051 [P] (WG-C) Pinning test `tests/integration/privacy/captions-leak.test.ts` (in the manner of `notes-leak.test.ts`): a whole fixture meeting with marker captions through runtime, repo and fake provider → the marker is found in `captionTurns` and nowhere else: not in `segments`, `meetings`, `chatTurns`, `meetingContexts`, any provider call, any `LiveEvent`, any log call, nor in a `transcriptFile` body
- [X] T052 (WG-P) **(after 012)** Copy check: add the K44 cases to `tests/unit/copy/keep-strings.test.tsx` (C2 on Meet and K1 elsewhere; C3 and K6; C4 and P13; `Download transcript` unchanged in all three places) and make the scanner of `tests/unit/copy/copy-review.test.ts` pass with no string outside C1–C5 added; grep the built panel for every phrase in "Never add"
- [X] T053 [P] (WG-A) Pinning test: `tests/unit/manifest/permissions.test.ts` unchanged and green (SC-009), plus a test that `package.json` `dependencies` has exactly the five entries it has today
- [X] T054 [P] (WG-A) Pinning test `tests/unit/core/export/download-perf.test.ts`: `meetingDownload` for 5,000 lines and 1,200 turns (invented, generated) returns within 200 ms and its zip is under 2 MB; `captionsFile` for one 200,000-character turn within 50 ms
- [X] T055 (WG-P) **(after 012)** Pinning e2e, cross-cutting block in `tests/e2e/captions-download.spec.ts`: with `watchForMarker` on, a whole run (Start on the Meet page, scripted captions, an Ask question, Download, Stop, Transcripts, Delete) makes no request holding the marker and none to a non-local origin other than the fixture routes; a seeded 3-hour meeting downloads within 2 s of the press (SC-008); axe on the main view and the Transcripts screen with the C3 and C4 confirmations open reports no violation
- [X] T056 [P] (WG-B) Pinning test in `tests/unit/platforms/meet/snapshot.test.ts` (expected green): `anonymiseMeetPage` on a page whose turns hold the marker returns HTML for which `expectNoMarker` holds (text overwritten, as today). Update `tests/fixtures/meet/README.md`: the turns' text is now read by the product, so step 1 of the review also searches for any sentence said in the call
- [X] T057 (WG-E) Documents: `CHANGELOG.md` entry; `ROADMAP.md` row 013 → `implemented — real check awaits the user`, text brought in line with decisions 67–70; a note for the main session to update `CLAUDE.md` "Current status" and "Structure" (`src/core/captions/`, `src/platforms/` if missing); the header comments of `caption-observer.ts`, `page-agent.ts`, `locators.ts`, `meet-bridge.ts` and `adapter.ts` that say caption text is never read are corrected by the tasks that change those files, and this task greps `src/` for "never read" and "never the caption text" to confirm none is left untrue
- [X] T058 [P] (WG-E) Bring `specs/013-captions-download/manual-check.md` in line with what was built (step numbers, exact texts after T001's review, the O1–O6 record lines), in the form of `specs/007-download-transcript/manual-check.md`
- [X] T059 Full gate on the merged result: `pnpm lint && pnpm typecheck && pnpm build && pnpm build:e2e && pnpm test && pnpm test:e2e`; `pnpm build:spike` builds; then `/speckit-analyze` findings, if any, are fixed before the PR is called ready

---

## Phase 8: One reminder text everywhere (amendment 2026-10-13, design decision 79, supersedes decision 71)

**Goal**: the reminder before Start is K1 on every platform and shows at once; the Meet-only sentence (C2) and the platform check that existed only for it are gone; captions are still kept on every Meet call with the reminder on or off. Each test task is written and seen failing before the task that makes it pass.

- [X] T060 Documents first: amend `spec.md` (Clarifications session 2026-10-13, P4, US2 scenarios 6 and 7, FR-022, Proposed copy C2), `plan.md`, `research.md` R9, `contracts/download-ui.md`, `contracts/files-and-storage.md`, `manual-check.md` steps 1 and 2, and `specs/006-panel-redesign/copy-review.md` (K44: C2 withdrawn, K1 the one reminder text; the removed sentence under "Checking the result"); withdraw the release-ordering rule wherever it is stated
- [X] T061 Tests (red): in `tests/unit/sidepanel/consent.test.tsx`, `ConsentDialog` takes no `platform` and shows K1 exactly, and the reminder is on screen in the same turn as the press; in `tests/unit/sidepanel/start-controls.test.tsx`, the api given to `StartControls` has no `startPlatform`, the reminder shows K1 at once, and Cancel, another screen opening and a second acknowledge are kept as cases of the simple flow; in `tests/unit/sidepanel/meeting-api.test.ts`, the `startPlatform` block goes and the api is pinned to have no such member; in `tests/unit/copy/keep-strings.test.tsx`, K1 on the main view whatever the tab, and `ConsentDialog.tsx` allowed K1 in one piece only; add entry `W1` to `tests/fixtures/copy/copy-review.json` (absent: the removed sentence) and raise the entry count in `tests/unit/copy/copy-review.test.ts`; remove `startPlatform` from `tests/unit/sidepanel/fake-meeting-api.ts` and the other panel fakes, and `activeTabUrl` from the deps in `tests/integration/storage/crash-recovery.test.ts`
- [X] T062 E2E (red on the build before T063): in `tests/e2e/captions-capture.spec.ts`, replace "the reminder says what this Start will keep" with "one reminder on every tab, and captions kept with it on or off": on a Meet call with the reminder on the text is K1 exactly, nothing is kept before it is acknowledged, and that Start keeps the captions; on a Meet call with the reminder off no reminder shows and that Start keeps the captions; on another tab the reminder is K1 and nothing is kept. In `tests/e2e/captions-download.spec.ts`, the reminder at 320 px on a Meet call has no sentence about captions, and the built extension holds the removed sentence in no file
- [X] T063 Implement until T061 passes: `components/ConsentDialog.tsx` (no `platform`, K1), `components/StartControls.tsx` (the Start flow as before 013: `askingConsent`, no pending state, no second check on acknowledge), `meeting-api.ts` (no `startPlatform`, no `activeTabUrl`), `main.tsx` (no `activeTabUrl`) under `src/entrypoints/sidepanel/`
- [X] T064 `pnpm build:e2e`, then T062 and the whole e2e suite green on the built extension
- [X] T065 `CHANGELOG.md` entry
- [X] T066 Full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build:e2e && pnpm test:e2e`

Notes from this amendment are at the end of this file.

## Dependencies

- T001 before any panel task (T029–T032, T039–T049, T052). T002 before everything else in code.
- Foundational: T003→T004→T005→T006; T007→T008→T009→T010; T011→T012. The three chains are independent of each other.
- US2: T013 first (red). T014→T015; T016→T017; T018→T019 needs T015 and T017; T020→T021 needs T019 and T002's message type (and passes `parseFromPage` only once T008 is merged). T022→T023 needs T010 and T012; T024 after T023. T025→T026 needs T006, T021 and T023; T013 turns green there except its deletion part, which needs T027→T028 (after T006). T029→T030 and T031→T032 need T023 (the live event) and 012.
- US1: T033→T034, T035→T036, T037→T038 need only T002 (and T036 before T038 for the name). T039 first among the panel tasks; T040→T041 needs T034, T036, T038; T042→T043 needs T041; T044→T045 needs T043, T006 and T032.
- US3: T046→T047→T048 needs T045. US4: T049 needs T048.
- Polish: T050, T051 after T023; T052 after T048; T053, T054 after T041 (T054) or at any time (T053); T055 after T049; T056 after T019; T057, T058 at the end; T059 last.

## Worktree groups

Groups that separate worktree agents can build at the same time, because no two of them write the same file:

| Group | Tasks | Files it owns | Starts after |
|---|---|---|---|
| WG-A core, pure | T002, T011–T012, T033–T038, T053, T054 | `src/core/captions/*`, `src/core/export/{zip,download-names,captions-file}.ts`, one line in `src/core/export/transcript-file.ts`, the type additions of T002, `tests/unit/core/{captions,export}/*` (not `meeting-files.test.ts`), `tests/fixtures/zip/*`, `tests/support/{stored-meetings,caption-marker}.ts` | nothing; T002 is merged first, alone |
| WG-S storage | T003–T006, T027–T028 | `src/storage/{db,meeting-repo}.ts`, `tests/integration/storage/*` | T002 merged |
| WG-B Meet page | T014–T021, T056 | `src/platforms/meet/*`, `tests/unit/platforms/meet/*`, `tests/support/meet-snapshot.ts`, `tests/fixtures/meet/README.md` | T002 merged |
| WG-C bridge, adapter, runtime | T007–T010, T022–T024, T050, T051 | `src/core/messaging/{meet-bridge,protocol}.ts`, `src/core/platform/{adapter,meet-bridge-adapter}.ts`, `src/core/session/meeting-runtime.ts`, `tests/support/fake-meet-adapter.ts`, `tests/contract/*`, `tests/unit/core/{messaging,platform,speakers,chat}/*`, `tests/integration/{core,privacy}/*`, `eslint.config.js` (one pattern) | T002 merged; T022 onwards after WG-A's T012 is merged |
| WG-E documents | T001, T057, T058 | `specs/**`, `CHANGELOG.md`, `ROADMAP.md` | T001 at once; the rest at the end |

Groups that cannot run alongside others:

| Group | Tasks | Why not independent |
|---|---|---|
| WG-I wiring and the capture e2e | T013, T025–T026 | Needs WG-B, WG-C and WG-S merged: it wires them in `src/entrypoints/offscreen/main.ts` and proves them together in `tests/e2e/captions-capture.spec.ts`. One agent. T013 can be written (red) while the others build, on its own branch, since it only adds two new e2e files. |
| WG-P the panel | T029–T032, T039–T049, T052, T055 | **Waits for `012-transcripts-screen` to be merged**, and for WG-A, WG-S and WG-C. Every task edits files 012 is editing now (`App.tsx`, `main.tsx`, `meeting-api.ts`, `StartControls.tsx`, `transcripts-api.ts`, the three Transcripts components, the shared panel fakes, 012's e2e helpers) or changes what 012's tests assert (`meeting-files.ts`: the transcript's download name). One agent, in task order; splitting it by story would have each agent rewriting `App.tsx` and `DownloadTranscript`'s call sites. |

Tasks that must wait until `012-transcripts-screen` is merged: T029, T030, T031, T032, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048, T049, T052, T055 (all of WG-P), and with them the final T057–T059. Everything else (T001–T028, T033–T038, T050, T051, T053, T054, T056) can be built and merged before.

Suggested run: T001 and T002 first; then WG-A, WG-S, WG-B and WG-C in parallel (WG-C's second half once T012 is in); then WG-I; then, once 012's screen is merged, WG-P alone; T059 on the merged result; then the user's real call with `manual-check.md`.

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T013, T018–T023 |
| FR-002 | T011, T012, T016–T019, T009, T010 |
| FR-003 | T011, T012, T013, T018, T022, T023 |
| FR-004 | T013, T018, T019, T022, T023 |
| FR-005 | T018–T021, T022, T046 |
| FR-006 | T018, T022, T024 |
| FR-007 | T022, T025, T049 |
| FR-008 | T013, T022, T050, T051, T055 |
| FR-009 | T011, T022, T025, T044, T047, T051 |
| FR-010 | T005, T006, T013, T027, T028, T046 |
| FR-011 | T002, T014, T033, T056 |
| FR-012 | T039–T045 |
| FR-013 | T035, T036, T040, T041, T045 |
| FR-014 | T037, T038 |
| FR-015 | T022, T023, T037, T038, T039 |
| FR-016 | T046 |
| FR-017 | T040, T041, T044, T049 |
| FR-018 | T040, T041, T044, T047–T049 |
| FR-019 | T046–T048 |
| FR-020 | T042–T044, T053, T055 |
| FR-021 | T033–T038, T039–T041 (`unzip`); Archive Utility and Windows Explorer by hand, `manual-check.md` steps 3 and 14 |
| FR-022 | T031–T032, T046–T048; the reminder left it with T060–T066 (decision 79) |
| FR-023 | T001, T052 |
| SC-001 | T039 |
| SC-002 | T049 |
| SC-003 | T050, T051, T055 (automated); T058 and the real call |
| SC-004 | T013, T022 |
| SC-005 | T027, T046 |
| SC-006 | T024 |
| SC-007, SC-010 | T058 and the user's real call (`manual-check.md` steps 7–10) |
| SC-008 | T054, T055 |
| SC-009 | T053 |
| Spec P1 (5 s) | T022, T046 |
| Spec P2 (remembered names) | T022–T024, T037 |
| Spec P3 (dropped beginning) | T016–T019 |
| Spec P4 (reminder platform) | Withdrawn (decision 79): T029, T030 undone by T060–T066 |
| Spec P5 (zip dates) | T033, T040 |

## Implementation strategy

The MVP is the two P1 stories: captions kept (Phases 1–3) and the zip from the main view (Phase 4). Phases 1–3 without their four panel tasks can be built, merged and left running before 012's screen lands: captions are then already being kept for every Meet call, visible only in IndexedDB, and the reminder does not yet say so. Because of that, **T026 (the wiring that starts keeping captions) must not be released to the user's daily build before T030 (the reminder that discloses it)**: either merge WG-I only when WG-P is ready to follow in the same session, or keep WG-I's branch unmerged until then. Each story ends with its own e2e block green on the built extension before the next begins, and the full gate (T059) runs once on everything.

Withdrawn 2026-10-13 (decision 79): the release-ordering rule in the paragraph above (T026 not before T030). The reminder does not disclose the captions on any platform, and captions are kept with the reminder on or off.

## Notes from the implementation (2026-10-12, second build: T013, T025, T026, T029–T032, T039–T049, T052, T054, T055, T057–T059)

Where what was built differs from a task's wording. Contract text that changed is marked and dated in `contracts/`.

- **T013**: `tests/e2e/resilience.spec.ts` has no crash simulation to copy (it scripts session failures). The interruption is the offscreen document closed from the service worker with `chrome.offscreen.closeDocument()`, four seconds after a change, without Stop. The spec file also holds the three reminder tests the release-ordering rule asks for (a Meet call, another tab, the Meet landing page).
- **T025, T026**: the store object is built by `offscreenStore` in new `src/entrypoints/offscreen/store.ts`, which `main.ts` passes to the host. `main.ts` cannot be loaded in a test (it registers Chrome listeners when imported), so the host test runs on the same store builder with a fake repository.
- **T030**: one behaviour added. When the unchanged reminder is acknowledged, the tab's platform is asked again; a tab that has become a Meet call meanwhile gets the Meet reminder before anything starts (constitution I; `contracts/download-ui.md`, `contracts/files-and-storage.md`). `MeetingApiDeps` gains `activeTabUrl`.
- **T039**: the entry order is read from the archive's central directory by a few lines in `tests/e2e/captions-helpers.ts`. `unzip -Z1` is still run and compared by count and by each name's ASCII ending: the unzip that ships with macOS prints every byte outside ASCII as `?`, so its listing cannot be compared with the names. Names on disk and both bodies come from `unzip`'s extraction, after `unzip -t`.
- **T042–T048, order**: the tests of T042, T044 and T047 and the e2e block of T046 were all written and seen failing before the code of T043, T045 and T048, because the new `load` and `save` types of `DownloadTranscript` (T043) do not compile until every caller is changed.
- **T043**: `saveTextFile` is removed with `saveFiles`; nothing called it any more. `saveBlob` is the one anchor download.
- **T048**: the single-meeting view's Download reads the meeting again at the press, like a row's (one `load` for both). In 012 it built the file from the lines on screen.
- **T052**: the scan of the built panel for the "Never add" phrases is the last test of `tests/e2e/captions-download.spec.ts`.
- **T057**: `CLAUDE.md` was left to the orchestrating session. For its "Current status": 013 is implemented and awaits the real call. For "Structure": `src/core/captions/` (the caption log and the stored turn), `src/core/export/` now also builds the captions file, the zip and what one press saves, and `src/entrypoints/offscreen/store.ts`.
- **Two points flagged with the first build** (a turn older than an hour; captions off and on): research R11, open risk O7, and the dated amendments in `contracts/captions-capture.md`.
- **Tests with a known race**: the helper in `download-transcript.test.tsx` and one test in `delete-transcript.test.tsx` waited for the panel's header and then fed its live port, which under load was not connected yet. Both now wait for the port.

## Notes from the amendment of 2026-10-13 (decision 79: T060–T066)

- **What went**: `MeetingApi.startPlatform`, `MeetingApiDeps.activeTabUrl`, the `platform` prop of `ConsentDialog`, and in `StartControls` the `'pending'` reminder state, the count of reminders asked for (`consentAsk`), the reminder as last drawn (`consentNow`), the `acknowledging` guard and the second question about the tab on acknowledge. `isMeetCallUrl` stays: the service worker and the offscreen registry use it to decide whether captions are kept.
- **The two fixes that came with T030** ("an acknowledged reminder that was cancelled meanwhile starts nothing", and "a Start pressed before the panel's first effects ran no longer leaves the reminder waiting"): both guarded the wait for an answer about the tab. With no wait there is no stale answer and no pending state to be left in, so their code is removed with it. Their observable behaviour is kept as tests of the simple flow in `tests/unit/sidepanel/start-controls.test.tsx`: the reminder is on screen in the same turn as a press made right after mount, Cancel starts nothing, another screen opening puts the reminder away and starts nothing, and a second acknowledge starts once. The a11y e2e's wait for the reminder to take the focus is kept; it is true of the simple flow too.
- **Permissions**: nothing was added to the manifest for the platform check (it read the tab through `activeTab`, which Start needs anyway), so nothing is left unused. The e2e build's `tabs` permission is still used by the e2e helpers.
