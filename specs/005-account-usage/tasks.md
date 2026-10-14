---

description: "Task list for 005 Account & usage in panel"
---

# Tasks: Account & usage in panel

**Input**: Design documents from `specs/005-account-usage/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/account-messages.md, quickstart.md; 001 merged on main.

**Tests**: Required. Constitution III and CLAUDE.md rule 9: every test task is written first and seen failing for the right reason before the implementation task after it. No automated test may use the network or a real key; ElevenLabs answers come from recorded fixtures in `tests/fixtures/elevenlabs/subscription/` and, in e2e, from Playwright `context.route` stubs.

**Concurrency note**: another branch (`002-impl-polish`) edits side panel files. Keep UI in `AccountStatus.tsx` and `account-status.css`; change `App.tsx` and `main.tsx` by a few lines only; do not edit `style.css`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US3 from spec.md

---

## Phase 1: Setup

- [X] T001 Add recorded ElevenLabs fixture responses in `tests/fixtures/elevenlabs/subscription/`: `success.json` (tier `creator`, `character_count` 19360, `character_limit` 121000, `next_character_count_reset_unix` 1792454400 = 2026-10-20T00:00:00Z, plus other real fields such as `status`, `voice_limit`), `no-reset.json` (same, reset `null`), `zero-limit.json` (tier `free`, limit 0, count 0), `over-limit.json` (count above limit), `malformed.json` (`character_count` missing), `user-read-error.json` (status 401, body `{"detail":{"status":"missing_permissions","message":"The API key you used is missing the permission user_read to execute this operation."}}`), `invalid-key-error.json` (status 401, `{"detail":{"status":"invalid_api_key","message":"Invalid API key"}}`); each file `{ "status": number, "body": unknown }`. No key-shaped strings

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the shared types, the message and its validator, which every story uses.

- [X] T002 [P] Write failing tests in `tests/unit/core/messaging/account-protocol.test.ts` (own file, to keep clear of concurrent edits to `protocol.test.ts`): `parseCommand({type:'account/usage'})` accepts; `parseAccountUsageReply` accepts a valid ok reply and each error kind; rejects negative or non-finite numbers, a non-string tier, a string resetAt, an unknown kind, an `ok:true` without usage, and any reply carrying a secret-looking field (e.g. `apiKey`)
- [X] T003 Create `src/core/account/usage.ts` with `AccountUsage`, `AccountErrorKind`, `AccountUsageReply` (data-model.md); add `{ type: 'account/usage' }` to `Command` and `parseCommand`, and `parseAccountUsageReply` to `src/core/messaging/protocol.ts` (guarded by `containsSecretField`) so T002 passes

---

## Phase 3: User Story 1 — See my plan and how much is left at a glance (Priority: P1) — MVP

**Goal**: the one line and its detail, from a successful answer.

**Independent test**: with `success.json` the panel shows "Creator plan · 84% of credits left · renews in 12 days (Oct 20)" and the detail shows "19,360 of 121,000 credits used · 101,640 left".

- [X] T004 [P] [US1] Write failing tests in `tests/unit/core/account/usage.test.ts` for `describeAccount(usage, now, { ratePerMinute, timeZone })`: the acceptance line with rate `null`; with a rate (e.g. 45) the line gains "≈ 2,258 min of transcription" after the percentage (floor); detail sentences with exact numbers, what the credits cover, and why no minutes estimate is shown when the rate is null; floor rounding (e.g. 84.9% → 84%); "<1%" for a tiny remainder; 0% when over the limit; zero limit → "Free plan · no credit allowance reported" with no percentage; missing reset → no renewal part; renew today / in 1 day; tier `growing_business` → "Growing business plan"; tier null → "Unknown plan". Also a test that `REALTIME_STT_CREDITS_PER_MINUTE` is `null` (research R2 open question: a change must update the doc citation and this test) and that `describeAccount` uses it by default
- [X] T005 [US1] Implement `describeAccount`, `REALTIME_STT_CREDITS_PER_MINUTE` (doc comment citing elevenlabs.io/pricing and elevenlabs.io/pricing/api, research R2) and `ACCOUNT_ERROR_MESSAGES` in `src/core/account/usage.ts` so T004 passes
- [X] T006 [P] [US1] Write failing tests in `tests/unit/providers/account/elevenlabs-subscription.test.ts` for `fetchAccountUsage({ readKey, fetch, log })` with the fixtures: request is `GET https://api.elevenlabs.io/v1/user/subscription` with header `xi-api-key`; `success.json` → derived fields only (`resetAt` in ms, no extra properties); `no-reset.json` → `resetAt: null`; `zero-limit.json` → limit 0; `malformed.json` → `unknown`
- [X] T007 [US1] Implement `src/providers/account/elevenlabs-subscription.ts` so T006 passes
- [X] T008 [P] [US1] Write failing tests in `tests/unit/sidepanel/account-api.test.ts` for `createAccountApi({ sendCommand })`: sends `{type:'account/usage'}`; returns a valid reply unchanged; a malformed reply or a rejected `sendCommand` → `{ ok:false, kind:'unknown' }`
- [X] T009 [US1] Implement `src/entrypoints/sidepanel/account-api.ts` (`AccountApi`, `createAccountApi`, `chromeAccountApi`) so T008 passes
- [X] T010 [P] [US1] Write failing tests in `tests/unit/sidepanel/account-status.test.tsx`: with a fake API answering success, the region "ElevenLabs account" shows the line; the detail (a `<details>` with summary "Details") contains the exact numbers; while the first fetch is pending it says "Checking your ElevenLabs plan…"
- [X] T011 [US1] Implement `src/entrypoints/sidepanel/components/AccountStatus.tsx` and `account-status.css` so T010 passes
- [X] T012 [US1] Write a failing test in `tests/unit/sidepanel/app-account.test.tsx` (own file, see concurrency note) that the account region renders above the Start button when `App` is given an `account` API, and that App without one still renders (existing tests unchanged); then wire it: optional `account` prop on `App`/`Workspace` in `src/entrypoints/sidepanel/App.tsx`, `chromeAccountApi()` in `src/entrypoints/sidepanel/main.tsx`
- [X] T013 [US1] Write a failing test in `tests/unit/background/account-usage.test.ts` for `answerAccountUsage({ store, fetch })` in `src/entrypoints/background/account.ts` (reads the saved key through `SettingsStore` over the fake chrome storage, calls `fetchAccountUsage`, logs through `createLogger('account')`), then implement it and route `account/usage` to it in `src/entrypoints/background/index.ts`

**Checkpoint**: US1 works end to end in a build with a working key.

---

## Phase 4: User Story 2 — Understand why the status is missing (Priority: P1)

**Goal**: every failure is one plain sentence; Start unaffected.

**Independent test**: with `user-read-error.json` the line says "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io" and Start stays enabled.

- [X] T014 [P] [US2] Extend `tests/unit/providers/account/elevenlabs-subscription.test.ts` (failing first): `user-read-error.json` → `missing-permission`; a string detail mentioning `user_read` with status 403 → `missing-permission`; `invalid-key-error.json` → `invalid`; 429 → `rate-limited`; 500 → `unknown`; non-JSON error body with 401 → `invalid`; fetch rejects → `network`; no key → `missing` and `fetch` never called; the log sink receives one line per failure with the kind and status and never the key (assert the key string is absent from every logged argument and from the returned value)
- [X] T015 [US2] Extend `src/providers/account/elevenlabs-subscription.ts` with the error mapping (research R3) and redacted logging so T014 passes
- [X] T016 [P] [US2] Extend `tests/unit/sidepanel/account-status.test.tsx` (failing first): each error kind shows its `ACCOUNT_ERROR_MESSAGES` sentence; the permission message is exactly the spec wording
- [X] T017 [US2] Extend `AccountStatus.tsx` to show failures so T016 passes
- [X] T018 [US2] Add to `tests/unit/sidepanel/app-account.test.tsx` (failing first if it fails): with an account API that fails (permission) or never resolves, Start is enabled exactly as without it (FR-011, SC-005); fix if not

---

## Phase 5: User Story 3 — Keep the status current (Priority: P2)

**Goal**: refresh on open, after a meeting stops, and by button; never on a timer.

**Independent test**: open (1 fetch), refresh (2), meeting running → stopped (3); fake timers advanced 10 min add none.

- [X] T019 [P] [US3] Write failing tests in `tests/unit/sidepanel/account-status.test.tsx`: the refresh button (accessible name "Refresh account status") fetches again and is disabled while in flight, keeping the previous line visible; rerendering with `meetingRunning` true → false fetches once more; true → true or false → false does not; advancing fake timers by 10 minutes makes no fetch
- [X] T020 [US3] Implement the refresh button and the falling-edge refresh in `AccountStatus.tsx`; pass `meetingRunning={running}` from `Workspace` in `App.tsx`, so T019 passes

---

## Phase 6: Polish & cross-cutting

- [X] T021 Write `tests/e2e/account.spec.ts` (Playwright, e2e build): route `https://api.elevenlabs.io/v1/user/subscription` to `success.json` and the token endpoint to a fake token; set up with a fake key; the panel shows the Creator line and Start is enabled; reroute to `user-read-error.json`, press refresh, the permission sentence shows and Start is still enabled; the panel never contains the key
- [X] T022 [P] Add the `account/usage` command to `specs/001-capture-live-transcript/contracts/extension-messages.md` (one row pointing to `specs/005-account-usage/contracts/account-messages.md`)
- [X] T023 Run `pnpm lint`, `pnpm typecheck`, `pnpm test` (privacy guard included), `pnpm build`, `pnpm build:e2e`, `pnpm test:e2e`; fix root causes
- [X] T024 Write `specs/005-account-usage/manual-check.md`: steps and an empty results table for the real-account check (line matches the ElevenLabs subscription page, readable within 3 s and on one line at the default panel width (SC-001, SC-002); refresh; refresh after Stop; key without 'User: Read'; credits used by a timed meeting, for the research R2 rate)
- [ ] T025 Real-account check by the user, recorded in `manual-check.md` — needs a real key and a real meeting; the agent cannot run it. If step 5 shows realtime transcription draws credits at a steady rate, set `REALTIME_STT_CREDITS_PER_MINUTE` with the measurement as its citation and update its test
- [X] T026 Update `CHANGELOG.md` and ROADMAP status for 005

---

## Dependencies & execution order

- T001 → T002/T003 → stories. US1 (T004–T013) before US2 (T014–T018) because both extend the same files; US3 (T019–T020) after US1. Polish last; T025 is the user's.
- Parallel: T002 with T004 and T006 test writing; T008 and T010 test writing alongside T005/T007.

## Implementation strategy

MVP = Phases 1–3 (the line from a successful answer). US2 makes failures readable; US3 keeps it current. One branch, one PR.

## Implementation notes (2026-10-08)

- T018 and the "never on a timer" case of T019 passed on first run: they guard behaviour the earlier tasks already gave (Start never depends on the account line; nothing schedules a fetch). Every other test was seen failing for the right reason first.
- The refresh button uses `aria-disabled` rather than `disabled` while a fetch is in flight: a disabled button drops keyboard focus and leaves the tab order, which the a11y e2e caught (FR-013 reworded).
- `tests/e2e/fixtures.ts` `launchExtension` now aborts the subscription endpoint by default, so no e2e spec reaches ElevenLabs when the panel opens; `account.spec.ts` routes it itself. `a11y.spec.ts` focus order now starts with "Refresh account status" (the account line is visually first).
- Open question (research R2): the credits-per-minute rate for realtime transcription through the API; `REALTIME_STT_CREDITS_PER_MINUTE` is `null` until T025 step 5 measures it.
