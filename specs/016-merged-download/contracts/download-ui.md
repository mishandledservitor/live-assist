# UI contract: Merged download (016)

Extends `specs/013-captions-download/contracts/download-ui.md`. One control is added, on one view.

## Download transcript

| Where | Present when | One press saves |
|---|---|---|
| Main view, transcript footer | as 013 (a settled line, or kept captions) | running meeting: 013's file (zip, transcript or captions). Not running: the merged `… — Transcript.txt` when the meeting has both a written line and a caption turn, else 013's file |
| Transcripts row | as 013 | the merged file when both, else 013's file |
| Transcripts single-meeting view | as 013 | the same |

Label `Download transcript` everywhere, row accessible name `Download transcript of {d Mon yyyy}, {HH:MM}`: unchanged. The panel shows nothing after a press; a press whose data cannot be read saves nothing.

## Download originals (new, K47)

| Where | Present when | One press saves |
|---|---|---|
| Transcripts single-meeting view only, in `.past-actions` after `Download transcript`, before `Delete transcript` | the meeting has a written transcript line **and** `hasCaptions` | 013's download for the meeting, byte for byte: `Meeting — DD-MM-YYYY at HHhMM.zip` holding `… — Transcript.txt` (live labels) and `… — Meet captions.txt` |

A `button` with the class `secondary`, text `Download originals`, no other accessible name. Not on the main view, not in a row, not for a meeting with one record (FR-016). Same press behaviour as `Download transcript` (`DownloadButton`): built on press, one file, nothing shown, nothing saved on a failed read.

## Never add

A line or tooltip saying the file is merged, how names were found, or that repeats were removed; a count of removed passages; a second button on the main view or in a row; a header or note in the merged file; a setting to turn merging off. The 013 never-add list stands, except that the single-meeting view now has a second download button (decision 97).
