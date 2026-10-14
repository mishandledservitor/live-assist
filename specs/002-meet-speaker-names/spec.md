# Feature Specification: Meet speaker names

**Feature Branch**: `002-meet-speaker-names` (specified on `docs/specs-002-004`)

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "ROADMAP 002 — Meet speaker names. Depends on 001 (capture & live transcript). On Google Meet, turn the platform's live captions on automatically and hide their overlay, read the speaker names from the captions, and align them by time to the transcript segments produced from the meeting audio, so each line of the live transcript shows who said it. When captions cannot be turned on or read, fall back to the user's name vs \"Others\" and show why. [Superseded 2026-10-08: without captions every line is \"Others\" — see Clarifications.] Follow Meet's mute state so the microphone audio is not sent anywhere while the user is muted, and show the mic status. Let the user correct labels manually: renaming a label renames every line carrying it, and a single line can be overridden on its own. Decisions: design-decisions.md #4, #5, #15, #16, #17, #18; constitution Principles I, II, IV, V, VI."

## Clarifications

### Session 2026-10-07

- Q: Should a rename be remembered for future meetings? → A: Yes — caption name → display name mappings persist and auto-apply in future meetings; they are listed in settings for review and removal.

### Session 2026-10-08

- Audio design changed (design decisions 28–30, constitution v1.1.0): tab audio and microphone are captured separately, mixed locally and transcribed as one stream in one ElevenLabs session. There is no separate mic stream, so the user's lines can no longer be recognised by stream.
- Q: How are the user's own lines identified? → A: From captions only. Meet's caption label for the user ("You" in English) is shown as the user's name from settings, as a confirmed caption-sourced label. Without captions every line is "Others", the user's included.
- Q: What happens to the mic while muted? → A: The mic's contribution is replaced with silence before mixing (and before any replay buffer); meeting audio keeps flowing. The earlier question about suspending a separate mic session is moot.

### Red-team 2026-10-08

- Finding: renaming the fallback label "Others" applied the new name to every "Others" line as a confirmed manual label. Since decision 29, "Others" also holds the user's own lines (and anyone the captions could not name), so a rename-all of "Others" would present the user's words, and other people's, under one person's name as confirmed — a guess shown as a name (constitution II).
- Q: Can "Others" be renamed everywhere? → A: No. "Others" is not a speaker, so it has no rename-everywhere; a single "Others" line can be overridden on its own (FR-019). Rename-everywhere stays for caption-sourced names and the user's own name. An "Others" override is never remembered for future meetings. A rename of "Others" stored by an earlier build is ignored when labels are shown. Acceptance scenario US4-3 and FR-018/FR-022 are revised accordingly.
- Q (user, 2026-10-08, design decision 34): On a Meet tab, what happens to the mic when the mute state cannot be read — no reading yet after Start, or the reading goes missing (e.g. the mic button is hidden while presenting)? → A: The gate fails closed. The mic's contribution stays silenced until a real reading says the user is unmuted; it is never sent on "unknown" on a Meet tab. The panel says plainly that the mic is not being sent and why ("Not sent — can't see Meet's mute button"). Tabs with no mute source (not Meet) keep 001's behaviour: the mic is sent and the status says the mute state is unknown. US3-4/US3-5 and FR-016/FR-017 are revised accordingly.

### Retest 2026-10-08

The user's second real call (solo, with a phone joined as a guest, about 4 minutes) showed the admit prompt, some names ("You" shown as the user's name, the phone under its account name), rename-everywhere with remembered names, "Muted in Meet — not sent" and fail-closed mute after leaving. Three failures: (1) most clear single-speaker lines, long monologues included, stayed "Others"; (2) the panel said "No captions seen for a while" while Meet's captions were visibly updating, and later lines still occasionally got names; (3) after "You left the meeting", capture and transcription kept running until Stop.

- Root cause of (1) and (2), reproduced on real-structure fixtures (tasks T096): the caption observer closed a caption item 4 s after its last change, including the item a speaker was still talking in. Meet keeps writing a speaker's ongoing turn into the same item through pauses, rewrites and older lines dropping off, so after the first pause of 4 s or more the speaker's whole remaining turn produced no activity: the watchdog degraded names while captions updated, and the lines had no caption turn to be named from. A re-rendered captions region or re-created item nodes also announced history as fresh activity, which looked like everyone talking at once.
- Q: When does a caption item count as active? → A: whenever something inside it changes (that a change happened and when; the caption text is never read). The newest caption item never closes, so a long turn keeps counting through pauses and rewrites. An older item still closes 4 s after its last change, so Meet's corrections to earlier turns stop counting. A re-rendered region or a re-created item is followed without reporting the turns already on the page as new speech (FR-025).
- Q: How is a turn's time window built? → A: from its bursts of activity rather than from first to last sighting: a gap in activity longer than the caption window splits the turn, so a pause in which someone else spoke without a caption is not credited to the turn. Thresholds are changed only where the timeline fixtures show the need (research R6, "Retest 2026-10-08").
- Q: How does the user find out why a line got its label on the next call? → A: the spike build (`pnpm build:spike`) records the alignment trace with the reason for every line's label and saves it to Downloads by itself when the meeting stops, however it stops (manual-check.md, "Alignment trace on a real call"). Production builds still contain no trace code.
- Q (design decision 36): What happens when the user leaves the Meet call? → A: the meeting stops by itself as if Stop had been pressed; the transcript is kept and the status says "Stopped — the call ended". Leaving is seen when Meet's in-call controls have been gone for a few seconds after the user was in the call. The lobby before joining, a brief re-render of the controls and presenting never stop the meeting (FR-024).

### Real trace 2026-10-08

The user's third real call (solo with a phone as a second participant, about 5½ minutes, spike build) produced the first real alignment trace (`tests/fixtures/meet/traces/real-2026-10-08-trace.json`, anonymised: placeholder names, no text). 24 lines; 19 should carry a name (10 the user's, 8 the phone's account, plus one the user's that stayed "Others"); 5 short fillers or noise should be "Others". The live labels named 18 of the 19 with 0 wrong names.

- Finding (trace): every line's reason read `no-captions` with coverage 0, although 18 lines were named live. The trace recorder never learned the meeting's start time — it is switched on after an asynchronous load that finished after the meeting record was created — so its caption times stayed in epoch milliseconds while line times were meeting-relative, and the reasons compared the two. Fitting the start against the live labels puts it at 1791473933400 (epoch ms).
- Finding (naming): the clear 6-word line at 03:27 (seg-18) stayed "Others" because the user's caption activity paused for 5.41 s inside the turn, and a pause longer than `ACTIVITY_GAP_MS` (5 s) splits a turn. At 5.5 s the line is named and nothing else changes: 19/19 on the real trace, every synthetic fixture unchanged, 0 wrong names. At 5.8 s or more a one-word filler at 03:21 (seg-17, spoken during a 5.77 s pause in the user's captions) is named as the user; that line has no caption activity of its own, so it stays "Others".
- Finding (timing): on the real trace a line's final label is known up to 4.7 s after its last word. By the caption timing, with the 3 s settle three named lines (01:01, 02:05, 05:17) were shown as "Others" first and then changed to the name, and seg-18 would have been too once named.
- Q: How must the trace record times? → A: In one clock: the trace stores the meeting's start time, captions are recorded as they arrive whether or not the start is known yet, and every time in the saved trace (captions, lines) and every reason is computed relative to that start. A trace from before this fix can still be converted by giving the start by hand.
- Q: What is the turn-split threshold? → A: 5.5 s (`ACTIVITY_GAP_MS`), between the real 5.41 s pause that must not split a turn and the 5.77 s pause whose filler must stay "Others". Both sides are pinned by tests on the real trace.
- Q (user, design decision 37): What does a line show while its name is not settled yet? → A: A neutral "…" placeholder in the label position, not "Others", then the name or "Others" once settled. Screen readers hear "Speaker pending". The placeholder is held until the line settles (`SETTLE_MS`, raised from 3 s to 6 s to cover the 4.7 s seen on the real trace). The in-progress line shows the same placeholder. Only lines that can still be named get it: when names are unavailable (no captions, not Meet, degraded) a line shows "Others" at once. A stored line read back after the meeting never shows the placeholder. FR-009 is revised and FR-026 added.

### Real call 2026-10-09

The user's first real meeting with five or more participants showed one line labelled with a remote participant's name (caption-sourced, confirmed) that held a quick back-and-forth: another participant interjected in the middle of it ("You, you will check that? Yes, yes. Okay."). ElevenLabs commits a line only after about 1.5 s of silence (its voice-activity default), so a rapid exchange lands in one line; one line gets one label; the participant who spoke most passed the 80 % share, so the other participant's words were shown under the first participant's name as confirmed. That is a guess presented as a name (constitution II).

- Q: What happens to a finished line whose words were spoken by more than one person? → A: It is split at each caption speaker change, using the line's word timings and the caption-lag model of research R6, into consecutive lines, one per speaker run. Each resulting line is named by the existing rules on its own words; any stretch whose speaker cannot be placed confidently — the words around a handover, an interjection too short to be placed, overlapping speech — becomes its own "Others" line and never takes a neighbour's name (FR-027).
- Q: When does a line split? → A: When it settles (`SETTLE_MS` after its last word, while it shows the "…" placeholder), or later if late captions show a speaker change before the line is final. A line the user has already given a single-line override is never split: the user's correction stands for the whole line. A line without word timings is never split.
- Q: Are split lines ordinary lines? → A: Yes. Each is a transcript line with its own start time, text, word timings and label, so renames, single-line overrides, the chat's `[mm:ss]` citations (003) and the inbox export (004) treat them like any other line. The first keeps the original line's id; the others get ids derived from it, so a split is idempotent and repeatable from the stored record.
- Q: Should lines also be cut shorter at the source? → A: Yes, as a second, smaller measure: the transcription session commits a line after 1.0 s of silence instead of the service default (001 spec, Clarifications "Real call 2026-10-09"). It does not split exchanges with no pause between speakers — on the real traces handovers came with gaps under 0.5 s or over 1.6 s — so splitting at speaker changes is the fix; the shorter silence only moves more handovers into separate lines before any splitting is needed.

### Session 2026-10-12

The user tested reclaiming the captions band in a live 5-person Meet call (design decision 61). When live-assist hides Meet's captions (opacity only, decision 58), Meet still reserves a band of about 216 px under the video. Both ways to get it back are closed: collapsing the band to zero height stopped caption updates reaching the adapter (real call 2026-10-10, reverted the same day); and shrinking the stage's bottom inset (`main.axUSnc`, inline `inset: 64px 16px 304px`, where 304 = 80 control bar + 216 band + 8) to 88px sticks on the element but leaves the tiles at the same height even after a window resize makes Meet lay out again, because Meet sizes tiles from its own model of the window minus its docks, not from the stage element.

- Q: What happens to the band? → A: It is accepted as it is. No further attempt to reclaim it.
- Q (user): Since the space is taken either way, can Meet's captions be shown in it? → A: Yes. A setting, off by default, leaves Meet's captions visible while live-assist reads speaker names from them. FR-002 is revised and FR-028–FR-030, User Story 5 and SC-007 are added.

Defaults chosen without asking the user (they prefer sensible defaults), recorded as assumptions:

- A1: The setting is one toggle on the Settings screen (design decision 32), labelled `Show Meet captions`, with no heading of its own and no sentence explaining how names are read (design decision 33; `specs/006-panel-redesign/copy-review.md` K42).
- A2: It is stored with the other settings in `chrome.storage.local`, off by default, existing installs included.
- A3: A change takes effect at once, in a running meeting too, in both directions, without restarting transcription and without a gap in caption activity. With no meeting running it applies from the next Start.
- A4: Speaker naming, the captions state and watchdog messages, and restore-on-Stop (captions and overlay put back as they were before Start) are the same in both modes.
- A5 (amended the same day by feature 013, decision 63: caption text is now read and kept locally for the captions download, the same in both modes; the rest stands): No caption text is read, sent over the bridge or stored in either mode (FR-004 is unchanged). The only new thing the Meet page is told is whether to show the captions.
- A6: The service worker tells the Meet page: with the attach message at Start, in its answer when a reloaded Meet page asks whether to attach, and with one message to the meeting's tab when the stored setting changes. The offscreen document, which cannot read settings, is not involved and the platform adapter contract does not change.
- A7: While captions are shown, live-assist leaves them fully to Meet: clicks on the captions work again (while hidden they pass through, as before). If the user turns Meet's captions off with Meet's button, names degrade with "Captions were turned off" exactly as when hidden.
- A8: The setting does nothing on tabs that are not a Google Meet call.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See who said what in a Meet call (Priority: P1)

The user starts transcription on a Google Meet tab. Without doing anything else, the live transcript in the side panel shows the real name of each remote participant next to what they said, and the user's own speech under the user's own name (Meet's caption label for the user, "You", is shown as the name from settings). The meeting itself looks unchanged to the user: no caption overlay appears on the Meet page (unless the user chose to show Meet's captions, User Story 5), and other participants see nothing different.

**Why this priority**: Names are what turn a wall of text into a usable record. Without them, the user cannot tell who committed to what, and the exported transcript (004) is far less useful to the knowledge base. Everything else in this feature supports or corrects this.

**Independent Test**: Replay a saved Meet page with a recorded caption sequence and a recorded transcript-segment sequence; the panel shows each segment attributed to the participant whose caption overlapped it in time, segments overlapping the user's own caption turns under the user's name from settings, and no visible caption overlay on the page.

**Acceptance Scenarios**:

1. **Given** a Meet call with captions off and two remote participants, **When** the user presses Start, **Then** captions are switched on for the user only, the caption overlay is hidden (`Show Meet captions` off, the default), and the panel's speaker-names indicator shows names as active.
2. **Given** captions are active and participant "Jane Doe" speaks, **When** the corresponding transcript segment arrives from the meeting audio, **Then** the segment is labelled "Jane Doe" and marked as a confirmed label.
3. **Given** captions are active and the user speaks, **When** the corresponding transcript segment arrives, **Then** it is labelled with the user's name from settings (not Meet's "You") and marked as a confirmed caption-sourced label.
4. **Given** the user had captions off before Start, **When** the user presses Stop, **Then** captions are returned to the state they were in before Start (off) and the overlay is no longer hidden.
5. **Given** two remote participants speak in quick succession, **When** a transcript segment overlaps both of their caption turns, **Then** the segment is split at the speaker change into one line per speaker, each named only if its own words clearly belong to that speaker; the words that cannot be placed confidently form an "Others" line, unconfirmed, rather than being given a guessed name. (Revised real call 2026-10-09: previously the whole segment took the dominant participant's name, interjections included.)
6. **Given** participant "Hannah" talks for a long stretch and participant "Oliver" interjects briefly in the middle ("Yes, yes. Okay."), **When** the line containing both settles, **Then** none of Oliver's words are shown under Hannah's name: they are under Oliver's name if his caption places them confidently, otherwise "Others", and Hannah's words before and after are lines of their own under his name.

---

### User Story 2 - Know when names are not available, and why (Priority: P1)

If the names cannot be obtained — captions cannot be switched on, Meet's page has changed so captions cannot be read, captions stop arriving mid-call, or the tab is not a Meet call — the transcript keeps flowing with every line labelled "Others" (the user's own lines included), and the panel says plainly that names are unavailable and gives the reason.

**Why this priority**: The constitution forbids silent failure and forbids presenting a guess as a name. A broken name source must never stop or corrupt the transcript.

**Independent Test**: Replay a saved Meet page whose caption controls are missing or changed; the transcript continues with every line labelled "Others" and the panel shows a "names unavailable" state with a reason.

**Acceptance Scenarios**:

1. **Given** a Meet page where the caption control cannot be found, **When** the user presses Start, **Then** transcription starts normally, every line is labelled "Others", and the panel shows names as unavailable with a reason such as "Couldn't turn on Meet captions".
2. **Given** names were working, **When** no caption activity is seen for a sustained period while speech is still being transcribed, **Then** the panel switches the names indicator to a degraded state with the reason, new segments are labelled "Others", and already-labelled lines keep their names.
3. **Given** caption reading recovers, **When** captions start arriving again, **Then** new segments are named again and the indicator returns to active, without the user doing anything.
4. **Given** the user starts transcription on a tab that is not Google Meet, **When** the transcript appears, **Then** every line is labelled "Others" and the panel says names are only available on Google Meet.

---

### User Story 3 - My microphone is not sent while I'm muted in Meet (Priority: P1)

When the user is muted in Meet, nothing from their microphone leaves the machine: the mic's contribution is silenced before it is mixed with the meeting audio. When they unmute, their speech is transcribed again under their name. The panel always shows whether the mic is currently being sent.

**Why this priority**: Privacy is the constitution's first principle; muted side conversations in the user's room must not reach any third party.

**Independent Test**: Replay a saved Meet page while toggling its mute state; verify that no mic audio is delivered to the transcription service while the page shows muted, that it resumes on unmute, and that the panel's mic status matches.

**Acceptance Scenarios**:

1. **Given** transcription is running and the user is unmuted, **When** the user mutes in Meet, **Then** mic audio stops being sent within one second and the panel shows the mic as "muted — not sent".
2. **Given** the user is muted, **When** the user unmutes in Meet, **Then** mic audio is sent again and the panel shows the mic as live.
3. **Given** the user is already muted when pressing Start, **When** transcription starts, **Then** no mic audio is sent until the user unmutes.
4. **Given** a tab that is not Google Meet (no mute source), **When** transcription runs, **Then** the mic is sent, the panel shows the mic as "mute state unknown — mic is being sent" so the user knows, and the meeting audio's transcript is unaffected.
5. **Given** a Meet call whose mute state cannot be read — no reading yet after Start, or the mute button disappears mid-call (e.g. while presenting) — **When** transcription runs, **Then** the mic stays silenced before mixing (fail closed, design decision 34), the panel shows "Not sent — can't see Meet's mute button", and the mic is sent again as soon as a reading shows the user unmuted.

---

### User Story 4 - Fix a wrong or missing name (Priority: P2)

The user can rename a named speaker label (a caption name or the user's own name), and every line carrying that label — past and future in this meeting — shows the new name. The user can also change the speaker of one single line without affecting any other line; that is the only correction for an "Others" line, because "Others" is not one person.

**Why this priority**: Captions sometimes show a nickname, a device name ("Conference Room 3"), or nothing at all; in fallback mode everything remote is "Others". Correction makes the record trustworthy, but the feature is still valuable without it.

**Independent Test**: In a transcript with labels "Jane D." and "Others", rename "Jane D." to "Jane" and override one "Others" line to "Bob"; every former "Jane D." line now reads "Jane", the one overridden line reads "Bob", and all other "Others" lines are unchanged.

**Acceptance Scenarios**:

1. **Given** several lines labelled "Jane D.", **When** the user renames that label to "Jane", **Then** all those lines show "Jane", and new segments that Meet attributes to the same participant also show "Jane" for the rest of the meeting.
2. **Given** a line labelled "Others", **When** the user overrides just that line to "Bob", **Then** only that line changes and is marked as a confirmed (manual) label.
3. **Given** a call in fallback mode (every line "Others", the user's own lines included), **When** the user opens the speaker editor on an "Others" line, **Then** only "Just this line" is offered — there is no way to rename "Others" everywhere — and overriding that line to "Bob" changes that line only. (Revised red-team 2026-10-08: renaming "Others" everywhere would attribute the user's own lines to someone else as confirmed.)
4. **Given** a line was overridden individually, **When** the user later renames the label that line originally had, **Then** the overridden line keeps its override.
5. **Given** the user renames a label to a name already used by another label, **When** the rename is confirmed, **Then** both sets of lines show the same name (the labels are merged for display).

---

### User Story 5 - Show Meet's captions while transcribing (Priority: P3)

Meet keeps a band under the video for its captions whenever they are on, and that band stays empty while live-assist hides them. A user who would rather read Meet's captions there turns on `Show Meet captions` in Settings. From then on Meet's captions stay visible during transcription, and everything else — names in the transcript, the speaker-names status, what Stop puts back — is the same as with captions hidden.

**Why this priority**: The feature works without it; it turns space that is lost anyway into something the user can read. Hidden stays the default, so nothing changes for a user who never opens the setting.

**Independent Test**: On a saved Meet page with the setting on, press Start: captions are switched on and stay visible, lines are named as before, and Stop turns captions off again. During a running meeting, switch the setting on and off: the captions appear and disappear on the page within a second while names keep arriving and the speaker-names indicator never leaves "On".

**Acceptance Scenarios**:

1. **Given** `Show Meet captions` is off (the default) and a Meet call with captions off, **When** the user presses Start, **Then** captions are switched on and hidden exactly as before this setting existed.
2. **Given** `Show Meet captions` is on and a Meet call with captions off, **When** the user presses Start, **Then** captions are switched on for the user only and stay visible in Meet's captions band, the speaker-names indicator shows names as active, and transcript lines are named as in User Story 1.
3. **Given** transcription is running with captions hidden, **When** the user turns `Show Meet captions` on in Settings, **Then** Meet's captions become visible within one second, transcription is not restarted, the speaker-names indicator stays active, and lines spoken across the change are named as before.
4. **Given** transcription is running with captions shown, **When** the user turns `Show Meet captions` off, **Then** Meet's captions are hidden within one second, with the same guarantees as scenario 3.
5. **Given** captions were off before Start and are shown during the meeting, **When** the user presses Stop (or leaves the call, or the meeting ends by itself), **Then** captions are switched off again and nothing of live-assist is left on the Meet page — the same as with captions hidden.
6. **Given** captions were already on before Start, **When** the meeting runs with `Show Meet captions` on and then stops, **Then** Meet's captions were visible throughout and stay on afterwards.
7. **Given** either mode, **When** captions are active, **Then** naming uses only who is speaking and when, never the caption text. (Amended 2026-10-12, feature 013: the text is kept locally for the captions download in both modes; before, it was not read at all.)

---

### Edge Cases

- A participant joins, leaves, or rejoins mid-call: their name is picked up when their captions appear; no participant list is required in advance.
- Two participants share the same display name in Meet: both are shown under that name; the user can tell them apart with single-line overrides.
- The user's own captions: Meet labels them with a self word ("You" in English, a translation in other UI languages). Those turns name the user's lines with the user's name from settings. If the self word is not recognised (an unfamiliar UI language), the lines show Meet's word as a caption name and the user can rename it once; the rename is remembered (FR-022).
- The user and a remote participant speak at the same time: the overlapping words are an "Others" line; words before and after the overlap that clearly belong to one speaker are split off under that speaker's name (FR-027, real call 2026-10-09).
- Someone speaks while no caption is shown (very short utterance, noise, captions lag): the segment is labelled "Others", unconfirmed.
- Caption timing is loose relative to the transcript: alignment tolerates a lag of a few seconds between caption and transcript timing.
- Captions are in a different language from the speech, or show poor text: only the speaker name is used for naming, never the caption text. (2026-10-12: the text Meet wrote is kept as it is for 013's captions file.)
- The user manually turns captions on or off in Meet during transcription: the app does not fight the user; if captions go off, names degrade visibly with the reason "Captions were turned off".
- The user presents or the Meet layout changes (e.g., full-screen, picture-in-picture): naming continues if captions remain readable; otherwise it degrades visibly.
- The user's settings name is empty: Start is already blocked by 001's first-run name prompt, so this cannot occur.
- Meet's mute state flips rapidly: mic sending follows the latest state; no mic audio captured while muted is ever sent, even if it was buffered.
- `Show Meet captions` is changed while no meeting runs: nothing happens on any page; the next Start uses the new value.
- `Show Meet captions` is changed before captions are on (in the lobby, or while they are being turned on): the value is used when captions come on.
- The Meet page reloads during a meeting: the reloaded page is told the current value when it re-attaches.
- The setting changes while the Meet page cannot be reached (reloading): the page gets the current value when it re-attaches.
- Captions are shown and the user turns them off with Meet's own button: names degrade with "Captions were turned off", as when hidden; turning them back on resumes naming, and they are shown again.
- Meet re-renders the captions region while captions are shown: it stays visible; while hidden, the new region is hidden again on the next check (unchanged).
- The meeting runs on a tab that is not a Google Meet call: the setting has no effect.

## Requirements *(mandatory)*

### Functional Requirements

**Speaker names from Meet captions**

- **FR-001**: On a Google Meet call, when transcription starts, the system MUST switch Meet's live captions on for the user if they are off, without requiring any user action.
- **FR-002**: While transcription runs, the system MUST hide Meet's caption overlay from the user's view of the meeting unless the user has turned on `Show Meet captions` (FR-028), and MUST NOT change anything other participants see in either case. Hiding makes the captions invisible and nothing more: the band Meet reserves for them under the video stays, and the system MUST NOT resize, collapse or move it (design decisions 58 and 61). (Revised 2026-10-12: previously captions were always hidden.)
- **FR-003**: When transcription stops (or the tab closes), the system MUST return captions and the overlay to the state they were in before Start.
- **FR-004**: The system MUST read, from Meet's captions, which participant is speaking and when, and MUST use only the speaker name and timing — never the caption text — in the transcript. (Amended 2026-10-12, feature 013, design decisions 63 and 65–75: the caption text is also read, for one purpose only: it is kept locally with the meeting as a second record and downloaded with the transcript, as `specs/013-captions-download/spec.md` specifies. It never reaches the transcript, a provider or the panel, and naming still uses only name and timing.)
- **FR-005**: The system MUST attribute each transcript segment to the participant whose caption activity overlaps it in time, tolerating caption lag of up to a few seconds.
- **FR-006**: When a segment's time overlaps more than one participant and no single participant clearly dominates, or overlaps no caption activity, the system MUST label it "Others" and mark it unconfirmed, rather than assigning a guessed name.
- **FR-007**: Segments attributed to Meet's caption label for the user MUST be labelled with the user's name from settings, as a confirmed caption-sourced label; the user's lines are identified from captions only (design decision 29).
- **FR-008**: Each label MUST carry its source — Meet captions (including the user's own caption label), manual correction, or fallback — and the transcript MUST visually distinguish confirmed labels (captions, manual) from fallback/unconfirmed ones.
- **FR-009**: Labels already assigned MUST be updated if a late-arriving caption resolves a segment that was still pending. While names are active, a new segment shows the pending placeholder (FR-026) until it settles, then its name or "Others"; it MUST NOT stay pending for longer than `SETTLE_MS` (6 s) after its last word. (Revised real trace 2026-10-08, design decision 37: previously it showed "Others" until resolved.)

**Fallback and visibility**

- **FR-010**: If captions cannot be switched on, cannot be read, or stop arriving while speech is still being transcribed, the system MUST continue transcription uninterrupted, label new segments "Others" (the user's included), and show in the panel that names are unavailable with a human-readable reason.
- **FR-011**: The system MUST recover automatically when captions become readable again, resuming naming for new segments and updating the indicator.
- **FR-012**: On any tab that is not a Google Meet call, the system MUST label every line "Others" and state that speaker names are available on Google Meet only.
- **FR-013**: The panel MUST show the current speaker-names state at all times during transcription: active, unavailable/degraded (with reason), or not supported on this site.

**Mute following**

- **FR-014**: On a Google Meet call, the system MUST NOT send microphone audio anywhere while the user is muted in Meet: the mic's contribution MUST be replaced with silence before it is mixed (and before any replay buffer), including audio captured just before the mute was detected but not yet sent.
- **FR-015**: The system MUST stop sending mic audio within 1 second of the user muting, and resume within 1 second of unmuting.
- **FR-016**: The panel MUST show the mic state at all times during transcription: live, muted — not sent, not sent because Meet's mute button can't be seen (Meet tabs), or mute state unknown — mic is being sent (tabs with no mute source).
- **FR-017**: On a Google Meet tab, when the mute state cannot be read — no reading within the initial wait after Start, or the reading goes missing or stale mid-call — the system MUST keep the mic's contribution silenced (fail closed) until a reading shows the user unmuted, and MUST show that the mic is not sent and why. On a tab with no mute source (not Meet), the system MUST continue to mix in mic audio (matching 001's behaviour) and MUST show the "unknown" state so the user can decide to stop. (Revised by design decision 34, 2026-10-08; previously the Meet gate fell open to "unknown" after a wait.)

**Manual relabel**

- **FR-018**: Users MUST be able to rename any named speaker label (caption-sourced names, including the user's own) in the current meeting; the rename MUST apply to every line carrying that label, past and future, for the rest of the meeting. The fallback label "Others" MUST NOT be renamable everywhere — it mixes the user's own lines with everyone the captions could not name — so the UI offers no rename-everywhere for it, the message protocol and the runtime reject such a rename, and a stored rename of "Others" is ignored when labels are shown (red-team 2026-10-08).
- **FR-019**: Users MUST be able to override the speaker of a single line without affecting any other line; an override MUST survive later renames of the line's original label.
- **FR-020**: Manually set labels MUST be marked as confirmed (manual source).
- **FR-021**: Renames and overrides MUST be part of the meeting's record so that anything built on the transcript (chat in 003, history and export in 004) sees the corrected names.
- **FR-022**: A rename of a caption-sourced speaker name MUST be remembered as a mapping (caption name → display name) and applied automatically to that caption name in future meetings. Remembered mappings MUST be listed in settings where the user can view, edit and remove each one. A single-line override of an "Others" line is never remembered (red-team 2026-10-08).

**Isolation**

- **FR-023**: Everything specific to Google Meet's page (captions on/off/hide, caption speaker stream, mute state) MUST be confined to a Meet adapter, so a change on Meet's side is fixed in one place and other platforms can be added later behind the same contract.

**Retest 2026-10-08**

- **FR-024**: On a Google Meet call, when the user leaves the call (Meet's in-call controls gone continuously for `CALL_GONE_MS` after the user was in the call), the system MUST end the meeting as Stop does, keep the transcript, restore captions, and show that the meeting stopped because the call ended. It MUST NOT end the meeting in the lobby before the user joins, during a re-render of the call controls shorter than `CALL_GONE_MS`, or while the user presents (design decision 36).
- **FR-025**: Caption activity MUST be derived from changes inside each caption item — that a change happened and when, never what the caption says. The item a speaker is currently captioned in MUST keep producing activity for as long as it changes, through pauses, rewrites and older lines dropping off; a re-rendered captions region or re-created caption item MUST NOT stop activity or report turns already on the page as new activity; and no caption text may leave the content script as part of caption activity. (Amended 2026-10-12, feature 013, design decisions 63 and 65–75: caption text leaves the content script in one message only, `meet/caption-text`, for local storage with the meeting; activity messages carry none, and which changes count as activity is unchanged. `specs/013-captions-download/contracts/captions-capture.md`.)

**Real trace 2026-10-08**

- **FR-026**: While a line's name is not settled — the in-progress line, and a finished line before `endMs + SETTLE_MS` while names are active — the panel MUST show a neutral "…" in the label position, never "Others" and never a name, with the accessible name "Speaker pending". It is not a speaker label: it is never stored as `speakerLabel`, never offered as a name, never editable, and a single-line override replaces it. When names are unavailable the line shows "Others" at once; a line read back from storage after the meeting never shows it (design decision 37).

**Real call 2026-10-09**

- **FR-027**: A finished line with word timings MUST be split at caption speaker changes into consecutive lines, one per speaker run, before (or when) its label settles. A word belongs to a speaker run only when, for every caption lag the model allows (research R6, "Real call 2026-10-09"), that speaker is the only one whose captions could hold it; each run is then named by the FR-005/FR-006 rules on its own words. Words that no run can hold confidently — around a handover, in overlapping speech, or in an interjection too short to place — MUST form an "Others" line of their own and MUST NOT take a neighbouring run's name. Split lines are ordinary lines (own id derived from the original, start time, text, word timings, label); a line with a single-line override, or without word timings, is never split. A line whose words belong to one speaker keeps its current behaviour.

**Session 2026-10-12 (design decision 61)**

- **FR-028**: The Settings screen MUST offer one setting, `Show Meet captions`, off by default (existing installs included) and stored with the other settings in `chrome.storage.local`. While it is on, the system MUST leave Meet's captions visible during transcription on a Google Meet call — it adds no hiding to the page — and still switches them on at Start (FR-001). While it is off, captions are hidden as FR-002 says.
- **FR-029**: A change to `Show Meet captions` MUST take effect within 1 second on the Meet page of a running meeting, in both directions, without restarting transcription or the captions, without clicking Meet's captions button, without changing the speaker-names state, and without interrupting caption activity. A Meet page that attaches or re-attaches during a meeting (Start, reload) MUST be given the current value before captions are enabled on it. With no meeting running, a change applies from the next Start.
- **FR-030**: Whether captions are shown or hidden MUST NOT change anything else: reading speaker names and timing (FR-004, FR-005, FR-025), naming and splitting (FR-006–FR-009, FR-027), the captions state, its reasons and the watchdog (FR-010–FR-013), restoring captions and the page when the meeting ends (FR-003, FR-024), and what other participants see are identical in both modes. In both modes no caption text is used for any of this; the value of the setting is the only thing this feature adds to what the Meet page is told. (Amended 2026-10-12, feature 013, design decisions 63 and 65–75: the caption text is read and kept locally as 013 specifies, identically in both modes; it was "not read, sent or stored" before.)

### Key Entities

- **Caption turn**: one stretch of caption activity attributed by Meet to one participant — participant display name, start time, end time. Used only for naming; naming never sees its text. (2026-10-12: 013 keeps the text separately, as a stored caption turn; `specs/013-captions-download/data-model.md`.)
- **Speaker label**: the name shown on a transcript line, with its source (captions, manual, fallback) and whether it is confirmed. Labels are keyed to a participant identity for the meeting so renames follow them.
- **Label rename**: a meeting-level mapping from an original label to a display name; applies to all lines and future segments with that label.
- **Line override**: a single-segment speaker assignment that takes precedence over the segment's label and any rename.
- **Speaker-names status**: active / degraded with reason / not supported on this site.
- **Mic status**: live / muted — not sent / mute state unknown.
- **Show Meet captions** (setting): on or off, default off. Decides only whether Meet's captions are visible on the user's Meet page while transcription runs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a recorded Meet call with at least three participants taking clear turns, at least 90% of transcript lines (the user's own included) carry the correct participant name.
- **SC-002**: No line ever shows a participant name that the captions did not support for that time span: every line is either correctly named (the user's name included), a manual label, or marked as "Others"/unconfirmed — 0 wrong names presented as confirmed in the fixture suite. Since the real call 2026-10-09 this is also measured per word: in the fixture suite no word is shown under a name other than the person who spoke it, and on the real traces no named word lies where only another speaker's captions could hold it.
- **SC-003**: When captions are unavailable, the user sees the "names unavailable" state and its reason within 10 seconds of Start (or of captions stopping), and the transcript never pauses because of it.
- **SC-004**: Zero microphone audio is delivered to any third party while the user is muted in Meet, verified across a fixture suite of mute/unmute sequences including rapid toggling.
- **SC-005**: The user can rename a speaker in under 10 seconds, and the change is visible on every affected line immediately.
- **SC-006**: Other participants in the call see no change caused by the extension (no captions announcement, no visible change on their side), confirmed in the real-meeting check recorded for this feature.
- **SC-007**: With `Show Meet captions` switched on and off during a fixture meeting, Meet's captions are visible or hidden on the page within 1 second of each change, the speaker-names state never leaves active, Meet's captions button is not clicked, lines spoken across the changes are named as without them, and Stop leaves the page as it was before Start — in the automated suite, and confirmed in a real call (manual-check.md "Show Meet captions").

## Assumptions

- **Depends on 001**: this feature builds on 001's live transcript — after design decision 28, segments from one mixed stream (tab audio + mic mixed locally, one ElevenLabs session), each with word timings relative to the meeting start and the label "Others"; 001's settings (user's name), side panel with status indicators, Start/Stop, auto-reconnect, and a gate that silences the mic input before the mixer. This spec changes how segments are named, drives that gate from Meet's mute state, and adds manual correction.
- ElevenLabs realtime provides no speaker separation; names can only come from Meet captions (design decision #4).
- Meet captions are per-user: switching them on and hiding them affects only the user's own view (design decision #5).
- While its captions are on, Meet reserves a band under the video for them (about 216 px on 2026-10-12) whether or not they are visible; live-assist cannot give that space back to the video (design decision 61).
- Meet shows a speaker name with captions even when the caption text quality is poor or the spoken language differs from the caption language, so naming works for mixed Greek/English meetings.
- Meet captions the user's own speech (only while the user is unmuted, since Meet captions what it transmits), so the user's lines can be named from captions.
- "Clearly dominates" for overlapping segments is a tunable threshold set during planning and validated against recorded fixtures; the alignment-accuracy risk is listed in design-decisions.md and is spiked during planning.
- Persisting a meeting's labels, renames and overrides as part of its saved record belongs to 004 (history); within a running meeting they live with the transcript. The remembered caption-name mappings (FR-022) are a setting owned by this feature and persist independently of history.
- Zoom and Teams adapters are later features (design decision #15); they are not built here.
- Manual verification against a real Meet call is required before this feature is called done, and its result is recorded in this folder (constitution Principle III).
