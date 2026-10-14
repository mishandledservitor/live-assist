# Implementation Plan: Download transcript

**Branch**: `007-download-transcript` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-download-transcript/spec.md`

## Summary

A `Download transcript` button in the transcript footer saves the meeting the panel shows as `Meeting — DD-MM-YYYY at HHhMM.txt` in 004's inbox format (design decision 48). A platform-free formatter in `src/core/export/transcript-file.ts` builds the name and body from the meeting and its segments, using `displayLabel` for speakers and skipping pending lines; 004 reuses it. The panel saves the result with a blob-URL anchor download (`src/entrypoints/sidepanel/save-file.ts`), so no `downloads` permission and no permission warning (research R1). Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/download-ui.md](contracts/download-ui.md), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript strict (as 001).

**Primary Dependencies**: as 001 (WXT, React 19). No new dependencies.

**Storage**: none new; reads the meeting and segments the panel already holds.

**Testing**: Vitest unit (node) for the formatter; dom (jsdom) for `saveTextFile`, `DownloadTranscript`, `App` placement and the K40 keep string; Playwright `download.spec.ts` for the real download (stored meeting with a question asked; running fixture meeting).

**Target Platform**: Chrome ≥ 116 side panel, 320 px minimum width.

**Project Type**: Browser extension (single project).

**Performance Goals**: building a 5,000-line file < 200 ms (SC-003); rendering the button never builds the body.

**Constraints**: no new permission (SC-004); one new string; do not touch `src/core/chat/*` or `src/platforms/meet/captions-control.ts` (concurrent work).

**Scale/Scope**: 3 new source files, 2 edited (`App.tsx`, `style.css`), 4 new test files, 1 edited test file.

## Permission impact

None. The download is an anchor/blob download from the side panel, which needs no permission. `chrome.downloads` was considered and rejected (research R1): adding `downloads` to the production manifest would show "Manage your downloads" at install and, for Web Store installs, disable the extension on update until the user accepts the new warning. The production permission list stays `sidePanel, tabCapture, offscreen, storage, activeTab`; `downloads` remains in the spike build only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | The file is built and saved locally; no network destination, no new permission. Transcript text never reaches logs. |
| II. Grounded Answers, Raw Records | Pass | Transcript only: the formatter takes segments and the meeting's renames, never chat turns, so AI text cannot reach the file. Labels come from `displayLabel`, which never presents a fallback as a name; pending lines (name not settled) are left out rather than written as "Others" and later contradicted. |
| III. Test-First with Fixtures | Pass | Each task's test is written and seen failing first. Fixtures are in-test segments and the existing `standup-en` meeting; e2e uses the fixture transcription and chat providers; no network or real key. |
| IV. Degrade Visibly | Pass | Nothing new can fail silently: the download is Chrome's, shown by Chrome's own indicator. Transcript persistence is unchanged. |
| V. Isolate the Fragile Edges | Pass | The formatter is platform-free core logic shared with 004; the browser-specific save is one small panel module. 004's export sink (File System Access) is unaffected and will reuse the formatter. |
| VI. Smallest Useful v1 | Pass | One button, one formatter, one save helper; no settings, no history, no folder grant. |

Re-check after design: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/007-download-transcript/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/download-ui.md
├── checklists/requirements.md
├── manual-check.md
└── tasks.md
```

### Source Code (repository root)

```text
src/core/export/transcript-file.ts          # new: name, lines, body (shared with 004)
src/entrypoints/sidepanel/save-file.ts      # new: blob + anchor download
src/entrypoints/sidepanel/components/DownloadTranscript.tsx  # new: the button
src/entrypoints/sidepanel/App.tsx           # footer: Download (+ Delete when stopped)
src/entrypoints/sidepanel/style.css         # footer row spacing

tests/unit/core/export/transcript-file.test.ts
tests/unit/sidepanel/save-file.test.tsx
tests/unit/sidepanel/download-transcript.test.tsx
tests/unit/copy/keep-strings.test.tsx       # K40
tests/e2e/download.spec.ts
```

**Structure Decision**: single project as 001; the formatter sits in `src/core/export/` (new folder, covered by the existing `src/core/**` lint boundary).

## Complexity Tracking

No violations.
