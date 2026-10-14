# Implementation Plan: Side-panel redesign

**Branch**: `006-panel-redesign` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-panel-redesign/spec.md`

## Summary

Presentation-only rework of the side panel plus the string changes in [copy-review.md](copy-review.md). `App` gains a screen state (`main` | `settings`); the main view (`Workspace`) stays mounted and is hidden while Settings shows, so the live port, scroll position and in-progress lines survive (FR-012). A new `PanelHeader` holds Start/Stop, the language picker, a `CreditsBadge` and the gear. `StatusBar` becomes `StatusLine`: a pure view function `statusDots(snapshot)` derives four dots and the list of problems, and the component renders one line of dots that expands only when a dot is in the error tone. The 005 `AccountStatus` splits into a shared fetch hook (`useAccount`), the header badge (`describeBadge`, pure, in `src/core/account/usage.ts`) and an `AccountDetails` section on the Settings screen. `RetentionNotice` moves into Settings (and stays in setup). Strings change exactly as the copy review lists, in the components and in the core/provider modules that produce reasons. A string-literal scanner test (TypeScript compiler API over `src/`) and a built-output scan in the e2e suite enforce the Delete and Rewrite lists from one fixture. CSS becomes a full-height flex column on the existing light/dark tokens. Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/panel-ui.md](contracts/panel-ui.md), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.9 strict (as 001).

**Primary Dependencies**: as 001 (WXT 0.21.x, React 19). No new runtime dependencies; the copy scanner uses the `typescript` package already in devDependencies.

**Storage**: none new. Screen state is not persisted.

**Testing**: Vitest — `statusDots` and `describeBadge` (unit, node); `StatusLine`, `PanelHeader`, `CreditsBadge`, `SettingsScreen`, `App` screen switching and focus (dom, jsdom with fake APIs); rewritten reason strings in `status.ts`, `reconnecting-session.ts`, `meeting-runtime.ts`, `generic-adapter.ts`, `watchdog.ts`, `usage.ts`, `permission.ts` (unit, updating existing tests first); copy scanner (unit, node). Playwright — layout (transcript share of height, one-line status), Settings round trip during a running fixture meeting, badge → account section, axe in light and dark (`page.emulateMedia({ colorScheme })`), and the built-output copy scan.

**Target Platform**: Chrome ≥ 116 desktop side panel, 320 px minimum width.

**Project Type**: Browser extension (single project).

**Performance Goals**: no regression on 001 T091's long-transcript rendering; switching screens does not re-render transcript lines.

**Constraints**: Do not touch Meet adapter internals or the 002 label editor beyond R25's label (they are on `002-impl-polish` until it merges). No new settings, permissions or messages. Implementation starts only after `002-impl-polish` merges into `main`.

**Scale/Scope**: about 20 source files touched; 12 Delete and 27 Rewrite entries in the copy review (some entries cover several literals).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | No new destination or data. Consent reminder (K1) unchanged and still on every Start. The retention disclosure keeps its full content (R16 drops only the opt-out clause that K15 states in full directly below it) and stays in setup; it moves from the main view to the Settings screen. Mute privacy fact kept in plain words (R12). |
| II. Grounded Answers, Raw Records | Pass | Confirmed vs fallback labels keep their visual distinction and their screen-reader text (R23/R24 change words, not the distinction). No AI text involved. |
| III. Test-First with Fixtures | Pass | Every task writes or updates its test first and sees it fail. No network or real key: account replies and status snapshots are fixtures/fakes; e2e uses the existing fixture transcription provider. |
| IV. Degrade Visibly | Pass, with a reading to confirm | Each dependency keeps a visible dot with its state as text, and any failure expands with its reason and action (FR-006/007). Retention is shown on the Settings screen inside the side panel rather than on the main view: it is a fixed fact, not a state that changes during a meeting, and the consent reminder names ElevenLabs on every Start. This reading is spec FR-016's open question; if the user rejects it, a fifth idle "Retention" dot whose accessible name is the R16 summary is added (one task, T-level change only). The "Others" fallback still says why via the speaker-names reason (R9, K22). |
| V. Isolate the Fragile Edges | Pass | No adapter or provider contract changes; only the reason strings they emit (copy review) and the core status type gains an `idle` speaker-names state. |
| VI. Smallest Useful v1 | Pass | No new settings, dependencies or abstractions beyond two pure view functions the spec needs. No chat placeholder (003 is later). |

Post-design re-check (after Phase 1): unchanged — the design adds `useAccount`, `statusDots`, `describeBadge`, `PanelHeader`, `StatusLine`, `CreditsBadge`, `SettingsScreen`, `AccountDetails`; none adds a dependency, permission, setting or network path.

## Project Structure

### Documentation (this feature)

```text
specs/006-panel-redesign/
├── spec.md
├── copy-review.md        # the string-by-string brief (FR-017)
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── panel-ui.md       # screens, regions, accessible names, focus rules
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── account/usage.ts            # D7, D8 detail; describeBadge() (new)
│   ├── platform/generic-adapter.ts # R9
│   ├── session/meeting-runtime.ts  # R13
│   ├── session/reconnecting-session.ts # D5, D6/R15, R14
│   ├── speakers/watchdog.ts        # R10
│   └── status/status.ts            # D3, R12, R16; speakerNames 'idle' state
├── entrypoints/
│   ├── mic-permission/permission.ts # R26
│   └── sidepanel/
│       ├── App.tsx                 # screen state, hidden h1, Workspace kept mounted
│       ├── status-view.ts          # statusDots() (new, pure)
│       ├── start-messages.ts       # R2, R3
│       ├── hooks/useAccount.ts     # fetch triggers moved out of AccountStatus (new)
│       ├── style.css               # full-height layout, dots, badge, tokens
│       └── components/
│           ├── PanelHeader.tsx     # Start/Stop, language, badge, gear (new)
│           ├── CreditsBadge.tsx    # (new)
│           ├── StatusLine.tsx      # replaces StatusBar.tsx
│           ├── SettingsScreen.tsx  # Back + Settings + AccountDetails + RetentionNotice (new)
│           ├── AccountDetails.tsx  # replaces AccountStatus.tsx (D9)
│           ├── StartControls.tsx   # split: start/stop into header; errors, consent, delete stay
│           ├── Settings.tsx        # D10, D11, R18, R20, R21, R22
│           ├── Setup.tsx           # R18, R19
│           ├── RetentionNotice.tsx # R17
│           ├── LanguagePicker.tsx  # R4
│           ├── LabelEditor.tsx     # R25
│           └── Transcript.tsx      # R23, R24; Delete-transcript slot after the last line
wxt.config.ts                       # R1

tests/
├── fixtures/copy/copy-review.json  # Delete/Rewrite fragments, one source for both scans (new)
├── unit/copy/copy-review.test.ts   # string-literal scan of src/ (new)
├── unit/sidepanel/*.test.tsx       # updated + new component tests
├── unit/core/...                   # updated reason-string tests
└── e2e/panel-layout.spec.ts        # layout, Settings round trip, badge, built-output scan (new); a11y.spec.ts extended
```

**Structure Decision**: single extension project as in 001; all UI work in `src/entrypoints/sidepanel/`, with the two pure derivations in testable modules (`status-view.ts` in the panel, `describeBadge` in `src/core/account/usage.ts` next to `describeAccount`).

## Complexity Tracking

No violations to justify.
