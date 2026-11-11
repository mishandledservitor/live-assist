# Tasks: Edit a line's text (020)

**Input**: `specs/020-edit-line-text/` — spec.md, plan.md, research.md, data-model.md, contracts/edit-text-ui.md, quickstart.md.

**Tests**: required (constitution III, CLAUDE.md rule 9). In every task the test is written first and seen failing for the right reason, then the code, then refactor with tests green.

## Phase 1: Setup

None: no new dependency or configuration.

## Phase 2: Foundational (blocks every story)

- [ ] T001 [P] `TranscriptSegment.textOverride: string | null` in `src/core/transcript/model.ts`; `normaliseSegment` defaults it to `null` and `displayText(segment)` returns `textOverride ?? text` in `src/core/transcript/labels.ts`; new segments from `src/core/transcript/segment-builder.ts` carry `null`; split pieces reset it in `src/core/transcript/split.ts`. Tests first: `tests/unit/core/transcript/labels.test.ts` (old record reads `null`; `displayText` both ways), `tests/unit/core/transcript/split.test.ts` (pieces carry `null`). Update `tests/support/stored-meetings.ts` builders to include the field.
- [ ] T002 [P] `parseLineText(raw)` in `src/core/messaging/protocol.ts`: line breaks and white-space runs → one space, trimmed, 1–2,000 characters, else `null`; `LabelCommand` gains `text/override` (text string or `null`), parsed by `parseLabelCommand`; `isSegment` accepts `textOverride` absent, `null` or string. Tests first in `tests/unit/core/messaging/protocol.test.ts`.

## Phase 3: User Story 1 — correct a line during the meeting (P1) 🎯 MVP

**Goal**: double-click a settled line, type, Enter; the line shows the new text while the meeting continues.

**Independent test**: e2e with the fixture provider: correct a settled line, new lines keep arriving with the editor open.

- [ ] T003 [US1] Runtime: `MeetingRuntime.command` handles `text/override` (ignores another meeting's id or an unknown segment), stores `{...current, textOverride}` with text equal to the original (after `parseLineText`) stored as `null`, updates its copy and emits `live/segment-updated`; `isOverridden` and the guard in `split()` treat `textOverride != null` as overridden, in `src/core/session/meeting-runtime.ts`. Tests first in `tests/integration/core/meeting-runtime.test.ts` (set, clear, equal-to-original clears, other meeting ignored, corrected line not split, relabel keeps it).
- [ ] T004 [P] [US1] Repo: `MeetingRepo.setTextOverride(meetingId, segmentId, text | null)` in one transaction over segments and meetings: checks the meeting id, writes the normalised segment with the field (equal-to-original → `null`), removes `meeting.summary`, in `src/storage/meeting-repo.ts`. Tests first in `tests/integration/storage/meeting-repo.test.ts`.
- [ ] T005 [US1] Panel API: `overrideText(target, segmentId, text | null)` in `src/entrypoints/sidepanel/meeting-api.ts` mirroring `overrideLine` (validates with `parseLineText`, live port while running, otherwise `repo.setTextOverride`; add it to the repo deps Pick); returns a promise that rejects when nothing could take the write. Tests first in `tests/unit/sidepanel/meeting-api.test.ts`; add it to `tests/unit/sidepanel/fake-meeting-api.ts`.
- [ ] T006 [P] [US1] `TextEditor` component in `src/entrypoints/sidepanel/components/TextEditor.tsx` per `contracts/edit-text-ui.md`: group `Edit line text`, textarea `Line text` with the initial selection, `Save`/Enter, `Cancel`/Escape, the two validation errors, awaits `onSave` and shows `Couldn't save this line. Try again.` on rejection keeping the typed text. (`Restore original` belongs to T012.) Tests first in `tests/unit/sidepanel/text-editor.test.tsx`.
- [ ] T007 [US1] Transcript: `onOverrideText` prop; a `dblclick` on a stored line's text (not in-progress, not `labelPending`) opens `TextEditor` in place with the browser selection's range inside the text; one editor state `{id, kind, selection}` shared with the label editor; focus returns to the label button (or the line) on close; auto-follow skipped while an editor is open; `Line` stays memoised, in `src/entrypoints/sidepanel/components/Transcript.tsx`; wire `onOverrideText` in `src/entrypoints/sidepanel/App.tsx` like `onOverrideLine`. Tests first in `tests/unit/sidepanel/transcript.test.tsx` (opens on double-click with word selected; not on single click, the in-progress or a pending line; new lines arriving keep the typed text and caret; no auto-scroll while open; Escape returns focus) and `tests/unit/sidepanel/transcript-perf.test.tsx` still within bound.
- [ ] T008 [US1] Keyboard path: `Edit text` button in `src/entrypoints/sidepanel/components/LabelEditor.tsx` (prop `onEditText`) closes the label editor and opens the text editor on that line with all text selected. Tests first in `tests/unit/sidepanel/label-editor.test.tsx` and `transcript.test.tsx`.
- [ ] T009 [P] [US1] Styles for the inline editor (full-width textarea, actions row like `.label-editor-actions`, 320 px) in the side panel stylesheet that holds `.label-editor`.

**Checkpoint**: a line can be corrected live and after Stop; it shows the corrected text.

## Phase 4: User Story 2 — the correction is the record (P1)

**Goal**: Ask, citations, downloads and past transcripts use the corrected text.

**Independent test**: correct a line, then check chat context, transcript file, merged file and a reopened meeting.

- [ ] T010 [P] [US2] Chat: `renderLine` in `src/core/chat/context.ts` and `textsAt` in `src/core/chat/citations.ts` use `displayText`. Tests first in `tests/unit/core/chat/context.test.ts` (corrected text sent; a line corrected after an earlier turn is re-sent) and `tests/unit/core/chat/citations.test.ts` (a quote of the corrected text links).
- [ ] T011 [P] [US2] Downloads: `src/core/export/transcript-file.ts` (`writable`, the line) and `src/core/export/merged-transcript.ts` (`transcriptLines` tokens from `displayText`; a text-corrected line counts as corrected for the repeat check) use the corrected text. Tests first in `tests/unit/core/export/transcript-file.test.ts`, `merged-transcript.test.ts`, `merged-repeats.test.ts`.

## Phase 5: User Story 3 — go back to what was heard (P2)

- [ ] T012 [US3] `Restore original` in `TextEditor` (only when the line has `textOverride`, saves `null`) and the `edited` mark (`span.line-edited` after the text) in `Transcript.tsx`, shown in past transcripts too; past transcripts open no editor. Tests first in `tests/unit/sidepanel/text-editor.test.tsx`, `transcript.test.tsx`, `tests/unit/sidepanel/past-transcript.test.tsx`; mark style in the same stylesheet as T009.

## Phase 6: Polish

- [ ] T013 Copy: record K50 (the nine strings of `contracts/edit-text-ui.md`) and the rejected candidates as A15 in `specs/006-panel-redesign/copy-review.md`; add the K50 and A15 cases to `tests/fixtures/copy/copy-review.json` and `tests/unit/copy/keep-strings.test.tsx`. Test first: the copy scan fails until recorded.
- [ ] T014 E2E `tests/e2e/edit-text.spec.ts`: fixture meeting, double-click a settled line, replace a word, Enter; further lines arrive with an editor open; `Download transcript` holds the correction; reload the panel shows it with `edited`; `Restore original` brings the original back; keyboard path through the label editor. Add the editor to `tests/e2e/a11y.spec.ts`.
- [ ] T015 Docs: `specs/020-edit-line-text/manual-check.md` (real Meet call steps), `CHANGELOG.md` `[Unreleased]` Added, `ROADMAP.md` row 020, `README.md` usage line, CLAUDE.md Current status.
- [ ] T016 Full check: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:e2e`, `pnpm test:e2e`.

## Dependencies

T001, T002 → everything. T003, T004 → T005 → T007. T006 → T007 → T008, T012. T010, T011 need only T001. T013 after T006, T008, T012. T014 after all implementation. T016 last.

## Parallel

After Phase 2: T003 ∥ T004 ∥ T006 ∥ T010 ∥ T011 (different files). All touch few files, so this runs in one worktree, one task at a time (CLAUDE.md rule 6: the phases share `Transcript.tsx` and the test support files, and would conflict on merge).

## Strategy

MVP is Phase 2 + US1 (T001–T009); US2 makes the correction count everywhere and ships in the same release; US3 completes the spec.
