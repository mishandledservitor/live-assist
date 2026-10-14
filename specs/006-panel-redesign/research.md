# Research: Side-panel redesign

## R1 — Switching between main view and Settings

- **Decision**: `App` holds `screen: 'main' | 'settings'` in React state. Both screens are rendered once setup is complete; the inactive one carries the `hidden` attribute. No router.
- **Rationale**: `useLive` (the live port and the transcript state) lives in `Workspace`. Unmounting it while Settings is open would close and reopen the port and lose the scroll position and the in-progress line; keeping it mounted satisfies FR-012 with no protocol change. `hidden` removes the inactive screen from the accessibility tree and from tab order.
- **Alternatives**: unmount and rely on the live port's snapshot on reconnect (works for finished lines, loses scroll position and is a needless reconnect); a Chrome options page (rejected by decision 32); CSS-only overlay (leaves the main view in the tab order).

## R2 — Status line as a pure derivation

- **Decision**: `statusDots(snapshot): { dots: Dot[]; problems: Dot[] }` in `src/entrypoints/sidepanel/status-view.ts`, where `Dot = { key, label, tone, text, action? }`. It holds every status string the panel shows (K21, R5–R8, R11, R12). `StatusLine` only renders it.
- **Rationale**: the string rules (D1–D4, R5–R12) and the expansion rule (FR-007: expand only on `error` tone) become node unit tests over fixture snapshots, independent of markup.
- **Alternatives**: keep the per-row functions inside the component (today's shape) — testable only through the DOM, which makes the copy assertions slower and more brittle.

## R3 — Idle speaker names

- **Decision**: add `'idle'` to `StatusSnapshot['speakerNames']['state']`; `initialStatus()` returns `{ state: 'idle', reason: '' }` (D3). `statusDots` renders idle as `Not running`, tone `idle`.
- **Rationale**: today's initial `unavailable` + "Speaker names start with transcription." produces "Not available here — every line is labelled Others — Speaker names start with transcription." before any meeting, which is wrong and is an announcement. `isStatus` in the protocol does not validate the state value, so the message contract is unchanged.
- **Alternatives**: special-case the reason text in the panel (keeps a misleading state in core).

## R4 — Account fetch shared by badge and Settings

- **Decision**: move 005's fetch and triggers (mount, falling edge of `meetingRunning`, refresh, in-flight guard) from `AccountStatus` into `hooks/useAccount.ts`, called once in `App`; pass `{ reply, busy, refresh }` to `CreditsBadge` (header) and `AccountDetails` (Settings). `describeBadge(reply, now)` in `src/core/account/usage.ts` returns `{ text, mark: 'ok' | 'neutral' | 'problem' | 'loading', name }`, reusing `describeAccount` for the name.
- **Rationale**: one request per trigger (005 FR-008) even though two places show the result; 005's tests for triggers move to the hook unchanged in substance.
- **Alternatives**: two `AccountStatus` instances (double requests); badge-only with no Settings section (loses the detail decision 32 puts in Settings).

## R5 — Enforcing the copy review

- **Decision**: one fixture, `tests/fixtures/copy/copy-review.json`, lists for each Delete/Rewrite ID the fragments that must be absent (`absent`) and present (`present`); placeholders are split out so each fragment is a literal run of characters as it appears in a source literal. Two checks read it:
  1. `tests/unit/copy/copy-review.test.ts` parses every `.ts`/`.tsx` under `src/` (except `entrypoints/spike-recorder/`) with the TypeScript compiler API and collects string literals, template literal pieces and JSX text — comments and identifiers are excluded, so a code comment mentioning "fallback label" does not trip it. It also reads `wxt.config.ts` and the `.html` entrypoints' text.
  2. `tests/e2e/panel-layout.spec.ts` scans the built `.output/chrome-mv3-e2e/` JS/HTML/manifest for the `absent` fragments (runs after `build:e2e` in CI).
  Rendered-text component tests cover the Keep strings for each state.
- **Rationale**: the skill asks for a checkable list; the source scan gives fast, precise failures at the literal, and the build scan proves nothing slipped in through another path. Fragments that collide with Keep strings are written in full (e.g. `Connection to ElevenLabs lost — reconnecting`, not `— reconnecting`, which also occurs in K22's `The Meet page reloaded — reconnecting…`). The main-view `Retention` label is checked by a DOM test, not a text scan, because `RETENTION` is also an identifier.
- **Alternatives**: plain `grep` over `src/` (matches comments and identifiers); snapshot tests of whole components (hide which string changed).

## R6 — Layout and style

- **Decision**: `body` and `#root` are full height; `main` is a flex column: visually hidden `h1`, header (flex row, no wrap, `gap: 6px`; the language `select` has `min-width: 0; flex: 0 1 auto` so it shrinks first), notices, status line, transcript (`flex: 1; min-height: 0; overflow-y: auto`), replacing today's `max-height: 60vh`. Status dots: 8 px; `ok` filled with `--ok`, `busy` filled with `--muted`, `idle` hollow ring, `error` a filled square in `--error` (FR-021: shape differs, not hue alone), each followed by a short word (spec open question, recommended). Badge: 12 px pill with `--line` border; problem mark `!`. Colours stay on the existing `:root` tokens with the existing `prefers-color-scheme: dark` overrides, adding `--ok` and `--accent` in both modes; primary button uses `--accent`. One stylesheet; `account-status.css` is folded into it.
- **Rationale**: plain, calm, dense-but-readable; tokens already respect dark mode; shape-coded error meets WCAG 1.4.1.
- **Alternatives**: icon font or SVG icons (new asset, no gain); CSS framework (new dependency, Principle VI).

## R7 — Focus and keyboard

- **Decision**: opening Settings focuses its `h2` "Settings" (`tabIndex={-1}`); Back and Escape return to `main` and focus the gear (a ref). Escape is ignored when the event target is an `input`, `textarea` or `select`, and when the label editor or a confirmation handles it first (they already stop propagation). Opening Settings while the consent reminder is open cancels the reminder (spec edge case). The badge opens Settings and calls `scrollIntoView` on `#account-heading`, then focuses it.
- **Rationale**: matches the existing focus-return pattern (T092) and WAI-ARIA expectations for a view switch.

## R8 — Retention under constitution IV

- **Decision**: proceed on the spec's recommendation (FR-016): retention appears on the Settings screen and in setup, not on the main view; the plan's Constitution Check records the reading. If the user answers otherwise, add a fifth idle dot whose accessible name is the R16 summary, with a link to the Settings section (one task).
- **Rationale**: retention is a fixed property of the provider, not a live state; the main view is reserved for things that change during a meeting (decision 32).

## R9 — Delete transcript placement

- **Decision**: proceed on the spec's recommendation (FR-013): `Transcript` takes an optional `footer` slot rendered after the last line of a stopped meeting; `StartControls`' delete button and confirmation render there. Focus return to the delete button after Cancel is kept.
- **Alternatives**: header overflow menu (adds a control and copy); Settings screen (acts on a transcript from a different screen).
