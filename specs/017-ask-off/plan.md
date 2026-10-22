# Implementation Plan: Turn Ask off

**Branch**: `017-ask-off` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/017-ask-off/spec.md` (design decisions 102, 103; 104 keeps the rest of the Settings screen for 018).

## Summary

One new setting, `askEnabled` (default `true`), stored with the other settings in `chrome.storage.local`. The side panel reads it at every render of the main view and the Settings screen: while it is `false`, `MainView` mounts neither `AskArea` (conversation strip, question box, `Ask`/`Stop`, missing-key line, model label, meeting notes) nor the next-meeting `NotesControl`, and Settings shows the tick box `Ask questions about the meeting` under **Questions** without the provider, model, key sections or `ChatRetention`. Turning it off unmounts `AskArea`, whose existing 014 cleanup (`useChat`, research R3 of 014) stops a streaming answer with `chat/stop`, and the waiting question and unsent box text go with the component's state. Setup accepts an empty chat key; finishing that way saves `askEnabled: false` with `chat.setupComplete: true`. No new message, permission, store or dependency; the service worker is unchanged.

Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/ask-off-ui.md](contracts/ask-off-ui.md), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript strict, Node 24 LTS, pnpm.

**Primary Dependencies**: WXT, React 19. No new dependency.

**Storage**: `chrome.storage.local` settings object gains one boolean field `askEnabled`; IndexedDB untouched (chat turns and notes are kept).

**Testing**: Vitest unit (node) for `parseSettings`/`DEFAULT_SETTINGS`; Vitest dom (jsdom) for `App` (main view in each state, Settings, setup, in-flight answer); the copy scan and keep-strings tests; Playwright on the built e2e extension for turning Ask off and reopening the panel.

**Target Platform**: Chrome ≥ 116 side panel, 320 px minimum width, light and dark.

**Project Type**: Browser extension (single project).

**Performance Goals**: the main view changes in the same render as the tick box (FR-006); one `chrome.storage.local` write per change.

**Constraints**: nothing stored is deleted (FR-005); one new string (FR-010, decision 103); no other Settings copy or layout changes (decision 104); `chrome.*` stays in `src/entrypoints/`.

**Scale/Scope**: about 5 edited source files (`schema.ts`, `App.tsx`, `Settings.tsx`, `ChatSettings.tsx`, `Setup.tsx`); 1 unit test file and 2-3 DOM test files edited or added; 1 e2e spec.

## Permission impact

None.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | Off means fewer destinations: the panel sends no question, so nothing reaches OpenAI or Anthropic (FR-004). Keys stay in `chrome.storage.local`; nothing is deleted. The retention text for the chat provider is hidden only while no chat provider can receive anything; it shows again with Ask. The ElevenLabs retention notice is unchanged. |
| II. Grounded Answers, Raw Records | Pass | No answer, transcript or export changes. Notes stay attached and are never written into a download. |
| III. Test-First with Fixtures | Pass | Every implementation task follows a failing test (fake APIs in DOM tests, the fixture provider in e2e). A short `manual-check.md` lists the steps for a real panel. |
| IV. Degrade Visibly, Never Lose the Transcript | Pass | Transcription, persistence and status are untouched (FR-009). The chat-provider status is shown only with Ask (there is no chat provider to report on while it is off). |
| V. Isolate the Fragile Edges | Pass | No provider, platform or credential code changes. |
| VI. Smallest Useful v1 | Pass | The setting is justified by the spec (owner request, FR-001). One boolean, no new abstraction. |

Re-check after design: unchanged. No deviation.

## Project Structure

### Documentation (this feature)

```text
specs/017-ask-off/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ask-off-ui.md
├── checklists/requirements.md
├── tasks.md
└── manual-check.md
```

### Source Code (repository root)

```text
src/core/settings/schema.ts                              # edit: Settings.askEnabled, default true, parsed with bool()
src/entrypoints/sidepanel/App.tsx                        # edit: MainView drops AskArea and next-meeting notes when off; ChatRetention only when on
src/entrypoints/sidepanel/components/Settings.tsx        # edit: passes askEnabled and its save to ChatSettings
src/entrypoints/sidepanel/components/ChatSettings.tsx    # edit: the tick box first under Questions; provider, model and keys only when on
src/entrypoints/sidepanel/components/Setup.tsx           # edit: empty chat key allowed; saves askEnabled false; confirmation shows the ElevenLabs key alone

tests/unit/core/settings/settings.test.ts               # edit: default and parse
tests/unit/sidepanel/app-ask-off.test.tsx                # new: main view states, Settings, in-flight answer, nothing sent
tests/unit/sidepanel/setup.test.tsx, setup-chat.test.tsx # edit: empty chat key finishes setup with Ask off
tests/unit/copy/keep-strings.test.tsx, copy-review.test.ts, tests/fixtures/copy/copy-review.json  # edit: K48 / A13
tests/e2e/ask-off.spec.ts                                # new
README.md, CHANGELOG.md, ROADMAP.md, specs/006-panel-redesign/copy-review.md  # edit
```

**Structure Decision**: single project; the change sits in the settings schema and the side panel entrypoint.

## Complexity Tracking

No violations.
