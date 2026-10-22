# Implementation Plan: Merged download

**Branch**: `016-merged-download` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-merged-download/spec.md` (design decisions 93–99; assumptions A1–A14). Constitution v1.2.2.

## Summary

After Stop, `Download transcript` saves one merged `.txt`: the realtime transcript's words, with each word's speaker taken from Meet's kept captions by word-level alignment at the press, passages the realtime transcript wrote twice removed. The originals (013's download) move to `Download originals` on the Transcripts screen's single-meeting view. Running meetings and meetings without both records download as before. The live transcript is untouched.

Technical approach: two new pure modules in `src/core/export/`: `matching-blocks.ts`, a port of Python difflib's `get_matching_blocks` (no autojunk), and `merged-transcript.ts`, a port of the reference merge's word assignment, sentence majority and joining, plus the repeat rule of research R3 (align, find whole-line repeats the captions carry once, drop them, align again). `meeting-download.ts` gains `mergedMeetingDownload`, which falls back to the unchanged `meetingDownload`. In the panel, the main view picks between the two by whether the meeting runs, the Transcripts screen always uses the merged one, and `PastTranscript` gets the `Download originals` button through a label-free `DownloadButton` extracted from `DownloadTranscript`. Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/merged-file.md](contracts/merged-file.md), [contracts/download-ui.md](contracts/download-ui.md), [quickstart.md](quickstart.md), [manual-check.md](manual-check.md).

## Technical Context

**Language/Version**: TypeScript strict, Node 24 LTS, pnpm (as 001).

**Primary Dependencies**: WXT, React 19. No new dependency, shipped or dev: the alignment is ported (research R2).

**Storage**: none new. Reads the meeting record, `segments` and `captionTurns` as 013's download does; writes nothing.

**Testing**: Vitest unit (node) for `matching-blocks.ts` (against outputs Python's difflib gives for the same inputs, written into the test as literals), `merged-transcript.ts` (invented meetings: alignment rules, sentences, joining, names, corrections, every repeat case of spec User Story 2, the invariants of SC-001 over generated meetings, and the 15,000-word timing), `meeting-download.ts` (which file a press saves); Vitest dom for `DownloadButton`, `PastTranscript`, `TranscriptsScreen`, `App` and the copy tests; Playwright on the built e2e extension for the merged file from the three places and `Download originals`.

**Target Platform**: Chrome ≥ 116, Manifest V3 side panel.

**Project Type**: Browser extension (single project).

**Performance Goals**: SC-005: a 15,000-word meeting merged and handed to the browser in under 1 s; 45,000 words under 2 s. Measured in Vitest (node) for the function and in Playwright for the press-to-download path (research R5).

**Constraints**: no change under `src/core/session`, `src/core/speakers`, `src/core/transcript`, `src/entrypoints/offscreen`, `src/platforms` (FR-018); `src/core/` stays platform-free (ESLint); caption text is used only inside the merge call and never written into the file (FR-011); the merged file is never stored or sent (FR-004, FR-019). Only one new user-facing string, `Download originals` (FR-022).

**Scale/Scope**: 2 new source files in `src/core/export/`, 2 new components (`DownloadButton` extracted, `DownloadOriginals`), about 5 edited panel and export files; about 4 new test files and 8 edited; 1 new test support generator (`tests/support/synthetic-meeting.ts`).

## Permission impact

None. The download stays an anchor/blob download from the panel (007 research R1). The permission list and `dependencies` stay as 013's tests pin them.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | The merge runs in the panel on data it already reads for a download; nothing is sent anywhere, no network code is added (FR-019). No audio is kept (decision 95). Nothing new is stored, so deletion is unchanged. |
| II. Grounded Answers, Raw Records | Pass | The file's words are the transcript's words, unchanged and in order (FR-005; asserted on every test meeting, SC-001); no caption text and no AI text enter it (FR-011). Names come only from Meet's captions for those words or their immediate surroundings (FR-006), from the live label when it is itself a caption name (R4), or from the user's correction; everything else is `Others` (FR-009): a fallback is never shown as a name. Ask is unchanged and never sees the captions (FR-020, decision 72). The knowledge-base export is not touched. |
| III. Test-First with Fixtures | Pass | Every task's test is written and seen failing first. Fixtures are invented: a seeded generator makes meetings with invented names and words; difflib's behaviour is pinned by literal expected blocks. The real calls are used only locally (R7, decision 82). A real-call check is in `manual-check.md`. |
| IV. Degrade Visibly, Never Lose the Transcript | Pass | Live persistence untouched. A press whose data cannot be read saves nothing, as 013 (A13). |
| V. Isolate the Fragile Edges | Pass | The merge is platform-free logic over the stored models, beside the other file builders and separate from saving (FR-021); it never reads Meet's page. |
| VI. Smallest Useful v1 | Pass | No setting, permission or dependency. The difflib port (about 120 lines) instead of a library: R2 explains why a library's different tie-breaks would undo the measured numbers. One control, required by decision 97. |

Re-check after design: unchanged. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/016-merged-download/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── manual-check.md          # steps for the owner's real call; results filled in by the owner
├── contracts/
│   ├── merged-file.md       # the function, its input, the file byte for byte, the repeat rule
│   └── download-ui.md       # what each Download saves where; Download originals
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── core/export/
│   ├── matching-blocks.ts         # NEW difflib get_matching_blocks port (autojunk off)
│   ├── merged-transcript.ts       # NEW normalise, assign, repeats, sentences, join, file
│   └── meeting-download.ts        # + mergedMeetingDownload
└── entrypoints/sidepanel/
    ├── App.tsx                    # main view: merged unless running
    └── components/
        ├── DownloadButton.tsx     # NEW press logic of DownloadTranscript, label-free
        ├── DownloadTranscript.tsx # renders DownloadButton with its label
        ├── DownloadOriginals.tsx  # NEW `Download originals`
        ├── PastTranscript.tsx     # + Download originals when both records exist
        └── TranscriptsScreen.tsx  # load → merged; loadOriginals → meetingDownload

tests/
├── support/synthetic-meeting.ts                         # NEW seeded invented meetings
├── unit/core/export/{matching-blocks,merged-transcript,merged-repeats,meeting-download}.test.ts
├── unit/sidepanel/{download-originals,past-transcript,transcripts-screen,app-captions,download-transcript}.test.tsx
├── unit/copy/keep-strings.test.tsx, tests/fixtures/copy/copy-review.json
└── e2e/captions-download.spec.ts                        # merged after Stop; originals on the single view
```

**Structure Decision**: the existing single-project layout; the merge sits with the other file builders in `src/core/export/`, which may import `src/core/captions/` (only chat, speakers and transcript may not).

## Design notes that span documents

1. **Two functions, one choice.** `meetingDownload` (013) is untouched and remains the originals; `mergedMeetingDownload` merges when both files exist and otherwise returns `meetingDownload`'s result. A caller chooses by one fact, whether the meeting runs, so no place can merge a running meeting or fail to merge a stopped one (FR-002, FR-003).
2. **Removed repeats are a download fact.** They are removed from the merged body only; the stored lines, the panel, Ask and the originals keep them (spec Key Entities).
3. **Deterministic.** The same meeting, names and captions give the same bytes, from any of the three places, at any time (FR-002): nothing depends on the clock except 013's zip stamp in the originals.

## Complexity Tracking

No constitution violation to justify.
