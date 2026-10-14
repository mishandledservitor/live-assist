# UI contract: Close transcript

| Element | Text | Role / name | Shown when |
|---------|------|-------------|------------|
| Close button | `Close transcript` (X1) | button, name `Close transcript` | a stopped (or interrupted) meeting is on the main view; never while it runs |
| Failure line | `Couldn't close this transcript. Try again.` (X2) | `alert` | after a failed close, until the next press |

Order in the row under the last line: `Download transcript` (if the meeting has something to download), `Close transcript`, `Delete transcript`. When the delete confirmation is open it takes the row's full width beneath the buttons (existing `.transcript-actions > .notice`).

After a successful close: the main view is clean (`No transcript yet.` only; no Download, Close or Delete; no conversation strip; the question box as with no meeting) and focus is on the header's `Transcripts` control (the `Settings` gear when there is none).

Never add: `Transcript closed`, `Saved to Transcripts`, a line on the clean main view pointing at the Transcripts screen, a tooltip or helper line saying closing does not delete, a confirmation before closing, a line saying the panel cleared itself, `Undo`.
