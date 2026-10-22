# Feature Specification: Turn Ask off

**Feature Branch**: `017-ask-off`

**Created**: 2026-10-22

**Status**: Draft (clarifications pending)

**Input**: Owner, 2026-10-22: "Add a setting to just turn off the ask session entirely." Today, with no Claude or OpenAI key, the main view still shows the question box, a greyed `Ask` button, `Add a Claude or OpenAI key in Settings to ask questions.` and the model label (e.g. `GPT-6 Luna`). The owner wants a way to remove all of it.

## Clarifications

### Session 2026-10-22 (decided without the owner; each can be overruled)

- Q: What goes when Ask is off? → A: Everything that exists only for asking: the question box, `Ask` and `Stop`, the missing-key line, the model label, the conversation strip (questions, answers, citations), and meeting notes (008) in both places they are offered (beside Start for the next meeting, and in the ask dock for the meeting shown), because notes are only ever sent with questions and never written into a download. In Settings, the provider choice, the key field and what the provider keeps are not shown while Ask is off.
- Q: What happens to things already stored? → A: Nothing is deleted. A stored Claude or OpenAI key, the chosen provider and model, earlier questions and answers, and notes attached to meetings stay where they are. Turning Ask back on shows them again as before, with no key to re-enter.
- Q: An answer is still arriving when Ask is turned off. → A: It is stopped as if its own `Stop` had been pressed (what arrived is kept with the meeting), and a question waiting behind it is not sent, the rule 014 uses for `Close transcript`: nothing keeps talking to the provider once Ask is off.
- Q: Does turning Ask off apply at once? → A: Yes, to the open panel, the moment the box is unticked, like the other Settings toggles. It is remembered across panel openings and browser restarts. A panel open in a second window picks it up at its next opening (the panel reads settings once at open, as for every other setting).
- Q: Default? → A: On, for existing and new users, so nothing changes for anyone who does not untick it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn Ask off in Settings (Priority: P1)

The user does not use questions, or has no Claude or OpenAI key. They open Settings and untick Ask. Back on the main view, there is no question box, no greyed button, no missing-key line, no model label and no notes control: just the transcript and its controls.

**Why this priority**: It is the owner's request, and the only part needed to remove the clutter shown in their screenshot.

**Independent Test**: With Ask on and no chat key, check the main view shows the ask dock; untick Ask in Settings; check the main view shows none of the Ask or notes elements, Settings hides the provider and key, and reopening the panel keeps it off.

**Acceptance Scenarios**:

1. **Given** Ask is on, **When** the user unticks it in Settings and goes back to the main view, **Then** there is no question box, `Ask`/`Stop` button, missing-key line, model label, conversation strip or notes control, and transcription, speaker names, `Download transcript`, `Close transcript`, `Delete transcript` and the Transcripts screen work as before.
2. **Given** Ask is off, **When** the panel is closed and opened again, or the browser is restarted, **Then** Ask is still off.
3. **Given** Ask is off, **When** the user looks at Settings, **Then** the Ask setting is shown unticked and the provider choice, key field and provider-retention text are not shown.
4. **Given** Ask is off and a chat key was stored, **When** the user ticks Ask again, **Then** the ask dock, earlier questions and answers and notes are back, and the stored key works without re-entry.
5. **Given** Ask is off, **When** a meeting runs and stops, **Then** nothing is sent to OpenAI or Anthropic.
6. **Given** an answer is still arriving, **When** the user turns Ask off, **Then** that answer stops, what arrived is kept, and a question waiting behind it is not sent.

---

### User Story 2 - Set up without a chat key (Priority: P2)

A new user installs live-assist and only wants the live transcript. Setup lets them finish with only their name and ElevenLabs key.

**Why this priority**: Without it, a user who never wants questions must still obtain a Claude or OpenAI key to get past setup.

**Independent Test**: Start from no settings; finish setup without a chat key in the way Q52 decides; check the main view opens with Ask off (or as Q52 decides) and transcription starts.

**Acceptance Scenarios**:

1. **Given** a first run, **When** the user finishes setup without a chat key [NEEDS CLARIFICATION: Q52, how setup lets the user skip the chat key], **Then** setup completes, Ask is off and the main view has no Ask elements.
2. **Given** a first run, **When** the user enters a chat key at setup, **Then** setup behaves as today and Ask is on.

### Edge Cases

- Ask is turned off while the question box holds unsent text: the text is dropped with the box (it is not a stored question).
- Ask is turned off while the notes dialog for the next meeting is open: the dialog closes; nothing is saved from it.
- Ask is off and the meeting shown has notes attached: the notes stay attached, unseen, and come back with Ask.
- Ask is off and the user removes the stored chat key in Settings: not possible while Ask is off, because the key field is hidden; it is removed after turning Ask back on.
- Ask is turned off in one window while a second window's panel is open and showing the ask dock: the second panel changes at its next opening; if a question is sent from it before then, it is answered as today (FR-007 covers only the panel where the setting changed).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Settings MUST offer one tick box that turns Ask on and off [NEEDS CLARIFICATION: Q53, its label and where it sits in Settings], on by default for every user.
- **FR-002**: While Ask is off, the main view MUST NOT show the question box, `Ask`, `Stop`, the missing-key line, the model label, the conversation strip, citations, or the notes control for the next meeting or for the meeting shown.
- **FR-003**: While Ask is off, Settings MUST NOT show the provider choice, the chat key field or the provider-retention text; the Ask tick box itself stays visible.
- **FR-004**: While Ask is off, the extension MUST NOT send anything to OpenAI or Anthropic.
- **FR-005**: Turning Ask off MUST NOT delete the stored chat key, provider, model, questions and answers, or notes; turning it on again MUST restore the Ask and notes elements with that data, without re-entering the key.
- **FR-006**: The setting MUST apply to the open panel as soon as it changes and MUST be remembered across panel openings and browser restarts.
- **FR-007**: Turning Ask off while an answer is arriving MUST stop that answer as its own `Stop` does (keeping what arrived) and MUST drop any question waiting to be sent.
- **FR-008**: Setup MUST be completable without a chat key (Q52), and a setup completed without one MUST leave Ask off.
- **FR-009**: Transcription, speaker names, downloads (including 016's merged file), `Close transcript`, `Delete transcript` and the Transcripts screen MUST behave the same with Ask on or off.
- **FR-010**: Every new user-visible string MUST pass the copy rule and be recorded in `specs/006-panel-redesign/copy-review.md` and its fixture; no explanatory line is added about what turning Ask off does.

### Key Entities

- **Ask setting**: one on/off value stored with the other settings on this computer; default on.

## Success Criteria *(mandatory)*

- **SC-001**: With Ask off, the main view shows zero Ask or notes elements in every state (no meeting, running, stopped, after `Close transcript`).
- **SC-002**: With Ask off, a full meeting from Start to download makes zero requests to OpenAI or Anthropic.
- **SC-003**: Turning Ask off and on again restores the previous questions, answers, notes and key with no re-entry.
- **SC-004**: A first-time user who has only an ElevenLabs key can finish setup and start transcribing.
- **SC-005**: Existing users see no change until they untick Ask.

## Assumptions

- The setting is per computer, like every other setting (keys are never synced).
- The Transcripts screen shows no Ask today (past meetings are read-only, decision 62), so it needs no change.
- Ask off is a display and sending switch only; no stored record changes shape.
- The README's "Removing the chat key in Settings turns off questions" line is updated to name the new setting.
