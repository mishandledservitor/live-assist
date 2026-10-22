# Tasks: Turn Ask off

**Input**: Design documents from `specs/017-ask-off/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: required (constitution III, CLAUDE.md standing rule 9). Every implementation task follows a test task whose test was run and seen failing for the right reason.

**Format**: `- [ ] [ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Confirm the baseline: `pnpm test` passes on the branch before any change (no file changes)

## Phase 2: Foundational

**Purpose**: the setting both stories read (research R1, data-model).

- [X] T002 Write failing tests in tests/unit/core/settings/settings.test.ts: `DEFAULT_SETTINGS.askEnabled` is `true`; `parseSettings` of stored settings without the field (an install before 017) gives `true`; a stored `false` is kept; a non-boolean reads as `true`
- [X] T003 Add `askEnabled` to `Settings`, `DEFAULT_SETTINGS` and `parseSettings` in src/core/settings/schema.ts

**Checkpoint**: the field exists, on by default; nothing reads it yet.

## Phase 3: User Story 1 - Turn Ask off in Settings (Priority: P1) 🎯 MVP

**Goal**: one tick box under **Questions** removes every Ask and notes element from the main view and the provider, key and retention text from Settings, at once and across reopenings, stopping an answer in flight.

**Independent Test**: in tests/unit/sidepanel/app-ask-off.test.tsx, with Ask on and no chat key the dock shows; untick in Settings; the main view shows none of the Ask or notes elements; Settings shows only the heading and the tick box under Questions; a panel loaded with `askEnabled: false` starts that way.

- [X] T004 [P] [US1] Write failing App tests in tests/unit/sidepanel/app-ask-off.test.tsx: (a) the tick box `Ask questions about the meeting` is the first control after the `Questions` heading, checked by default; (b) unticking calls `saveSettings({ askEnabled: false })` and hides `Answers from`, `Model`, both key sections and the chat retention text, while `Questions` and the tick box stay; ticking again shows them with the stored key hints and saves `true`; (c) with `askEnabled: false` loaded, the main view has no `Question` box, `Ask`/`Stop`, missing-key line, model label, `Questions and answers` strip, `Add notes` or `Add notes for the next meeting`, in each state: no meeting, a running meeting, a stopped meeting, and after `Close transcript`; while `Download transcript`, `Close transcript`, `Delete transcript` and the Transcripts control stay; (d) unticking in Settings and going back removes the dock and strip at once (no reload), and ticking again brings back the stored turns (`listTurns` read again) and notes; (e) with Ask off, `chat.ask` and `chat.listTurns` and `notes` reads are never called during a meeting from Start to Stop
- [X] T005 [P] [US1] Write a failing App test in tests/unit/sidepanel/app-ask-off.test.tsx: while an answer streams and a question waits behind it, unticking Ask sends `chat.stop` for the streaming turn once and never sends the waiting question, even after `chat/end` arrives; text typed in the box and unsent is gone when Ask is ticked again (FR-007, edge cases). Run it and see it fail (Ask cannot yet be turned off) before T008
- [X] T006 [P] [US1] Add the K48 case (the tick box label in Settings) to tests/unit/copy/keep-strings.test.tsx and the A13 entry (present `Ask questions about the meeting`; absent the never-add fragments of contracts/ask-off-ui.md) to tests/fixtures/copy/copy-review.json with the entry count in tests/unit/copy/copy-review.test.ts; see them fail before T007, pass after
- [X] T007 [US1] Add the tick box and hide provider, model and keys while off in src/entrypoints/sidepanel/components/ChatSettings.tsx, passing `askEnabled` and its save from src/entrypoints/sidepanel/components/Settings.tsx (the `cleanTranscript` pattern)
- [X] T008 [US1] In src/entrypoints/sidepanel/App.tsx, drop `AskArea` and the next-meeting `NotesControl` from `MainView` and `ChatRetention` from the Settings screen while `askEnabled` is false
- [X] T009 [US1] Record K48, its review paragraph and the A13 never-add line in specs/006-panel-redesign/copy-review.md

**Checkpoint**: US1 works in the panel; setup still requires a chat key.

## Phase 4: User Story 2 - Set up without a chat key (Priority: P2)

**Goal**: first-run setup finishes with the chat key empty and leaves Ask off (decision 102).

**Independent Test**: in tests/unit/sidepanel/setup.test.tsx and setup-chat.test.tsx, finish setup with an empty chat key; `replaceChatKey` is not called; saved settings have `chat.setupComplete: true` and `askEnabled: false`; App then shows the main view with no Ask elements.

- [X] T010 [P] [US2] Write failing tests: full setup with name, ElevenLabs key and an empty chat key saves `firstRunComplete: true`, `chat.setupComplete: true`, `askEnabled: false`, does not call `replaceChatKey`, and its confirmation shows only the ElevenLabs key with the existing line `Key saved on this computer only:`; full setup with a chat key saves `askEnabled: true` as before; chat-only setup (`mode="chat"`) with an empty key completes without a confirmation step and with Ask off; App after such a setup shows the main view with no question box (tests/unit/sidepanel/setup.test.tsx, tests/unit/sidepanel/setup-chat.test.tsx, tests/unit/sidepanel/app-setup-gating.test.tsx). Replace the existing tests that expected the empty-key refusal
- [X] T011 [US2] Implement in src/entrypoints/sidepanel/components/Setup.tsx (research R5); no new text

**Checkpoint**: both stories work.

## Phase 5: Polish & Cross-Cutting

- [X] T012 [P] Write tests/e2e/ask-off.spec.ts: on the e2e build with a stored meeting shown, untick Ask in Settings, Back: no `Question` box, `Ask` button, model label or notes control; reload the panel: still off and the tick box unticked; tick it again: the box is back. See it fail before T007/T008 (the tick box is missing)
- [X] T013 [P] README.md: name the setting in the line about removing the chat key, and setup step 4 no longer requires a chat key
- [X] T014 [P] CHANGELOG.md: an `### Added` line under `## [Unreleased]`; ROADMAP.md: 017 in progress
- [X] T015 [P] Write specs/017-ask-off/manual-check.md with the real-panel steps
- [X] T016 Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:e2e && pnpm test:e2e`

## Dependencies

- T002 → T003 → (US1, US2). T004, T005, T006 (tests, seen failing) → T007, T008 → T009. T010 → T011. T012 seen failing before T007/T008. T016 last.
- US1 and US2 are independent once T003 is done; US2's App check needs T008.

## Parallel opportunities

T004-T006 and T010 are test files written before their implementation; T013-T015 are documentation.

## Analysis (2026-10-22, `/speckit-analyze`)

Every FR and SC maps to a task: FR-001 T004a, T006; FR-002 and SC-001 T004c, T012; FR-003 T004b; FR-004 and SC-002 T004e; FR-005 and SC-003 T004b, T004d; FR-006 T004d, T012; FR-007 T005; FR-008 and SC-004 T010; FR-009 T004c; FR-010 T006, T009; SC-005 T002. Constitution: no conflict (plan check). Findings fixed in this round: the in-flight test was ordered after the App change it tests (moved before it, T005); the plan named a schema test file that does not exist (now `tests/unit/core/settings/settings.test.ts`). Left as is: the edge case "Ask turned off while the notes dialog for the next meeting is open" cannot happen in one panel, because the dialog is modal over the main view and Ask is turned off on the Settings screen; unmounting `NotesControl` would close it anyway.
