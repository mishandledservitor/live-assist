# Implementation Plan: Account & usage in panel

**Branch**: `005-account-usage` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-account-usage/spec.md`

## Summary

A new `account/usage` command (side panel → service worker) returns either the derived account fields (plan tier, credits used, credit limit, reset time in ms) or an error kind. The service worker reads the key, calls `GET https://api.elevenlabs.io/v1/user/subscription` with `xi-api-key`, maps the answer in a new provider module (`src/providers/account/`), and logs failures only through the redacting logger. A pure core module (`src/core/account/usage.ts`) holds the types, the one rate constant `REALTIME_STT_CREDITS_PER_MINUTE` and `describeAccount()`, which turns the fields into the one-line summary and the detail text. A new `AccountStatus` component, rendered first in the workspace, fetches on mount, after a running meeting ends, and on its refresh button. The ElevenLabs docs do not state a credit rate for realtime transcription and say API usage is billed in dollars (research R2), so the constant is `null` and the line shows the percentage only, with the detail saying what it covers. Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/account-messages.md](contracts/account-messages.md), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.9 strict (as 001).

**Primary Dependencies**: as 001 (WXT 0.21.x, React 19). No new dependencies.

**Storage**: none new. The key is read from `chrome.storage.local` by the existing `SettingsStore` in the service worker only. The status is not cached.

**Testing**: Vitest — `describeAccount` and the rate constant (unit), the subscription mapper with recorded fixture responses (success, `user_read` permission error, 401, network failure, missing reset date, zero limit, malformed), the protocol validator, the panel API and the `AccountStatus` component (jsdom, fake API). Playwright — the e2e build with `context.route` stubbing the subscription endpoint: success line, then permission-error line, Start still enabled. Privacy guard test unchanged and must pass.

**Target Platform**: Chrome ≥ 116 desktop (as 001).

**Project Type**: Browser extension (single project).

**Performance Goals**: one request per trigger; the line appears as soon as the reply arrives (one network round trip).

**Constraints**: the key never leaves the service worker (FR-009); no polling (FR-008); no new host permission (already `https://api.elevenlabs.io/*`); never affects Start (FR-011).

**Scale/Scope**: one account, a handful of requests per day.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | No new destination: the request goes to ElevenLabs, already the only host permission. Only the key leaves the machine (as a header to ElevenLabs), no audio or transcript. The key stays in the service worker; the reply carries four derived fields or an error kind and passes the existing `containsSecretField` guard. Failures log only the kind and HTTP status through `createLogger`. |
| II. Grounded Answers, Raw Records | Pass | No figure is invented: the minutes estimate appears only if the rate constant is set from a cited source (FR-005/FR-006); today it is `null` (R2). The percentage is labelled with what it covers. |
| III. Test-First with Fixtures | Pass | Recorded JSON fixtures for every response shape; e2e stubs the endpoint with Playwright routing; no network or real key. Real-account check recorded in `manual-check.md`. |
| IV. Degrade Visibly | Pass | Every failure kind has a sentence on the line (FR-010); Start unaffected (FR-011). |
| V. Isolate the Fragile Edges | Pass with note | Vendor wire format confined to `src/providers/account/elevenlabs-subscription.ts`; core sees only `AccountUsage`. The account fetch uses the saved key directly rather than going through `CredentialSource`: the contract is about transcription credentials, and a future company backend would answer for a company account, so this feature would then be hidden or re-pointed (recorded in Complexity Tracking). |
| VI. Smallest Useful v1 | Pass | No polling, no cache, no history of usage, no new setting. The component reads one command. |

**Post-design re-check (after Phase 1)**: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/005-account-usage/
├── spec.md
├── plan.md                    # this file
├── research.md                # R1–R6
├── data-model.md              # AccountUsage, AccountErrorKind, AccountSummary
├── quickstart.md
├── contracts/account-messages.md
├── checklists/requirements.md
├── manual-check.md            # real-account check (created during implement)
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── account/usage.ts               # NEW types, REALTIME_STT_CREDITS_PER_MINUTE, describeAccount(), error messages
│   └── messaging/protocol.ts          # + 'account/usage' command, parseAccountUsageReply
├── providers/account/
│   └── elevenlabs-subscription.ts     # NEW fetchAccountUsage(): GET /v1/user/subscription → AccountUsageReply
└── entrypoints/
    ├── background/account.ts          # NEW answerAccountUsage(): key from SettingsStore → fetchAccountUsage
    ├── background/index.ts            # + case 'account/usage'
    └── sidepanel/
        ├── account-api.ts             # NEW AccountApi over sendCommand, validates the reply
        ├── components/AccountStatus.tsx   # NEW the line, detail, refresh button
        ├── components/account-status.css  # NEW styles (kept out of style.css to avoid conflicts with 002 polish)
        ├── App.tsx                    # + optional `account` prop; AccountStatus first in Workspace
        └── main.tsx                   # wires chromeAccountApi

tests/
├── fixtures/elevenlabs/subscription/  # NEW recorded responses (*.json)
├── unit/core/account/usage.test.ts
├── unit/core/messaging/protocol.test.ts      # + account cases
├── unit/providers/account/elevenlabs-subscription.test.ts
├── unit/sidepanel/account-api.test.ts
├── unit/sidepanel/account-status.test.tsx
└── e2e/account.spec.ts
```

**Structure Decision**: same layering as 001: vendor wire format in `providers/`, pure formatting in `core/`, `chrome.*` only in entrypoints. UI in its own component and stylesheet; shared panel files (`App.tsx`, `main.tsx`) change by a few lines only, because another branch (`002-impl-polish`) is editing the panel concurrently.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| Account fetch reads the local key directly instead of adding a method to `CredentialSource` | Account status is a property of the user's own ElevenLabs account, which only exists with bring-your-own keys | Adding `getAccountUsage()` to the credential contract would make every future source (company backend) implement a personal-account feature it cannot meaningfully answer; Principle VI |
