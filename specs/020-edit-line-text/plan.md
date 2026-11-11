# Implementation Plan: Edit a line's text

**Branch**: `020-edit-line-text` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/020-edit-line-text/spec.md` (owner answers Q1 B, Q2 A, Q3 A of 2026-11-11; design decisions 111, 112).

## Summary

A stored line gains `textOverride` beside 002's `labelOverride`; `text` stays as transcribed. Every consumer reads a line's text through a new `displayText(segment)` helper, as it reads the label through `displayLabel`. In the main view a double-click on a settled line's text opens an inline editor with the double-clicked word selected; the label editor's new `Edit text` is the keyboard path. Saving travels the speaker override's path: a `text/override` command over the live port while the meeting runs, otherwise a direct repo write; `live/segment-updated` brings the line back. A corrected line shows a small `edited` mark, is never split by late captions, and is never removed as a repeat in the merged download. Auto-follow pauses while any editor is open. Past transcripts stay read-only.

Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/edit-text-ui.md](contracts/edit-text-ui.md), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript strict, Node 24 LTS, pnpm.

**Primary Dependencies**: WXT, React 19, `idb`. No new dependency.

**Storage**: IndexedDB `segments` gains the optional field `textOverride`; no schema version bump, no migration (`normaliseSegment` defaults it).

**Testing**: Vitest unit (protocol parse, `displayText`, split, chat context, citations, transcript file, merged file), integration (runtime command, split guard, repo transaction with fake-indexeddb), dom (text editor, transcript opening rules, follow pause, keyboard path, past transcript read-only), the copy scan and keep-strings tests; Playwright on the built e2e extension with the fixture provider.

**Target Platform**: Chrome ≥ 116 side panel, 320 px minimum width, light and dark.

**Project Type**: Browser extension (single project).

**Performance Goals**: opening the editor or saving re-renders only the edited line (memoised `Line`); a 5,000-line transcript keeps the existing `transcript-perf` bound.

**Constraints**: `chrome.*` stays in `src/entrypoints/`; core stays platform-free; no new network destination (FR-016); copy rule for the nine new strings (FR-017).

**Scale/Scope**: about 12 edited source files, 1 new component; about 12 test files edited or added; 1 e2e spec.

## Permission impact

None.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | The correction stays in IndexedDB and reaches only the chat provider already receiving the transcript for Ask (FR-016). No new destination, permission or key. |
| II. Grounded Answers, Raw Records | Pass | A correction is human-entered, not AI-generated, so it may be written into the transcript and its downloads. The transcribed original is kept and restorable; the line is visibly marked `edited`. Citations check against the text the user sees. |
| III. Test-First with Fixtures | Pass | Each task's test is written and seen failing first; e2e uses the fixture provider; a `manual-check.md` lists the real-call steps. |
| IV. Degrade Visibly, Never Lose the Transcript | Pass | Editing never pauses capture or storage; a refused save says so and keeps the typed text (FR-015). The known silent case (store failure inside the running meeting) is the same as 002's and leaves the line unchanged, never lost. |
| V. Isolate the Fragile Edges | Pass | No provider or platform code changes. |
| VI. Smallest Useful v1 | Pass | One field, one helper, one component; no edit history, no line deletion or merging. |

Re-check after design: unchanged. No deviation.

## Project Structure

### Documentation (this feature)

```text
specs/020-edit-line-text/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/edit-text-ui.md
├── checklists/requirements.md
├── tasks.md
└── manual-check.md
```

### Source Code (repository root)

```text
src/core/transcript/model.ts                       # edit: TranscriptSegment.textOverride
src/core/transcript/labels.ts                      # edit: displayText; normaliseSegment default
src/core/transcript/split.ts                       # edit: pieces reset textOverride
src/core/transcript/segment-builder.ts             # edit: new segments carry textOverride: null
src/core/messaging/protocol.ts                     # edit: parseLineText, text/override command, isSegment
src/core/session/meeting-runtime.ts                # edit: text/override command, isOverridden and split guard
src/core/chat/context.ts, src/core/chat/citations.ts           # edit: displayText
src/core/export/transcript-file.ts, merged-transcript.ts       # edit: displayText; corrected lines never removed as repeats
src/storage/meeting-repo.ts                        # edit: setTextOverride (clears summary)
src/entrypoints/sidepanel/meeting-api.ts           # edit: overrideText
src/entrypoints/sidepanel/App.tsx                  # edit: wires onOverrideText
src/entrypoints/sidepanel/components/Transcript.tsx    # edit: double-click, editor state, follow pause, edited mark
src/entrypoints/sidepanel/components/TextEditor.tsx    # new
src/entrypoints/sidepanel/components/LabelEditor.tsx   # edit: Edit text
src/entrypoints/sidepanel/style.css (or the transcript stylesheet)  # edit: editor and mark

tests/unit/core/messaging/protocol.test.ts, tests/unit/core/transcript/{labels,split}.test.ts
tests/unit/core/chat/{context,citations}.test.ts, tests/unit/core/export/{transcript-file,merged-transcript}.test.ts
tests/integration/core/meeting-runtime.test.ts, tests/integration/storage/meeting-repo.test.ts
tests/unit/sidepanel/{text-editor,transcript,label-editor,past-transcript,meeting-api}.test.ts(x)
tests/unit/copy/keep-strings.test.tsx, copy-review.test.ts, tests/fixtures/copy/copy-review.json
tests/e2e/edit-text.spec.ts                        # new
README.md, CHANGELOG.md, ROADMAP.md, specs/006-panel-redesign/copy-review.md, .specify/memory/design-decisions.md
```

**Structure Decision**: single project; the change follows 002's override path through core, storage and the side panel.

## Complexity Tracking

No violations.
