# Tasks: Merged download

**Input**: Design documents from `specs/016-merged-download/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: required (constitution III, CLAUDE.md standing rule 9). Every implementation task follows a test task whose test was run and seen failing for the right reason.

**Format**: `- [ ] [ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Confirm the baseline: `pnpm test` passes on the branch before any change (no file changes)

## Phase 2: Foundational

**Purpose**: the alignment every story rests on.

- [X] T002 [P] Write failing tests for `matchingBlocks` (contracts/merged-file.md) against blocks Python's `difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks()` gives for the same inputs, written into the test as literals (empty sides, no match, identical, ties of equal blocks, repeated symbols, a block made of two adjacent ones joined, a 2,000-symbol pseudo-random pair) in tests/unit/core/export/matching-blocks.test.ts
- [X] T003 Implement `matchingBlocks` (research R2 "difflib, exactly") in src/core/export/matching-blocks.ts
- [X] T004 [P] Add a seeded generator of invented meetings (lines with word timings, caption turns that carry the same words with Meet-like differences, the user's own turns, optional replayed passages) in tests/support/synthetic-meeting.ts

**Checkpoint**: the alignment matches difflib.

## Phase 3: User Story 1 - One file with the right names (Priority: P1) 🎯 MVP

**Goal**: after Stop, `Download transcript` saves one merged `.txt` from all three places.

**Independent Test**: `mergedMeetingDownload` on a meeting with lines and captions returns one `text/plain` file named `… — Transcript.txt` whose words are the transcript file's; the panel saves it from the main view after Stop, a row and the single-meeting view.

- [X] T005 [P] [US1] Write failing tests for `mergedTranscript` and `mergedTranscriptFile`: word normalisation (case, accents, punctuation, Greek); an anchor names a live "Others" line; a single short matched word is ignored; the proportional, hint, same-speaker and backchannel gap rules and `Others`; sentence majority with weights and its tie-breaks; a punctuation-only sentence; cutting at a sentence end and keeping the line's time; joining across lines only when the earlier one does not end a sentence; display names (self → user's name or its rename, a caption rename, Meet's name); a corrected line keeps its correction and is not cut; pending lines left out; the contracts/merged-file.md example byte for byte; and over 50 generated meetings: words equal the written words, every time is a written line's time, determinism, a captions-only marker word never in the body; in tests/unit/core/export/merged-transcript.test.ts
- [X] T006 [US1] Implement `mergedTranscript` and `mergedTranscriptFile` without the repeat rule (research R2, R4) in src/core/export/merged-transcript.ts
- [X] T007 [P] [US1] Write failing tests for `mergedMeetingDownload`: lines and captions → one merged `.txt`; lines only, captions only, neither → exactly `meetingDownload`'s result; `meetingDownload` itself unchanged; in tests/unit/core/export/meeting-download.test.ts
- [X] T008 [US1] Implement `mergedMeetingDownload` in src/core/export/meeting-download.ts
- [X] T009 [P] [US1] Write failing panel tests: main view of a stopped meeting with captions saves the merged `.txt`; a running one saves the 013 zip; in tests/unit/sidepanel/app-captions.test.tsx (the stopped-meeting zip expectations become the merged file)
- [X] T010 [US1] Choose the download by `running` on the main view in src/entrypoints/sidepanel/App.tsx
- [X] T011 [P] [US1] Write failing Transcripts screen tests: a row and the single-meeting view save the merged `.txt`, same name and bytes as the main view, in tests/unit/sidepanel/transcripts-screen.test.tsx
- [X] T012 [US1] Use `mergedMeetingDownload` for the screen's `load` in src/entrypoints/sidepanel/components/TranscriptsScreen.tsx

**Checkpoint**: US1 works without repeat removal.

## Phase 4: User Story 2 - A passage written twice appears once (Priority: P1)

**Goal**: FR-012–FR-014.

**Independent Test**: tests/unit/core/export/merged-repeats.test.ts.

- [X] T013 [P] [US2] Write failing tests: a replayed 20-word line the captions carry once is removed, its first copy keeps its time and the captions' speaker; the later copy carried and the first not: still the later removed, the first named by pass 2; both carried (said twice) kept; neither carried kept; under 8 words kept; a partly repeated line kept; a corrected line kept; a repeat starting more than 400 words after its source kept; a run of two lines (one short) removed together; a run broken by a non-repeated line judged per part; a passage written three times; `removedSegmentIds`; in tests/unit/core/export/merged-repeats.test.ts
- [X] T014 [US2] Implement the repeat rule and the second pass (research R3) in src/core/export/merged-transcript.ts

**Checkpoint**: US1 and US2 give the merged file of the spec.

## Phase 5: User Story 3 - The original files, out of the way (Priority: P2)

**Goal**: `Download originals` on the single-meeting view only.

**Independent Test**: tests/unit/sidepanel/download-originals.test.tsx and past-transcript.test.tsx.

- [X] T015 [P] [US3] Write failing tests: `DownloadButton` (label as given, builds on press, saves one file, nothing on null or rejection); `DownloadOriginals` reads `Download originals`; `DownloadTranscript` unchanged; in tests/unit/sidepanel/download-originals.test.tsx
- [X] T016 [US3] Extract `DownloadButton` from src/entrypoints/sidepanel/components/DownloadTranscript.tsx into src/entrypoints/sidepanel/components/DownloadButton.tsx and add src/entrypoints/sidepanel/components/DownloadOriginals.tsx
- [X] T017 [P] [US3] Write failing tests: the single-meeting view shows `Download transcript`, `Download originals`, `Delete transcript` for a meeting with lines and captions, and no `Download originals` with one record; its press saves the 013 zip (byte for byte `meetingDownload`); rows and the main view never show it; in tests/unit/sidepanel/past-transcript.test.tsx and tests/unit/sidepanel/transcripts-screen.test.tsx
- [X] T018 [US3] Add `loadOriginals` to src/entrypoints/sidepanel/components/PastTranscript.tsx and pass `meetingDownload` from src/entrypoints/sidepanel/components/TranscriptsScreen.tsx
- [X] T019 [US3] Copy: K47 cases in tests/unit/copy/keep-strings.test.tsx (the label, its place, nothing beside it; K44 C5's single-view expectation amended for decision 97), the A12 never-add entry in tests/fixtures/copy/copy-review.json with the entry count in tests/unit/copy/copy-review.test.ts; see them fail before T016/T018, pass after; record K47 and the review paragraph in specs/006-panel-redesign/copy-review.md

## Phase 6: User Story 4 - Everything else downloads as before (Priority: P2)

Covered by T007 (fallbacks), T009 (running meeting) and the unchanged 013 tests.

- [ ] T020 [US4] Update tests/e2e/captions-download.spec.ts: after Stop the main view, a row and the single-meeting view save the same merged `.txt`; `Download originals` saves the 013 zip, unzipped and compared byte for byte; the 3-hour timing of the zip goes through `Download originals`; a running meeting still saves the zip; meetings without both records unchanged; plus a merged-file timing on a generated 3-hour meeting (SC-005). Run `pnpm build:e2e && pnpm exec playwright test` for it and tests/e2e/transcripts.spec.ts, tests/e2e/download.spec.ts

## Phase 7: Measurements

- [X] T021 Write the speed test (a generated 15,000-word meeting under 1 s, 45,000 words under 2 s) in tests/unit/core/export/merged-transcript-speed.test.ts; record the measured times in research.md R5
- [X] T022 Run the local parity check (spikes/data/016-parity/parity.ts, gitignored, never committed) on the six recorded calls and record per-call metrics in research.md R7

## Phase 8: Polish & Cross-Cutting

- [ ] T023 [P] Dated amendment notes for decision 93 in specs/013-captions-download/spec.md (FR-012, FR-019), specs/013-captions-download/contracts/download-ui.md (the table and "Never add"), specs/007-download-transcript/spec.md (FR-003) and specs/012-past-transcripts/spec.md (FR-014); update the captions-file.ts comment that says the captions are never merged
- [ ] T024 [P] Add the 016 line under `## [Unreleased]` in CHANGELOG.md and set the ROADMAP.md row to `in-progress`
- [ ] T025 Check that nothing under src/core/session, src/core/speakers, src/core/transcript, src/entrypoints/offscreen or src/platforms, nor any of their tests, differs from `origin/main`
- [ ] T026 Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:e2e && pnpm test:e2e`

## Dependencies

T002 → T003 → T005/T006 → T007/T008 → T009–T012; T013/T014 after T006; T015–T019 after T008; T020 after T012, T014, T018; T021 after T014; T022 after T014. Stories touch the same few files, so they run in order on one branch (no worktree split, CLAUDE.md rule 6).
