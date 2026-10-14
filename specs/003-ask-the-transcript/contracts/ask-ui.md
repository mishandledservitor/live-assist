# UI contract: Ask on the main view and chat settings

What tests (unit dom and Playwright) may rely on: roles, accessible names and strings. Written for the recommended placement (research R9, spec FR-001); if the user chooses the tab switch, only the "Layout" rows change. Every string here passed the `embody-dont-announce` procedure (frame, for this author only: "a colleague who was listening and only says what was said"); the review lists are at the end and become entries in `tests/fixtures/copy/copy-review.json`.

## Layout (main view, after 006)

| Region | Role / name | Notes |
|---|---|---|
| Header, status line | unchanged (006 `panel-ui.md`) | |
| Transcript | unchanged `region` `Transcript`; each line gets `data-segment-id`; a highlighted line has `aria-current="true"` and the `line-cited` class for 2 s | still fills the space left |
| Conversation strip | `region` `Questions and answers`, present once the meeting has a turn; height ≤ 40% of the panel, scrolls internally, opens scrolled to the latest turn | between transcript and box |
| Collapse toggle | `button` `Hide answers` / `Show answers`, `aria-expanded` | collapsed shows the latest question on one line |
| Question box | `textbox` (multi-line) named `Question`, placeholder `Ask about this meeting` | Enter sends, Shift+Enter new line |
| Ask / Stop | `button` `Ask`; while an answer streams, `button` `Stop` | Ask disabled when the box is empty, there is no key, or no meeting is shown |
| Model | text after the box: the selected model's label, e.g. `Claude Sonnet 5.5` | the AI disclosure next to the input (keep-list) |

## Turn rendering (`ChatThread`)

| Element | Role / text |
|---|---|
| Question | `paragraph` with the question text, visually marked as the user's |
| Answer | `article` named by the question; text with line breaks kept; `aria-busy="true"` while streaming |
| Citation | `button` whose text is the bracketed time as written (`[12:40]`), accessible name `Go to {time} in the transcript` |
| Unmatched time | plain text `[99:99]` |
| Written by | small text under a finished answer: the model label (`Claude Sonnet 5.5`) |
| Waiting for the answer (FR-003a, decision 80) | while the turn is `streaming` and has no answer text: in the answer's place, inside the `article`, an `img` named `Waiting for the answer` (three dots, class `chat-pending`, one text line high so the first words replace it without moving anything; no animation under `prefers-reduced-motion: reduce`). Outside the strip, a visually hidden `status` holds the same words while such a turn exists and is empty otherwise, so a screen reader hears it once per question (the `article` is `aria-busy`, which would hold back a live region inside it) |
| Waiting question | the question with `Waiting…` under it (FR-009, R15) |
| Stopped | `Stopped` under the partial answer |
| Cut off | `The answer was cut off.` + `button` `Try again` |
| Failed | `alert` with the error text below + `button` `Try again`, which puts the question back into the box. After `no-answer` the question is put back without a click, into an empty box only (FR-018a) |

## Strings

Notices beside the box (no turn created):

| Kind | Text |
|---|---|
| no chat key saved at all (both removed in Settings after setup) | `Add a Claude or OpenAI key in Settings to ask questions.` |
| the other provider has a key, the selected one doesn't | Claude selected: `Add a Claude key in Settings to ask questions.`; OpenAI selected: `Add an OpenAI key in Settings to ask questions.` |
| empty transcript | `Nothing transcribed yet.` |
| busy | (none — the Ask button is Stop while an answer streams) |

Answer errors (`{P}` = `Anthropic` or `OpenAI`, `{M}` = model label):

| Kind | Text |
|---|---|
| invalid-key | `{P} rejected the API key. Replace it in Settings.` |
| forbidden | `This {P} API key isn't allowed to use {M}.` |
| billing | `{P} refused the request because of the account's billing or credit. Check your {P} account.` |
| model-unavailable | `{M} isn't available to this {P} account. Pick another model in Settings.` |
| rate-limited | `{P} is rate-limiting requests. Try again in a moment.` |
| overloaded, unavailable | `{P} is busy or unavailable. Try again in a moment.` |
| network | `Couldn't reach {P}.` |
| too-large | `The meeting is too long to send to {M} in full.` |
| declined | `{M} declined to answer this question.` |
| unknown | `{P} returned an unexpected response.` |
| no-answer (no answer text within 45 s, FR-018a) | `No answer came back. Ask again.` |

## First-run setup additions (research R16, FR-011a)

Inside the existing `region` `Set up live-assist` form, after the ElevenLabs key field:

| Element | Role / name / text |
|---|---|
| Provider | `radiogroup` `Answers from` with `radio` `Claude` and `radio` `OpenAI` (checked by default, design decision 40) |
| Key | `textbox` (password) `Claude API key` or `OpenAI API key` (label follows the choice), help `Stored only in this browser on this computer (never synced).` |
| Submit | `button` `Check keys and save`; while checking `Checking keys…` (006 copy-review R28) |
| Errors (`alert`) | `Enter your Claude API key.` / `Enter your OpenAI API key.`; `Anthropic rejected this key. Check that you copied the whole key, or create a new one in the Claude Console.`; `OpenAI rejected this key. Check that you copied the whole key, or create a new one in your OpenAI account.`; `This key isn't allowed to use the Claude API.` / `This key isn't allowed to use the OpenAI API.`; `Could not reach Anthropic. Check your internet connection and try again.` / same for OpenAI; `Anthropic returned an unexpected response. Try again in a moment.` / same for OpenAI |
| Disclosures | after `What ElevenLabs keeps`: the chosen provider's `What Anthropic keeps` / `What OpenAI keeps` section (same text as Settings, below) |
| Saved screen | `Keys saved on this computer only: ElevenLabs ••••{hint}, Claude ••••{hint}` (or `OpenAI`) (006 copy-review R29), then the existing microphone text and buttons |
| Chat step only (installs set up before 003) | same region and heading; only provider, key, disclosure and `button` `Check key and save`; saved screen `Key saved on this computer only: ••••{hint}` and `Done` |

## Settings screen additions (006 `panel-ui.md` order; new rows after `Key terms`)

| Order | Heading (`h3`) | Content |
|---|---|---|
| 4a | `Questions` | `radiogroup` `Answers from` with `radio` `Claude` and `radio` `OpenAI` (default); `combobox` `Model` listing the selected provider's labels (R3) |
| 4b | `Claude API key` | saved key `…abcd` or `No key saved.`; `textbox` `New key`; `button` `Check and replace key`; `button` `Remove key`; results `Key works.` / `Anthropic rejected the API key.` / `This key isn't allowed to use the Claude API.` / `Couldn't reach Anthropic.` |
| 4c | `OpenAI API key` | same pattern with OpenAI wording |
| 8a | `What Anthropic keeps` (Claude selected) or `What OpenAI keeps` (OpenAI selected) | disclosure below; after `What ElevenLabs keeps` |

Disclosures (required content, keep-list; wording re-checked against the providers' pages at implementation, research R11 — re-read 2026-10-09: Anthropic's no-training statement is "by default", so its text gains those words; OpenAI's matched):

- `Each question sends the transcript so far, any notes you added to the meeting and this meeting's questions and answers to Anthropic. Anthropic deletes API requests and answers within 30 days, keeps content its safety systems flag for up to 2 years, and does not train its models on API data by default.` + link `Anthropic privacy policy`.
- `Each question sends the transcript so far, any notes you added to the meeting and this meeting's questions and answers to OpenAI, with storage turned off. OpenAI keeps API requests for abuse monitoring for up to 30 days and does not train its models on API data by default.` + link `OpenAI data controls`.

## Copy review (embody-dont-announce)

**Keep** (look suspect, do a job): the model label next to the box and under each answer (AI disclosure and FR-015); both disclosures (constitution I); `Nothing transcribed yet.` (empty state: what happened; the action — Start — is visible); every error's second sentence (what to do); `Waiting…`, `Stopped` (state the reader cannot otherwise see); citation accessible names (screen-reader equivalent of the button's position).

**Delete / never add** (candidates rejected while drafting, so a later edit does not bring them back): `Ask anything about the meeting so far!` (reassures); `Answers are based only on the transcript` (explains the interface's logic — the citations show it); `AI assistant` heading over the strip (names the frame); `Powered by Claude` (names the mechanism; the model label already discloses); `Click a timestamp to jump to the transcript` (narrates; the citation is a button); `The transcript may be incomplete while reconnecting` (duplicates the status line); `Your key is stored securely` (implies a guarantee, constitution I).

Added 2026-10-13 (design decision 80, FR-003a, FR-018a). **Keep**: `Waiting for the answer` (accessible name of the waiting mark and the one announcement: a state the listener cannot otherwise perceive, the equivalent of the dots; sighted readers get the dots and no sentence); `No answer came back. Ask again.` (what happened in the reader's words, then what to do; the question is already back in the box, so `Ask` is the next press). It names no provider and no time limit: which side stalled is not known, and the limit is the interface's own logic. **Delete / never add**: `Thinking…` (credits the wait with a mechanism nobody has observed); `Generating answer…` (narrates the screen); `This is taking longer than usual` (reassures, and explains nothing the reader can act on); `The request timed out after 45 seconds` (names the mechanism); `Your question was put back in the box` (duplicates what the box shows); `Retrying…` (nothing is retried).

**Do not add**: no counters (questions asked, tokens, cost), no onboarding hint, no helper line under the box.
