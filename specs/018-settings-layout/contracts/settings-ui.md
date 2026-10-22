# UI contract: the Settings screen after 018

Under the screen bar (`Back`, heading `Settings`, unchanged), three groups in this order. `h3` = group heading (role `region` named by it), `h4` = sub-heading (role `region` named by it where it was one before).

## Transcription (`h3`)

1. `h4` `ElevenLabs API key` — key block (below).
2. `h4` `ElevenLabs account` with the button `Check again` beside it; the account line and detail lines as before (K24-K26, the network error now `Couldn't reach ElevenLabs to check your plan.`).
3. `h4` `What ElevenLabs keeps` — K14-K16 unchanged.
4. `h4` `Key terms`, its description (K17), the list of term rows (no bullets; field + `Remove` on one line), the not-used list directly under the terms when there is one, then the field `New key terms, separated by commas or one per line` + `Add terms` (K17a).
5. Tick box `Leave out fillers and false starts` (no heading).
6. Button `Allow microphone` (no heading).
7. Tick box `Remind me to tell participants they are being transcribed each time I press Start` (no heading).

## Speaker names (`h3`)

1. Field `Your name` + `Save name` on one line; `Name saved.` / name errors as before.
2. Tick box `Show Meet captions`.
3. `h4` `Remembered names`, `Changes here apply from the next meeting.`, then the empty line or the list (K19 otherwise unchanged).

## Questions (`h3`)

1. Tick box `Ask questions about the meeting` (K48). Unticked: nothing else in the group.
2. `Answers from` radios and `Model` select (unchanged).
3. `h4` `{Claude|OpenAI} API key` — key block for the selected provider only.
4. `h4` `What {Anthropic|OpenAI} keeps` — K37 unchanged, for the selected provider.

## Key block

| State | Shows |
|---|---|
| Key saved, closed | one line: `Saved key: ••••{hint}`, `Replace`, `Remove` |
| Replacing | password field (accessible name = the block heading), `Check and save` (`Checking key…` while checking), `Cancel`; Escape in the field = `Cancel`; focus moves to the field, and back to `Replace` on cancel |
| No key saved | `No key saved.` then the field and `Check and save` (no `Cancel`) |
| ElevenLabs `Remove` | `Remove the saved key? Transcription cannot start without one.` `Yes, remove` `Cancel` (unchanged) |
| After a check | success: closed line with the new hint and `Key replaced.` (ElevenLabs) / `Key works.` (chat); failure: field stays open with the existing error alert |

## Gone from the screen

Headings `Consent reminder`, `Clean transcript`, `Microphone`; the sentence `When you rename someone Meet's captions named, the new name is used for them in later meetings too.`; `New key`, `Check and replace key`, `Remove key`; `↻` and `Refresh account status`; the second chat key block; the retention texts at the bottom of the screen.

## Never add

An intro line, a description under a group heading, helper text in place of a deleted line.

## Widths

320 px: no horizontal scroll. 380 px: each field and its button on one line.
