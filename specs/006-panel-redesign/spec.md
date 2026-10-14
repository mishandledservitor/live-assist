# Feature Specification: Side-panel redesign

**Feature Branch**: `006-panel-redesign`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "Side-panel redesign per design decision 32 (one main view: slim header with Start/Stop, language and a small credits badge; one-line status dots that expand only on a problem; transcript fills the rest; gear opens Settings as a separate screen holding settings, retention text and account details; Ask/chat from 003 is added later) and decision 33 (all copy per the copy review in `copy-review.md`). Visual style: plain, calm, dense-but-readable side panel; respect light/dark mode."

## Clarifications

### Session 2026-10-12 (bug found in a real call)

- In a real 45-minute call the main view showed three scrollbars: the transcript's, the answers strip's and a third on the panel page itself. The page was scrolled a little, so the header (Stop, language picker) was pushed out of view, and the page grew taller as the meeting went on. Only the transcript and the answers strip may scroll on the main view; the page itself never does, at any transcript length (FR-023, US1 scenario 5, SC-007).

### Session 2026-10-08 (reconciled with the red-team fixes)

- Design decision 34: on a Meet tab whose mute button can't be read, the mic is not sent and the microphone dot reads `Not sent — can't see Meet's mute button` (copy-review K33). The status line expands for it, because the user's own speech is silently missing from the transcript otherwise (constitution I and IV). `Live — sent even while muted` (R12) now shows only on tabs with no mute source.
- Design decision 35: an "Others" line's label editor offers only `Just this line`; 006 changes nothing there beyond R25.

### Session 2026-10-08 (user)

- Q: Where does Delete transcript go? → A: Just after the last line of a stopped transcript (FR-013).
- Q: Is retention on the Settings screen enough for constitution IV? → A: Yes; no Retention dot in the status line (FR-016).
- Q: Status dots with words or dots only? → A: A short word next to each dot.

### Session 2026-10-08

Settled by the user before this spec (design decisions 32 and 33):

- Q: Tabs, a full Chrome options page, or one main view plus a Settings screen? → A: One main view plus a Settings screen opened from a gear, inside the side panel.
- Q: What goes on the main view? → A: A slim header (Start/Stop, language, small credits badge), one line of status dots that expands only on a problem, and the transcript filling the rest.
- Q: What goes on the Settings screen? → A: All settings, the ElevenLabs retention text and the account details.
- Q: What copy changes? → A: Exactly the strings in `copy-review.md`, following the `embody-dont-announce` skill.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The transcript gets the panel (Priority: P1)

During a meeting the user glances at the side panel. Almost all of it is the transcript. Above it sits one slim header with Start or Stop, the language and a small credits badge, and one line of status dots. Nothing else competes for space: no settings forms, no retention paragraphs, no account sentence.

**Why this priority**: The user's complaint (decision 32): "way too much going on in one panel". The transcript is what the panel is for.

**Independent Test**: Open the panel at its default width with a stored meeting of 50 lines: the header and status line together take no more than two lines of text height, the transcript area takes the rest, and no settings control is visible.

**Acceptance Scenarios**:

1. **Given** setup is complete and nothing is running, **When** the panel opens, **Then** it shows the header (Start, language picker, credits badge, gear), the status line and the transcript area, and no settings form, retention text or account sentence.
2. **Given** a meeting is running, **When** the user looks at the header, **Then** it shows Stop in place of Start and the language picker is disabled and shows the meeting's language.
3. **Given** the panel is resized taller or shorter, **When** lines arrive, **Then** the transcript area grows or shrinks and the header and status line stay in place.
4. **Given** setup is not complete (no key or no name), **When** the panel opens on the main view, **Then** Start is disabled and the existing instruction (copy-review K3) is shown under the header.
5. **Given** a meeting whose transcript is many times taller than the panel, with several answers in the answers strip, **When** the user reads the panel, follows a citation to its line, or lines keep arriving, **Then** the panel page itself does not scroll: only the transcript and the answers strip have a scrollbar, and the header with Start or Stop stays in view.

---

### User Story 2 - Status stays quiet until something is wrong (Priority: P1)

The status line shows one dot per dependency (capture, transcription, speaker names, microphone), each coloured by state and each with its state as text for screen readers and as a tooltip. When everything is fine, starting or idle, the line stays one line. When a dependency fails or degrades, the line expands to show that dependency's state and reason, and its action button when it has one (for example "Allow microphone"). When the problem clears, it collapses again.

**Why this priority**: Constitution IV requires every dependency's state to be visible; decision 32 requires it to take one line unless there is a problem.

**Independent Test**: Feed status snapshots to the main view: an all-healthy snapshot renders one line with four dots and no reason text; a snapshot with speaker names degraded renders the expanded reason `Unavailable — Couldn't turn on Meet captions`; returning to healthy collapses it.

**Acceptance Scenarios**:

1. **Given** capture, transcription, speaker names and microphone are all active, **When** the status line renders, **Then** it is a single line and each dot's accessible name is "{label}: {state}" (e.g. "Speaker names: On").
2. **Given** the microphone is unavailable because permission is missing, **When** the status renders, **Then** the line expands with `Not available — Microphone permission needed. Only the meeting tab is being transcribed; your own speech is not.` and an `Allow microphone` button.
3. **Given** transcription is reconnecting, **When** the status renders, **Then** the transcription dot shows a busy state with the accessible name "Transcription: Reconnecting… — Connection to ElevenLabs lost" and the line does not expand.
4. **Given** Meet reports the user muted, **When** the status renders, **Then** the microphone dot's accessible name is "Microphone: Muted in Meet — not sent" and the line does not expand.
5. **Given** a tab other than Google Meet (no mute source), **When** the mic is live, **Then** the microphone dot's accessible name is "Microphone: Live — sent even while muted" and the line does not expand.
6. **Given** a problem in two dependencies at once, **When** the status renders, **Then** both reasons are shown, one per line, in the order capture, transcription, speaker names, microphone.
7. **Given** a Meet tab whose mute button can't be read (design decision 34), **When** the status renders, **Then** the line expands with `Microphone` `Not sent — can't see Meet's mute button`, with no action button.

---

### User Story 3 - Settings live on their own screen (Priority: P1)

A gear button in the header opens the Settings screen in the same panel. It holds the user's name, the ElevenLabs key, key terms, the consent reminder, remembered names, microphone access, the ElevenLabs account details (plan line, exact credits, caveat, refresh) and the retention disclosure ("What ElevenLabs keeps"). A Back button returns to the main view. A running meeting keeps running and its transcript is all there when the user comes back.

**Why this priority**: Moving settings off the main view is what frees the space in US1; every existing setting must stay reachable.

**Independent Test**: From the main view, activate the gear: the Settings screen shows every settings control that exists today plus the account details and retention text; activate Back: the main view returns with focus on the gear.

**Acceptance Scenarios**:

1. **Given** the main view, **When** the user activates the gear, **Then** the Settings screen replaces the main view, its title "Settings" is focused, and it contains, in order: Your name, ElevenLabs API key, ElevenLabs account, Key terms, Consent reminder, Remembered names, Microphone, What ElevenLabs keeps.
2. **Given** the Settings screen, **When** the user activates Back or presses Escape outside a text field, **Then** the main view returns and focus is on the gear button.
3. **Given** a meeting is running, **When** the user opens Settings and goes back after new lines arrived, **Then** the transcript shows every line, including those that arrived while Settings was open, and capture never paused.
4. **Given** the user changes a setting (e.g. saves a new name), **When** they go back to the main view, **Then** the main view reflects it (e.g. Start becomes enabled once name and key are present).
5. **Given** the account section on the Settings screen, **When** it is shown, **Then** it shows the account line, the exact credits line and the caveat (copy-review K24, K25) with no "Details" disclosure, and the refresh button works as in 005.

---

### User Story 4 - The credits badge (Priority: P2)

The header shows a small badge with the percentage of ElevenLabs credits left. Its tooltip and accessible name are the full account line from 005 (e.g. "Creator plan · 84% of credits left · renews in 12 days (Oct 20)"). While the status is being fetched it reads `Checking plan…`; on a failure it shows a problem mark whose tooltip and accessible name is the 005 error message. Activating the badge opens the Settings screen at the account section. It refreshes exactly when 005's line did (panel open, after a meeting stops, the refresh button) and never blocks Start.

**Why this priority**: Keeps 005's value at a glance in far less space; the full detail is one click away.

**Independent Test**: With a recorded success reply, the badge reads `84%` and has the accessible name of the full line; with a recorded permission error, it shows the problem mark with the exact 'User: Read' message; Start is enabled in both.

**Acceptance Scenarios**:

1. **Given** a successful account reply with 84% left, **When** the panel opens, **Then** the badge shows `84%` and its accessible name is the full account line.
2. **Given** a reply with no credit allowance, **When** the badge renders, **Then** it shows the neutral mark with accessible name `{Plan} plan · no credit allowance reported`.
3. **Given** any account error, **When** the badge renders, **Then** its accessible name is the exact message from copy-review K26 and Start is unaffected.
4. **Given** the badge, **When** the user activates it, **Then** the Settings screen opens scrolled to the ElevenLabs account section.

---

### User Story 5 - Every string reads as the copy review says (Priority: P1)

Every user-facing string in the extension matches `copy-review.md`: the Delete list is gone, each Rewrite replacement is present verbatim, each Keep string is unchanged, and nothing new is added beyond the gear's `Settings` and the `Back` button names.

**Why this priority**: Decision 33 makes the copy rule binding, and this feature is where it is applied to the existing panel.

**Independent Test**: An automated test searches the built extension for every string in the copy review's "Checking the result" list (none found) and for every Rewrite replacement (all found).

**Acceptance Scenarios**:

1. **Given** the built extension, **When** its files are searched for each deleted string in `copy-review.md` → "Checking the result", **Then** none is found.
2. **Given** the built extension, **When** its files are searched for each Rewrite replacement, **Then** each is found.
3. **Given** the side panel rendered in each state, **When** its text is compared with the Keep list, **Then** each Keep string relevant to that state appears unchanged.

---

### Edge Cases

- First run: the setup screen stays a single screen as today (name, key, retention disclosure, then microphone); it does not show the header, status line or gear until setup is complete.
- Start fails (copy-review K4, R2, R3): the error shows under the header with its action button, above the status line, and does not push the transcript out of view entirely.
- Consent reminder on Start: shown under the header, above the transcript, with focus on its primary button; Escape cancels and focus returns to Start (as today).
- Delete transcript: appears only when a stopped meeting is shown, placed per FR-013; the confirmation keeps its existing text (K6).
- Label editor (002): opens inline on the transcript line as today; layout change does not alter it except the R25 label.
- A very long reason (e.g. a raw provider error) wraps inside the expanded status line; it never widens the panel.
- A meeting on a site other than Google Meet: the status line stays expanded with `Speaker names` `Not available — Speaker names work on Google Meet only.` for the whole meeting (FR-007).
- Narrow panel (Chrome's minimum side-panel width, 320 px): the header fits on one line; if it cannot, the language picker shrinks before anything wraps, and no control is hidden.
- Dark mode: every colour, including dot states and the badge, follows the system light/dark setting with readable contrast in both.
- The user opens Settings while the consent reminder is showing: the reminder is cancelled (nothing starts) and Start is shown again on return.

## Requirements *(mandatory)*

### Functional Requirements

**Main view**

- **FR-001**: After setup, the panel MUST open on the main view: a header, a status line, and the transcript area filling the remaining height.
- **FR-002**: The header MUST contain, on one line at 320 px width and wider: Start (or Stop while a meeting runs), the language picker, the credits badge and a gear button whose accessible name is `Settings`.
- **FR-003**: The panel title text `live-assist` MUST NOT be visible on the main view or Settings screen; it stays as the document title and as a visually hidden top-level heading (copy-review K32).
- **FR-004**: The main view MUST NOT show settings controls, the retention disclosure, the account line or its detail.
- **FR-005**: The not-ready instruction (K3), start errors (K4, R2, R3) and the consent reminder (K1) MUST appear between the header and the status line, and Start-flow behaviour (consent before capture, focus return, "Stop that one") MUST be unchanged.
- **FR-023**: On the main view the panel page itself MUST NOT scroll, at any transcript length and any number of answers: the document is never taller than the panel, only the transcript and the answers strip scroll, and the header stays in view, including after a citation brings its line into view. Visually hidden text (screen-reader-only labels) MUST NOT add to the page's scrollable area and MUST stay in the accessibility tree.

**Status line**

- **FR-006**: The status line MUST show one dot per dependency — capture, transcription, speaker names, microphone — in that order, each with a colour for its tone (ok, busy, idle, error) and an accessible name and tooltip "{label}: {state text}", using the state texts in copy-review (K21, K33, R5–R8, R11, R12).
- **FR-007**: The status line MUST be one line when no dependency is in an error tone, speaker names are not unavailable during a running meeting, and the microphone is not withheld because Meet's mute button can't be read (K33, design decision 34); otherwise it MUST expand (an unavailable speaker-names dot during a meeting counts as a problem, so the panel says why every line is "Others", constitution IV; an unreadable Meet mute state counts as a problem, so the panel says why the user's own speech is missing, constitution I) to show each failing dependency's label, state text and reason on its own line, plus its action button if it has one (`Allow microphone` for the microphone).
- **FR-008**: State changes in the status line MUST be announced to screen readers politely, as today.
- **FR-009**: Before any meeting, the speaker-names dot MUST read `Not running` (not an "unavailable" reason).

**Settings screen**

- **FR-010**: The gear MUST open the Settings screen in the same panel; Back (accessible name `Back`) and Escape (when focus is not in a text field) MUST return to the main view with focus on the gear.
- **FR-011**: The Settings screen MUST contain, in this order: Your name; ElevenLabs API key; ElevenLabs account (account line, exact credits detail, caveat, refresh — shown directly, without a "Details" disclosure); Key terms; Consent reminder; Remembered names; Microphone; What ElevenLabs keeps (the retention disclosure as in setup).
- **FR-012**: Opening or closing Settings MUST NOT stop, pause or restart a running meeting, and MUST NOT lose transcript lines that arrive while Settings is open.
- **FR-013**: `Delete transcript` and its confirmation MUST be shown on the main view after the last line of a stopped meeting's transcript, and nowhere while a meeting runs.

**Credits badge**

- **FR-014**: The credits badge MUST show `{pct}%` on success, `Checking plan…` while fetching, and a problem mark on failure; its accessible name and tooltip MUST be the full account line (K25) or the error message (K26). With no credit allowance it MUST show a neutral mark named with the account line.
- **FR-015**: Activating the badge MUST open the Settings screen with the ElevenLabs account section in view. Its refresh triggers MUST be exactly 005's (panel open, meeting stop, refresh button) and it MUST never block Start.

**Retention and disclosure**

- **FR-016**: The retention disclosure (K14–K16) MUST remain in setup and MUST appear on the Settings screen; the consent reminder (K1) MUST still name ElevenLabs on every Start while the reminder is on. The main-view status line MUST NOT carry a retention row.

**Copy**

- **FR-017**: Every user-facing string MUST match `copy-review.md`: change exactly the strings in its Delete and Rewrite lists and nothing else; every Keep string MUST keep its exact text.
- **FR-018**: The panel MUST NOT add user-facing text beyond the accessible names `Settings` (gear) and `Back`, and the badge's `{pct}%`.
- **FR-019**: Automated tests MUST assert that each string in `copy-review.md` → "Checking the result" is absent from the source and the built extension, and that each Rewrite replacement is present.

**Visual style**

- **FR-020**: The panel MUST follow the system light/dark setting for every element, including dots and badge, with text contrast of at least 4.5:1 and dot/badge contrast of at least 3:1 against their background in both modes.
- **FR-021**: Each dot's state MUST be distinguishable without colour (accessible name and tooltip) and the error tone MUST also differ in shape or outline, not hue alone.
- **FR-022**: The style MUST be plain and calm: system font, one base size for transcript text with timestamps and labels smaller or muted, no decorative colour; one accent colour for the primary action.

### Key Entities

- **Panel screen**: which screen the panel shows — setup, main view or Settings. Not persisted; the panel always opens on setup (if incomplete) or the main view.
- **Status line view**: the four dependency dots derived from the existing status snapshot, plus which of them are in an error tone (decides expansion).
- **Credits badge view**: derived from the existing account reply — percentage text, mark (ok, neutral, problem, loading) and accessible name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At 360 px × 700 px, the transcript area takes at least 80% of the panel's height on the main view when no problem is shown.
- **SC-002**: With all dependencies healthy, the status information takes exactly one line.
- **SC-003**: Every setting available before 006 is reachable from the main view in one activation (the gear).
- **SC-004**: 100% of the copy review's deleted strings are absent and 100% of its Rewrite replacements are present in the built extension.
- **SC-005**: Going to Settings and back during a running meeting loses zero transcript lines.
- **SC-006**: The automated accessibility check reports no violations on the main view, the expanded status line and the Settings screen, in both light and dark mode.
- **SC-007**: At 400 px × 870 px with a 1,500-line transcript and answers in the strip, the page's scroll height equals the panel's height and Start or Stop is inside the viewport, before and after following a citation.

## Assumptions

- 006 starts after `002-impl-polish` merges; any user-facing string that branch adds is reviewed against the skill before 006's copy tests are finalised.
- Ask/chat (003) is not part of 006; the layout leaves the transcript area as the place a chat panel will later share, but 006 adds no chat placeholder.
- Setup keeps its current single-screen flow and copy, apart from the listed rewrites.
- The status snapshot, account reply and settings API from 001, 002 and 005 are reused unchanged; 006 changes presentation and strings, plus the idle speaker-names state (FR-009) and the strings produced in core and providers listed in the copy review.
- No new settings, permissions or dependencies.
- Chrome's side panel minimum width is 320 px.
- Status dot labels: a short word next to each dot (user, 2026-10-08).
