# Research: Close transcript

## R1 — What is remembered (FR-006, FR-007)

**Decision**: nothing new. Both ways of clearing write 012's `mainViewClearedAt` (`MainViewStore.clear(now)`, via `MeetingApi.clearMainView`), and the main view's existing rule (`showsOnMain`: the most recent stored meeting shows only if it started after that moment) does the rest.

**Rationale**: the clean state after a close is by definition the clean state after a delete (decision 91 refers to decision 64), and 012 already made that survive a panel reopen, other windows and a browser restart, and end with the next Start without any reset. The moment names no meeting.

**Alternatives considered**: a per-meeting `closed` flag on the record (changes the meeting, against spec FR-003, and needs IndexedDB writes); a "seen stopped" flag written at Stop by the offscreen document (the offscreen document has no `chrome.storage`, and the owner's rule is about the next opening, not Stop); session-only panel state (lost on reopen).

## R2 — Where the opening clear is decided (FR-004, FR-005)

**Decision**: in `useLive`, the hook that already decides between a running meeting (live port snapshot) and the stored one (port disconnect → `latestStored()`). A ref `opening` starts true on mount. The first time the live port answers in a current generation: a `live/snapshot` sets it false (a meeting is running; it shows live and will stay after its Stop); a disconnect calls `latestStored({ opening: true })` and sets it false. Every later call (refresh after Start, after an edit, after a clear elsewhere, Stop while the panel stays open) passes no option. `createMeetingApi().latestStored({ opening: true })` finds the meeting it would show as before; if there is one, it writes the cleared moment and returns null; if the write fails it returns the meeting (a transcript is never hidden because of a storage failure).

**Rationale**: the hook is the one place that knows both whether a meeting runs here and whether this is the panel's first look. Keeping the storage write in the meeting API keeps `useLive` free of storage, and the fakes used by every DOM test ignore the option, so they keep modelling "the panel stayed open" without change.

**Why the port's first answer and not "the meeting has an end time"**: an interrupted meeting has no end time and must also clear (spec Clarifications); a running meeting has no end time and must not. Only the live port tells them apart.

**StrictMode**: the first generation is closed by React's double effect; its disconnect is ignored (`current()` false) and never consumes the opening. The opening write fires `onMainViewCleared` in the same panel, which calls `refresh()`; that second answer passes no option and reads the moment just written, so the panel stays clean.

**Alternatives considered**: deciding in `App` on mount (has no way to know whether a meeting runs before the port answers); clearing in `main.tsx` before render (same problem, and would race the live port); comparing the meeting's end time with the panel's load time (an interrupted meeting has none).

## R3 — The answer in flight at Close (FR-008)

**Decision**: `useChat` stops the streaming turn when the meeting it is held for changes away while that turn is streaming (`api.stop(turnId)`, the same message the answer's own Stop sends). The waiting question goes with the old meeting's state (already true: the state is held per meeting and port messages are ignored once the shown meeting is null).

**Rationale**: once closed, the meeting is not on screen and cannot be asked about; an answer still arriving would keep spending the user's chat credits for text nobody sees until 004. Stopping keeps what arrived, as a stopped answer, with the meeting. The same rule also covers a delete on the Transcripts screen of the meeting shown, which already cannot have a streaming answer there in practice.

**Alternatives considered**: let it finish in the background (invisible text, credits spent); refuse Close while an answer streams (a disabled control that needs explaining, copy tell 3).

## R4 — The button (FR-001, FR-002, FR-009)

**Decision**: a small `CloseTranscript` component beside `DownloadTranscript` and `DeleteTranscript` in the main view's `.transcript-actions` row, order Download, Close, Delete, shown only when the meeting shown is not running. It takes `close(): Promise<void>` (the panel's `clearMainView` without swallowing errors) and `onClosed()`. While the write runs the button is disabled; on failure it shows X2 with `role="alert"` and stays. On success the panel refreshes (the main view goes clean) and focus moves to the Transcripts control, or the gear when there is none, through the same `focusNext` mechanism the screens use.

**Rationale**: mirrors `DeleteTranscript` (failure text P17, focus discipline) without a confirmation, because nothing is lost (decision 92: "close" does not read as deleting).

## R5 — End-to-end tests and seeded meetings

**Finding**: many e2e specs seed a stopped meeting into IndexedDB, reload the panel and use it on the main view (Ask, download, layout, transcripts). After 014 that reload is an opening and clears the main view, which is the intended product behaviour.

**Decision**: a helper `showSeededOnMain(panel)` in `tests/e2e/helpers.ts`: after the seeding reload, wait until the opening has written `mainViewClearedAt`, then set it to `0` in `chrome.storage.local`. The panel's own change listener (`onMainViewCleared` → `refresh`) then shows the seeded meeting through the ordinary non-opening path, the state of a panel that stayed open across Stop. `seedAskMeeting` and `seedStoredMeetings` call it, so specs that test Ask, download or delete on the main view keep testing them. Specs that reload after a real Stop and expected the transcript are changed to expect the clean main view, or to use the helper where the reload only served setup. A new `tests/e2e/close.spec.ts` covers 014 itself: close, reload, opening clear after a fixture Start/Stop, and a running meeting surviving a reload.

**Alternatives considered**: an e2e-only build switch that disables the opening clear (production behaviour would be untested); rewriting every seeded spec to record a fixture meeting (slow, and the chat fixtures are tied to the seeded standup).

**Fix (2026-10-14)**: the helper as merged (`showStoredOnMain`) waited with `page.waitForFunction` and an async predicate. Playwright does not await the predicate's promise and takes it as true, so the helper never waited: it wrote `0` at once, and when the panel's opening clear landed after that (a slow CI runner), the seeded meeting stayed hidden and every seeded spec timed out waiting for `Close transcript` (main run 38558581709: a11y, ask, captions-download, transcripts). The product was right throughout. The helper now polls the marker from the test with `expect.poll`; `close.spec.ts` checks it against a panel slowed 10x with CDP CPU throttling, which failed 2 runs in 3 before the fix.

## R6 — Copy (FR-010)

Two strings, X1 and X2, recorded as K46 in `specs/006-panel-redesign/copy-review.md`; the "Never add" list becomes fixture entry A11 (absent fragments) so the scan enforces it.

## R7 — The lingering offscreen document (fix, 2026-10-14)

**Finding**: R2 took "the live port answered with a snapshot" to mean "a meeting runs". That is wrong for 30 s after a meeting ends by itself (the Meet call left, transcription failed for good): the service worker's `ended()` keeps the offscreen document open for `OFFSCREEN_LINGER_MS` so late panels still see why it stopped, and the host answers every new `live` port with `runtime.snapshot()`, which still holds the stopped meeting. `Close transcript` reconnects (`refresh`), got that snapshot and showed the meeting again; a panel opened in that window never asked for the opening clear. The running test (`isRunning` in `App.tsx`: connected, a meeting, no end time) was not broken, so the Close button showed correctly; only the main view's source was.

**Decision**: in `useLive`, a connection's first `live/snapshot` that holds no meeting, or a meeting with an end time, counts as no meeting running: the hook closes that port and reads `latestStored()` exactly as on a disconnect (as an opening on the panel's first look). A later snapshot on a connection that first saw a running meeting is the end arriving while the panel is open, and is shown as before (001/002/006 FR-022). When the stored meeting is the one in that snapshot, the snapshot's status is kept, so the reason it ended stays: after a rename within the linger, and after a Start whose meeting fails before the panel reconnects (an ElevenLabs key rejected; `tests/e2e/resilience.spec.ts` caught a first version of this fix that dropped it).

**Why not the offscreen host**: answering with an empty snapshot once nothing runs would show an empty main view for every refresh within the linger (after a rename, a delete elsewhere), not the stored meeting, and would leave the protocol's snapshot meaning "running" implicit in two places. **Why not a running flag in the snapshot**: the meeting's end time already says it, and a protocol change would touch the parser and contract tests for nothing.
