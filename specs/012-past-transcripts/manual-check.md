# Manual check record: 012 Past transcripts

Real-browser checks that automated tests cannot cover (constitution III). Not yet run: the steps below are for the user, with real Google Meet calls and the meetings already stored on this machine. Automated coverage already in place:

- `tests/unit/core/history/meeting-summary.test.ts`, `tests/unit/core/history/main-view.test.ts`, `tests/unit/core/export/meeting-files.test.ts`: names, durations, markers, date and time text, the clean-main-view rule, the file equals 007's.
- `tests/integration/storage/meeting-list.test.ts`, `real-deletion.test.ts`, `late-writers.test.ts`, `crash-recovery.test.ts`; `tests/unit/background/chat-session-deleted.test.ts`; `tests/unit/storage/main-view-store.test.ts`: the list, the every-store scan after a delete, late answers and notes that cannot come back, the remembered moment.
- `tests/unit/sidepanel/transcripts-api.test.ts`, `meeting-row.test.tsx`, `past-transcript.test.tsx`, `transcripts-screen.test.tsx`, `transcripts-perf.test.tsx`, `app-transcripts.test.tsx`, `app-clean-main.test.tsx`, `meeting-api.test.ts`, `panel-header.test.tsx`: rows and their states, reading, focus moves, one confirmation at a time, the clean main view, 200 rows and a 5,000-line transcript.
- `tests/unit/core/history/meeting-title.test.ts`, the title cases of `meeting-row.test.tsx`, `transcripts-screen.test.tsx` and `keep-strings.test.tsx`, and the title test of `tests/e2e/transcripts.spec.ts` (design decision 76): every title form the spec lists, the title line and its absence, the heading, and a long title at 320 px. Not covered: what a real Meet, Zoom or Teams tab is titled today (step 10).
- `tests/unit/copy/keep-strings.test.tsx` (K43) and `tests/unit/copy/copy-review.test.ts`: every string of the screen, and no other.
- `tests/e2e/transcripts.spec.ts` on the built extension: the four stories with seeded meetings and a fixture meeting, a real IndexedDB scan after a delete, a real file compared byte for byte with the main view's, the clean main view across a panel reload and the next Start, axe in light and dark, 200 meetings and a 5,000-line transcript within their time limits, the page never scrolling, 320 px, and no request leaving the extension.
- `tests/unit/manifest/permissions.test.ts`: no new permission.

**Build** (from the repo root, on branch `012-transcripts-screen` or later; step 10 needs `012-row-title` or later):

```sh
pnpm install
pnpm build
```

Reload the unpacked extension in `chrome://extensions`, reload the Meet tab, click the toolbar icon. Chrome should not ask to accept any new permission.

## Steps

1. **The list after real meetings.** With a few earlier meetings stored, press the `Transcripts` button in the header (left of the gear). Expect: every meeting, newest first, each `{date} · {time} · {duration}` with the names of who spoke under it; nothing else on the screen but Back and the title. The first time after this update the names and `Download transcript` may appear a moment after the dates; from the second opening on they are there at once.
2. **Reading a long transcript.** Select your longest older meeting. Expect: its transcript from the first line under a title with its date and time, names as you corrected them, "Others" lines still told apart, nothing editable, no question box and no earlier answers. Scroll to the end: only the transcript scrolls, Back and the two buttons stay in view. Back (or Escape): the list, where you were, with that row focused. Back again: the main view, unchanged.
3. **A running meeting's row.** Start a meeting, say a sentence, then open Transcripts. Expect: the first row says `In progress`, shows no duration and has no Download or Delete. Keep talking for a few seconds, then select that row. Expect: the live transcript with every line said meanwhile; transcription never paused.
4. **An interrupted meeting.** During a call, quit the browser (do not press Stop). Open it again and open Transcripts without pressing Start. Expect: that meeting marked `Interrupted`, its duration ending at its last line (not at the time you reopened the browser), with Download and Delete. Open it: `Interrupted` is shown beside the buttons.
5. **Download compared with the main view's file.** For a meeting whose file you downloaded from the main view at the time (007), press `Download transcript` in its row, now that it is not the newest. Expect: `Meeting — DD-MM-YYYY at HHhMM.txt` for that meeting's start, with the same content as the earlier file (compare the two). The list does not change and no message appears. Time yourself from opening the panel to the file in Downloads for a meeting from last week: under 20 seconds (SC-002).
6. **Delete from the list, with chat and notes present.** Ask a question about the newest meeting and add notes to it. In Transcripts, press `Delete transcript` on an older meeting. Expect: the confirmation in that row names its date and time and says its questions, answers and notes are deleted too. Press Escape: only the confirmation closes. Open it again and confirm. Expect: the row is gone, focus is on the next row, the others are untouched. Back: the main view still shows the newest meeting with its question, answer and notes.
7. **Delete on the main view.** On the main view press `Delete transcript` and confirm (this confirmation reads as before). Expect: the Transcripts screen with what remains. Back: `No transcript yet.`, no Download, no Delete, no older transcript, and nothing saying a transcript was deleted. Close the panel and open it again: still clean. Open Transcripts: the older meetings are there, and one of them can be opened and read while the main view stays clean.
8. **The next Start.** Press Start, say a sentence, Stop. Expect: that meeting on the main view with `Download transcript` and `Delete transcript`, as always, also after closing and reopening the panel.
9. **Narrow panel.** Drag the side panel to its narrowest. Expect: the header stays on one line (the language picker shortens), every row's date line stays on one line, and no button is cut off.
10. **Titles (design decision 76).** Look at the rows of meetings you already have, and hold one call that has a name (started from a calendar event) and one that does not (an instant meeting). Expect: the named call's row starts with its name, exactly as Meet shows it and without `Meet -` in front, with date, time and duration on the line under it; the unnamed call's row has no title line and no meeting code. Open the named one: its name is above the date in the heading. If any row's first line is `Meet`, a code, or the same text on every row, note the exact text: that is a form the rule in spec.md Clarifications E2 does not cover. With the panel at its narrowest, a long name stays on one line and ends in `…`; hovering shows all of it.

## Results

| Step | Result (pass / fail / note) |
|------|-----------------------------|
| 1 | |
| 2 | |
| 3 | |
| 4 | |
| 5 | |
| 6 | |
| 7 | |
| 8 | |
| 9 | |
| 10 | |

Real check by the user 2026-10-13 (walkthrough `live-assist-test-run-2026-10-12.html`, production build of 2026-10-12): step 1 pass (list, titles on rows), step 2 pass (long transcript read-only, Back), step 5 pass (row download, now named `… — Transcript.txt` per decision 70), step 6 confirmation text pass (cancelled, not deleted), step 7 pass (main-view delete → Transcripts screen → clean main view, still clean after closing and reopening the panel). Not done: step 3 (running row), step 4 (interrupted), step 8 (next Start), step 9 (narrow panel), step 10 (non-Meet titles).
