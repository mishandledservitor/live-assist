# Tasks: Download transcript (007)

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/download-ui.md`

**TDD**: every implementation task is preceded by its test task; the test is run and seen failing for the right reason before the implementation is written (constitution III, CLAUDE.md rule 9).

Format: `[ID] [P?] [Story] Description`. `[P]` = can run in parallel (different files, no dependency).

## Phase 1: Setup

- [x] T001 Feature folder, design decision 48, ROADMAP row 007 (done in the plan commit).

## Phase 2: Foundational — the shared formatter (blocks every story)

- [x] T002 [US1] Test `tests/unit/core/export/transcript-file.test.ts`: `exportTimestamp` (0 → `00:00`, 65 400 → `01:05`, 4 512 000 → `75:12`, floors, negative → `00:00`); `transcriptFileName` from local components (`new Date(2026, 9, 7, 14, 30)` → `Meeting — 07-10-2026 at 14h30.txt`, single-digit padding, midnight `00h05`).
- [x] T003 [US1] Implement `exportTimestamp` and `transcriptFileName` in `src/core/export/transcript-file.ts` until T002 passes.
- [x] T004 [US1] Test (same file): `transcriptFileLines` / `transcriptFile` — order by startMs then seq; `[mm:ss] Speaker: text`; labels via renames, overrides, the user's name and "Others"; body = lines joined by one blank line plus a final newline; no header; empty → `''`; whitespace and line breaks collapsed; empty text skipped; Greek kept; pending lines skipped (US2-2); `hasTranscriptFileLines` true/false; the input segments are not mutated; 5,000 lines build in < 200 ms (SC-003).
- [x] T005 [US1] Implement `transcriptFileLines`, `hasTranscriptFileLines`, `transcriptFile` until T004 passes.

## Phase 3: User Story 1 — save the transcript of the meeting in the panel (P1)

- [x] T006 [P] [US1] Test `tests/unit/sidepanel/save-file.test.tsx`: `saveTextFile(name, body)` creates a UTF-8 text blob, an anchor with `download` = name and the object URL as `href`, clicks it once, does not leave it in the document, and revokes the URL afterwards.
- [x] T007 [US1] Implement `src/entrypoints/sidepanel/save-file.ts` until T006 passes.
- [x] T008 [US1] Test `tests/unit/sidepanel/download-transcript.test.tsx`: `DownloadTranscript` renders `button` `Download transcript`; a press calls `save` once with `transcriptFile(meeting, segments)`'s name and body (current renames applied); absent when there is no settled line.
- [x] T009 [US1] Implement `src/entrypoints/sidepanel/components/DownloadTranscript.tsx` until T008 passes.
- [x] T010 [US1] Test (same file, `App`): a stopped stored meeting shows Download then Delete in the transcript footer, in that order; pressing Download saves the expected file.
- [x] T011 [US1] Wire the footer in `src/entrypoints/sidepanel/App.tsx` (and footer row spacing in `style.css`) until T010 passes, with the existing `delete-transcript.test.tsx` still green.

## Phase 4: User Story 2 — download while running (P2)

- [x] T012 [US2] Test (same file, `App`): a running meeting shows Download and no Delete; the file holds finished lines only (no partial text, no pending line); a later live label update is reflected in the next download.
- [x] T013 [US2] Adjust `App.tsx` until T012 passes.

## Phase 5: User Story 3 — nothing to download (P3)

- [x] T014 [US3] Test (same file, `App`): no meeting → no Download; a running meeting with only partials or pending lines → no Download; the first settled line → Download appears.
- [x] T015 [US3] Adjust until T014 passes.

## Phase 6: Polish and cross-cutting

- [x] T016 [P] Copy review: add K40 `Download transcript` to `specs/006-panel-redesign/copy-review.md` (embody-dont-announce: a control label; nothing added beside it), the K40 test in `tests/unit/copy/keep-strings.test.tsx` (seen failing first), and the row in `specs/006-panel-redesign/contracts/panel-ui.md`.
- [x] T017 Playwright `tests/e2e/download.spec.ts`: (a) stored `standup-en` meeting, ask a question and wait for the answer, press Download → `suggestedFilename()` equals the 004 name for the meeting's local start time and the saved bytes equal the expected body (no question or answer text); (b) running fixture meeting → Download mid-meeting saves the lines so far, transcription continues; Stop → Download again. (c) The production manifest's permissions are unchanged (no `downloads`).
- [x] T018 `specs/007-download-transcript/manual-check.md` (steps for the user's real call), CHANGELOG entry.
- [x] T019 Gates: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build:e2e && pnpm test:e2e`.

## Dependencies

T002→T003→T004→T005 block T008 onward. T006/T007 are independent of the formatter. T010–T015 edit `App.tsx` in sequence. T016 can run any time after T009. T017 needs T011–T015. T019 last.
