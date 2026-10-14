# UI contract: side panel after 006

What tests (unit dom and Playwright) may rely on. Strings are those of `copy-review.md`; this file names roles and accessible names only.

## Main view

| Region / control | Role and accessible name | Notes |
|---|---|---|
| Title | `heading` level 1 `live-assist`, visually hidden | K32 |
| Header | `banner`-like `header` element containing the controls below, on one line ≥ 320 px | |
| Start / Stop | `button` `Start` / `Stop` | Stop replaces Start while running |
| Language | `combobox` `Language`; first option `Auto-detect` | disabled while running or busy |
| Next meeting's notes (008) | `button` `Add notes` (named `Add notes for the next meeting`) or a chip named `Notes for the next meeting: {name}` with `Remove notes for the next meeting`, after the language picker | only while no meeting runs; details in `specs/008-meeting-context/contracts/notes-ui.md` |
| Credits badge | `button` named by `describeBadge().name`, text `describeBadge().text`, `aria-busy` while fetching | opens Settings at the account section |
| Transcripts (012) | `button` `Transcripts`, `title` `Transcripts`, in the header's end group before the gear | opens the Transcripts screen; present whenever the header is; details in `specs/012-past-transcripts/contracts/transcripts-ui.md` |
| Gear | `button` `Settings` | opens Settings |
| Notices | not-ready `paragraph` (K3); start error `alert` (K4/R2/R3) with `Stop that one`; consent `alertdialog` `Consent reminder` (K1) | between header and status |
| Status line | `region` `Status`, live `polite`; four items each with accessible name `{label}: {text}` | one line unless a dot has tone `error` |
| Expanded problem | per failing dot: `{label}` and `{text}` visible; `button` `Allow microphone` for mic | |
| Transcript | `region` `Transcript` with `log` `Transcript lines` | fills remaining height; each line has `data-segment-id` (003) |
| Conversation strip (003) | `region` `Questions and answers`, once the meeting has a turn; `button` `Hide answers` / `Show answers` | between transcript and box, at most about 40% of the panel height (design decision 38); details in `specs/003-ask-the-transcript/contracts/ask-ui.md` |
| Question box (003) | `textbox` `Question`, `button` `Ask` / `Stop`, the selected model's label after it | pinned under the transcript; strings and notices in `specs/003-ask-the-transcript/contracts/ask-ui.md` |
| Meeting notes (008) | `button` `Add notes` or a chip named `Notes: {name}` with `Remove notes`, on the line under the question box beside the model label | whenever a meeting is shown; details in `specs/008-meeting-context/contracts/notes-ui.md` |
| Download (007) | `button` `Download transcript` after the last line, before Delete (K40) | running or stopped, once the meeting has a settled line; details in `specs/007-download-transcript/contracts/download-ui.md` |
| Delete | `button` `Delete transcript` after the last line of a stopped meeting; confirmation `group` `Confirm delete` (K6) | never while running |
| Failed deletion (012) | `alert` `Couldn't delete this transcript. Try again.` inside the open `Confirm delete` group | the transcript stays and the panel stays on the main view |
| After a deletion (012) | — | the Transcripts screen is shown with its title focused; the main view is then clean (`No transcript yet.`, no Download, no Delete) until the next Start (design decision 64) |
| Retention | absent from the main view | FR-016 |

## Settings screen

| Order | Section heading (`heading` level 3 unless noted) | Content |
|---|---|---|
| 0 | `button` `Back`, then `heading` level 2 `Settings` (focused on open) | |
| 1 | — (no heading, D11) | `textbox` `Your name`, `Save name` |
| 2 | `ElevenLabs API key` | saved key or `No key saved.`; `textbox` `New key`; `Check and replace key`; `Remove key` |
| 3 | `ElevenLabs account` (id `account-heading`) | account line, exact credits line, caveat (K24), `Refresh account status`; no `Details` disclosure |
| 4 | `Key terms` | as today with K17 strings |
| 4a–4c | `Questions`, `Claude API key`, `OpenAI API key` (003) | per `specs/003-ask-the-transcript/contracts/ask-ui.md` "Settings screen additions" |
| 5 | `Consent reminder` | `checkbox` `Remind me to tell participants they are being transcribed each time I press Start` |
| 6 | `Remembered names` | as today (K19) |
| 7 | `Microphone` | `button` `Allow microphone` only (D10) |
| 8 | `What ElevenLabs keeps` | R16 summary, R17 billing line, K15 instruction with `ElevenLabs privacy policy` link |
| 8a | `What Anthropic keeps` or `What OpenAI keeps` (003, the selected provider) | per `specs/003-ask-the-transcript/contracts/ask-ui.md` |

Back and Escape (outside text fields and selects) return to the main view and focus the gear.

## Transcripts screen (012)

The list of stored meetings, one meeting's transcript read-only, per-meeting Download and Delete: roles, names, order and states are in `specs/012-past-transcripts/contracts/transcripts-ui.md`, strings in `copy-review.md` K43. Back and Escape return to the main view and focus the `Transcripts` button. Selecting the running meeting's row returns to the main view the same way. With the control in it the header still stays on one line at 320 px: every control keeps its label on one line and the language picker gives way.

## Setup

Unchanged structure (`region` `Set up live-assist`); strings per R18, R19 and the RetentionNotice changes (R16, R17). No header, status line or gear.

003 adds the chat step to the same form (`radiogroup` `Answers from`, the chosen provider's key field and disclosure; button and saved line per R28, R29), and a chat-only step for installs set up before 003 (provider, key, disclosure, `Check key and save`, `Done`), shown while `chat.setupComplete` is false. Details: `specs/003-ask-the-transcript/contracts/ask-ui.md` "First-run setup additions".

## Mic-permission page

Unchanged structure; `why` text per R26.

## Manifest

`description` per R1; `name` and `action.default_title` unchanged.
