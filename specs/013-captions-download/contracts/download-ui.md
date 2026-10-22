# UI contract: Captions download (013)

Extends `specs/007-download-transcript/contracts/download-ui.md` and `specs/012-past-transcripts/contracts/transcripts-ui.md`. No region, control, role or accessible name is added. What changes is when two existing controls are present, what one press saves, and three texts.

## Download transcript

| Where | Present when | One press saves |
|---|---|---|
| Main view, transcript footer (007) | the meeting shown has a settled finished line, **or** kept captions (`meeting.hasCaptions`) | exactly one file, see below |
| Transcripts row (012) | the stopped or interrupted meeting's summary has `fileLines > 0`, **or** `meeting.hasCaptions` | the same file the main view saves for that meeting |
| Transcripts single-meeting view (012) | as the row; with no transcript line the view still reads `Nothing was transcribed.` and Download stands beside Delete when the meeting has captions | the same |

Label `Download transcript` everywhere; accessible name in a row `Download transcript of {d Mon yyyy}, {HH:MM}` (012 P11). Unchanged.

| The meeting has | File saved | Type |
|---|---|---|
| transcript lines and captions | `Meeting — DD-MM-YYYY at HHhMM.zip` holding `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt` then `Meeting — DD-MM-YYYY at HHhMM — Meet captions.txt` | `application/zip` |
| transcript lines only | `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt` | `text/plain;charset=utf-8` |
| captions only | `Meeting — DD-MM-YYYY at HHhMM — Meet captions.txt` | `text/plain;charset=utf-8` |
| neither | no button | |

(Amended 2026-10-22, feature 016, decision 93: for a meeting that is no longer running, the "transcript lines and captions" row saves `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt`, the merged transcript, as `text/plain;charset=utf-8`; the zip is saved by `Download originals` on the Transcripts screen's single-meeting view, decision 97. A running meeting still saves the zip.)

A browser download of a local blob through an anchor, as 007: no message, no network, no permission. One download per press, so Chrome's multiple-downloads prompt cannot appear. The panel shows nothing new afterwards. If the stored captions cannot be read, the press saves nothing and shows nothing; the transcript is never saved alone in place of the zip.

## Reminder on Start

Amended 2026-10-13 (decision 79, superseding decision 71): this feature does not change the reminder.

`alertdialog` `Consent reminder`, unchanged in structure, buttons and text.

| Tab | Text |
|---|---|
| Any tab, a Google Meet call included | K1: `Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs and the transcript is kept on this computer. You can turn this reminder off in Settings.` |

The reminder appears at once when Start is pressed; the tab is not asked about. With the reminder turned off in Settings nothing is shown. Captions are kept on a Google Meet call either way (decision 65). Withdrawn: C2, the wait for the tab's platform, and the swap of K1 for C2 when a tab became a Meet call while the reminder was open.

## Delete confirmation

| Where | The meeting has captions | Text |
|---|---|---|
| Main view | yes | C3: `Delete this transcript permanently? Meet's captions of this meeting are deleted too. It cannot be recovered.` |
| Main view | no | K6, unchanged |
| Transcripts screen | yes | C4: `Delete the transcript of {d Mon yyyy}, {HH:MM} permanently? Its questions, answers, notes and Meet's captions are deleted too. It cannot be recovered.` |
| Transcripts screen | no | 012 P13, unchanged |

Buttons, focus, Escape, the failure line and the announcement are 006's and 012's, unchanged.

## Never add (copy review)

A "captions kept" badge, dot, status row or count; a line under the button saying what the zip holds or that it is a zip; a second button for the captions; a message that a meeting has no captions; a `Downloaded` message; a setting to turn captions keeping on or off; any caption text, anywhere in the panel; a note in the captions file or the zip (header, footer, readme); a marker for a gap in the captions file. (Amended 2026-10-22, feature 016, decision 97: `Download originals` on the single-meeting view is the one second download button, and only there.)
