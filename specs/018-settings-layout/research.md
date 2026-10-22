# Research: Settings layout (018)

## R1 Group markup and heading levels

- Decision: each group is a `section` labelled by an `h3` (`Transcription`, `Speaker names`, `Questions`); the existing sub-headings inside a group become `h4` (`ElevenLabs API key`, `ElevenLabs account`, `What ElevenLabs keeps`, `Key terms`, `Remembered names`, `{Claude|OpenAI} API key`, `What {Anthropic|OpenAI} keeps`).
- Rationale: the group names are the only new headings (FR-001); keeping the sub-headings as `h3` would put them on a level with their group for screen readers. Their text is unchanged (K13, K14, K17, K19, K26, K37).
- Alternatives: dropping the sub-headings (a copy change the review did not list); a `fieldset`/`legend` per group (groups hold more than form controls).

## R2 Where the retention texts render

- Decision: `RetentionNotice` renders inside `Settings`, after the account section; `ChatRetention` renders inside `ChatSettings`, after the selected provider's key block, for the provider currently selected there. `App.tsx` no longer appends either. Both components gain `headingLevel={4}`; their defaults (used by setup) stay.
- Rationale: FR-003 (beside the key); `ChatSettings` already holds the selected provider, so a switch updates the text in the same render. Setup keeps its own calls and props, so it does not change.

## R3 Key block (decision 106)

- Decision: one component `KeyBlock` for the ElevenLabs key and the chat key. Closed: `Saved key: <code>••••{hint}</code>` then `Replace` and `Remove` on one line. `Replace` opens the field (type password, accessible name from the block heading, focused) with `Check and save` and `Cancel`; Escape in the field or `Cancel` closes it unchanged and puts focus back on `Replace`. A key that passes the check is saved and the line returns with the new masked key and the existing success line (`Key replaced.` / `Key works.`). With no key saved the field and `Check and save` show at once after `No key saved.`, with no `Cancel`. The ElevenLabs `Remove` opens the existing confirmation (`Remove the saved key? Transcription cannot start without one.`, `Yes, remove`, `Cancel`); the chat key's `Remove` removes at once, as before. While checking, the button reads the existing `Checking key…`. A failed check keeps the field open with the existing error. The field is emptied after every check, for the ElevenLabs key as for the chat keys (before 018 only the chat field was), so a key never stays on screen.
- Strings: `Replace` and `Check and save` are new (FR-002) and replace `New key` (the field's label) and `Check and replace key`. The remove button reads `Remove`, as decision 106 and FR-002 name it, replacing `Remove key`; `Remove` is already K17's string. `Saved key:` stays: it is in K13 and the review does not delete it.
- Rationale: the field needs a name and `New key` is gone, so it takes the block heading (`ElevenLabs API key`), which adds no string. Escape inside a field already does not leave Settings (`SettingsScreen` ignores Escape in inputs), so the field can use it to cancel.
- Alternatives: keep `Remove key` (contradicts decision 106's `Remove`); drop `Saved key:` (an unlisted deletion).

## R4 One chat key (decision 107)

- Decision: `ChatSettings` mounts `KeyBlock` for `chat.provider` only, keyed by provider so a switch starts closed. Hints for both providers stay in `ChatSettings` state and `LoadedSettings`; nothing is removed on a switch.

## R5 Account error and `Check again`

- Decision: `ACCOUNT_ERROR_MESSAGES.network` becomes `Couldn't reach ElevenLabs to check your plan.` The refresh control is a text button `Check again` (its accessible name is its visible text; the `↻` glyph, `aria-label` and `title` `Refresh account status` go). It stays where the `↻` was, beside the `ElevenLabs account` heading, in every state, keeping `aria-disabled` while busy.
- Note: the header badge reuses `ACCOUNT_ERROR_MESSAGES` as its accessible name and tooltip (K26), so its name follows the rewrite. The string has one source; the review rewrote the string, not a copy of it.

## R6 Layout at panel width

- Decision: `.settings-group` sections with a top border and spacing; a `.field-row` flex line (`gap`, `flex-wrap: wrap`, the input `flex: 1 1 8em; min-width: 0`) for name, key field, key-term rows, new key terms and remembered-name rows; the key line is the same flex row; the key-term list has `list-style: none; padding: 0`. Tick boxes keep their labels as block rows. The account head stays a flex row.
- Rationale: FR-008, FR-009. `min-width: 0` and wrapping stop overflow at 320 px; at 380 px each field and its one button fit on one line.

## R7 Measuring SC-002

- Decision: an e2e case in `tests/e2e/panel-layout.spec.ts` seeds the same settings (name, two key terms, ElevenLabs key, OpenAI selected with its key saved, no remembered names), opens Settings at 380 px and reads the Settings screen's `scrollHeight`. The value before 018, measured on the pre-018 build with the same test, is recorded here and in the test; the test asserts the new value is at most two thirds of it.
- Measured on macOS (2026-10-22): 1762 px before 018, 1146 px after (35% shorter; the bound is 1174 px). The assertion runs on macOS only: the baseline is a macOS measurement, and other systems' fonts wrap the same text differently, so there the height is logged, not compared.
- To reach the bound without touching copy, the groups use a line height of 1.35 and tighter heading and paragraph margins, and the three retention texts are set at 13 px (the account detail's size) beside their keys.
