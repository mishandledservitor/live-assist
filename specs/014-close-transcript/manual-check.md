# Manual check record: 014 Close transcript

Real-browser checks that automated tests cannot cover (constitution III). Not yet run: the steps below are for the owner, in a real Google Meet call. Automated coverage already in place:

- `tests/unit/sidepanel/close-transcript.test.tsx`, `app-close.test.tsx`: the button, its place between Download and Delete, the clean main view, focus on the Transcripts control, nothing deleted, the failure line, no button while a meeting runs.
- `tests/unit/sidepanel/meeting-api.test.ts`, `use-live.test.tsx`: the opening clear (stopped and interrupted meetings, nothing to clear, already clean, a failed write showing the meeting, a clock set back), and that only the panel's first look with no meeting running is an opening.
- `tests/unit/sidepanel/use-chat-close.test.tsx`: an answer still arriving is stopped when its meeting leaves the main view; a waiting question is not sent.
- `tests/unit/copy/keep-strings.test.tsx` (K46) and `tests/unit/copy/copy-review.test.ts` (A11): the two new strings and nothing of the never-add list.
- `tests/e2e/close.spec.ts` on the built extension: Close, the meeting unchanged in storage, Transcripts and Back, a reload still clean, the next Start; a running meeting across a panel reopen; Stop with the panel open keeps the transcript; the next opening is clean; after leaving the fixture Meet call (the meeting ends by itself and the offscreen document lingers 30 s), Close and the next opening are clean within that time.

**Build** (from the repo root, on branch `014-close-transcript` or later):

```sh
pnpm install
pnpm build
```

Reload the unpacked extension in `chrome://extensions`, reload the Meet tab, click the toolbar icon. Chrome should not ask to accept any new permission.

## Steps

1. **Stop with the panel open.** Start a meeting, say a few sentences, press Stop and leave the panel open. Expect: the transcript stays, with `Download transcript`, `Close transcript`, `Delete transcript` under the last line in that order. Ask a question: it is answered as before.
2. **Close.** Press `Close transcript`. Expect: at once `No transcript yet.`, no buttons under it, no questions and answers, nothing saying what happened; focus on the Transcripts button (left of the gear). Open Transcripts: the meeting is the first row; open it and read it; Back twice: the main view is still clean. Download it from its row: the same file the main view would have saved.
3. **Close and reopen.** Close the side panel and open it again: still clean.
4. **The clean opening.** Start and stop another meeting, close the panel straight away (within a few seconds) and open it again. Expect: clean, the meeting on the Transcripts screen. Restart Chrome and open the panel: still clean.
5. **A running meeting is never cleared.** Start a meeting, close the panel while it runs, open it again. Expect: the meeting live with Stop, lines still arriving; no `Close transcript` while it runs.
6. **Switching tabs.** With a stopped meeting shown in a panel left open, switch to another tab and back to the Meet tab. Record whether the transcript is still there. (If Chrome reloads the side panel on a tab switch, this counts as an opening and the main view is clean; tell us which happens.)
7. **Close during an answer.** After Stop, ask a long question and press `Close transcript` while the answer is still arriving. Expect: the main view is clean at once. Later, reopening that meeting in 004 (not built yet) is the only way to see the stopped answer; nothing to check now beyond the clean view.
8. **Notes stay.** Attach notes to a meeting before Start, stop it, press `Close transcript`. Expect: the header's notes chip for the next meeting is empty; delete the closed meeting from the Transcripts screen: its confirmation names its notes.
9. **Close after leaving the call.** Start a meeting, say a few sentences, then leave the Meet call with Meet's red hang-up button (do not press Stop). Expect: the panel shows `Stopped — the call ended` with the transcript. Within 30 seconds press `Close transcript`. Expect: clean at once, and still clean a minute later. Repeat, but this time close the panel within 30 seconds of leaving and open it again: clean.

## Result

Real check by the user 2026-10-19 (walkthrough `live-assist-test-run-2026-10-19.html`, production build of 2026-10-14, Google Meet): steps 1 to 5 pass (Stop with the panel open, Close, still clean after reopening the panel, clean at the next opening without Close, also after restarting Chrome, and a running meeting never cleared). Not yet run: step 6 (switching tabs), 7 (Close during an answer), 8 (notes), 9 (Close after leaving the call with Meet's hang-up button).
