# Implementation Plan: Past transcripts

**Branch**: `012-past-transcripts` (this plan was written on `012-past-transcripts-plan`) | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-past-transcripts/spec.md`, amended 2026-10-12 for design decision 64 (Clarifications, sessions two and three).

## Summary

A Transcripts screen, opened from a new header control, lists every stored meeting newest first and lets the user read, download and delete each one; the running meeting is listed but only leads back to the main view. After the meeting the main view shows is deleted (there, or on the Transcripts screen) the main view is clean until the next Start, and the Transcripts screen shows what remains (decision 64).

Technical approach: the side panel reads IndexedDB directly, as it does today for the stored meeting it shows; no message, port, permission or dependency is added. The list is drawn from the small `meetings` records; what a row needs from the lines (names, file line count, end of the last line) is a summary computed by a pure core function and cached on the meeting's own record (research R3). The transcript view reuses `Transcript.tsx` read-only (R4). Download goes through one new seam, `meetingFiles()`, that wraps 007's formatter and that the main view's button also uses, so feature 013 can add a file in one place (R7). Delete reuses `MeetingRepo.deleteMeeting` unchanged; two late-writer holes that could put a deleted meeting's chat or notes back are closed, and a test scans every object store after a delete (R6). The clean main view is one timestamp in `chrome.storage.local`, `mainViewClearedAt`, applied where the panel picks the stored meeting to show (R5).

Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/transcripts-ui.md](contracts/transcripts-ui.md), [contracts/internal-api.md](contracts/internal-api.md), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript strict (as 001), Node 24 LTS, pnpm.

**Primary Dependencies**: WXT, React 19, `idb`. No new dependency.

**Storage**: IndexedDB `live-assist`, `DB_VERSION` stays 3 (no new store). One new optional field on stored meetings, `Meeting.summary`. One new `chrome.storage.local` key, `mainViewClearedAt`.

**Testing**: Vitest unit (node) for `src/core/history/*`, `meeting-files`, `MainViewStore`, the chat session; Vitest integration (fake-indexeddb) for `MeetingRepo`, `ChatRepo`, `ContextRepo` and the every-store deletion scan; Vitest dom (jsdom) for components and `App`; Playwright `tests/e2e/transcripts.spec.ts` on the built e2e extension.

**Target Platform**: Chrome ≥ 116 side panel, 320 px minimum width, light and dark.

**Project Type**: Browser extension (single project).

**Performance Goals**: with 200 stored meetings every row's date, time and duration within 1 s of opening the screen, names too from the second opening; a 5,000-line transcript shown within 2 s of selecting it and a click answered within 200 ms afterwards (SC-006); `summariseMeeting` over 5,000 lines under 200 ms; the page never scrolls (SC-010).

**Constraints**: no network request, no new permission (SC-007); no string beyond spec "Proposed copy" (FR-025); `src/core/` stays platform-free; `chrome.*` only in `src/entrypoints/`; every scroll container on the new screen is positioned (006 FR-023, fix of 2026-10-12); a running meeting is never disturbed (FR-003).

**Scale/Scope**: 9 new source files, 16 edited; 19 new test files, about 10 edited. Hundreds of meetings, transcripts up to about 5,000 lines.

## Permission impact

None. The screen reads local IndexedDB and `chrome.storage.local` (`storage` is already granted); downloads stay anchor/blob downloads from the panel (007 research R1). The production permission list stays `sidePanel, tabCapture, offscreen, storage, activeTab`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | Nothing leaves the machine: the screen causes no network request (e2e asserts it) and needs no permission. History stays in local storage. Deletion is per meeting and real: `deleteMeeting` removes the record (with renames and the new summary), every line (with overrides), every chat turn (with the transcript text it carried) and the notes in one transaction; 012 additionally stops late writers from re-creating chat or notes rows, and a test scans every object store by name after a delete (research R6). The cleared-main-view marker is a moment in time, not a meeting's datum, so it leaves no trace of the deleted meeting (R5). No key or token is touched. |
| II. Grounded Answers, Raw Records | Pass | The read-only view shows labels through `displayLabel`, with the main view's confirmed / fallback distinction; row names list confirmed labels only, never "Others". The downloaded file is 007's, transcript only: `meetingFiles` takes the meeting and its segments, never chat turns or notes, so AI text cannot reach it. No Ask on this screen. |
| III. Test-First with Fixtures | Pass | Every implementation task in tasks.md follows its failing test. Fixtures are in-test meetings and segments and seeded IndexedDB in e2e; the fixture transcription provider covers the Start after a clean main view. No network, microphone, live meeting or real key. A `manual-check.md` records the user's real check. |
| IV. Degrade Visibly, Never Lose the Transcript | Pass | A storage read failure shows P18, never the empty state. A failed deletion says so and leaves the meeting. An unreadable marker shows the most recent transcript rather than hiding one; a clean main view hides nothing for good (every meeting stays on the Transcripts screen). An interrupted meeting is marked in its row and beside its transcript. Capture and persistence are untouched: the main view stays mounted, and no hot-path write (`appendSegment`, `updateSegment`) changes. |
| V. Isolate the Fragile Edges | Pass | No platform DOM, vendor protocol, credential or export sink is involved. Layering holds: rules and formatting in `src/core/history/` and `src/core/export/`, IndexedDB and `chrome.storage` access in `src/storage/`, `chrome.*` wired only in `src/entrypoints/sidepanel/main.tsx`. The download seam keeps 004's future export sink and 013's second file behind one function. |
| VI. Smallest Useful v1 | Pass | No setting, permission, dependency, store or message type. Two stored additions, each required by the spec: `Meeting.summary` (SC-006 with hundreds of meetings, FR-006) and `mainViewClearedAt` (FR-020, FR-026, decision 64). `meetingFiles` returns exactly one file; nothing of 013 is built. No search, sort, multi-select or virtual list. |

Re-check after design: unchanged. No deviation.

## Project Structure

### Documentation (this feature)

```text
specs/012-past-transcripts/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── transcripts-ui.md
│   └── internal-api.md
├── checklists/requirements.md
├── tasks.md
└── manual-check.md            # written by task T049
```

### Source Code (repository root)

```text
src/core/transcript/model.ts                         # edit: MeetingSummary, Meeting.summary?
src/core/history/meeting-summary.ts                  # new: summary, state, duration, date and name formatting
src/core/history/main-view.ts                        # new: showsOnMain
src/core/export/meeting-files.ts                     # new: the download seam over 007's formatter

src/storage/meeting-repo.ts                          # edit: listMeetings, summarise; renames and overrides drop the summary
src/storage/chat-repo.ts                             # edit: putTurn writes only while the meeting exists
src/storage/context-repo.ts                          # edit: set writes only while the meeting exists
src/storage/main-view-store.ts                       # new: mainViewClearedAt

src/entrypoints/background/chat-session.ts           # edit: stop and store nothing when the meeting is gone
src/entrypoints/background/context-commands.ts       # edit: unknown-meeting when set wrote nothing

src/entrypoints/sidepanel/transcripts-api.ts         # new
src/entrypoints/sidepanel/meeting-api.ts             # edit: clearMainView, onMainViewCleared, latestStored honours the marker
src/entrypoints/sidepanel/save-file.ts               # edit: saveFiles
src/entrypoints/sidepanel/main.tsx                   # edit: wire TranscriptsApi and MainViewStore
src/entrypoints/sidepanel/App.tsx                    # edit: third screen, focus moves, clean main view
src/entrypoints/sidepanel/style.css                  # edit: header control
src/entrypoints/sidepanel/components/transcripts.css        # new: screen, list, rows
src/entrypoints/sidepanel/components/TranscriptsScreen.tsx  # new
src/entrypoints/sidepanel/components/MeetingRow.tsx         # new
src/entrypoints/sidepanel/components/PastTranscript.tsx     # new
src/entrypoints/sidepanel/components/PanelHeader.tsx        # edit: Transcripts control
src/entrypoints/sidepanel/components/StartControls.tsx      # edit: pass the control through
src/entrypoints/sidepanel/components/Transcript.tsx         # edit: follow prop
src/entrypoints/sidepanel/components/DownloadTranscript.tsx # edit: available / load through meetingFiles
src/entrypoints/sidepanel/components/DeleteTranscript.tsx   # edit: prompt, controlled confirmation, failure message

tests/support/stored-meetings.ts                     # new: meeting and segment builders
tests/unit/core/history/meeting-summary.test.ts
tests/unit/core/history/main-view.test.ts
tests/unit/core/export/meeting-files.test.ts
tests/unit/storage/main-view-store.test.ts
tests/unit/background/chat-session-deleted.test.ts
tests/integration/storage/meeting-list.test.ts
tests/integration/storage/late-writers.test.ts
tests/integration/storage/real-deletion.test.ts
tests/unit/sidepanel/fake-transcripts-api.ts
tests/unit/sidepanel/transcripts-api.test.ts
tests/unit/sidepanel/meeting-row.test.tsx
tests/unit/sidepanel/past-transcript.test.tsx
tests/unit/sidepanel/transcripts-screen.test.tsx
tests/unit/sidepanel/transcripts-perf.test.tsx
tests/unit/sidepanel/app-transcripts.test.tsx
tests/unit/sidepanel/app-clean-main.test.tsx
tests/e2e/transcripts-helpers.ts
tests/e2e/transcripts.spec.ts
# edited: tests/unit/sidepanel/{fake-meeting-api.ts, meeting-api.test.ts, delete-transcript.test.tsx,
#         download-transcript.test.tsx, save-file.test.tsx, transcript.test.tsx, panel-header.test.tsx},
#         tests/unit/copy/keep-strings.test.tsx, tests/integration/storage/{chat-repo,context-repo}.test.ts
```

**Structure Decision**: single project, as every feature so far. Rules live in a new `src/core/history/` folder (covered by the existing `src/core/**` lint boundary); the download seam sits beside 007's formatter in `src/core/export/`; the screen is three new components plus their own stylesheet so that the bulk of the UI work touches no existing file.

## Design notes

**Real deletion (FR-018)**. What a meeting owns, store by store, and what removes it: research R6. `deleteMeeting` is not changed. Changed around it: `ChatRepo.putTurn` and `ContextRepo.set` refuse to write for a meeting that no longer exists, and the chat session aborts a stream whose meeting was deleted. Kept on purpose: remembered names in Settings, notes waiting for the next meeting, the cleared-main-view marker.

**Clean main view (FR-020, FR-026, FR-027)**. State: `mainViewClearedAt` in `chrome.storage.local`, behind `MainViewStore`; rule: `showsOnMain` in core; applied in `meeting-api.latestStored()`. Why there: it has to outlive the panel and the browser session (so not component state or `storage.session`), IndexedDB has no key-value store (a new one would need a version bump in three contexts), and a timestamp needs no reset at Start: the next meeting is simply newer. Research R5 has the failure modes.

**Performance**. List: one read of the `meetings` store; row details from the cached summary; missing summaries filled in after first paint, one meeting at a time (R3). Transcript: the existing memoised `Transcript`, no virtualisation, opened at the top (R4). Layout: flex column with `min-height: 0`; `.transcripts-list` and `.transcript-scroll` are the only scrollers and both are `position: relative`, so visually hidden text inside them cannot stretch the page (006 FR-023).

**Download seam for 013**. `meetingFiles(source) → MeetingFile[]` and `saveFiles(files)`; `DownloadTranscript` saves whatever its `load()` returns. 013 widens `MeetingFile.kind`, adds its data to `MeetingFileSource` and appends one file inside `meetingFiles`. Nothing of 013 is built or specified here (R7).

**Copy**. Spec "Proposed copy" P1–P18 goes into `specs/006-panel-redesign/copy-review.md` as K43 before any UI task (T001), reviewed with `embody-dont-announce`; the clean main view adds no string. `contracts/transcripts-ui.md` "Never add" lists what must not appear.

**Row title (design decision 76, amendment 2026-10-12, tasks T052–T062)**. `Meeting.source.title` already holds the tab's title from Start (`tabSource` in `meeting-control.ts`), so nothing is added to storage, to `Meeting.summary` or to any message: `SUMMARY_VERSION` stays 1 and no stored summary is recalculated. One pure function, `displayTitle(source)` in `src/core/history/meeting-title.ts`, turns the stored title into what is shown or `null` (spec Clarifications E2, data-model.md "Display title"). `MeetingRow` puts it in a `.meeting-title` span inside the opening control, above the `.meeting-when` span, and into the control's accessible name; `TranscriptsScreen` puts the same two spans in the single-meeting heading. One line with `text-overflow: ellipsis`; the full title is the span's `title` attribute. React renders it as a text node. No new string: P3a is the meeting's own title, P9 and P10 gain the title (copy-review K43, re-reviewed). The shared test meeting (`tests/support/stored-meetings.ts`) becomes an untitled Meet call (`Meet - abc-defg-hij`), which is the common case and keeps every existing row assertion as it was.

## What the code contradicts in the spec as first written

Each is resolved in spec.md Clarifications, session three (D1–D8):

- An interrupted meeting's record is closed at the next Start (`host.ts` → `markOrphanedCrashed`), not when the extension starts; until then it has no end time (D1).
- The main view's `Delete transcript` shows nothing when deletion fails (`DeleteTranscript.tsx` has no catch); US3 scenario 5 assumed an error was shown (D2).
- "This feature stores nothing new" does not survive SC-006 with hundreds of meetings (D4) or decision 64 (C5).
- `Transcript.tsx` always opens at the last line and is a live `log`; a stored transcript needs neither (D8).

## Complexity Tracking

No violations.
