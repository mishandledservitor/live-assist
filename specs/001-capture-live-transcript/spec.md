# Feature Specification: Capture & Live Transcript

**Feature Branch**: `001-capture-live-transcript`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Capture & live transcript (roadmap 001): Settings with the user's ElevenLabs API key, the user's display name (asked on first run), a key-terms list, and a consent-reminder toggle. Start/Stop transcription of the current browser tab's meeting from the extension side panel; the meeting tab's audio and the user's microphone are captured as separate streams and transcribed live as two realtime transcription sessions; the side panel shows a live transcript where lines from the mic are labelled with the user's name and lines from the tab are labelled "Others" (confirmed vs fallback label distinguished); the user keeps hearing the meeting while it is captured. Automatic language detection (Greek/English mixed speech expected) with a per-meeting language override; consent reminder on every Start unless turned off; automatic reconnect when a session drops or hits a time limit, continuing the same meeting record; status indicators for capture, transcription, speaker names, mic and retention. Includes the project scaffold (WXT/React/TS, Vitest, Playwright, CI, CodeGraph) as delivery infrastructure, and two early spikes the user runs with real audio: echo without headphones, and mixed Greek/English recognition quality."

Sources: `ROADMAP.md` row 001; `.specify/memory/design-decisions.md` decisions 1, 2, 11, 12, 15, 16, 18, 19, 28–30 and the senior-dev defaults; constitution v1.1.0 Principles I, III, IV, V, VI. (The input above describes the original two-session design, superseded 2026-10-08 by one mixed stream — see Clarifications.)

## Clarifications

### Session 2026-10-07

- Q: Until the Meet adapter (002) can read mute state, should the panel offer a manual "pause my mic" control? → A: No. 001 has no manual mic pause; the mic is transcribed continuously until 002 follows Meet's mute state (FR-021, design decision 24).
- Q: Should the "headphones recommended" notice appear on every Start, or only until dismissed? → A: On every Start until the user ticks "Don't show again" (FR-028, design decision 25).

### Session 2026-10-08

- Q: Do the echo and mixed-language spikes still gate v1? → A: No. FR-028 (headphones notice) is deferred out of v1: the user always uses headphones, so the echo spike is not run and the notice is not built; revisit only if echo duplicates show up in real use or colleagues adopt the tool (design decision 27). The mixed Greek/English spike is not run either; Automatic stays the default and is validated in real meetings, with the per-meeting override as the fallback (design decision 26). FR-026/FR-027 (the user-runnable harnesses) are already delivered.
- Q: Two realtime sessions (tab and mic) cost twice the meeting length. Keep them? → A: No (user, 2026-10-08: "We're not paying double"; constitution v1.1.0, design decisions 28–30). Tab audio and the mic are still captured separately but mixed locally into one mono stream sent to **one** ElevenLabs realtime session; the separate captures exist only so the mic can be silenced before mixing (002 drives that from Meet's mute state; in 001 the mic is always mixed in). No per-source audio leaves the machine. With one stream there is no way to tell the user's lines apart in 001, so **every finished line is labelled "Others" as a fallback label**, the user's own included; the user's name label comes from Meet's "You" caption in 002. The user's-name setting stays (002 needs it). Status shows one transcription stream plus capture (tab) and mic input; a mic that cannot be opened leaves a tab-only mix running. Revised: US1 scenarios 3–4, US3 scenarios 1, 3, 4, 5, US4 scenario 2, edge cases, FR-008, FR-010, FR-012, FR-013, FR-014, FR-019, FR-020, FR-021, SC-005, Key Entities, Assumptions.

### Red-team 2026-10-08

- Finding: the side panel read the full saved API key. Its settings API computed the key hint by reading the key from `chrome.storage.local`, and writing a pending key read the whole credentials record first. Decision 31 and the credential contract claim the key never reaches the panel. → Fix: the panel never reads credentials. The key hint (last four characters) comes from the service worker through a validated `settings/key-hint` message. Key entry: the panel writes the candidate to its own write-only storage slot (`pendingCredential`) and never reads it back; the service worker reads it, validates, promotes it into the credentials record and clears the slot. Removing the key is a single delete, which reads nothing. A test with a storage fake that throws on any credentials read covers every panel path, and a lint rule forbids the panel importing the full settings store. FR-003a added.
- Finding: after a reconnect, frames sent after the server's commit point but before the commit message arrived were dropped from the replay buffer, so a drop right after a commit lost them. → Fix: a commit drops only the frames whose audio ends at or before the committed segment's last word (its word timings); frames after it stay for replay. A commit without word timings drops nothing, so its audio may be transcribed twice after a drop rather than lost. FR-019 states the 40 s replay cap precisely.
- Finding: the privacy guard treated any secret-shaped string containing "test", "e2e", "fake" and similar as a fake (about 1 % of real keys), did not check network destinations in code, and missed indirect `storage.sync` access. → Fix: only the exact fixture token prefix is allowlisted; every URL literal in `src` must be `api.elevenlabs.io` unless listed as a non-network reference, and every fetch/WebSocket/EventSource/sendBeacon call must take a known ElevenLabs endpoint; `sync` access on `storage` is caught through bracket, optional-chaining and destructuring forms. Each check is proven against a planted violation.

### Real call 2026-10-09

- Finding (002 spec, Clarifications "Real call 2026-10-09"): with the service's default silence before a commit (about 1.5 s; the session URL did not set it), a rapid exchange between participants came back as one finished line, and 002 named the whole line after the participant who spoke most.
- Q: How much silence ends a finished line? → A: 1.0 s, set explicitly on every transcription session (`vad_silence_threshold_secs=1.0`, research R2 "Real call 2026-10-09"), including each session after a reconnect. More pauses inside one person's speech now end a line, so lines are somewhat shorter; the service's own commit after about 36 s of continuous speech and the 40 s replay buffer are unchanged (FR-019). Splitting a line at a speaker change is 002's job (002 FR-027); this setting only reduces how often it is needed.

### Session 2026-10-09 — clean transcript

- Q (user, design decision 41, after comparing with their batch Scribe v2 output): Should the transcript keep fillers ("um", "uh") and false starts? → A: No by default. Each transcription session asks ElevenLabs for a clean transcript (`no_verbatim=true`), which leaves out fillers and false starts. Settings has one switch to turn it off ("Clean transcript" → "Leave out fillers and false starts"), applied from the next Start; installs set up before this change get it on too. FR-011b.

### Session 2026-10-12 — key terms as a list

- Q (user, with 50 names and product names to enter): Must key terms be added one at a time? → A: No. The field for new key terms takes a list, one term per line or separated by commas, and Add puts all of them in the list with one save. FR-004a, User Story 2 scenarios 7–9.
- Pasting: Chrome drops the line breaks when several lines are pasted into a single-line field, which would run a pasted column of names together. The field stays a single line (Enter still adds); a paste that contains line breaks is taken over and shown in the field as the same terms separated by commas, at the cursor or in place of the selected text. A paste without line breaks is left to the browser.
- Limits are unchanged: at most 50 terms are sent, each at most 20 characters; terms over either limit are kept in the list and flagged as before, never dropped, also when they arrive in one paste.
- Assumptions (not asked, reversible): a key term added through this field cannot contain a comma or a line break, since both separate terms (the field of an already saved term is not split: a comma typed there stays part of that term); other characters, semicolons and tabs included, stay part of a term; terms already in the list and repeats within the list collapse case-insensitively with the first spelling kept; new terms go after the existing ones in the order given; a list with nothing new in it changes nothing and empties the field; there is no confirmation message, the list itself shows what was added.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Transcribe a meeting live (Priority: P1)

I am in a browser meeting (Google Meet, or any other site playing a call). I open the live-assist side panel, press Start, and from then on I see what everyone says — me included — appear as text in the panel within a couple of seconds, labelled "Others" until speaker names arrive with 002. I keep hearing the meeting normally. When the meeting ends I press Stop, and the transcript stays in front of me.

**Why this priority**: This is the product. Everything else in v1 (speaker names, chat, export) consumes this transcript. On its own it already lets me glance back at what was just said.

**Independent Test**: With settings filled in, start transcription on a tab playing a recorded two-person conversation while speaking into the mic; verify both the tab's speech and mine appear, every line labelled "Others" (fallback), while the tab audio stays audible; press Stop and verify the transcript remains visible.

**Acceptance Scenarios**:

1. **Given** settings are complete and a meeting tab is active, **When** I press Start (and acknowledge the consent reminder if it is on), **Then** capture begins, the status shows capture and transcription as active, and the meeting audio remains audible to me.
2. **Given** transcription is running, **When** someone in the meeting speaks, **Then** their words appear in the panel labelled "Others", first as in-progress text and then as a finished line with its time offset from the meeting start.
3. **Given** transcription is running, **When** I speak into my microphone, **Then** my words appear in the same transcript, also labelled "Others" (revised 2026-10-08: one mixed stream cannot tell me apart; 002 labels my lines with my name from Meet's "You" caption).
4. **Given** a line labelled "Others", **When** I look at it, **Then** I can tell it is a fallback label (not a known person), styled differently from a confirmed name.
5. **Given** transcription is running, **When** I press Stop, **Then** the tab and mic captures end, nothing more is sent for transcription, the status shows stopped, and the full transcript remains visible in the panel.
6. **Given** transcription is running, **When** I close and reopen the side panel, **Then** transcription has continued in the meantime and the panel shows the full transcript so far.

---

### User Story 2 - First-run setup and settings (Priority: P1)

The first time I open the panel, it asks for my name (how my lines are labelled) and my ElevenLabs API key, tells me what ElevenLabs retains and how to turn off model-training use of my audio, and lets me add key terms (names, product terms) that should be recognised correctly. I can change all of these later, and turn the consent reminder off.

**Why this priority**: Start cannot work without a key and a name; it ships together with Story 1 as the MVP.

**Independent Test**: On a fresh install, open the panel, complete setup, reopen the browser, and verify the values persist, the key is never shown in full after saving, and Start is enabled only once required settings are present.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** I open the side panel, **Then** I am asked for my name and my ElevenLabs API key before Start is available.
2. **Given** I enter a key, **When** I save it, **Then** the app checks it with ElevenLabs and tells me whether it works; the saved key is shown only masked afterwards.
3. **Given** the setup screen, **When** I read the retention notice, **Then** it states truthfully that ElevenLabs may retain audio/transcripts under my account's settings, and tells me how to turn off "Improve the models for everyone"; it does not claim zero retention.
4. **Given** settings, **When** I add, edit or remove key terms, **Then** the next Start uses the updated list.
5. **Given** settings, **When** I turn the consent reminder off, **Then** Start no longer shows it; turning it back on restores it.
6. **Given** settings were saved, **When** I restart the browser, **Then** they are still there and are stored only on this computer (not synced to other devices).
7. **Given** settings, **When** I paste a column of names (one per line) into the field for new key terms and press Add, **Then** every name is in the list as its own term, after the terms already there and in the order pasted, and the next Start uses them.
8. **Given** settings, **When** I type several terms separated by commas and press Add, **Then** each one is added as its own term.
9. **Given** a pasted list that repeats a term, repeats one already in the list, or has empty lines and stray spaces, **When** I press Add, **Then** each term appears once, trimmed, with the spelling that came first.

---

### User Story 3 - Stay transcribing through failures, and see what is working (Priority: P2)

During a long meeting the connection to the transcription service drops, or a session hits the service's time limit. The app reconnects by itself and keeps adding to the same transcript; I can see briefly that it was reconnecting. At all times the panel shows me the state of capture, transcription (one stream), speaker names, the microphone, and data retention, so I never discover a silent failure afterwards.

**Why this priority**: Principle IV — a silent failure in a live meeting is found only after the moment it mattered. Needed before real use, but the MVP can be demonstrated without it.

**Independent Test**: Replay a recorded transcription session that disconnects mid-way and one that ends with a time-limit error; verify the app reconnects automatically, the transcript continues in the same meeting with no duplicated or lost finished lines, and the status indicator shows reconnecting then active.

**Acceptance Scenarios**:

1. **Given** transcription is running, **When** the transcription session drops, **Then** the transcription status shows "reconnecting", the app reconnects automatically, and new lines continue in the same meeting transcript.
2. **Given** a session hits the service's session time limit, **When** it ends, **Then** a new session starts automatically without user action and the transcript continues.
3. **Given** reconnection keeps failing (e.g. no network, key revoked, quota exhausted), **When** retries are exhausted or the error is not recoverable, **Then** the panel shows transcription as failed with a plain-language reason and what I can do, and the transcript collected so far is kept.
4. **Given** transcription is running on a site without a speaker-name adapter (all sites in this feature), **When** I look at the status, **Then** speaker names show as "not available here — every line is labelled Others" with the reason.
5. **Given** the microphone cannot be captured (permission denied, no device), **When** I press Start, **Then** transcription still runs on the tab audio alone, the mic status shows the problem, how to fix it and that only the meeting tab is being transcribed, and my own speech is not transcribed.
6. **Given** the meeting tab is closed or navigates away, **When** that happens during transcription, **Then** transcription stops, the status says why, and the transcript is kept.
7. **Given** the browser or extension crashes during transcription, **When** I reopen the panel, **Then** every finished line received up to a few seconds before the crash is still shown for that meeting.

---

### User Story 4 - Language control for mixed Greek/English meetings (Priority: P2)

My meetings mix Greek and English, sometimes within a sentence. By default the app detects the language automatically. For a meeting where I know the language, I can choose it before pressing Start so recognition is more accurate. Each finished line records which language was detected.

**Why this priority**: The knowledge-base meetings are mixed-language; poor recognition makes every downstream feature worse.

**Independent Test**: Start with the default (automatic) and with an explicit language override using recorded clips; verify the override is applied to the transcription session for that meeting only, and that the next meeting starts again on automatic.

**Acceptance Scenarios**:

1. **Given** no override is chosen, **When** I press Start, **Then** transcription uses automatic language detection.
2. **Given** I choose a language override for this meeting, **When** I press Start, **Then** the meeting is transcribed in that language and the panel shows the active language choice.
3. **Given** a meeting ended with an override, **When** I start the next meeting, **Then** the language choice is back to automatic.
4. **Given** a finished line, **When** language detection was used, **Then** the line records the detected language.

---

### User Story 5 - Consent reminder (Priority: P2)

Every time I press Start, I am reminded to tell participants that the meeting is being transcribed, unless I have turned the reminder off.

**Why this priority**: Constitution Principle I requires it; it is small.

**Independent Test**: Press Start with the reminder on and off and verify the reminder's presence and that transcription does not begin until it is acknowledged.

**Acceptance Scenarios**:

1. **Given** the reminder is on, **When** I press Start, **Then** a reminder appears and capture begins only after I acknowledge it; if I cancel, nothing is captured.
2. **Given** the reminder is off, **When** I press Start, **Then** capture begins immediately.

---

### User Story 6 - Check recognition quality and echo with my own audio (Priority: P3)

Before relying on the tool, I run two guided checks with my real setup: (a) a meeting without headphones, to see whether remote voices coming out of my laptop speakers get transcribed a second time under my name; and (b) recordings of mixed Greek/English speech, to see how well they are recognised. Each check tells me exactly what to do, collects the results, and produces a findings record in the repository that decides whether the app must warn "headphones recommended" and whether automatic language detection is good enough as the default.

**Why this priority**: These are the two early risks in the design decisions. They need real audio from me, so they are run by me, not by automated tests.

**Independent Test**: Run each check with the provided instructions and verify it produces a results record with the measured outcome and a recommendation.

**Acceptance Scenarios**:

1. **Given** the echo check, **When** I follow its steps with and without headphones, **Then** it records how many remote-speaker lines also appeared under my name in each case.
2. **Given** the language check, **When** I run it on my mixed-language clips with automatic detection and with each language fixed, **Then** it records the recognised text alongside a reference transcript I provide, with an error measure for each run.
3. *(Deferred out of v1, 2026-10-08 — FR-028, design decision 27.)* **Given** the echo check shows remote voices duplicated under my name without headphones, **When** I press Start, **Then** the panel recommends headphones, and keeps doing so on each Start until I tick "Don't show again" (FR-028).

### Edge Cases

- Start pressed with no key, an invalid key, or no name saved → Start is unavailable or fails with a message pointing to settings; nothing is captured.
- Start pressed on a tab that cannot be captured (browser internal pages, the Web Store) → a clear message; nothing starts.
- Start pressed while a transcription is already running in another tab → one meeting at a time; the app says which tab is being transcribed and offers to stop it.
- The tab is silent for a long time → transcription stays connected or reconnects transparently; no empty lines appear.
- Remote participants and I talk over each other → the overlapping speech is transcribed from the mix as the service returns it, with no per-speaker separation (revised 2026-10-08, design decision 29).
- In-progress text is replaced or revised before it is finished → only finished lines are stored; in-progress text is displayed but never stored.
- The network drops for longer than the reconnect window → transcription marked failed with reason; transcript kept; I can press Start again (which begins a new meeting record) or Stop.
- Very long meeting (e.g. 3 hours) → transcription continues across multiple service sessions without user action and the panel remains responsive.
- I am muted in the meeting → in this feature the mic is still mixed in and transcribed (FR-021); the mic status shows "mute state unknown — mic is being sent". Following Meet's mute arrives in 002.
- Key terms list is very long → the app limits it to what the transcription service accepts and tells me which terms were not used.
- The key is revoked or the account runs out of quota mid-meeting → transcription marked failed with that reason; not retried endlessly.
- One paste brings the key-terms list past 50 → every term is kept in the list; the ones after the 50th usable term are listed as not used, exactly as when they are added one at a time (added 2026-10-12).
- A pasted list contains a term longer than 20 characters → it is kept and listed as not used; it does not count towards the 50 (added 2026-10-12).
- A pasted list uses Windows line endings, or mixes line breaks and commas → both separate terms; no empty term results (added 2026-10-12).

## Requirements *(mandatory)*

### Functional Requirements

**Settings & first run**

- **FR-001**: On first open, the app MUST ask for the user's display name and ElevenLabs API key and MUST NOT allow Start until both are saved.
- **FR-002**: The app MUST verify a newly entered key with ElevenLabs and report whether it is valid; after saving, the key MUST be shown only masked.
- **FR-003**: Settings MUST be stored only on the local computer (never synced across devices); the key MUST never appear in logs, error messages, diagnostics, or exported files.
- **FR-003a**: The side panel MUST never read the API key, saved or pending: it gets only the last four characters from the service worker, and it may write a candidate key to a write-only pending slot that only the service worker reads (red-team 2026-10-08).
- **FR-004**: Users MUST be able to edit their name, replace or remove the key, maintain a key-terms list, and turn the consent reminder on or off (default on).
- **FR-004a** (added 2026-10-12): The field for new key terms MUST accept several terms at once, one per line or separated by commas, typed or pasted, and add them all with a single action and a single save: each piece trimmed, empty pieces dropped, terms already in the list and repeats collapsed case-insensitively with the first spelling kept, order preserved, appended after the existing terms. Line breaks in pasted text MUST survive as separators. Terms over the service's limits MUST be kept and flagged as for single terms. Editing and removing individual terms MUST keep working, and the Settings screen MUST stay responsive with 50 terms listed.
- **FR-005**: The setup screen and the retention status MUST state truthfully what ElevenLabs may retain and instruct the user how to turn off "Improve the models for everyone"; the app MUST NOT claim zero retention. The setup screen MUST also say that each meeting is sent as one mixed audio stream (meeting tab and microphone together), billed for about the meeting's length (added 2026-10-08, design decision 28).

**Capture & transcription**

- **FR-006**: The user MUST be able to start transcription of the active tab from the side panel by an explicit click, and stop it at any time.
- **FR-007**: When the consent reminder is on, Start MUST show the reminder and begin capture only after the user acknowledges it.
- **FR-008**: The app MUST capture the tab's audio and the user's microphone separately, mix them locally into one mono stream, and transcribe that stream in real time in a single transcription session (one billed stream). The microphone's contribution MUST pass through a gate that can replace it with silence before mixing (closed by 002 while the user is muted; always open in 001). No per-source audio leaves the machine. *(Revised 2026-10-08, design decision 28; superseded: two separate streams and sessions.)*
- **FR-009**: While the tab is captured, the user MUST continue to hear the tab's audio.
- **FR-010**: In this feature every finished line MUST be labelled "Others" as a fallback label, the user's own lines included; the panel MUST visually distinguish confirmed from fallback labels (confirmed labels arrive with 002's captions and manual relabel). *(Revised 2026-10-08, design decision 29; superseded: mic lines labelled with the user's name.)*
- **FR-011**: The panel MUST show in-progress text as it is recognised and replace it with the finished line; only finished lines are part of the meeting record.
- **FR-011b**: Each transcription session MUST ask for a clean transcript (fillers and false starts left out; ElevenLabs `no_verbatim`) unless the user has turned it off in Settings; the setting is on by default, existing installs included, and applies from the next Start (design decision 41, 2026-10-09).
- **FR-011a**: A finished line MUST end after at most 1.0 s of silence (the transcription session's silence threshold is set to 1.0 s on every session, reconnects included), so that turns separated by a short pause become separate lines (real call 2026-10-09).
- **FR-012**: Each finished line MUST carry its audio stream (in 001 always the single mixed stream; revised 2026-10-08, superseded: microphone / meeting tab), start and end time relative to the meeting start, text, detected language when available, speaker label, and whether that label is confirmed or a fallback.
- **FR-013**: Lines MUST be shown in one transcript ordered by start time, each with an `mm:ss` (or `h:mm:ss` beyond an hour) offset from the meeting start.
- **FR-014**: Transcription MUST use automatic language detection by default; the user MUST be able to choose a language override for the upcoming meeting, which applies to the meeting's transcription session for that meeting only.
- **FR-015**: The key-terms list MUST be supplied to transcription at Start to improve recognition of those terms.
- **FR-016**: Every finished line MUST be saved locally as it arrives, so that closing the panel, or a crash, loses at most a few seconds of finished lines; the current meeting's transcript MUST reappear when the panel is reopened.
- **FR-017**: Each Start MUST create a new meeting record (start time, source tab title/address, language choice); Stop ends it. Only one meeting may be transcribed at a time.
- **FR-018**: Transcription MUST continue while the side panel is closed.

**Resilience & status**

- **FR-019**: If the transcription session drops or reaches the service's time limit, the app MUST reconnect automatically, continue the same meeting record, and give the new session the recent transcript as context, without duplicating or losing finished lines. Audio not yet finalised by the service when the session drops — everything after the last committed word, including audio sent before the commit message arrived — MUST be replayed into the new session. Replay holds at most the last 40 s of such audio: during an outage longer than that, the oldest audio is dropped and the panel reports roughly how many seconds could not be transcribed once the stream is back (red-team 2026-10-08).
- **FR-020**: The panel MUST always show the state of: capture (tab), transcription — one stream (connecting / active / reconnecting / failed / stopped), speaker names (in this feature: "not available — every line labelled Others" with reason), microphone input (active / unavailable with reason — when unavailable, that only the meeting tab is being transcribed — plus "mute state unknown — mic is being sent" until 002), and retention (what ElevenLabs retains). *(Revised 2026-10-08: one transcription stream instead of one per source.)*
- **FR-021**: This feature MUST NOT offer a manual mic-pause control. Until a meeting-platform adapter can read the meeting's mute state (Google Meet, feature 002), the microphone is mixed in continuously while transcription runs (its gate stays open), and the mic status MUST show "mute state unknown — mic is being sent" (the wording 002 uses). Constitution Principle I's mute rule applies "wherever the meeting platform's mute state can be read", which 001 cannot yet do.
- **FR-022**: Unrecoverable errors (invalid or revoked key, quota exhausted, permission denied, tab not capturable) MUST be shown in plain language with a next step, MUST stop retrying, and MUST keep the transcript gathered so far.
- **FR-023**: If the captured tab is closed or navigates away, transcription MUST stop and the panel MUST say why.

**Privacy**

- **FR-024**: Audio and transcript text MUST be sent only to ElevenLabs in this feature; no other network destination, telemetry or analytics.
- **FR-025**: Nothing MUST be captured or sent before Start or after Stop.
- **FR-029**: When no transcription is running, the user MUST be able to delete the transcript shown in the panel; deletion is permanent (no soft delete) after a confirmation. After a deletion the panel shows the next most recent stored meeting, so every stored meeting can be deleted one at a time. Browsing a history list arrives in 004.

**Quality checks (spikes)**

- **FR-026**: The project MUST provide a user-runnable echo check that, with and without headphones, measures how many remote-speaker lines are duplicated under the user's name, and records the result with a recommendation.
- **FR-027**: The project MUST provide a user-runnable mixed Greek/English check that transcribes the user's own clips with automatic detection and with each language fixed, compares them to reference text the user supplies, and records an error measure per run with a recommendation on the default language mode.
- **FR-028** *(deferred out of v1, 2026-10-08, design decision 27)*: If the echo check finds duplication without headphones, the panel MUST show a "headphones recommended" notice at Start, on every Start until the user ticks "Don't show again"; that choice is remembered on this computer.

### Key Entities

- **Settings**: user's display name; transcription key (secret); key-terms list; consent-reminder on/off; first-run complete flag.
- **Meeting**: one Start→Stop session: id, start time, end time, source tab title and address, language choice (automatic or a fixed language), end reason (user stop, tab closed, failure).
- **Transcript segment (line)**: belongs to a meeting; audio stream (always the single mixed stream in 001); start and end time offset from meeting start; text; detected language; speaker label; label source (fallback in 001; 002 adds captions and manual correction).
- **Transcription status**: one per meeting: state, reason, number of reconnects; shown in the status area next to capture (tab) and mic input states.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user completes first-run setup and starts a first transcription in under 2 minutes.
- **SC-002**: Speech appears as in-progress text in the panel within 2 seconds of being spoken, and as a finished line within 5 seconds of the speaker pausing, in 95% of cases on a normal home connection.
- **SC-003**: In a 2-hour meeting with at least one forced disconnect and one session time-limit expiry, 100% of finished lines received before each interruption are kept, none are duplicated, and transcription resumes within 10 seconds without user action.
- **SC-004**: After a crash, at most the last 5 seconds of finished lines are missing when the panel is reopened.
- **SC-005**: 100% of finished lines carry "Others" styled as a fallback label, and a meeting uses exactly one transcription session at a time (one billed stream). *(Revised 2026-10-08; superseded: mic lines carry my name, tab lines "Others".)*
- **SC-006**: The user hears the meeting audio during capture with no perceptible change in volume or delay.
- **SC-007**: Every failure of capture, transcription or microphone is visible in the panel within 5 seconds of occurring, with a reason.
- **SC-008**: Both quality checks can be run by the user end to end from written instructions, each producing a findings record with a clear recommendation.

## Assumptions

- Applies to any tab the user chooses (design decision 15): on every site in this feature, every line is labelled "Others"; real speaker names, including the user's own name from Meet's "You" caption, arrive with the Meet adapter in 002.
- History browsing, reopening past meetings, export to the knowledge-base inbox and deletion arrive in 004; this feature saves the current meeting's lines locally (Principle IV) and keeps the most recent meeting visible after Stop, but provides no history list or export.
- Chat over the transcript arrives in 003.
- Following Meet's mute state arrives with the Meet adapter in 002 (design decision 18); until then the mic is mixed in continuously (FR-021).
- Bring-your-own key stored locally (design decision 2); a future company backend will issue short-lived tokens instead, so the app must not assume the key is local.
- ElevenLabs realtime has no speaker separation within a stream; with one mixed stream every voice, the user's included, shares the "Others" label in 001.
- Auto-reconnect with recent-transcript context is the agreed default (design decisions, senior-dev defaults).
- Language override list: automatic (default), Greek and English shown first, then the other languages the service supports. Changing the choice mid-meeting is not supported in this feature; it applies at Start.
- Reasonable retry policy: a short series of automatic retries with increasing delay before a stream is marked failed; non-recoverable errors are not retried.
- One transcription session runs per meeting (one mixed stream), so service usage is roughly the meeting length (design decision 28; superseded 2026-10-08: two sessions, twice the length).
- Delivery infrastructure, not user-visible: the project scaffold (extension build, unit/integration and end-to-end test setup, CI on every PR, code-graph index) is built as part of this feature because every later feature depends on it.
- A key term cannot contain a comma or a line break when added through the field for new key terms, because both separate terms there (2026-10-12, FR-004a).
