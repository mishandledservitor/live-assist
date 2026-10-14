---

description: "Task list for 006 Side-panel redesign"
---

# Tasks: Side-panel redesign

**Input**: Design documents from `specs/006-panel-redesign/`

**Prerequisites**: plan.md, spec.md, copy-review.md, research.md, data-model.md, contracts/panel-ui.md, quickstart.md; `002-impl-polish` merged into `main`.

**Tests**: Required. Constitution III and CLAUDE.md rule 9: every test task is written first and seen failing for the right reason before the implementation task after it. No automated test uses the network or a real key; account replies and status snapshots are fakes or fixtures, e2e uses the existing fixture transcription provider.

**Copy rule**: change exactly the strings in `copy-review.md` and nothing else. Do not add helper text, tooltips explaining dots, or notices about the new layout (copy-review "Do not add"). If a task seems to need a new string, stop and ask.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md

---

## Phase 1: Setup

- [X] T001 Confirm `002-impl-polish` is merged into `main`, rebase `006-panel-redesign` on `main`, run `pnpm test`; then search the merged `src/` for user-facing strings added since the copy review and, if any, add them to `specs/006-panel-redesign/copy-review.md` (Delete/Rewrite/Keep with the skill's tells) before going on. Done 2026-10-08 (`002-impl-polish` and the red-team fixes merged): R1's old text updated, K33 added, R12 narrowed, K28 noted; spec FR-007, US2 scenarios 5 and 7, data-model `problems` updated
- [X] T002 Create `tests/fixtures/copy/copy-review.json`: one entry per copy-review Delete and Rewrite ID (`D1`–`D12`, `R1`–`R27`, 39 entries; R1's `absent` is `Live meeting transcript in a side panel`) with `absent` fragments (from copy-review "Checking the result") and `present` fragments (the literal runs of each Rewrite replacement, placeholders split out), plus `enabled: false` on every entry; D9, D11 and D12 are marked `dom: true` (checked by rendered-DOM tests, not text scans, because their text also occurs in Keep strings or identifiers)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the copy scanner and the two-screen shell every story builds on.

- [X] T003 Write `tests/unit/copy/copy-review.test.ts`: a scanner that parses every `.ts`/`.tsx` under `src/` except `src/entrypoints/spike-recorder/` with the `typescript` compiler API and collects string literals, no-substitution templates, template heads/middles/tails and JSX text (no comments, no identifiers), plus the text of `src/entrypoints/**/*.html` and the string literals in `wxt.config.ts`; for each `enabled` fixture entry without `dom: true`, assert every `absent` fragment is in no collected string and every `present` fragment is in at least one, reporting the copy-review ID on failure. Add a self-test over an inline sample source proving comments are ignored and JSX text and template pieces are collected. With all entries disabled the suite passes
- [X] T004 Write failing tests in `tests/unit/sidepanel/app-screens.test.tsx`: after setup the panel renders the main view; a `Settings` button switches to a screen with heading level 2 `Settings` focused and a `Back` button; Back returns to the main view and focuses the `Settings` button; Escape on the Settings screen returns too, but not when focus is in a text input or select; the main view stays mounted (`hidden`) while Settings shows, so a fake live-port line delivered meanwhile is in the transcript after Back; opening Settings while the consent reminder is open cancels it and no start command is sent
- [X] T005 Create `src/entrypoints/sidepanel/components/SettingsScreen.tsx` (Back button, `h2` Settings with `tabIndex={-1}`, Escape handling per research R7) wrapping the existing `Settings` content, and add the `screen` state to `src/entrypoints/sidepanel/App.tsx` with both screens rendered and the inactive one `hidden`; a temporary gear button sits above the workspace so T004 passes. Update `tests/unit/sidepanel/app.test.tsx` and `tests/unit/sidepanel/settings.test.tsx` to reach Settings through the gear

**Checkpoint**: two screens, nothing else changed visually; `pnpm test` green.

---

## Phase 3: User Story 1 — The transcript gets the panel (Priority: P1) — MVP

**Goal**: slim header, transcript fills the panel, nothing settings-related on the main view.

**Independent Test**: spec US1 — header plus status at most two text lines, transcript the rest, no settings control visible.

- [X] T006 [P] [US1] Write failing tests in `tests/unit/sidepanel/panel-header.test.tsx`: `PanelHeader` renders in order Start (or Stop while running), the `Language` combobox (disabled and showing the meeting's language while running), a badge slot and a `Settings` button; Start disabled with the not-ready reason shown below the header (K3) when not ready
- [X] T007 [US1] Create `src/entrypoints/sidepanel/components/PanelHeader.tsx`; split `src/entrypoints/sidepanel/components/StartControls.tsx` so Start/Stop and the language picker render in the header while start errors (with `Stop that one`), the consent reminder and the not-ready line render between header and status (FR-005), behaviour and focus return unchanged; replace T005's temporary gear; update `tests/unit/sidepanel/start-controls.test.tsx` and `tests/unit/sidepanel/consent.test.tsx` for the new structure (assertions on behaviour unchanged) so T006 passes
- [X] T008 [P] [US1] Write failing tests in `tests/unit/sidepanel/app-layout.test.tsx`: the main view contains no textbox, no checkbox, no `What ElevenLabs keeps` text, no account line and no `Retention` label (D12 DOM check, enable fixture entry D12); heading level 1 `live-assist` exists and has the visually-hidden class (K32)
- [X] T009 [US1] Remove `Settings` and `AccountStatus` from the main view in `src/entrypoints/sidepanel/App.tsx`, make the `h1` visually hidden, and remove the retention row from `src/entrypoints/sidepanel/components/StatusBar.tsx` (its `RETENTION` text stays in `RetentionNotice`); set D12 `enabled: true` in `tests/fixtures/copy/copy-review.json`; T008 passes
- [X] T010 [P] [US1] Write failing tests in `tests/unit/sidepanel/transcript.test.tsx`: with a stopped meeting, `Delete transcript` renders after the last transcript line (inside the transcript region, after the list); while running it does not render; the confirmation (K6) and focus return after Cancel are unchanged
- [X] T011 [US1] Add a `footer` slot to `src/entrypoints/sidepanel/components/Transcript.tsx` and move the delete button and confirmation there from `StartControls.tsx` (research R9); T010 passes
- [X] T012 [US1] Rewrite `src/entrypoints/sidepanel/style.css` to the full-height flex column (research R6): `html, body, #root, main` 100% height, header one line with the language select shrinking first, transcript `flex: 1; min-height: 0; overflow-y: auto` (drop `max-height: 60vh`), add `--ok` and `--accent` tokens in both the light `:root` and the dark `prefers-color-scheme` block, primary button on `--accent`, system font, muted smaller timestamps, no decorative colour (FR-022); fold `components/account-status.css` into it and delete that file
- [X] T013 [US1] Write and pass `tests/e2e/panel-layout.spec.ts` › "transcript fills the panel": e2e build, panel at 360×700 with a seeded stopped meeting of 50 lines; transcript region height ≥ 80% of the viewport (SC-001); header controls share one row at 320 px width (bounding boxes' top equal); no settings control visible

**Checkpoint**: MVP — transcript-first main view; settings reachable through the gear.

---

## Phase 4: User Story 2 — Status stays quiet until something is wrong (Priority: P1)

**Goal**: one line of four dots, expanding only on a problem, with the copy-review state texts.

**Independent Test**: spec US2 — healthy snapshot one line, degraded speaker names expanded with its reason, healthy again collapsed.

- [X] T014 [P] [US2] Write failing tests in `tests/unit/core/status/status.test.ts`: `initialStatus().speakerNames` is `{ state: 'idle', reason: '' }`; the `adapter` and `captions` events move it out of `idle` as they do from `unavailable`; `MUTE_UNKNOWN_REASON` is `sent even while muted` (R12); update the existing initial-status expectations
- [X] T015 [US2] Add `'idle'` to the speaker-names state and change `initialStatus()` and `MUTE_UNKNOWN_REASON` in `src/core/status/status.ts` (D3, R12); T014 passes; fix `tests/unit/sidepanel/use-live.test.tsx` and `tests/unit/core/messaging/protocol.test.ts` fixtures that used the old initial reason
- [X] T016 [P] [US2] Write failing tests in `tests/unit/sidepanel/status-view.test.ts` for `statusDots(snapshot, { running })` covering every state → text row in data-model.md "State → text", including: transcription active with 2 reconnects reads `Transcribing` (D1, D2, R5); speaker names active `On` (R6); degraded `Unavailable — Couldn't turn on Meet captions` with no "labelled Others" (R7, D4); unavailable with the generic reason `Not available — Speaker names work on Google Meet only.` (R8); idle `Not running` (FR-009); mic followed and live `Live` (R11); mic live with no mute source `Live — sent even while muted` (R12); mic muted with `MUTE_UNREADABLE_REASON` reads `Not sent — can't see Meet's mute button`, is a problem and has no action (K33, decision 34); mic `Checking Meet's mute state — not sent` is not a problem; mic unavailable has `action: 'allow-mic'`; `problems` contains exactly the error-tone dots in capture, transcription, speaker names, microphone order, plus the speaker-names dot when it is `unavailable` and `running` is true (and not when `running` is false)
- [X] T017 [US2] Create `src/entrypoints/sidepanel/status-view.ts` with `statusDots` (research R2, data-model.md) holding every status string; T016 passes
- [X] T018 [P] [US2] Write failing tests in `tests/unit/sidepanel/status-line.test.tsx`: healthy snapshot renders four items with accessible names `{label}: {text}` and no visible reason text; a snapshot with mic unavailable renders the expanded problem with label, text and an `Allow microphone` button that calls `onFixMic`; two problems render two lines in order; the region is `Status` with `aria-live="polite"`; the error dot has a different shape class from the others (FR-021); a 300-character reason wraps inside the region (no horizontal overflow)
- [X] T019 [US2] Create `src/entrypoints/sidepanel/components/StatusLine.tsx` rendering `statusDots`, add dot and expanded-problem styles to `src/entrypoints/sidepanel/style.css` (ok filled, busy muted, idle ring, error square), use it in `App.tsx`, delete `components/StatusBar.tsx` and move still-relevant cases from `tests/unit/sidepanel/status-bar.test.tsx` into `status-line.test.tsx`, then delete `status-bar.test.tsx`; T018 passes
- [X] T020 [US2] Write and pass `tests/e2e/panel-layout.spec.ts` › "status line": during a fixture meeting on the Meet test page with captions on, the status region is a single line (height ≤ 1.5 × its line-height, SC-002); on the generic test page it expands with `Not available — Speaker names work on Google Meet only.`

**Checkpoint**: status meets constitution IV in one line.

---

## Phase 5: User Story 3 — Settings live on their own screen (Priority: P1)

**Goal**: every setting, the account details and the retention disclosure on the Settings screen, in the contract's order.

**Independent Test**: spec US3 — gear opens the full Settings screen; Back returns with focus on the gear.

- [X] T021 [P] [US3] Write failing tests in `tests/unit/sidepanel/settings-screen.test.tsx`: section order is Your name field, `ElevenLabs API key`, `ElevenLabs account`, `Key terms`, `Consent reminder`, `Remembered names`, `Microphone`, `What ElevenLabs keeps` (contracts/panel-ui.md); the account section shows the account line, the exact-credits line and the caveat (K24) directly with no `Details` disclosure (D9 DOM check, enable entry D9) and a working `Refresh account status`; the retention section renders `RetentionNotice`
- [X] T022 [P] [US3] Write failing tests in `tests/unit/sidepanel/use-account.test.tsx` (moving the trigger cases from `tests/unit/sidepanel/account-status.test.tsx`): `useAccount` fetches once on mount, once on the falling edge of `meetingRunning`, on `refresh()`, ignores a refresh while one is in flight, and never fetches twice when two consumers read it
- [X] T023 [US3] Create `src/entrypoints/sidepanel/hooks/useAccount.ts` (research R4), call it once in `App.tsx`; T022 passes
- [X] T024 [US3] Create `src/entrypoints/sidepanel/components/AccountDetails.tsx` (heading `ElevenLabs account`, id `account-heading`; line, detail paragraphs, refresh button; no `<details>`), delete `components/AccountStatus.tsx`, move remaining rendering cases from `account-status.test.tsx` and `app-account.test.tsx` into `settings-screen.test.tsx`, delete those two files; compose `SettingsScreen.tsx` in the contract order with `AccountDetails` and `RetentionNotice`; set D9 `enabled: true`; T021 passes
- [X] T025 [US3] Write and pass `tests/e2e/panel-layout.spec.ts` › "settings round trip": during a fixture meeting open Settings, wait for two more fixture lines, press Back; all lines present, capture status still active, focus on the gear (SC-005, FR-012)

**Checkpoint**: settings fully off the main view and reachable in one activation (SC-003).

---

## Phase 6: User Story 4 — The credits badge (Priority: P2)

**Goal**: 005's account status as a small header badge.

**Independent Test**: spec US4 — `84%` with the full line as accessible name; permission error shows the problem mark with the exact message; Start enabled.

- [X] T026 [P] [US4] Write failing tests in `tests/unit/core/account/usage.test.ts` for `describeBadge` per data-model.md: null reply → `Checking plan…`, `loading`, name `ElevenLabs account` (R27); 19,360 of 121,000 → `84%`, `ok`, name equal to `describeAccount(...).line`; zero limit → `–`, `neutral`; each error kind → `!`, `problem`, name equal to `ACCOUNT_ERROR_MESSAGES[kind]` (the 'User: Read' message verbatim)
- [X] T027 [US4] Implement `describeBadge` in `src/core/account/usage.ts`; T026 passes
- [X] T028 [P] [US4] Write failing tests in `tests/unit/sidepanel/credits-badge.test.tsx`: renders the view's text, accessible name and `title`; `aria-busy` while fetching; activating it calls `onOpenAccount`; with an error reply, Start in `App` stays enabled
- [X] T029 [US4] Create `src/entrypoints/sidepanel/components/CreditsBadge.tsx`, place it in `PanelHeader`, and make `onOpenAccount` switch `App` to Settings, scroll `#account-heading` into view and focus it; badge styles in `style.css`; T028 passes
- [X] T030 [US4] Update `tests/e2e/account.spec.ts` for the badge: stubbed success shows `84%` in the header with the full line as accessible name; stubbed 'User: Read' error shows the problem mark with the exact message; activating the badge opens Settings at `ElevenLabs account`; Start enabled throughout

---

## Phase 7: User Story 5 — Every string reads as the copy review says (Priority: P1)

**Goal**: apply every Delete and Rewrite; enable each fixture entry first (red), then change the string (green).

**Independent Test**: spec US5 — copy scanner and built-output scan green with every entry enabled.

For each task below: set the listed IDs to `enabled: true` in `tests/fixtures/copy/copy-review.json` and update the existing tests named, run `pnpm exec vitest run tests/unit/copy` and the named tests and see them fail on exactly those IDs, then change the strings.

- [X] T031 [P] [US5] Enable R2, R3 and update `tests/unit/sidepanel/start-controls.test.tsx` expectations for `startErrorMessage`; change `src/entrypoints/sidepanel/start-messages.ts`
- [X] T032 [P] [US5] Enable R4 and update `tests/unit/sidepanel/language-picker.test.tsx`; change `src/entrypoints/sidepanel/components/LanguagePicker.tsx`
- [X] T033 [P] [US5] Enable D5, D6, R14, R15 and update `tests/integration/core/reconnecting-session.test.ts`; change `failureReason` and `reconnectingReason` in `src/core/session/reconnecting-session.ts` (time-limit reconnects carry no reason)
- [X] T034 [P] [US5] Enable R13 and update `tests/integration/core/meeting-runtime.test.ts`; change `micProblem` in `src/core/session/meeting-runtime.ts`
- [X] T035 [P] [US5] Enable R9, R10 and update `tests/unit/core/platform/generic-adapter.test.ts` and `tests/unit/core/speakers/watchdog.test.ts`; change `src/core/platform/generic-adapter.ts` and `WATCHDOG_REASON` in `src/core/speakers/watchdog.ts`
- [X] T036 [P] [US5] Enable D1–D4, R5–R8, R11, R12 (already satisfied by `status-view.ts` from T017 and `status.ts` from T015; the scanner confirms no old literal remains anywhere in `src/`) and remove any leftover literal it finds
- [X] T037 [P] [US5] Enable D7, D8 and update `tests/unit/core/account/usage.test.ts`; remove the two detail sentences in `describeAccount` in `src/core/account/usage.ts`; enable R27 (satisfied by T027) and confirm
- [X] T038 [P] [US5] Enable R16, R17 and update `tests/unit/core/status/status.test.ts` and `tests/unit/sidepanel/setup.test.tsx`; change `RETENTION.summary` in `src/core/status/status.ts` and the billing paragraph in `src/entrypoints/sidepanel/components/RetentionNotice.tsx`
- [X] T039 [P] [US5] Enable D10, D11, R18, R20, R21, R22 and update `tests/unit/sidepanel/settings.test.tsx`; change `src/entrypoints/sidepanel/components/Settings.tsx` (heading `Your name` removed, label kept; D11 is asserted in `settings.test.tsx` as no heading named `Your name` on the Settings screen)
- [X] T040 [US5] Enable R18 (setup half), R19 and update `tests/unit/sidepanel/setup.test.tsx` and `tests/e2e/setup.spec.ts`; change `src/entrypoints/sidepanel/components/Setup.tsx` (after T038, which also edits `setup.test.tsx`)
- [X] T041 [P] [US5] Enable R23, R24 and update `tests/unit/sidepanel/transcript.test.tsx`; change the title and screen-reader text in `src/entrypoints/sidepanel/components/Transcript.tsx`
- [X] T042 [P] [US5] Enable R25 and update `tests/unit/sidepanel/label-editor.test.tsx`; change `src/entrypoints/sidepanel/components/LabelEditor.tsx`
- [X] T043 [P] [US5] Enable R26 and update `tests/unit/mic-permission/mic-permission.test.ts`; change `MIC_PERMISSION_TEXT.why` in `src/entrypoints/mic-permission/permission.ts`
- [X] T044 [P] [US5] Enable R1 (the scanner reads the `wxt.config.ts` literal); change `description` in `wxt.config.ts`
- [X] T045 [US5] Add `tests/e2e/panel-layout.spec.ts` › "built output has no deleted copy": read every `.js`, `.html` and `manifest.json` under `.output/chrome-mv3-e2e/` and assert no enabled, non-DOM `absent` fragment from `tests/fixtures/copy/copy-review.json` occurs and that `manifest.json`'s `description` equals R1's replacement; it must pass with every entry enabled
- [X] T046 [US5] Write `tests/unit/copy/keep-strings.test.tsx`: render setup, main view (idle, running, start error, consent, delete confirm), Settings screen and the mic page text, and assert each Keep string from copy-review K1–K32 relevant to that state appears verbatim; fix any accidental change it finds by restoring the Keep text

**Checkpoint**: all 39 fixture entries enabled; scanner, built-output scan and Keep test green.

---

## Phase 8: Polish & cross-cutting

- [X] T047 Extend `tests/e2e/a11y.spec.ts`: axe on main view (idle, running, expanded status), Settings screen and setup, each under `page.emulateMedia({ colorScheme: 'light' })` and `'dark'` (SC-006); update its tab-order expectations to header order Start, Language, credits badge, Settings
- [X] T048 [P] Check contrast of every token pair used in `src/entrypoints/sidepanel/style.css` in both modes (text ≥ 4.5:1, dots and badge border ≥ 3:1, FR-020) with a unit test in `tests/unit/sidepanel/contrast.test.ts` that parses the token values from the stylesheet
- [X] T049 [P] Re-run 001 T091's long-transcript render test (`tests/unit/sidepanel/transcript-perf.test.tsx`) and add a case that switching screens (gear → Back) does not re-render transcript lines
- [X] T050 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:e2e`, `pnpm test:e2e`; then `codegraph sync`
- [X] T051 Walk `specs/006-panel-redesign/quickstart.md` manual steps in a real Meet call and record the result in `specs/006-panel-redesign/manual-check.md` (user-run); include the reviewer re-check from copy-review "Checking the result" on the built extension. Steps and results table written 2026-10-08; awaiting the user's real-Meet run — DONE 2026-10-09: user sign-off in a real Meet call (manual-check.md "Sign-off — 2026-10-09").
- [X] T052 Update `CHANGELOG.md`, ROADMAP row 006 status, and `CLAUDE.md` "Current status" (the user's hook may lock `CLAUDE.md`; if so, leave the status text for the user). CHANGELOG and ROADMAP (006 → in-progress) done; CLAUDE.md is hook-locked, so its status text is left for the user
- [ ] ~~T053~~ NOT NEEDED (user accepted FR-016's recommendation, 2026-10-08) — Only if the user rejects spec FR-016's recommendation: write a failing test in `tests/unit/sidepanel/status-view.test.ts` for a fifth idle `Retention` dot whose accessible name is the R16 summary, then add it in `src/entrypoints/sidepanel/status-view.ts`, and remove D12 from `copy-review.md` and the fixture

---

## Phase 9: Fix from the real call of 2026-10-12 — the panel page never scrolls (FR-023, SC-007)

**Goal**: only the transcript and the answers strip scroll on the main view; the header stays in view at any transcript length.

- [X] T054 Write a failing e2e test in `tests/e2e/panel-layout.spec.ts` › "the panel page never scrolls with a long transcript": at 400 × 870 with a stored meeting of about 1,500 lines and answers in the strip, `document.scrollingElement.scrollHeight <= clientHeight`, `scrollTop` is 0 and Start is inside the viewport, before and after a citation click; run it on the e2e build and record the failure. Red 2026-10-12: `overflow: 70432` (the document was 70,432 px taller than the 870 px panel)
- [X] T055 Make T054 pass with the minimum change in `src/entrypoints/sidepanel/style.css` (and `components/ask.css` if the answers strip has the same fault); the visually hidden text stays in the accessibility tree (existing tests that query it stay green). Done: `position: relative` on `.transcript-scroll`; the answers strip holds no visually hidden text and needed no change
- [X] T056 Add the manual step to `specs/006-panel-redesign/manual-check.md`, update `CHANGELOG.md`, and run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:e2e`, `pnpm test:e2e`

---

## Dependencies & execution order

- Phase 1 → Phase 2 → US1 (Phase 3). US2, US3 and US4 depend on Phase 2 and on T007 (header) but not on each other, except US4's T029 needs T023 (`useAccount`). US5 needs T002–T003; T036 needs T015 and T017; T037's R27 needs T027; T040 after T038. Polish last; T053 only on the user's answer to FR-016.
- Within each story: the test task before its implementation task; [P] tasks touch different files.

## Parallel examples

- After T007: T014/T016 (US2), T021/T022 (US3) and T026 (US4) can be written in parallel.
- In US5, T031–T044 touch disjoint files and can run in parallel, except T040, which follows T038; T045 and T046 follow.

## Implementation strategy

MVP is Phases 1–3 (transcript-first panel with Settings behind the gear). Then US2 and US3 (both P1), US5 (P1, mostly mechanical once the scanner exists), and US4 (P2). Commit after every task pair, per CLAUDE.md rule 4.
