# Tasks: Close transcript

**Input**: Design documents from `specs/014-close-transcript/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: required (constitution III, CLAUDE.md standing rule 9). Every implementation task follows a test task whose test was run and seen failing for the right reason.

**Format**: `- [ ] [ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Confirm the baseline: `pnpm test` passes on the branch before any change (no file changes)

## Phase 2: Foundational

No foundational work: both stories reuse 012's `MainViewStore`, `clearMainView` and `showsOnMain` unchanged (research R1).

## Phase 3: User Story 1 - Close a stopped transcript (Priority: P1) 🎯 MVP

**Goal**: `Close transcript` beside Download and Delete clears the main view without deleting.

**Independent Test**: in `tests/unit/sidepanel/app-close.test.tsx`, a stored meeting on the main view, press `Close transcript`, the main view is clean, `clearMainView` called once, `deleteMeeting` never, focus on Transcripts; running meeting has no button; failure shows X2.

- [ ] T002 [P] [US1] Write failing component tests for `CloseTranscript` (label, disabled while closing, `onClosed` on success, X2 alert on failure and cleared on the next press) in tests/unit/sidepanel/close-transcript.test.tsx
- [ ] T003 [US1] Implement `CloseTranscript` per contracts/internal-api.md in src/entrypoints/sidepanel/components/CloseTranscript.tsx
- [ ] T004 [P] [US1] Write failing App tests (button order Download, Close, Delete; none while running; press → clean main view, `clearMainView` once, `deleteMeeting` never, focus on the Transcripts control or the gear without it; Transcripts screen then Back stays clean; delete confirmation open then Close → clean, nothing deleted; failed write keeps the transcript and shows X2) in tests/unit/sidepanel/app-close.test.tsx
- [ ] T005 [US1] Wire `CloseTranscript` into `MainView`'s footer and add the `Panel` close handler and focus move in src/entrypoints/sidepanel/App.tsx
- [ ] T006 [P] [US1] Write failing tests that `useChat` stops a streaming answer once when the meeting shown changes to another or to none, and sends no waiting question, in tests/unit/sidepanel/use-chat-close.test.tsx
- [ ] T007 [US1] Implement the stop on meeting change in src/entrypoints/sidepanel/hooks/useChat.ts
- [ ] T008 [P] [US1] Add the K46 cases (X1 on a stopped meeting, X2 after a failed close, the clean main view shows only K27) to tests/unit/copy/keep-strings.test.tsx and the A11 never-add entry to tests/fixtures/copy/copy-review.json with the entry count in tests/unit/copy/copy-review.test.ts; see them fail before T003/T005 exist, pass after
- [ ] T009 [US1] Record K46 (X1, X2), the review paragraph and the A11 never-add line in specs/006-panel-redesign/copy-review.md

**Checkpoint**: US1 works with the panel left open; the opening clear is not yet built.

## Phase 4: User Story 2 - The panel opens clean after a meeting stopped (Priority: P1)

**Goal**: the first stored answer of an opened panel clears the main view; a panel kept open across Stop does not.

**Independent Test**: `latestStored({ opening: true })` writes the moment and returns null for a stored meeting; `useLive` passes the flag only on the first disconnect; e2e reload after Stop is clean, reload during a running meeting is live.

- [ ] T010 [P] [US2] Write failing `createMeetingApi` tests: opening with a meeting (stopped, or interrupted with no end time) writes `now()` and returns null without reading its lines; opening with none writes nothing; opening with an already-cleared view writes nothing; opening whose write rejects returns the meeting; no option behaves as 012, in tests/unit/sidepanel/meeting-api.test.ts
- [ ] T011 [US2] Implement `latestStored(options)` and widen `LiveApi.latestStored` in src/entrypoints/sidepanel/meeting-api.ts and src/entrypoints/sidepanel/hooks/useLive.ts (signature only)
- [ ] T012 [P] [US2] Write failing `useLive` tests: first disconnect calls `latestStored({ opening: true })`; `refresh()` afterwards calls it without the flag; after a snapshot, the disconnect at Stop calls it without the flag; a stale generation's disconnect does not consume the opening (the hook mounts with `Panel`, so finishing setup is an opening too), in tests/unit/sidepanel/use-live.test.tsx
- [ ] T013 [US2] Implement the `opening` ref in src/entrypoints/sidepanel/hooks/useLive.ts
- [ ] T014 [US2] Make the fake record the flag (and keep ignoring it for what it returns) in tests/unit/sidepanel/fake-meeting-api.ts; run `pnpm test`
- [ ] T015 [P] [US2] Add `showSeededOnMain` (research R5) to tests/e2e/helpers.ts and call it from `seedAskMeeting` and from `seedStoredMeetings` in tests/e2e/transcripts-helpers.ts
- [ ] T016 [US2] Write tests/e2e/close.spec.ts: fixture Start/Stop with the panel open keeps the transcript with Close; Close → clean, reload → still clean, the meeting listed on Transcripts; fixture Start/Stop then reload → clean; reload while running → live; Start after Close → the new meeting shows. See the opening cases fail on a build without T011/T013 (or before them), pass after
- [ ] T017 [US2] Run `pnpm build:e2e && pnpm test:e2e`; update the specs whose reload after a real Stop expected the transcript (expect clean, or use the helper where the reload served setup only) in tests/e2e/*.spec.ts

**Checkpoint**: both stories work.

## Phase 5: Polish & Cross-Cutting

- [ ] T018 [P] Add the 014 line under `## [Unreleased]` in CHANGELOG.md
- [ ] T019 [P] Add the 014 row to ROADMAP.md
- [ ] T020 [P] Write specs/014-close-transcript/manual-check.md with the real-call steps
- [ ] T021 Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:e2e && pnpm test:e2e`

## Dependencies

- US1 (T002–T009) and US2 (T010–T017) are independent; both edit nothing in common except tests/unit/sidepanel/fake-meeting-api.ts (US2 only).
- Within each story: test task before its implementation task (T002→T003, T004→T005, T006→T007, T010→T011, T012→T013).
- T016–T017 need T011 and T013; T021 needs all.

## Parallel examples

- US1: T002, T004, T006, T008 can be written together (different files).
- US2: T010, T012, T015 together.

## Implementation strategy

MVP is US1 (the button). US2 follows on the same branch; the PR carries both, since decision 91 chose them together.
