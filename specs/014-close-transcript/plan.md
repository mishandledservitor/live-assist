# Implementation Plan: Close transcript

**Branch**: `014-close-transcript` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-close-transcript/spec.md` (design decisions 91, 92).

## Summary

After Stop the main view can be cleared without deleting the meeting: a `Close transcript` button beside `Download transcript` and `Delete transcript`, and a clean main view on the next opening of the panel. Both reuse 012's clean main view unchanged: the remembered moment `mainViewClearedAt` in `chrome.storage.local` and the rule `showsOnMain` (012 research R5). Closing writes that moment, exactly as a delete on the main view does, without deleting. The opening clear is decided where the panel first picks the stored meeting to show: `useLive` passes `{ opening: true }` to `latestStored` for its first answer when no meeting is running, and `latestStored` then writes the moment instead of returning the meeting. A stopped meeting therefore shows only in a panel that stayed open across its Stop. No new storage key, message, permission or dependency.

Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/internal-api.md](contracts/internal-api.md), [contracts/close-ui.md](contracts/close-ui.md), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript strict, Node 24 LTS, pnpm.

**Primary Dependencies**: WXT, React 19. No new dependency.

**Storage**: unchanged. 012's `mainViewClearedAt` (`chrome.storage.local`) is written in two more cases; IndexedDB is untouched.

**Testing**: Vitest unit (node) for `createMeetingApi` (`latestStored` opening), Vitest dom (jsdom) for `useLive`, `useChat`, the `CloseTranscript` component and `App`; the copy scan and keep-strings tests; Playwright on the built e2e extension for close and reopen.

**Target Platform**: Chrome ≥ 116 side panel, 320 px minimum width, light and dark.

**Project Type**: Browser extension (single project).

**Performance Goals**: the main view is clean in the same render cycle as the storage write resolves (SC-001); opening adds at most one `chrome.storage.local` write.

**Constraints**: a running meeting is never cleared; nothing about a meeting record changes; `src/core/` untouched; `chrome.*` stays in `src/entrypoints/`; only the two strings of spec "Proposed copy".

**Scale/Scope**: 1 new component, about 5 edited source files; 2 new DOM test files, about 4 edited test files; e2e helpers adjusted for the opening clear.

## Permission impact

None.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | Nothing leaves the machine and nothing new is stored: the only write is 012's cleared moment, which names no meeting. Closing deletes nothing and implies no deletion (the label is `Close`, decision 92); real deletion stays with `Delete transcript`. |
| II. Grounded Answers, Raw Records | Pass | No AI text or transcript changes. A closed meeting cannot be asked about from the main view (decision 62); an answer in flight at Close is stopped, keeping what arrived as a stopped answer, as the answer's own Stop does. |
| III. Test-First with Fixtures | Pass | Every implementation task follows a failing test; fixtures are fake APIs, seeded IndexedDB and the fixture transcription provider in e2e. A `manual-check.md` lists the real-call steps. |
| IV. Degrade Visibly, Never Lose the Transcript | Pass | A failed Close says so (X2) and keeps the transcript; a failed opening write shows the meeting rather than hiding it. Every closed meeting stays on the Transcripts screen. Capture and persistence are untouched. |
| V. Isolate the Fragile Edges | Pass | No platform, vendor, credential or export code involved. The decision lives in the panel's meeting API (`src/entrypoints/sidepanel/meeting-api.ts`) over the existing `MainViewStore`. |
| VI. Smallest Useful v1 | Pass | No setting, key, store or message. The opening clear reuses 012's marker instead of a new "seen" flag (research R1). |

Re-check after design: unchanged. No deviation.

## Project Structure

### Documentation (this feature)

```text
specs/014-close-transcript/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── internal-api.md
│   └── close-ui.md
├── checklists/requirements.md
├── tasks.md
└── manual-check.md
```

### Source Code (repository root)

```text
src/entrypoints/sidepanel/hooks/useLive.ts             # edit: first answer with no running meeting asks latestStored({ opening: true })
src/entrypoints/sidepanel/meeting-api.ts               # edit: latestStored(options) clears on opening; LiveApi signature
src/entrypoints/sidepanel/hooks/useChat.ts             # edit: the meeting shown changes while an answer streams → stop it
src/entrypoints/sidepanel/components/CloseTranscript.tsx  # new: the button and its failure line
src/entrypoints/sidepanel/App.tsx                      # edit: Close beside Download and Delete; focus after closing

tests/unit/sidepanel/meeting-api.test.ts               # edit: opening cases
tests/unit/sidepanel/use-live.test.tsx                 # edit: opening flag cases
tests/unit/sidepanel/use-chat-close.test.tsx           # new: answer stopped when the meeting shown goes away
tests/unit/sidepanel/close-transcript.test.tsx         # new: component
tests/unit/sidepanel/app-close.test.tsx                # new: App, US1
tests/unit/sidepanel/fake-meeting-api.ts               # edit: records the opening flag
tests/unit/copy/keep-strings.test.tsx                  # edit: K46
tests/unit/copy/copy-review.test.ts, tests/fixtures/copy/copy-review.json  # edit: A11 (never-add list)
tests/e2e/close.spec.ts                                # new: close, reopen, opening clear, running meeting
tests/e2e/helpers.ts, tests/e2e/transcripts-helpers.ts # edit: seeded meetings are put back on the main view after the opening clear
other tests/e2e/*.spec.ts                              # edit where a reload after Stop expected the transcript
```

**Structure Decision**: single project; the change sits in the side panel entrypoint and reuses 012's storage.

## Complexity Tracking

No violations.
