# Research: Download transcript (007)

## R1 — How the file is saved: anchor/blob download from the panel, not `chrome.downloads`

**Decision**: The side panel builds the file as a `Blob` (`text/plain;charset=utf-8`), makes an object URL, clicks a detached `<a download="Meeting — … .txt">`, and revokes the URL shortly after. No `downloads` permission.

**Rationale**:
- **No permission warning.** `downloads` shows "Manage your downloads" at install, and adding it in an update disables the extension until the user accepts it (Web Store installs; it also matters for the future colleague distribution in ROADMAP "Later"). The anchor download needs no permission, so SC-004 holds: the production manifest's permission list is unchanged. (`downloads` stays in the spike build only, as today.)
- **Collisions.** An anchor download goes through Chrome's download manager like any other: an existing file of the same name gets ` (1)`, ` (2)`… appended, never overwritten (FR-009). That is what `chrome.downloads.download({ conflictAction: 'uniquify' })` would do, so the API buys nothing here.
- **Where it runs.** The side panel already holds the meeting, its segments and its renames (the data it renders), so the file is built from what the user sees, with no message round trip and no new message type. `chrome.downloads` would need either the permission in the panel or a service-worker route carrying the whole transcript.
- **Privacy.** A blob URL is local; nothing leaves the machine (constitution I).
- **"Ask where to save"** is honoured by both mechanisms (Chrome's dialog opens with the name filled in).

**Alternatives considered**:
- `chrome.downloads.download` with a data or blob URL: explicit `conflictAction` and a download id to watch, at the cost of a new install-time warning and an update prompt. Rejected: the only gain (knowing completion) is not used — Chrome's own download indicator is the feedback (spec Clarifications).
- File System Access API `showSaveFilePicker`: asks every time; it is 004's mechanism for the granted inbox folder, not for a one-off download.

**Name sanitising**: Chrome replaces `\ / : * ? " < > |` and control characters in a suggested name. The 004 name contains none of them (`—`, spaces, digits, `h`, `.txt`), so the requested name is used as is.

## R2 — Placement and states

**Decision**: In the transcript's footer, after the last line (the slot 006 FR-013 gave `Delete transcript`), first in the row. Running meeting: Download alone. Stopped meeting: Download, then Delete. Absent with no meeting or no downloadable line.

**Rationale**: Decision 32 keeps the header slim (Start/Stop, language, badge, gear) on one line at 320 px; a fifth control there would wrap. The footer is where the transcript's own actions already live, and it is reached by keyboard after the lines. Absent rather than disabled: a disabled button would need a reason (embody-dont-announce tell 3 if explained, a puzzle if not), and the transcript area already says `No transcript yet.`

**Alternatives**: header icon button (crowds the header, needs an icon-only accessible name); a menu (one item does not need a menu).

## R3 — Which lines are written

**Decision**: Finished segments the panel holds whose label is not pending, in `sortSegments` order, with `displayLabel` for the speaker. In-progress partials are never segments, so they are excluded by construction. Segments with `labelPending` are skipped; segments whose text collapses to empty are skipped.

**Rationale**: `displayLabel` is the single source for what the panel shows (002 FR-021), so the file shows the same names, overrides and renames. A pending line's stored `speakerLabel` is "Others" while the panel shows `…`; writing "Others" would put a label in the file that is about to become a name. Stopped meetings never have pending lines (`normaliseSegment` drops the flag).

## R4 — The shared formatter (FR-010)

**Decision**: `src/core/export/transcript-file.ts`, platform-free, exporting:
- `exportTimestamp(ms)` → `mm:ss` with unbounded minutes (`75:12`), floor of whole seconds. Not `formatOffset` (that switches to `h:mm:ss` for the panel).
- `transcriptFileName(startedAt)` → `Meeting — DD-MM-YYYY at HHhMM.txt` from the local date/time of `startedAt`.
- `transcriptFileLines(meeting, segments)` → the `[mm:ss] Speaker: text` lines (R3 rules).
- `hasTranscriptFileLines(segments)` → cheap visibility check without building the body.
- `transcriptFile(meeting, segments)` → `{ name, body }`; body = lines joined by `\n\n` plus a final `\n`, or `''` when there are none.

004 will call `transcriptFile` for its inbox writes; its own suffix rule for name collisions in a granted folder (004 FR-022) stays 004's.

**Local time**: `Date` getters (`getDate`, `getHours`, …) give the local zone, as 004's edge case requires. Tests build `startedAt` from local components (`new Date(2026, 9, 7, 14, 30).getTime()`), so they pass in any time zone.

## R5 — Size and speed

A 3-hour meeting is about 5,000 lines of ~100 characters: ~0.5 MB of string built once on click (sort + map + join), a few milliseconds; `Blob` creation is cheap. Visibility uses `hasTranscriptFileLines`, which stops at the first settled line, so renders of a long transcript do not build the body. SC-003 is checked with a 5,000-line unit timing (`< 200 ms`, generous).

## R6 — Testing the download

- Unit (node): the formatter with fixtures (names, renames, overrides, "Others", user's name, pending, empty text, line breaks, long meeting, Greek, ordering).
- DOM (jsdom): `saveTextFile` creates an anchor with `download` = the name and an object-URL `href`, clicks it, revokes later (`URL.createObjectURL` stubbed). `DownloadTranscript` and `App` placement/states with an injected `save` function.
- Playwright: `page.waitForEvent('download')` on the side-panel page gives `suggestedFilename()` and the saved file; the test reads it and compares bytes. A stored meeting (the existing `standup-en` fixture via `seedAskMeeting`) covers the after-Stop case and "no chat in the file" after asking a question; a running fixture meeting covers the mid-meeting case.
