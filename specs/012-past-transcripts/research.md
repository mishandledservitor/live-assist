# Research: Past transcripts (012)

Decisions taken while planning, each checked against the code on `main` at the time (2026-10-12). No item is left as NEEDS CLARIFICATION.

## R1 — Where the Transcripts screen sits in the panel

**Decision**: A third value of the panel's screen state in `App.tsx` (`'main' | 'settings' | 'transcripts'`), opened by a new icon button in `PanelHeader` (in `.header-end`, before the gear; glyph `☰`, accessible name and tooltip `Transcripts`). The main view stays mounted and hidden, exactly as it does behind Settings, so the live port, the scroll position and lines arriving meanwhile survive (FR-003, 006 research R1). The Transcripts screen itself is mounted only while it shows, so every opening reads storage afresh (FR-009). Inside the screen the list stays mounted (hidden) while one meeting's transcript shows, which keeps the list's scroll position for Back (FR-013).

**Rationale**: It is the Settings pattern (decision 32), with the focus hand-off the panel already has (`focusNext` in `Panel`). `StartControls` already cancels an open consent reminder when the main view is not the active screen (`active={!hidden}`), so that edge case costs nothing.

**Alternatives considered**: keeping the screen mounted like Settings (stale list after a meeting stops or another window deletes one; needs its own invalidation); a route or a second HTML page (loses the live main view underneath).

## R2 — Which meetings exist, and what state each is in

**Decision**: `MeetingRepo.listMeetings()` reads the `meetings` store through its `startedAt` index and returns newest first. State is derived in `src/core/history/meeting-summary.ts`:

- `in-progress`: the record's id is the meeting the live port reports as running (`live.connected && live.meeting.endedAt === null`, the same test the main view uses for Stop).
- `interrupted`: `endReason === 'crashed'`, or `endedAt === null` and it is not the running meeting.
- `stopped`: everything else.

**What the code showed (spec Clarifications D1)**: an interrupted meeting's record is closed by `markOrphanedCrashed`, which `src/entrypoints/offscreen/host.ts` calls only at the start of the next meeting, not when the extension starts. So between a crash and the next Start the record has `endedAt: null` and `endReason: null`. The main view already treats such a record as a stopped meeting (it offers `Delete transcript`); the list calls it `Interrupted`, which is what it is.

**Duration**: `stopped` → `endedAt − startedAt`; `interrupted` → the largest `endMs` among its lines (offsets are relative to the meeting start), or none when it has no line; `in-progress` → none (a number that is stale the moment it is drawn). Formatted `under 1 min`, `{n} min`, `{h} h`, `{h} h {m} min`, minutes floored.

**Rejected**: asking the service worker which meeting is active (`chrome.storage.session.activeMeeting`). It would be a second source of truth for "running", and a stale value after an offscreen crash would make an interrupted meeting undeletable. The live port is what the main view already trusts.

## R3 — Opening the list quickly with many meetings (SC-006)

**Problem**: a row shows the confirmed names in order of first appearance, whether the meeting has any line a file would hold, and, for an interrupted meeting, the end of its last line. All three need every line of the meeting. Lines are heavy (each carries its word timings): 200 meetings of 45 minutes are roughly 250,000 segment records. Reading them all each time the screen opens would take seconds and a lot of memory.

**Decision**: two tiers.

1. The list is drawn from the `meetings` store alone: one `getAll` of small records. Date, time, state and (for stopped meetings) duration need nothing else. This is what SC-006's one second covers; with 200 records it is a few milliseconds.
2. The parts that need the lines are a `MeetingSummary` (`names`, `fileLines`, `lastLineEndMs`, `v`) computed by a pure core function and cached on the meeting's own record as `Meeting.summary` once the meeting has ended. `MeetingRepo.summarise(id, compute)` reads the meeting and its segments, computes, and writes the record back in one `readwrite` transaction over `meetings` and `segments`, so a label edit cannot interleave. After the list is drawn the screen fills in missing summaries one meeting at a time, newest first, yielding between meetings; rows already summarised show everything at once. Meetings stored before 012 are summarised the first time the list opens after the update; after that the list never touches `segments`.

**Invalidation**: the only writes that can change a summary are label edits. `setSpeakerRename` and `setLabelOverride` drop `summary` in the same transaction that makes the edit (`setLabelOverride`'s transaction grows to cover `meetings`). Segment appends and updates happen only while a meeting runs, and a running meeting never has a stored summary (`summarise` stores only when `endedAt !== null`; `MeetingRuntime.end` awaits every pending write before `endMeeting`). A `v` different from `SUMMARY_VERSION` reads as missing, so a later change to the rules recomputes.

**Why on the meeting record and not a new store**: no IndexedDB version bump (three contexts open the database), and deletion needs no new code: the summary is part of the record `deleteMeeting` already removes. Every writer of `meetings` spreads the current record (`{ ...current, … }`), so the field survives `endMeeting` and `markOrphanedCrashed`.

**Cost accepted**: `summarise` holds a `readwrite` transaction on `segments` for the length of one read (tens of milliseconds for a 5,000-line meeting). A meeting running at the same time has its next line write queued behind it for that long, once per old meeting, once ever.

**Alternatives considered**:

- Compute everything on every open: fails SC-006 beyond a few dozen meetings.
- Compute per visible row with an `IntersectionObserver` and an in-memory cache: no stored state, but every panel session pays again, names pop in on every scroll, and it is awkward to test in jsdom.
- A separate `meetingSummaries` store: needs `DB_VERSION` 4 and a fifth store in the delete transaction, for no gain.
- Having the offscreen document write the summary at Stop: touches `MeetingRuntime` for a value only the panel reads, and still needs the panel path for old and interrupted meetings.

**Names**: the same rule as the label editor's suggestions (`meetingNames` in `Transcript.tsx`): `displayLabel(segment, meeting)` over `sortSegments(segments)`, keep `confirmed` labels, first appearance order, exact-text duplicates dropped. "Others" is a fallback and never confirmed, so it is never listed; an "Others" line the user corrected by hand is a confirmed name and is listed. `fileLines` is `transcriptFileLines(meeting, segments).length`, so "has a Download" is by construction "007 would write a line" (FR-015).

## R4 — Reading a 5,000-line transcript without freezing the panel

**Decision**: reuse `Transcript.tsx` unchanged in structure, with one new prop, `follow` (default `true`). With `follow={false}` it does not stick to the bottom (a past transcript opens at its first line, spec D8), and its scroller is a `group` named `Transcript lines` instead of a live `log` (nothing arrives; a live region would be wrong). No rename or override handlers are passed, so every label renders as text, not a button (the component already does this), and no `partials` and no `footer`. No virtualisation and no new dependency.

**Rationale**: the component is already built for this size. Lines are memoised, and `tests/unit/sidepanel/transcript-perf.test.tsx` holds a 5,000-line render to a 100 ms budget in jsdom (001 T091). Opening is one `listSegments` (an index range read, tens of milliseconds) and one React commit; the single-view e2e measures both against SC-006 (shown within 2 s, a click answered within 200 ms afterwards). Scrolling is the browser's own.

**006 FR-023 (fix of 2026-10-12)**: transcript lines hold visually hidden text (`.sr-only`, absolutely positioned: the "(confirmed)" and "(speaker not identified)" suffixes). A scroll container that is not positioned lets that text escape and stretch the page to the transcript's full height. The past transcript keeps the already-positioned `.transcript-scroll`. The list's own scroller (`.transcripts-list`) and the screen's live region for `Transcript deleted.` (visually hidden) follow the same rule: every scroll container on this screen is `position: relative`, the screen is a flex column with `min-height: 0`, and only the list or the transcript scrolls, never the page (FR-024). The e2e asserts `document.documentElement.scrollHeight === innerHeight` with 200 meetings and with a 1,500-line transcript open (SC-010).

**Fallback, only if the e2e misses its budget**: `content-visibility: auto` with `contain-intrinsic-size` on `.past-transcript .line`. Not planned; noted so the implementer does not reach for a virtual list.

**Alternatives considered**: a virtualised list (new dependency or new code, breaks find-in-page and the screen reader's reading order, not needed at this size); paging the transcript (new strings, new controls).

## R5 — The clean main view (decision 64, FR-020, FR-026, FR-027)

**Decision**: one remembered value, `mainViewClearedAt` (epoch milliseconds), in `chrome.storage.local` under its own key, written by the panel when the meeting the main view shows is deleted. The main view's rule becomes: the running meeting; else the most recent stored meeting **whose `startedAt` is later than `mainViewClearedAt`**; else nothing.

- Pure rule: `showsOnMain(meeting, clearedAt)` in `src/core/history/main-view.ts`.
- Storage: `MainViewStore` in `src/storage/main-view-store.ts` (`clearedAt()`, `clear(at)`, `onChange(listener)`), over the same `StorageAreaLike` the settings stores use. `chrome.storage.local` is wired in `src/entrypoints/sidepanel/main.tsx`.
- Use: `createMeetingApi` gets the store as a dependency. `latestStored()` returns `null` when the latest meeting does not pass the rule; `clearMainView()` records the moment. `useLive` is untouched: with `null` it already shows the empty state, and `MainView` already hides Download and Delete and gives Ask no meeting.

**Why a moment in time and not a flag**: "until the next Start" then needs no second write. The next meeting's `startedAt` is later than the marker, so it shows while running (the live port, which ignores the marker) and after it stops, including when it crashes. Nothing has to notice a Start and reset anything, in whichever window it happens.

**Why the deletion moment and not a meeting's start time**: real deletion (constitution I). A stored start time of the deleted meeting would be a trace of it. The marker says only when the user last cleared the main view.

**Why `chrome.storage.local`**: the assumption (C1) is that the clean state survives closing the panel and restarting the browser, which rules out component state and `chrome.storage.session`. IndexedDB has no key-value store and would need a version bump. `chrome.storage.local` is where the panel's other remembered state lives, has a test fake (`tests/support/fake-chrome-storage.ts`), and its change event lets a second window's panel drop a transcript that was just deleted elsewhere. It is not put inside `settings`: it is not a setting, `parseSettings` drops unknown fields, and settings are written read-modify-write by two contexts.

**Failure modes** (constitution IV):

- Marker cannot be read → treat as absent → the most recent meeting shows. A transcript is never hidden by an error.
- Marker cannot be written after a successful delete → the deletion stands, the Transcripts screen opens, the main view shows the next most recent meeting (the pre-012 behaviour). Order is always delete first, mark second, so a failed delete never clears the main view.
- System clock set back between the delete and the next meeting, so that the new meeting's `startedAt` is earlier than the marker → that meeting shows while it runs and the main view is clean after it stops; it is on the Transcripts screen. Accepted: the "most recent meeting" rule already depends on `startedAt` ordering.

**When it is written**: (a) `Delete transcript` on the main view succeeded; (b) a meeting deleted on the Transcripts screen is the stopped meeting the main view shows. Never when another meeting is deleted (FR-027), never while a meeting runs.

**Alternatives considered**: a boolean cleared on Start (needs every Start path to clear it, and a Start in another window to be seen); a per-meeting "hidden from main" flag (writes every remaining record); remembering it only in the panel's memory (lost on reopen, against C1).

## R6 — What real deletion removes (FR-018), checked against `src/storage/db.ts`

The database has four object stores at `DB_VERSION` 3. Per meeting:

| Where | What is the meeting's | Removed by |
|---|---|---|
| `meetings` (key `id`) | the record: start, end, end reason, tab URL and title, language, the user's name at Start, `speakerRenames` (label renames), and from 012 `summary` (names, line count) | `deleteMeeting`, same transaction |
| `segments` (index `meetingId`) | every transcript line: text, word timings, attributed label, caption name, `labelOverride` (single-line corrections) | `deleteMeeting`, every key of the index |
| `chatTurns` (index `meetingId`) | every question and answer, plus `contextBlock` and `sentLines`, which hold the transcript text sent with the question | `deleteMeeting`, every key of the index |
| `meetingContexts` (key `meetingId`) | the notes record, or its tombstone after `Remove notes` | `deleteMeeting` |

`MeetingRepo.deleteMeeting` already does all four in one transaction (001, 003 FR-022, 008 FR-017); 012 reuses it unchanged for both delete paths.

Not a meeting's, and kept: `meetingContexts['next']` (notes waiting for the next meeting, 008); `settings.speakerNameMappings` (names remembered across meetings, decision 20, removed in Settings); `mainViewClearedAt` (R5). Not stored at all: the running meeting's `activeMeeting` in `chrome.storage.session` is removed at Stop and never exists for a stopped meeting; the spike build's alignment trace is a download, not storage, and is not in production builds; the redacting logger keeps no transcript text.

**Two gaps found**:

1. **Late writers can put rows back.** `ChatRepo.putTurn` is a plain `put`. The service worker keeps writing a streaming answer (every `ANSWER_WRITE_MS`, and once at the end) for as long as the provider streams. If the meeting is deleted meanwhile (possible today from the main view, and from the Transcripts screen for the meeting the main view shows), the next write re-creates a `chatTurns` row holding the question, the answer and the transcript block, attached to no meeting and reachable from nowhere. `ContextRepo.set` has the same shape with a smaller window (the handler checks the meeting exists, then writes in a separate transaction).
   **Decision**: both writes check the meeting inside their own transaction (`chatTurns` + `meetings`, `meetingContexts` + `meetings`) and write nothing when it is gone. `putTurn` reports whether it stored; `chat-session.ts` aborts the stream when it did not, and rejects a question whose first write found no meeting as `unknown-meeting`. `ContextRepo.set` returns `null` and the handler replies `unknown-meeting`. The `next` key is exempt.
   Segments need no guard: a meeting cannot be deleted while it runs (no Delete on the running row or the running main view), the runtime awaits every pending line write before it marks the meeting ended, and nothing writes lines afterwards except the panel's own label edits, which already check the record exists.
2. **Nothing proves the list of stores is complete.** A store added later (013's captions) could be forgotten in `deleteMeeting`. **Decision**: an integration test that deletes one of two fully populated meetings and then scans **every** object store by name for the deleted meeting's id and for sentinel strings planted in its lines, labels, question, answer and notes. It reads `db.objectStoreNames`, so a new store is covered without editing the test.

## R7 — The download seam (FR-014, FR-015), shaped for 013

**Decision**: one platform-free function, `meetingFiles(source)` in `src/core/export/meeting-files.ts`, returns the list of files a meeting can be downloaded as: `{ kind, name, body }[]`. In 012 it returns one file of kind `transcript`, built by 007's `transcriptFile` unchanged, or an empty list when there is no line to write. The panel saves a list with `saveFiles(files)` in `save-file.ts` (one `saveTextFile` per file). `DownloadTranscript` stops calling `transcriptFile` itself: it takes `available` and `load()` and saves whatever `load` returns. The main view passes the segments it holds; a row or the single view loads the meeting from storage first (`TranscriptsApi.open(id)`), then calls the same function.

**Why**: both download paths produce the same bytes by construction (SC-005), and 013 adds its captions file by adding one builder to `meetingFiles` and one field to its `source`; no caller, component or test of 012 changes shape. The row's `available` comes from the cached `summary.fileLines`, so no file is built to decide whether to show a button.

**Not done here**: 013's file, its store, or any placeholder for them. Notes for 013 (`specs/013-captions-download/spec.md`, specified 2026-10-12, not planned):

- Its FR-012 (transcript file requested first) is the order of the list `meetingFiles` returns.
- Its FR-018 (the captions file alone, when a meeting has captions but no transcript line) is why `DownloadTranscript` takes `available` from its caller instead of working it out from transcript lines. A row decides from the cached summary; 013 adds its own count there and raises `SUMMARY_VERSION`, which makes every stored summary recompute once.
- Its captions are deleted with the meeting: the store it adds must join `deleteMeeting`'s transaction, and the every-store scan of R6 fails until it does.
- Two anchor downloads from one click make Chrome ask once to allow multiple downloads from the extension; that prompt is 013's to design around.

**Alternatives considered**: a `files` registry or plug-in interface (speculative, constitution VI); leaving the main view on `transcriptFile` and giving the list its own path (two code paths to keep identical).

## R8 — Delete on the Transcripts screen and on the main view

**Decision**: one component, `DeleteTranscript`, extended rather than copied:

- `prompt` (default: K6's text) so the Transcripts screen can pass P13 with the meeting's date and time.
- `accessibleName` for the row's button (P12).
- Controlled confirmation (`confirming`, `onConfirmingChange`), optional, so the list can keep at most one confirmation open (FR-017). Uncontrolled on the main view, as today.
- On failure it catches, keeps the confirmation open and shows P17 in an `alert` (spec D2). Today the rejection is unhandled and nothing is shown.
- `onDeleted(id)` replaces `onChanged`.

After a delete on the screen: the row is removed from local state without re-reading the list, `Transcript deleted.` is put in a visually hidden `status` region, and focus goes to the next row's opening control, else the previous row's, else the screen title (FR-021). Escape closes an open confirmation first; only a second Escape goes back.

## R9 — Tests

- Unit (node): `meeting-summary`, `main-view`, `meeting-files`, `MainViewStore` (with the storage fake), `chat-session` with a meeting deleted mid-answer.
- Integration (fake-indexeddb): `listMeetings`, `summarise` and its invalidation, the late-writer guards, and the every-store deletion scan.
- DOM (jsdom): row, past transcript, screen, `DeleteTranscript`, `DownloadTranscript`, `Transcript` with `follow={false}`, `PanelHeader`, and `App` for the screen switch, focus and the clean main view; a 200-row and a 5,000-line render budget.
- Playwright on the built e2e extension (`tests/e2e/transcripts.spec.ts`, seeding helper in `tests/e2e/transcripts-helpers.ts`): the four stories end to end, a real IndexedDB scan after delete, a real file compared byte for byte with the main view's, the clean main view across a panel reload and a fixture Start/Stop, SC-006 timings, SC-010 page height, 320 px, axe in light and dark, and zero non-extension network requests.
- No test needs a meeting, a microphone, the network or a key (constitution III).
