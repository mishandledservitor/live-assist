# Quickstart: Past transcripts (012)

How to check the feature once it is built. Contracts: [contracts/transcripts-ui.md](contracts/transcripts-ui.md), [contracts/internal-api.md](contracts/internal-api.md). Rules and stored values: [data-model.md](data-model.md).

## Automated

```sh
pnpm install

# rules, storage, components
pnpm exec vitest run tests/unit/core/history tests/unit/core/export/meeting-files.test.ts
pnpm exec vitest run tests/integration/storage
pnpm exec vitest run tests/unit/storage/main-view-store.test.ts tests/unit/background/chat-session-deleted.test.ts
pnpm exec vitest run tests/unit/sidepanel

# the built extension
pnpm build:e2e && pnpm exec playwright test tests/e2e/transcripts.spec.ts

# everything
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build:e2e && pnpm test:e2e
```

Expected: all green; `tests/unit/manifest/permissions.test.ts` passes unchanged (no new permission).

What each layer proves:

| Check | Where |
|---|---|
| Names, duration, markers, date and time text | `tests/unit/core/history/meeting-summary.test.ts` |
| The list is newest first; row details are cached and dropped on a label edit | `tests/integration/storage/meeting-list.test.ts` |
| Nothing of a deleted meeting is left in any object store | `tests/integration/storage/real-deletion.test.ts`, and on a real IndexedDB in the US2 e2e block |
| A late answer or late notes cannot come back after a delete | `tests/integration/storage/late-writers.test.ts`, `tests/unit/background/chat-session-deleted.test.ts` |
| The clean main view and when it ends | `tests/unit/core/history/main-view.test.ts`, `tests/unit/sidepanel/meeting-api.test.ts`, `tests/unit/sidepanel/app-clean-main.test.tsx`, the US3 e2e block |
| The file equals 007's | `tests/unit/core/export/meeting-files.test.ts`, the US4 e2e block (byte comparison with the main view's download) |
| 200 meetings, a 5,000-line transcript, the page never scrolls, axe, no network | the cross-cutting e2e block |

## By hand (real Meet calls) — becomes `manual-check.md`

`pnpm build`, reload the unpacked extension in `chrome://extensions`, reload the Meet tab, click the toolbar icon. Chrome must not ask for a new permission.

1. With a few earlier meetings stored, press the `Transcripts` button in the header. Expect: every meeting, newest first, each `{date} · {time} · {duration}` with the names of who spoke; nothing else on the screen but Back and the title.
2. Select an older meeting. Expect: its transcript from the first line, names as you corrected them, nothing editable, no question box. Back: the list, where you were. Back: the main view, unchanged.
3. Start a meeting, then open Transcripts. Expect: the first row says `In progress` and has no Download or Delete; selecting it returns to the live transcript with every line that arrived meanwhile.
4. During a call, quit the browser. Open it again and open Transcripts (do not press Start). Expect: that meeting marked `Interrupted`, its duration ending at its last line.
5. In a row that is not the newest, press `Download transcript`. Expect: `Meeting — DD-MM-YYYY at HHhMM.txt` for that meeting's start, the same content the main view saved for it at the time.
6. Ask a question about the newest meeting and add notes to it. In Transcripts, delete an older meeting: the confirmation names its date and time and says its questions, answers and notes go too. Confirm. Expect: the row is gone, the others are untouched, the main view still shows the newest meeting.
7. On the main view press `Delete transcript` and confirm. Expect: the Transcripts screen with what remains. Back: `No transcript yet.` and no older transcript. Close the panel and open it again: still clean. Open Transcripts: the older meetings are there.
8. Press Start, say a sentence, Stop. Expect: that meeting on the main view with Download and Delete, as always.
