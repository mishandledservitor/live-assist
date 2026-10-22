# Implementation Plan: Settings layout

**Branch**: `018-settings-layout` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/018-settings-layout/spec.md` (design decisions 105-107) and the review `input-2026-10-22.md`.

## Summary

The Settings screen is recomposed into three groups, **Transcription**, **Speaker names** and **Questions** (decision 105), each a `section` with an `h3`; what were the screen's `h3` sub-headings (`ElevenLabs API key`, `ElevenLabs account`, `What ElevenLabs keeps`, `Key terms`, `Remembered names`, the chat key and `What … keeps`) become `h4` inside their group. `RetentionNotice` and `ChatRetention` move from the bottom of the screen (`App.tsx`) into `Settings` and `ChatSettings`, each right after its key. One shared `KeyBlock` component draws a key as one line, `Saved key: ••••{hint}` with `Replace` and `Remove`; `Replace` swaps the line for the key field with `Check and save` and `Cancel` (Escape cancels); with no key saved the field shows at once beside `No key saved.` (decision 106). Questions mounts the key block of the selected provider only (decision 107). The review's four Deletes go, the account error is rewritten and the refresh control shows `Check again`. CSS puts each field and its button on one flex line that wraps only when the width forces it, and drops the key-term bullets. No setting's stored value, default or effect changes; setup is untouched.

Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/settings-ui.md](contracts/settings-ui.md), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript strict, Node 24 LTS, pnpm.

**Primary Dependencies**: WXT, React 19. No new dependency.

**Storage**: none changed (`chrome.storage.local` settings and keys as before; IndexedDB untouched).

**Testing**: Vitest dom (jsdom) for `Settings`, `ChatSettings`, `AccountDetails` and the composed screen in `App`; the copy scan and keep-strings tests; Playwright on the built e2e extension for widths (320 px, 380 px) and the screen's height (SC-002).

**Target Platform**: Chrome ≥ 116 side panel, 320 px minimum width, light and dark.

**Project Type**: Browser extension (single project).

**Performance Goals**: n/a (layout only).

**Constraints**: the review's lists applied exactly (FR-011); setup unchanged and its tests passing; `chrome.*` stays in `src/entrypoints/`; no new helper text.

**Scale/Scope**: about 8 edited source files (`App.tsx`, `Settings.tsx`, `ChatSettings.tsx`, `RememberedNames.tsx`, `RetentionNotice.tsx`, `ChatRetention.tsx`, `AccountDetails.tsx`, `usage.ts`, `style.css`) and one new component (`KeyBlock.tsx`); the Settings DOM tests, copy tests and two e2e specs edited.

## Permission impact

None.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | The three retention disclosures stay word for word and move beside the key they are about (FR-003), so each is read where the key is entered. The consent-reminder setting keeps its label and default. Keys are still shown only as `••••{hint}` and never stay in a field after a check. |
| II. Grounded Answers, Raw Records | Pass | No transcript, answer or export changes. |
| III. Test-First with Fixtures | Pass | Each task's DOM or e2e test is written and seen failing first; fakes and the e2e fixture build, no network. |
| IV. Degrade Visibly | Pass | The account error now says what to do (`Check again`); no status is removed. |
| V. Isolate the Fragile Edges | Pass | No provider, platform or credential code changes; the key check still goes through `SettingsApi`. |
| VI. Smallest Useful v1 | Pass | No setting added; one small component (`KeyBlock`) replaces two copies of the same markup. |

Re-check after design: unchanged. No deviation.

## Project Structure

### Documentation (this feature)

```text
specs/018-settings-layout/
├── spec.md
├── input-2026-10-22.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/settings-ui.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/entrypoints/sidepanel/components/KeyBlock.tsx        # new: one-line key block (masked key, Replace, Remove; field with Check and save, Cancel)
src/entrypoints/sidepanel/components/Settings.tsx        # edit: three groups; ElevenLabs KeyBlock + account + RetentionNotice; deleted headings
src/entrypoints/sidepanel/components/ChatSettings.tsx    # edit: selected provider's KeyBlock only, then ChatRetention
src/entrypoints/sidepanel/components/RememberedNames.tsx # edit: h4, sentence deleted
src/entrypoints/sidepanel/components/RetentionNotice.tsx # edit: headingLevel 4 allowed
src/entrypoints/sidepanel/components/ChatRetention.tsx   # edit: headingLevel 4 allowed
src/entrypoints/sidepanel/components/AccountDetails.tsx  # edit: h4, visible `Check again`
src/core/account/usage.ts                                # edit: network error rewrite
src/entrypoints/sidepanel/App.tsx                        # edit: retention texts no longer appended after Settings
src/entrypoints/sidepanel/style.css                      # edit: groups, one-line rows, no key-term bullets

tests/unit/sidepanel/settings.test.tsx, chat-settings.test.tsx, settings-screen.test.tsx, chat-retention.test.tsx,
  app-ask.test.tsx, app-ask-off.test.tsx, app-setup-gating.test.tsx      # edit: positions and reviewed strings; new cases
tests/unit/copy/keep-strings.test.tsx, copy-review.test.ts, tests/fixtures/copy/copy-review.json  # edit
tests/e2e/panel-layout.spec.ts                           # edit: 320 px / 380 px and SC-002 height
tests/e2e/a11y.spec.ts, account.spec.ts, ask-settings.spec.ts, transcripts.spec.ts  # edit: reviewed strings
README.md, CHANGELOG.md, ROADMAP.md, specs/006-panel-redesign/copy-review.md       # edit
```

**Structure Decision**: single project; the change sits in the side panel's Settings components and one core string.

## Complexity Tracking

No violations.
