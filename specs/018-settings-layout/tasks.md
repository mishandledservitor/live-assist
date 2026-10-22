# Tasks: Settings layout

**Input**: Design documents from `specs/018-settings-layout/` (spec.md, input-2026-10-22.md, plan.md, research.md, data-model.md, contracts/settings-ui.md, quickstart.md)

**Tests**: required (constitution III, CLAUDE.md standing rule 9). Every implementation task follows a test task whose test was run and seen failing for the right reason.

**Format**: `- [ ] [ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Confirm the baseline: `pnpm test` passes on the branch before any change; build the e2e extension and save a full-page screenshot of Settings at 380 px to the scratchpad (not committed)
- [X] T002 Write the SC-002 and width e2e case in tests/e2e/panel-layout.spec.ts (seeded settings of research R7; 320 px no horizontal scroll; 380 px each field and its button on one line; Settings scroll height at most two thirds of the pre-018 value); run it on the pre-018 build, record the measured height in the test, research.md R7 and quickstart.md, and see it fail

## Phase 2: Foundational

- [X] T003 Write failing DOM tests in tests/unit/sidepanel/key-block.test.tsx for `KeyBlock` (contracts/settings-ui.md "Key block"): closed line `Saved key: ••••{hint}` with `Replace` and `Remove`; `Replace` opens the password field named by the block heading with `Check and save` and `Cancel` and focuses it; `Cancel` and Escape close it unchanged with focus on `Replace`; a passing check closes it with the new hint; a failing check keeps it open with the error; no key saved shows `No key saved.` with the field and `Check and save` and no `Cancel`
- [X] T004 Create src/entrypoints/sidepanel/components/KeyBlock.tsx to pass T003

## Phase 3: User Story 2 - One compact block per key (Priority: P1)

**Goal**: the ElevenLabs key and the selected chat provider's key each one `KeyBlock`, with its retention text beside it.

**Independent Test**: tests/unit/sidepanel/settings.test.tsx "key" cases and tests/unit/sidepanel/chat-settings.test.tsx with keys saved and none saved.

- [X] T005 [P] [US2] Update tests/unit/sidepanel/settings.test.tsx key cases to the new block (`Replace`, `Check and save`, `Remove`, the ElevenLabs confirmation kept, `No key saved.` with the field at once) and see them fail
- [X] T006 [P] [US2] Update tests/unit/sidepanel/chat-settings.test.tsx: only the selected provider's key block shows; switching shows the other's with its stored hint; replacing, failing and removing as before through `Replace`/`Check and save`/`Remove`; `What {provider} keeps` follows the key block; see them fail
- [X] T007 [US2] Use `KeyBlock` for the ElevenLabs key in src/entrypoints/sidepanel/components/Settings.tsx and for the selected provider only in src/entrypoints/sidepanel/components/ChatSettings.tsx, with `ChatRetention` after it (headingLevel 4, src/entrypoints/sidepanel/components/ChatRetention.tsx)

## Phase 4: User Story 1 - Find a setting at a glance (Priority: P1)

**Goal**: three groups in the order of FR-001; retention texts beside their keys; field + button on one line.

**Independent Test**: tests/unit/sidepanel/settings-screen.test.tsx group order and contents on the composed App screen.

- [X] T008 [US1] Rewrite the order case of tests/unit/sidepanel/settings-screen.test.tsx: the `h3` headings are exactly `Transcription`, `Speaker names`, `Questions`; each group's `h4`s and controls in the contract's order; `What ElevenLabs keeps` inside Transcription after the account; Ask off leaves only `Questions` and the tick box in its group; update tests/unit/sidepanel/chat-retention.test.tsx positions; see them fail
- [X] T009 [US1] Group src/entrypoints/sidepanel/components/Settings.tsx into the three sections (RetentionNotice inside, headingLevel 4 in src/entrypoints/sidepanel/components/RetentionNotice.tsx; RememberedNames and AccountDetails headings to h4) and stop appending the retention texts in src/entrypoints/sidepanel/App.tsx
- [X] T010 [US1] Style the groups, one-line field rows and key line, and the key-term list without bullets in src/entrypoints/sidepanel/style.css (research R6); make T002 pass on a fresh e2e build

## Phase 5: User Story 3 - The copy review applied (Priority: P2)

**Goal**: the four Deletes, the Rewrite and `Check again`; Keep strings unchanged; nothing added.

**Independent Test**: tests/unit/copy/keep-strings.test.tsx Settings case and tests/unit/copy/copy-review.test.ts.

- [X] T011 [P] [US3] Update tests/unit/copy/keep-strings.test.tsx (Settings case: the Keep strings present, the deleted headings, sentence, `New key`, `Check and replace key`, `Remove key`, `Refresh account status` absent from the rendered screen; group headings, `Replace`, `Check and save`, `Check again` present; K26 list with the rewrite), add entries D13-D16, R32-R34 and K49's A14 to tests/fixtures/copy/copy-review.json and the count in tests/unit/copy/copy-review.test.ts; update tests/unit/sidepanel/settings-screen.test.tsx AccountDetails cases to `Check again`; see them fail
- [X] T012 [US3] Delete the headings `Consent reminder`, `Clean transcript`, `Microphone` (src/entrypoints/sidepanel/components/Settings.tsx) and the sentence (src/entrypoints/sidepanel/components/RememberedNames.tsx); rewrite `ACCOUNT_ERROR_MESSAGES.network` in src/core/account/usage.ts; the visible `Check again` in src/entrypoints/sidepanel/components/AccountDetails.tsx; remove the key-term bullets
- [X] T013 [US3] Record D13-D16, R32-R34, K49 and the 018 review paragraph in specs/006-panel-redesign/copy-review.md

## Phase 6: Polish

- [X] T014 Update the remaining tests that name the old strings or positions (tests/unit/sidepanel/app-ask.test.tsx, app-ask-off.test.tsx, app-setup-gating.test.tsx; tests/e2e/a11y.spec.ts, account.spec.ts, ask-settings.spec.ts, ask-off.spec.ts, transcripts.spec.ts) with only strings and positions changed (FR-010)
- [X] T015 README.md where it names moved Settings controls; CHANGELOG.md `[Unreleased]` `### Changed`; ROADMAP.md 018 in progress
- [X] T016 Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:e2e && pnpm test:e2e`; after-screenshot at 380 px to the scratchpad; record SC-002 numbers in quickstart.md

## Phase 7: Trims and closed retention texts (decisions 108, 109; FR-012 to FR-018)

- [X] T017 Write failing tests: tests/unit/sidepanel/key-block.test.tsx (masked key alone, its accessible name; headings `ElevenLabs key`), tests/unit/sidepanel/settings.test.tsx and chat-settings.test.tsx (new headings, key-term strings, consent label, remembered names hidden while none and shown when one is remembered), tests/unit/sidepanel/settings-screen.test.tsx (no `ElevenLabs account` heading; plan line and `Check again` under the key; the badge opening focuses the account section; retention disclosures closed with the heading as summary), tests/unit/sidepanel/chat-retention.test.tsx (Settings closed, setup open), tests/unit/copy/keep-strings.test.tsx with the fixture entries D17-D20, R36-R39 and the count; see them fail
- [X] T018 Apply the trims in src/entrypoints/sidepanel/components/KeyBlock.tsx, Settings.tsx, ChatSettings.tsx, AccountDetails.tsx, RememberedNames.tsx and App.tsx (badge focus)
- [X] T019 Make RetentionNotice and ChatRetention closed disclosures in Settings only (src/entrypoints/sidepanel/components/RetentionNotice.tsx, ChatRetention.tsx), with styles in style.css
- [X] T020 Update the e2e specs naming the changed strings or regions (account, a11y, ask-settings, ask-off, panel-layout) and the SC-002 numbers; record D17-D20, R36-R39 in specs/006-panel-redesign/copy-review.md; CHANGELOG; gates

## Dependencies

T001-T002 → T003-T004 → US2 (T005-T007) → US1 (T008-T010) → US3 (T011-T013) → T014-T016. US1 and US2 touch the same files (`Settings.tsx`, `ChatSettings.tsx`), so they run in order, not in parallel worktrees.
