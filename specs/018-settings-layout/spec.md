# Feature Specification: Settings layout

**Feature Branch**: `018-settings-layout`

**Created**: 2026-10-22

**Status**: Draft (clarifications pending)

**Input**: Owner, 2026-10-22: "your whole settings page is a disaster", with `/embody-dont-announce`. The review of that day (`input-2026-10-22.md` in this folder) found four structural problems (no order or grouping; the same four-row key block three times, both chat keys shown when one provider is selected; a heading over single controls; a raw form layout at panel width) and a copy list (Delete, Rewrite, Keep, Do not add). Built after 017 (decision 104): 017's `Ask questions about the meeting` tick box is part of the screen.

## Clarifications

### Session 2026-10-22 (owner)

- Q55: The groups and their order? → A: Three groups, in this order. **Transcription**: the ElevenLabs key with the account line and what ElevenLabs keeps, key terms, `Leave out fillers and false starts`, `Allow microphone`, the consent reminder. **Speaker names**: `Your name`, `Show Meet captions`, remembered names. **Questions**: `Ask questions about the meeting`, the provider and model, and the provider's key with what it keeps (decision 105).
- Q56: How a key block looks and works? → A: One line: the masked key, then `Replace` and `Remove`. `Replace` swaps that line for the key field and `Check and save` (Escape or `Cancel` puts the line back unchanged); a key that passes the check is saved and the line returns with the new masked key. With no key saved, the field and `Check and save` show at once beside `No key saved.`. `Remove` keeps the ElevenLabs confirmation (`Remove the saved key? Transcription cannot start without one.`) (decision 106).

### Session 2026-10-22 (decided without the owner; each can be overruled)

- Q: Does any setting change what it does? → A: No. Every setting keeps its stored value, its default and its effect. Only the screen's order, grouping, layout and the reviewed strings change.
- Q: The copy review's lists? → A: Applied exactly: the four Deletes, the one Rewrite, every Keep string unchanged in wording (moved where the layout puts them), and nothing added in place of deleted lines.
- Q: The provider-retention texts ("What ElevenLabs keeps", "What OpenAI keeps", "What Anthropic keeps")? → A: Required disclosures, kept word for word, each shown beside the key it is about instead of at the bottom of the screen.
- Q: Width? → A: The screen works at the narrowest panel width the panel already supports (320 px) with no sideways scrolling, and no button wraps onto a line of its own under its field unless the width forces it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find a setting at a glance (Priority: P1)

The user opens Settings to change one thing (their name, a key, key terms, captions, questions). The screen is in a few named groups in an order that matches how the product is used, so they find it without reading the whole page.

**Why this priority**: It is the owner's complaint: the current screen has no order.

**Independent Test**: Render Settings at 380 px and at 320 px; check the groups, their order and their contents match FR-001, and that each control works as before.

**Acceptance Scenarios**:

1. **Given** Settings is open, **When** the user looks at it, **Then** the controls are in the groups and order of FR-001.
2. **Given** any setting, **When** the user changes it, **Then** it saves and takes effect exactly as before 018.

---

### User Story 2 - One compact block per key (Priority: P1)

Each key (ElevenLabs, and the chat provider's) is one compact block: what is saved, a way to replace it and a way to remove it, with that provider's retention text beside it.

**Why this priority**: The three repeated four-row key blocks are most of the screen's length and noise.

**Independent Test**: With keys saved and with none saved, check each key block's rows, that replacing and removing work as before, and that the retention text sits with its key.

**Acceptance Scenarios**:

1. **Given** a saved key, **When** the user looks at its block, **Then** it shows the masked key and the replace and remove actions on one line, `Replace` opens the field with `Check and save` in its place, and Escape or `Cancel` closes it unchanged.
2. **Given** Ask is on, **When** the user looks at Questions, **Then** only the selected provider's key block is shown [NEEDS CLARIFICATION: Q57, only the selected provider's key, or both]; switching provider shows the other provider's block, and a key saved for the other provider is kept.
3. **Given** Ask is off (017), **When** the user looks at Questions, **Then** only the heading and the tick box are shown, as 017 decided.

---

### User Story 3 - The copy review applied (Priority: P2)

The reviewed strings are deleted or rewritten as listed; nothing new is added in their place.

**Independent Test**: Search the rendered screen for each deleted string (absent) and each Keep string (present, same wording).

**Acceptance Scenarios**:

1. **Given** Settings is open, **Then** the headings `Consent reminder`, `Clean transcript` and `Microphone` and the sentence `When you rename someone Meet's captions named, the new name is used for them in later meetings too.` are absent.
2. **Given** the account check failed, **Then** the line reads `Couldn't reach ElevenLabs to check your plan.` and the refresh control shows the label `Check again`.
3. **Given** Settings is open, **Then** every Keep string of the review is present with its wording unchanged.

### Edge Cases

- No ElevenLabs key saved (after `Remove key`): the block shows `No key saved.` and the field to add one, as today.
- Account status is still loading or the key has no User: Read access: the account line shows today's text in its new place.
- No remembered names: today's empty line, in its new place.
- Flagged key terms: the not-used list stays directly under the terms.
- Keyboard: tab order follows the visual order; Escape still goes Back; focus lands on the Settings heading on opening, as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Settings MUST present its controls in three groups, in this order (decision 105): **Transcription** (the ElevenLabs key block with the account line and what ElevenLabs keeps; key terms; `Leave out fillers and false starts`; `Allow microphone`; the consent reminder), **Speaker names** (`Your name`; `Show Meet captions`; remembered names), **Questions** (`Ask questions about the meeting`; provider and model; the provider's key block with what it keeps). The group names are the only new headings.
- **FR-002**: Each key MUST be one block with the masked key (or `No key saved.`), a replace action that checks the key before saving it, and a remove action (with the ElevenLabs confirmation kept), laid out on one line with `Replace` and `Remove`, `Replace` opening the field with `Check and save` and `Cancel` (decision 106). The new strings `Replace` and `Check and save` replace `New key` and `Check and replace key` on the Settings screen.
- **FR-003**: Each provider's retention text MUST be shown beside that provider's key block, word for word.
- **FR-004**: Questions MUST show the key block of the selected provider only, unless Q57 decides otherwise; a key stored for the other provider MUST be kept.
- **FR-005**: The headings `Consent reminder`, `Clean transcript` and `Microphone` MUST be removed; each control keeps its own label.
- **FR-006**: The sentence `When you rename someone Meet's captions named, the new name is used for them in later meetings too.` MUST be removed; `Changes here apply from the next meeting.` stays.
- **FR-007**: The account error MUST read `Couldn't reach ElevenLabs to check your plan.` and the refresh control MUST carry the visible label `Check again`.
- **FR-008**: Key terms MUST NOT show list bullets before their fields.
- **FR-009**: The screen MUST have no sideways scrolling at 320 px, and a field and its button MUST sit on one line where the width allows.
- **FR-010**: No setting's stored value, default or effect changes; every behaviour test of the current Settings keeps passing with only position and the reviewed strings updated.
- **FR-011**: Every changed string MUST be recorded in `specs/006-panel-redesign/copy-review.md` and its fixture, and nothing is added in place of deleted lines.

## Success Criteria *(mandatory)*

- **SC-001**: Each setting can be found by its group heading alone, with no more than one group to scan.
- **SC-002**: At 380 px, the screen is at least a third shorter than before 018 with the same settings saved.
- **SC-003**: Zero deleted strings remain and every Keep string is present unchanged.
- **SC-004**: No horizontal scrolling at 320 px.

## Assumptions

- First-run setup is not part of 018; it shares the provider radios and retention text with Settings, so those components change only where Settings needs them to, and setup must still pass its tests.
- The Transcripts screen and the main view are unchanged.
