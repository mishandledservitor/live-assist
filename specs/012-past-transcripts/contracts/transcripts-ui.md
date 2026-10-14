# UI contract: Transcripts screen and the clean main view (012)

Extends `specs/006-panel-redesign/contracts/panel-ui.md`. What unit dom tests and Playwright may rely on: roles, accessible names, order and states. Strings are those of spec.md "Proposed copy" (P1–P18), entered in `specs/006-panel-redesign/copy-review.md` as K43; this file adds no string.

`{date}` is `{d Mon yyyy}` (e.g. `7 Oct 2026`), `{time}` is `HH:MM` (e.g. `14:30`), both local, from the moment transcription started. `{title}` is the meeting's display title (`displayTitle`, spec Clarifications E2, design decision 76); a meeting may have none.

## Main view (changes only)

| Region / control | Role and accessible name | Notes |
|---|---|---|
| Transcripts | `button` `Transcripts`, `title` `Transcripts`, in the header's end group before the gear (`.icon-button.transcripts`) | Opens the Transcripts screen. Present whenever the header is (so not during setup). The header stays on one line at 320 px. |
| Delete confirmation | `group` `Confirm delete`, text K6 unchanged | After a failed deletion it also holds an `alert` with `Couldn't delete this transcript. Try again.`; the transcript stays and the panel stays on the main view. |
| After a successful `Delete transcript` | — | The Transcripts screen is shown with its title focused. |
| Clean main view | `log` `Transcript lines` containing `No transcript yet.`; no `Download transcript`, no `Delete transcript`; the question box as with no meeting | After the meeting shown here was deleted (here or on the Transcripts screen), until the next Start; also after the panel is reopened. No string says a transcript was deleted or where the others are. |

Everything else on the main view is unchanged, including `Download transcript` (now through `meetingFiles`, same file).

## Transcripts screen: the list

`section` labelled by its heading, class `transcripts-screen`, shown in place of the main view (the main view stays mounted and hidden).

| Order | Region / control | Role and accessible name | Notes |
|---|---|---|---|
| 0 | Back | `button` `Back` | Returns to the main view; focus goes to the `Transcripts` button. |
| 1 | Title | `heading` level 2 `Transcripts`, `tabindex="-1"` | Focused when the screen opens. Stays in view while the list scrolls. |
| 2 | Announcements | `status` (polite), visually hidden | Empty, or `Transcript deleted.` after a deletion. |
| 3 | List | `list` named `Transcripts`, inside the screen's only scroller (`.transcripts-list`, `position: relative`, focusable) | One `listitem` per stored meeting, newest first; the running meeting first. Each item has `data-meeting-id` and `data-state` (`in-progress`, `stopped`, `interrupted`). |
| 3′ | Empty | `paragraph` `No transcripts stored.` in place of the list | Nothing else but Back and the title. |
| 3″ | Read failure | `alert` `Couldn't read the stored transcripts. Close the panel and open it again.` in place of the list | Never the empty state. |

Nothing is shown between opening and the first rows: no loading text, no count, no intro line.

### A row

| Part | Role and accessible name | Notes |
|---|---|---|
| Opening control | `button` (`.meeting-open`) `Open transcript of {date}, {time}`, or `Open transcript of {title}, {date}, {time}` when the meeting has a title; visible text: the title line when there is one, then `{date} · {time} · {duration}` (`.meeting-when`, a `span` inside the button); described by the row's marker and names (`aria-describedby`) | `stopped` / `interrupted`: shows that meeting's transcript in this screen. `in-progress`: returns to the main view. The duration part is left out for the running meeting, for an interrupted meeting with no line, and until an interrupted meeting's details are ready. Stays on one line at 320 px. |
| Title line | text `{title}` (`.meeting-title`, a `span` inside the opening control, before `.meeting-when`), with the full title as its `title` attribute | Only when the meeting has a display title; otherwise the element is absent and nothing stands in for it. One line, cut with an ellipsis when it does not fit; never wraps and never widens the page. Rendered as text. Also on the running meeting's row. |
| Marker | text `In progress` or `Interrupted` (`.meeting-marker`) | Absent on a stopped meeting. |
| Names | text `{name}, {name}` then ` +{n} more` (`.meeting-names`); or `Nothing was transcribed.` | At most four names. Absent when the meeting has lines but no confirmed name, and until the row's details are ready. |
| Download | `button` `Download transcript of {date}, {time}`, visible text `Download transcript` | Only when the meeting is not running and its file would have at least one line. One press saves the file(s); the screen does not change. |
| Delete | `button` `Delete transcript of {date}, {time}`, visible text `Delete transcript` | Not on the running meeting. |
| Confirmation | `group` `Confirm delete`: `Delete the transcript of {date}, {time} permanently? Its questions, answers and notes are deleted too. It cannot be recovered.`, `button` `Delete permanently` (focused), `button` `Cancel` | Replaces the row's Delete while open. At most one open in the list: opening another closes this one. Cancel or Escape closes it and focuses the row's Delete. |
| Failure | `alert` `Couldn't delete this transcript. Try again.` inside the confirmation | The row stays; the confirmation stays open. |

After a confirmed deletion: the row is gone, the `status` says `Transcript deleted.`, focus is on the next row's opening control, else the previous row's, else the title; when no row is left the list is replaced by `No transcripts stored.`.

While the screen is open: when the running meeting stops, its row loses `In progress` and gains its actions without the user leaving the screen.

Keyboard: Tab order is Back, list scroller, then per row: opening control, Download, Delete. Escape closes an open confirmation; with none open, it goes Back.

## Transcripts screen: one meeting

Same `section`; the list stays mounted and hidden, keeping its scroll position.

| Order | Region / control | Role and accessible name | Notes |
|---|---|---|---|
| 0 | Back | `button` `Back` | Returns to the list at the same scroll position, focus on that meeting's opening control. |
| 1 | Title | `heading` level 2, `tabindex="-1"`: `{date}, {time}` in a `.meeting-when` span; when the meeting has a title, a `.meeting-title` span with `{title}` before it (its own line, one line with an ellipsis, full title in its `title` attribute) | Focused when the meeting opens. Without a title the heading's name is `{date}, {time}` as before. |
| 2 | Actions | `Interrupted` (text, only for an interrupted meeting), `button` `Download transcript` (when it has a file line), `button` `Delete transcript` | A row under the title, not scrolling with the transcript. Delete opens the same confirmation as in a row (P13). |
| 3 | Transcript | `region` `Transcript` containing a `group` `Transcript lines` (focusable scroller, `.transcript-scroll`, `position: relative`) | Every stored line in the main view's order: time, label, text. Labels are text, not buttons (`.label-confirmed` / `.label-fallback` with the same visually hidden suffixes as the main view). Opens at the first line. No in-progress line, no footer, no question box, no notes control, no answers. |
| 3′ | No lines | `paragraph` `Nothing was transcribed.` in place of the transcript | Delete only. |

A confirmed deletion here returns to the list without that meeting, with the announcement and focus rule above. Escape closes an open confirmation, else goes back to the list.

## Layout

- The page never scrolls on this screen: `document.documentElement.scrollHeight` equals the panel height with 200 rows and with a 1,500-line transcript open. Only `.transcripts-list` or `.transcript-scroll` scrolls; both are positioned (006 FR-023).
- 320 px wide: nothing is hidden or cut off; names and actions wrap under the date line. The one exception is a title longer than its line, which ends in an ellipsis (its full text is in the accessible name and on hover); the date line under it is whole.
- Light and dark, contrast and non-colour cues as 006 FR-020 and FR-021; the markers are text, not colour.

## Never add (copy review)

A count of transcripts; a loading line; a visible `Deleted` or `Downloaded` message; a line on the clean main view saying a transcript was deleted or pointing at the Transcripts screen; an explanation of why the running meeting has no actions; a tooltip explaining `Interrupted`; the site's name or the page's address; a label in front of the title (`Title:`); a placeholder where a meeting has no title (`Untitled`, `Meet call`, the meeting code); `Past` in the screen's name; a `View` label on a row; a helper line about where files are saved.
