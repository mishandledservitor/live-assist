# UI contract: notes beside Start and in the Ask area

What tests (unit dom and Playwright) may rely on: roles, accessible names and strings. Every string passed the `embody-dont-announce` procedure (frame, for this author only: "the user's own notes, kept apart from what was said"); the review lists at the end are recorded in `specs/006-panel-redesign/copy-review.md` (K41, R30, R31) and become entries in `tests/fixtures/copy/copy-review.json`.

## Placement

| Region | Where | Shown when |
|---|---|---|
| Next-meeting notes | header row, after the language picker (006 `panel-ui.md` header) | no meeting is running |
| Meeting notes | Ask dock, on the line under the question box beside the model label (003 `ask-ui.md`); the menu opens upwards | a meeting is shown (running or stopped) |

## Controls (`NotesControl`, both places)

| Element | Role / name / text |
|---|---|
| Add | `button` `Add notes` (`aria-haspopup="menu"`); beside Start its accessible name is `Add notes for the next meeting` |
| Menu | `menu` with `menuitem` `Choose file…` and `menuitem` `Paste text`; with notes present also `menuitem` `Remove notes` |
| File input | hidden `input[type=file]` with `accept=".txt,.md,text/plain,text/markdown"`, opened by `Choose file…` |
| Chip | `button` (`aria-haspopup="menu"`) whose visible text is the notes name (`agenda.md` or `Pasted notes`, ellipsis when long); accessible name `Notes: {name}`, beside Start `Notes for the next meeting: {name}`; opens the menu to replace or remove |
| Remove | `button` with visible `×`, accessible name `Remove notes` (beside Start: `Remove notes for the next meeting`) |
| Error | `alert` under the control with the text below; cleared by the next action |

## Paste dialog

| Element | Role / name / text |
|---|---|
| Dialog | `dialog` named `Notes` (modal, focus trapped, Escape cancels) |
| Text box | `textbox` (multi-line) named `Notes`; prefilled with the current notes when they were pasted, else empty |
| Save | `button` `Save notes`, disabled while the box holds only whitespace |
| Cancel | `button` `Cancel` |

## Strings

Errors (`{name}` = the file name):

| Kind | File | Paste |
|---|---|---|
| empty | `{name} is empty.` | (Save is disabled) |
| too-long | `{name} has more than 100,000 characters. Shorten it and add it again.` | `These notes have more than 100,000 characters. Shorten them and save again.` |
| not-text | `{name} isn't UTF-8 text. Save it as UTF-8 and add it again.` | — |
| wrong-type | `Only .txt and .md files can be added.` | — |
| unreadable | `Couldn't read {name}. Try again.` | — |
| save-failed, unknown-meeting | `Couldn't save the notes. Try again.` | same |

Chat (003 `ask-ui.md` "Answer errors"), too-large when the meeting has notes: `The meeting and your notes are too long to send to {M} in full. Remove or shorten the notes.`

Disclosure rewrites (003 `ask-ui.md` "Disclosures", K37; constitution I, FR-016):

- Anthropic: `Each question sends the transcript so far, any notes you added to the meeting and this meeting’s questions and answers to Anthropic. Anthropic deletes API requests and answers within 30 days, keeps content its safety systems flag for up to 2 years, and does not train its models on API data by default.`
- OpenAI: `Each question sends the transcript so far, any notes you added to the meeting and this meeting’s questions and answers to OpenAI, with storage turned off. OpenAI keeps API requests for abuse monitoring for up to 30 days and does not train its models on API data by default.`

Model output, not UI copy: the `From your notes:` label is written by the model in the answer's language (research N5); the panel renders it as ordinary answer text, with two rules (FR-009a, real call 2026-10-10): a recognised label (`From your notes`, `Από τις σημειώσεις σας/σου`, `Στις σημειώσεις σας/σου`, then `:`) that follows a sentence end or a citation in the same paragraph starts a new paragraph (a blank line before it), and a citation inside a notes passage is not shown. A passage runs from the label at the start of a line to the end of its paragraph: a blank line ends it, a single line break ends it unless the next line is a `- ` list item or the label stood alone on its line. Labels in other languages are left as the model wrote them (`src/core/chat/notes-passages.ts`). A Greek label whose first word came out in English (`From τις σημειώσεις σου:` / `σας:`, eval 2026-10-12) in a label position (start of a line, or after a sentence end or citation) is shown as `Από τις σημειώσεις σου:` / `σας:` and then follows the same two rules.

A notes statement the model attributes in the sentence itself (`Your notes give a launch budget of 40k.`, design decision 77) is ordinary answer text: shown as written, no label added, nothing flagged. The panel does not look for such sentences, so a citation the model wrongly attached to one is handled like any other citation; keeping those away is the prompt's job and is measured by `pnpm eval:ask`.

## Copy review (embody-dont-announce)

**Keep** (look suspect, do a job): `Add notes`, `Choose file…`, `Paste text`, `Remove notes`, `Save notes`, `Cancel`, dialog and box name `Notes` (labels and actions); the chip's name text and `Pasted notes` (state the reader cannot otherwise see); the accessible names with `for the next meeting` and `Notes: {name}` (screen-reader equivalent of the chip's position beside Start or in the Ask area); every error (what happened, and what to do where there is something to do); the too-large variant's second sentence (what to do); both disclosure rewrites (required disclosure; they now cover notes).

**Delete / never add** (candidates rejected while drafting, so a later edit does not bring them back): `Notes for the next meeting` as visible text beside Start (duplicates position; the accessible name carries it); `Add context to improve answers` (explains the interface's logic, tell 3); `Context` as a label or heading (names the mechanism, tell 6); `Your notes are only sent to OpenAI` / `Notes are never sent to ElevenLabs` next to the chip (reassurance and a duplicate of the Settings disclosure, tells 4–5); `Notes added` confirmation (the chip shows it, tell 4); `Supported: .txt, .md` helper line (the picker filters; the wrong-type error covers the rest); `Drop a file here` (no drag and drop in 008).

**Do not add**: no character counter in the paste dialog, no notes preview, no "answers use your notes" marker on answers, no helper line under the chip.
