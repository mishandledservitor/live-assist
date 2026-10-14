# UI contract: Download transcript (007)

Extends `specs/006-panel-redesign/contracts/panel-ui.md` "Main view".

| Region / control | Role and accessible name | Notes |
|---|---|---|
| Download | `button` `Download transcript` | In the transcript footer after the last line (`.transcript-footer`), first in the row; present while a meeting is shown that has at least one settled finished line, running or stopped; absent otherwise. One press saves one file named `transcriptFile(...).name` (`Meeting — DD-MM-YYYY at HHhMM.txt`); the panel shows nothing new afterwards. |
| Delete | `button` `Delete transcript` | Unchanged (006), after Download; still only for a stopped meeting. |

## File

Name and body exactly as `data-model.md` (004 FR-017–FR-019). The download is a browser download of a local blob; no message, no network, no permission.

## Strings

One new string: `Download transcript` (copy-review K40). Nothing else is added: no confirmation, toast, count, tooltip or helper text.
