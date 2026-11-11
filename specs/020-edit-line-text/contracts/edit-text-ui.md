# UI contract: Edit a line's text (020)

Main view, live or stopped meeting (not after `Close transcript`, not a past transcript).

## Opening

- Double-click on the text of a settled line → the text is replaced in place by the editor; the double-clicked word is selected in the field.
- Label editor (002) → `Edit text` → the label editor closes and the text editor opens on that line with all its text selected.
- Nothing opens on the in-progress line, a line showing `…`, a single click, a drag, or any line of a past transcript.
- One editor at a time: opening one closes the other (an unsaved text edit is dropped, as Cancel).

## The editor

| Element | String | Behaviour |
|---------|--------|-----------|
| Group | accessible name `Edit line text` | inline in the line, under the label |
| Field | accessible name `Line text` | textarea, grows with the text; holds `displayText` |
| Button | `Save` | saves; also Enter in the field |
| Button | `Restore original` | only on a corrected line; saves `null` |
| Button | `Cancel` | closes, nothing stored; also Escape |
| Error | `Enter the line's text.` | empty after trimming |
| Error | `Keep the line under 2,000 characters.` | longer than 2,000 after normalisation |
| Error | `Couldn't save this line. Try again.` | the save was refused; editor stays open |

Errors are a `p.field-error` with `role="alert"`, linked by `aria-describedby`, as the label editor's.

After Save, Restore or Cancel focus returns to the line's label button, or to the line itself when its label is plain text.

## The line

- A corrected line shows its corrected text followed by the mark `edited` (muted, small, real text).
- Auto-follow does not scroll while an editor is open.

## Strings for the copy review

New: `Edit text`, `Edit line text`, `Line text`, `Save`, `Restore original`, `Enter the line's text.`, `Keep the line under 2,000 characters.`, `Couldn't save this line. Try again.`, `edited`. Existing: `Cancel`. Rejected candidates (never shown): `Click to edit`, `Double-click to edit`, `Your changes are saved`, `Original:` followed by the original text.
