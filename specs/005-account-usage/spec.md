# Feature Specification: Account & usage in panel

**Feature Branch**: `005-account-usage`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "Show the user's ElevenLabs account status in the side panel, readable at a glance (inspired by another tool the author uses). One line near the top of the side panel: plan name, PERCENTAGE of credits left, ESTIMATED REMAINING TRANSCRIPTION MINUTES, and renewal, e.g. \"Creator plan · 84% left · ≈ 2,150 min of transcription · renews in 12 days (Oct 20)\". Exact credit numbers only in an expandable detail. Data from the ElevenLabs subscription endpoint using the credits used, the credit limit, the plan tier and the next reset time. If the key lacks the 'User: Read' permission, say so plainly: \"API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io\". live-assist sends one mixed stream, so one meeting minute ≈ one transcription minute; the minutes estimate uses one named rate constant with a doc citation; if the realtime transcription rate in credits cannot be determined from ElevenLabs docs, show the percentage only and say plainly what it covers. Refresh on panel open, after each meeting stops, and via a small refresh button; no polling. The fetch happens in the service worker; the key never reaches the panel or offscreen document; the panel receives only derived fields via a new validated message. Failures shown plainly, never block Start. Logging only through the redacting logger."

## Clarifications

### Session 2026-10-08

All answers below are the user's decisions from the feature request, recorded as design decision 31 (`.specify/memory/design-decisions.md`).

- Q: How are the numbers shown? → A: One line near the top of the panel with plan, percentage of credits left, estimated transcription minutes left and renewal. Long raw numbers are hard to read, so exact credit counts appear only in an expandable detail.
- Q: When is the status fetched? → A: When the panel opens, after each meeting stops, and when the user presses a small refresh button. No polling.
- Q: Where does the fetch happen? → A: In the service worker, which holds the key. The panel receives only derived fields through a new validated message; neither the panel nor the offscreen document ever sees the key.
- Red-team 2026-10-08: the "neither the panel … ever sees the key" claim did not hold — 001's settings API in the panel read the saved key to compute its hint. Fixed under 001 (spec Clarifications "Red-team 2026-10-08", FR-003a, tasks T109–T110): the hint now comes from the service worker via `settings/key-hint`, and no panel code path can read credentials. This feature's message already carried only derived fields; nothing in 005 changed.
- Q: What if the fetch fails? → A: The failure is shown plainly on the account line; it never blocks Start. Logging goes only through the redacting logger.
- Q: What if ElevenLabs does not publish how many credits realtime transcription uses? → A: Do not invent a figure. Show the percentage only, say plainly what the percentage covers, and leave the rate as an open question. (Research 2026-10-08: the pricing page states a general speech-to-text rate in credits but nothing for realtime, and the API pricing page says API usage is billed in dollars, not credits — research.md R2.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my plan and how much is left at a glance (Priority: P1)

The user opens the side panel. Near the top, one short line says which ElevenLabs plan the account is on, what share of its credits is left, how many minutes of transcription that is roughly worth (when that can be known), and when the allowance renews. The user can tell in a second whether there is enough left for the next meeting, without reading long numbers. Expanding the line shows the exact credits used, the limit and what is left.

**Why this priority**: This is the feature. Running out of credits mid-meeting loses the transcript of what follows; knowing the balance before Start prevents that.

**Independent Test**: With a recorded successful account response, open the panel: the account line shows the plan, a whole-number percentage left and the renewal in days with a date; expanding it shows the exact numbers with thousands separators.

**Acceptance Scenarios**:

1. **Given** a saved key on a Creator plan with 19,360 of 121,000 credits used and a reset in 12 days on Oct 20, **When** the panel opens, **Then** the account line reads "Creator plan · 84% of credits left · renews in 12 days (Oct 20)" (with "≈ N min of transcription" after the percentage when the transcription rate is known).
2. **Given** the account line is shown, **When** the user expands its detail, **Then** it shows "19,360 of 121,000 credits used · 101,640 left" and says what the credits cover.
3. **Given** the account has used more credits than its limit, **When** the line is shown, **Then** it says 0% left, never a negative number.
4. **Given** the account response has no reset date, **When** the line is shown, **Then** the renewal part is left out and the rest is shown.
5. **Given** the account response reports a credit limit of zero, **When** the line is shown, **Then** it shows the plan and says the plan reports no credit allowance, with no percentage and no minutes.

---

### User Story 2 - Understand why the status is missing (Priority: P1)

If the account status cannot be fetched — the key lacks permission to read account details, the key is rejected, ElevenLabs cannot be reached, or the answer is not understood — the account line says so plainly in one sentence. Start and transcription work exactly as before.

**Why this priority**: The constitution requires visible degradation. ElevenLabs keys can be scoped, and a key that is allowed to transcribe may not be allowed to read account details; the user needs to know what to change.

**Independent Test**: With a recorded permission-error response, open the panel: the line says the key lacks the 'User: Read' permission and how to fix it, and Start is still enabled.

**Acceptance Scenarios**:

1. **Given** the key lacks the 'User: Read' permission, **When** the status is fetched, **Then** the line says "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io".
2. **Given** ElevenLabs rejects the key, **When** the status is fetched, **Then** the line says ElevenLabs rejected the key.
3. **Given** the network is down, **When** the status is fetched, **Then** the line says ElevenLabs could not be reached.
4. **Given** any failure above, **When** the user looks at Start, **Then** Start is enabled exactly as it would be without this feature.
5. **Given** no key is saved, **When** the panel opens, **Then** no request is made and the line says there is no key to check.

---

### User Story 3 - Keep the status current without thinking about it (Priority: P2)

The status refreshes itself when the panel opens and after each meeting stops (when usage has just changed), and the user can refresh it at any time with a small button next to the line. Nothing refreshes in the background on a timer.

**Why this priority**: A stale balance after a long meeting is misleading; polling would make needless requests.

**Independent Test**: Open the panel (one fetch), press refresh (a second fetch), run and stop a meeting (a third fetch); waiting with the panel open makes no further fetches.

**Acceptance Scenarios**:

1. **Given** the panel is open, **When** the user presses the refresh button, **Then** the status is fetched again and the line updates; while fetching, the previous line stays visible and the button shows it is busy.
2. **Given** a meeting is running, **When** it stops (by Stop or by ending on its own), **Then** the status is fetched again once.
3. **Given** the panel stays open with no meeting and no clicks, **When** time passes, **Then** no further fetches happen.

### Edge Cases

- Unknown or missing plan tier: shown as "Unknown plan"; tiers with underscores (e.g. "growing_business") are shown as words ("Growing business plan").
- Reset time in the past (stale data): renewal shown as "renews today".
- Exactly one day: "renews in 1 day", not "1 days".
- Malformed or partial success response (missing counts, non-numbers): treated as an unexpected response, never shown as 0% or NaN.
- Rate-limited by ElevenLabs: says so plainly; the user can refresh later.
- A refresh while a fetch is in flight: the button is disabled until the fetch finishes, so requests never pile up.
- The key is replaced in Settings: the next refresh (panel open or button) uses the new key; no special handling.
- Percentages are rounded down so the line never overstates what is left; any non-zero remainder below 1% shows as "<1% left".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The side panel MUST show one account line near the top of the workspace (above the Start controls) with, in order: the plan name, the percentage of credits left, the estimated transcription minutes left (only when the rate is known, FR-006), and the renewal as "renews in N days (Mon D)".
- **FR-002**: The percentage left MUST be computed from credits used and the credit limit, clamped to 0–100 and rounded down; a non-zero remainder under 1% MUST show as "<1%".
- **FR-003**: Exact credit numbers (used, limit, left, with thousands separators) MUST appear only in an expandable detail of the account line, not on the line itself.
- **FR-004**: The detail MUST say in plain words what the percentage covers: the plan's credit allowance, shared by everything the ElevenLabs account is used for, not only live-assist.
- **FR-005**: The estimated minutes MUST come from exactly one named rate constant (credits per minute of realtime transcription) that cites the ElevenLabs document it came from, and MUST assume one meeting minute is one transcription minute (one mixed stream, constitution v1.1.0).
- **FR-006**: If the rate is not known (the constant is unset because ElevenLabs does not publish it for realtime transcription), the line MUST show the percentage only and the detail MUST say that no minutes estimate is shown and why. No figure may be invented.
- **FR-007**: A missing reset time MUST omit the renewal part; a zero credit limit MUST omit percentage and minutes and say the plan reports no credit allowance.
- **FR-008**: The status MUST be fetched when the panel opens, once after each meeting stops (however it stopped), and when the user presses the refresh button. It MUST NOT be fetched on a timer.
- **FR-009**: Only the service worker MAY call ElevenLabs for the account status and read the key for it. The panel MUST receive only derived fields (plan tier, credits used, credit limit, reset time) or an error kind, through a new message that is validated at the receiving boundary like every other message.
- **FR-010**: Failures MUST be shown on the account line in one plain sentence, distinguishing at least: missing 'User: Read' permission (with the exact wording "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io"), key rejected, no key saved, ElevenLabs unreachable, rate-limited, and unexpected response.
- **FR-011**: The account status (loading, success or failure) MUST NOT change whether Start is enabled or what Start does.
- **FR-012**: Logging about the account fetch MUST go through the redacting logger, and no message, log line, error text or panel content may contain the key.
- **FR-013**: The refresh button MUST have an accessible name, be marked disabled while a fetch is in flight (ignoring presses, but keeping keyboard focus and its place in the tab order), and leave the last good line visible during the refresh.

### Key Entities

- **Account usage**: what the panel receives on success — plan tier (text or unknown), credits used, credit limit, next reset time (or none). Derived by the service worker from the ElevenLabs answer; never includes the key or the raw response.
- **Account error kind**: one of missing permission, key rejected, no key, unreachable, rate-limited, unexpected.
- **Transcription rate**: credits per minute of realtime transcription, or unknown; one named constant with its source.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the panel open, the user can say which plan they are on, roughly how much is left and when it renews within 3 seconds, without expanding anything.
- **SC-002**: The account line fits on one line at the side panel's default width for every plan name ElevenLabs uses today (wrapping only on very narrow panels).
- **SC-003**: Every failure case in FR-010 shows a sentence that tells the user what happened; none shows a blank, "NaN", a negative number or a raw error code.
- **SC-004**: Over a 10-minute idle period with the panel open, zero account requests are made.
- **SC-005**: Start behaves identically with the account status succeeding, failing, or still loading.

## Assumptions

- The ElevenLabs subscription endpoint reports credit usage in the fields named `character_count` and `character_limit` (historical names; on today's plans they count credits), plus `tier` and an optional `next_character_count_reset_unix` (verified against the API reference 2026-10-08).
- The credit limit reported may include rolled-over credits; the percentage is of whatever limit ElevenLabs reports.
- A key restricted from reading account details returns an error whose detail mentions `user_read`; this is detected by that text, as another tool the author uses does.
- No new extension permission is needed: the extension already has host access to the ElevenLabs API only.
- 004 (history) and 003 (chat) are not required; this feature depends only on 001.
