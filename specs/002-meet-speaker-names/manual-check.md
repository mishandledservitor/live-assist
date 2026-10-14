# Manual check record: 002 Meet speaker names

Real-browser checks that automated tests cannot cover (Constitution III). The automated suite runs on synthetic Meet page snapshots and scripted caption activity; only a real Meet call shows whether Meet's page matches them. Fill in each section when you run it. This record is the one task T076 asks for; sections are added as their phases land (US3 mute and US4 relabel come with Phases 5 and 6).

## Build

From the repo root, on branch `002-impl-names` or later:

```sh
pnpm install
pnpm build
```

Chrome → `chrome://extensions` → reload live-assist (or Load unpacked → `.output/chrome-mv3`). You need a Meet call with at least two other people (or two other devices signed in as different named accounts), headphones, and your ElevenLabs key already set up.

## Speaker names (US1) and when they are unavailable (US2) — quickstart.md steps 1–5, 7–9, 11

About 20 minutes. Do them in one call where you can; step 11 needs a non-Meet tab.

1. **Captions on and hidden** — Join the call with captions off. Click the live-assist toolbar icon on the Meet tab, press Start. Within a few seconds the Speaker names row reads "Active — names from Meet captions"; no caption band is visible; the layout looks unchanged (note any blank band where captions would be). Ask another participant whether they saw anything change (SC-006).
2. **Names** — Have two others take clear turns for a few minutes, and speak a few times yourself. Their lines carry their names in the confirmed style; yours carry your settings name. Count lines with a wrong or missing name (SC-001: at least 90 % correct; SC-002: no wrong name shown as confirmed).
3. **Quick exchange** — Have two people talk over each other briefly. The overlapping line shows "Others" (fallback), not a guessed name.
4. **Stop restores** — Press Stop: captions are off again and nothing is hidden. Start again with captions already on: after Stop they stay on.
5. **Captions turned off by you** — During transcription press `c` in Meet (or the CC button): the row says "Captions were turned off"; new lines are "Others", yours included; earlier lines keep their names. Turn them back on: names resume by themselves.
6. **Captions silent** — Optional, hard to provoke: if captions stop updating while people keep talking, within about 10 s the row says "No captions seen for a while — new lines are labelled Others", and recovers by itself.
7. **Layout changes** — Present your screen, then switch Meet to full screen and back: names keep arriving, or the row says why not.
8. **Reload** — Reload the Meet tab mid-transcription (stay in the call): the row briefly says "The Meet page reloaded — reconnecting…", then captions turn on again and names come back by themselves.
9. **Lobby** — Press Start on the pre-join screen: the row says "Join the call to get speaker names"; after joining, captions turn on and names appear.
10. **Non-Meet tab** — Start on a YouTube tab: the row says speaker names are available on Google Meet only; every line is "Others".

**Record results here** (one row per step; pass/fail plus what you saw):

| Step | Expected | Observed | Pass/fail | Notes |
|------|----------|----------|-----------|-------|
| Date, Chrome version, Meet UI language | | | | |
| 1 Captions on and hidden | Row active within a few seconds, no caption band, layout unchanged | | | Blank band left where captions were? |
| 1 Meet's notifications stay visible (research R13) | While transcribing, a join request still shows and "Admit" works; only the caption band is hidden | | | First real call (2026-10-08) hid them; fixed by T086 |
| 1 Others saw nothing (SC-006) | Another participant confirms no change | | | Who confirmed |
| 2 Names (SC-001) | ≥ 90 % of lines named correctly, yours included | | | Correct / total |
| 2 No wrong confirmed names (SC-002) | 0 | | | Count |
| 3 Quick exchange | Overlap → "Others" | | | |
| 4 Stop restores (captions were off) | Captions off, nothing hidden | | | |
| 4 Stop restores (captions were on) | Captions stay on | | | |
| 5 Captions turned off | Reason shown, new lines Others, earlier kept; recovery on | | | |
| 6 Captions silent (optional) | Degraded within ~10 s, recovers | | | |
| 7 Layout changes | Names continue or reason shown | | | |
| 8 Reload | "Reconnecting…", then names resume | | | |
| 9 Lobby | "Join the call…", then names after joining | | | |
| 10 Non-Meet tab | "Google Meet only", every line Others | | | |

## Mic not sent while muted (US3) — quickstart.md step 6 and the mute checks

About 10 minutes, in the same kind of call (headphones on). Someone else in the call helps by telling you whether they heard you, but the check is about the transcript.

1. **Status follows Meet** — Start unmuted. The Microphone row reads "Live — follows Meet's mute". Mute with Meet's button: within a second it reads "Muted in Meet — not sent". Unmute: back to "Live".
2. **Nothing said while muted is transcribed** — While muted, say a distinctive sentence (e.g. "purple elephant forty-two") clearly into the mic, twice. Unmute and say "back again". The muted sentence never appears in the transcript; "back again" does, under your name if captions are on.
3. **Keyboard mute** — Repeat step 2 muting with ⌘+D (Ctrl+D) instead of the button.
4. **Muted at Start** — Mute first, then press Start. The row shows "Checking Meet's mute state — not sent" for a moment, then "Muted in Meet — not sent". Speak; nothing of yours appears. Unmute; you appear.
5. **Rapid toggling** — Mute and unmute quickly five or six times while speaking a counted sequence ("one, two, three…"). Only numbers said while unmuted appear (a word cut in half at a toggle is fine).
6. **Push-to-talk** (research R7, unverified) — While muted, hold the space bar and speak, then let go. Note whether the row flips to Live while held and whether those words appear.
7. **Reload while muted** — Muted, reload the Meet tab. The row reads "Checking Meet's mute state — not sent" while the page comes back, then "Muted in Meet — not sent". Nothing you say during the reload appears.
8. **Non-Meet tab** — On a YouTube tab the row reads "On — mute state unknown — mic is being sent".

**Record results here**:

| Step | Expected | Observed | Pass/fail | Notes |
|------|----------|----------|-----------|-------|
| 1 Status follows Meet | Live / Muted within 1 s | | | |
| 2 Muted speech not transcribed (SC-004) | Muted sentence absent, "back again" present | | | |
| 3 Keyboard mute | As step 2 | | | |
| 4 Muted at Start | Checking → Muted; nothing until unmute | | | |
| 5 Rapid toggling | Only unmuted numbers | | | |
| 6 Push-to-talk | Record what happens | | | Unverified assumption (R7) |
| 7 Reload while muted | Checking → Muted; nothing during reload | | | |
| 8 Non-Meet tab | "mute state unknown — mic is being sent" | | | |

## Fix a wrong or missing name (US4) — quickstart.md step 10 and the relabel checks

About 10 minutes, in a call with captions working and at least one other person.

1. **Rename everywhere** — Click a remote speaker's name on any line. The dialog shows their current name; type a new one and press Enter. Every line of that person, earlier and new, shows the new name at once (SC-005: under 10 seconds from click to done).
2. **Just this line** — Click any line's name, type another name, choose "Just this line". Only that line changes, in the confirmed style. Click it again: "Clear override" puts it back.
3. **Override survives a rename** — Override one of a person's lines, then rename that person everywhere: the overridden line keeps its override.
4. **Two names into one** — Rename two different speakers to the same name: both sets of lines show it.
5. **Others in a 1:1 call** — In a call where names are unavailable (turn captions off with `c`), rename "Others" to the other person's name: every Others line, earlier and new, shows it in the confirmed style.
6. **Remembered for the next meeting** — After step 1, Stop. Settings → Remembered names lists "caption name → new name". Start a new meeting with the same person: their lines show the new name without renaming again. Edit the name in Settings, start again: the edited name is used. Forget it, start again: Meet's name is back.
7. **After the meeting** — With the meeting stopped, rename a speaker and override a line in the stored transcript; reload the panel: both kept.
8. **Your own name in another UI language** (optional, with step 12 of quickstart) — If your lines show Meet's word for "You" in another language, rename it once; the next meeting shows your name.

**Record results here**:

| Step | Expected | Observed | Pass/fail | Notes |
|------|----------|----------|-----------|-------|
| 1 Rename everywhere (SC-005) | All lines renamed at once, < 10 s | | | Seconds taken |
| 2 Just this line / Clear override | Only that line; cleared back | | | |
| 3 Override survives rename | Override kept | | | |
| 4 Two names into one | Both under one name | | | |
| 5 Others in a 1:1 call | Every Others line renamed, confirmed style | | | |
| 6 Remembered names | Listed; applied, edited, forgotten in later meetings | | | |
| 7 After the meeting | Edits kept after a panel reload | | | |
| 8 Self word in another language (optional) | Renamed once, remembered | | | Word seen |

## Real Meet snapshots and alignment trace — tasks T068 and T070 (quickstart.md step 13)

Not done yet. About 15 minutes, best in the same call as the US1 checks: the trace needs at least 5 minutes with at least 3 participants (you included) taking turns. The snapshots replace guesses in the synthetic test pages; the trace tunes the alignment rules on real timing. Nothing leaves your machine: both are saved to your Downloads folder and you decide what gets committed.

**Setup**

1. `pnpm build:spike`. In `chrome://extensions` disable the normal live-assist, then Load unpacked → `.output/chrome-mv3-spike` (it asks for "downloads" and "tabs"; both are spike-only). Note its extension ID.
2. Join the Meet call, then reload the Meet tab once so the spike build's content script is on it.
3. Open `chrome-extension://<ID>/spike-recorder.html` in a new tab. In step 1 "Meeting tab", pick the Meet tab. The "Meet helpers" section is right under it.
4. In "Extra names to scrub" type your own name and the name of anyone in the call who has not spoken yet, one per line (names that appear in captions or on tiles are found by themselves).

**Snapshots (T068)** — for each page state below, put the page in that state, type the label into "What the page shows", press "Save Meet snapshot". Each save writes `Downloads/live-assist-meet/<stamp>-<label>.html` and `<stamp>-<label>-names-key-DO-NOT-COMMIT.txt`.

1. `lobby` — on the pre-join screen (open the meeting link again in the same tab before joining).
2. `in-call-captions-off` — in the call, captions off, unmuted.
3. `in-call-captions-on` — captions on (press `c`) after at least two other people have spoken, so the caption band shows two remote names and yours ("You").
4. `in-call-muted` and `in-call-unmuted` — the same with Meet's mic muted, then unmuted.
5. Optional: `greek-ui-captions-on` with your Google account in Greek (note Meet's word for "You").

Review each `.html` as `tests/fixtures/meet/README.md` says (search for every participant's first and last name, your name and email, the meeting title and code, `googleusercontent.com`). Move the clean ones to `tests/fixtures/meet/real/` with a name like `2026-10-in-call-captions-on.html`; delete the key files. Leave `real/expected.json` to the agent (task T069).

**Alignment trace (T070)**

1. With the spike build loaded, start transcription from the live-assist toolbar icon on the Meet tab as usual (the spike build's panel works like the normal one).
2. Let at least 5 minutes of the call run with at least 3 people taking turns, you included; a quick exchange or two is welcome.
3. Press Stop: the trace is saved by itself (since the retest 2026-10-08; "Save alignment trace" in the recorder tab still saves one mid-meeting). It writes `<stamp>-trace.json` (caption turns and line timings, placeholder names, no text) and its names key.
4. Read the transcript in the panel against the key file and note every line whose name is wrong or missing, by the time shown on the line: for example `04:12 should be Participant B`, `07:30 should be me`, `09:02 should be Others` (overlap). Put that list in a file `corrections.json` (`{ "04:12": "Participant B", "07:30": "$user", "09:02": "Others" }`) or just paste it to the agent.
5. Hand the trace and the corrections to the agent (or run `pnpm spike:meet-trace <trace.json> corrections.json <name> --clear-turns` yourself; spikes/README.md). Do not commit the key.

**Record results here**:

| Item | Expected | Observed | Pass/fail | Notes |
|------|----------|----------|-----------|-------|
| Date, Chrome version, Meet UI language | | | | |
| Snapshot: lobby | Saved, no real name/title/code/avatar left after review | | | |
| Snapshot: in call, captions off | As above | | | |
| Snapshot: in call, captions on (2 remote + You) | As above; caption names are placeholders, "You" kept | | | |
| Snapshot: muted / unmuted | As above | | | |
| Snapshot: Greek UI (optional) | As above | | | Meet's word for "You" |
| Trace: length and participants | ≥ 5 min, ≥ 3 people | | | |
| Trace: wrongly named or missing lines | List by time | | | Count / total lines |
| Trace converted (`real-<name>.json`) | SC-001 ≥ 90 %, SC-002 = 0 | | | Printed by `spike:meet-trace` |

**Outcome** (pick one and delete the other):

- PASS — names and fallbacks behave as above; the synthetic snapshots and research R1/R4/R5 stand.
- FAIL — describe what failed. A Meet page that differs from the snapshots is fixed by saving a real snapshot (tasks Phase 7) and updating the locator with it.

Notes:

## Alignment trace on a real call — retest 2026-10-08 (tasks T101, T105)

The spike build now records the alignment trace for every meeting and saves it by itself when the meeting stops, however it stops (Stop, leaving the call, closing the tab). Each line in the trace says why it got its label: `named`, `no-captions` (no caption activity near its words), `low-coverage` (captions cover too little of it) or `no-clear-speaker` (two or more speakers, none dominant), with the caption coverage and each speaker's share. Production builds contain none of this.

**Switch it on** (once per machine):

1. `pnpm build:spike`.
2. `chrome://extensions` → turn off the normal live-assist → Load unpacked → `.output/chrome-mv3-spike` (it asks for "downloads" and "tabs"; both spike-only). It works like the normal build: toolbar icon, side panel, Start, Stop.
3. Reload any Meet tab that was open before, so the spike build's content script is on it.

**Each call**:

1. Start from the toolbar icon on the Meet tab as usual. Nothing else to press.
2. When the meeting stops, two files appear in `Downloads/live-assist-meet/`: `<stamp>-trace.json` (placeholder names, times, reasons, no text) and `<stamp>-trace-names-key-DO-NOT-COMMIT.txt` (placeholder → real name, for your eyes only).
3. While the call is fresh, note lines whose label is wrong or missing by the time on the line (`04:12 should be Participant B`, `07:30 should be me`, `09:02 should be Others`), as in T070 step 4.
4. Hand the trace and the notes to the agent. Never commit or paste the key file.

To go back to the normal build: turn the spike build off and the normal live-assist on in `chrome://extensions`.

**Retest steps** (about 10 minutes; the 2026-10-08 failures):

1. Set-up matters: the phone (or second device) must not hear your laptop's speaker or your voice. In the same room, both devices caption the same voice under two names, and the line is correctly "Others" (two speakers at once). Put the phone in another room, or have a second person join from their own place.
2. Long monologue: one person talks for 2 minutes with natural pauses of 5–10 seconds, nobody else speaking. Expected: Speaker names stays on the whole time and the lines carry that person's name.
3. People panel: open Meet's People panel mid-call, keep talking, close it. Expected: names keep coming and the People panel stays visible.
4. Handovers: take turns of 10–20 seconds each, you included. Expected: each line carries its speaker's name; a line that mixes two speakers is "Others".
5. Leave the call with Meet's red button. Expected within about 5 seconds: Capture shows "Stopped — the call ended", the transcript stays, the trace files appear in Downloads (spike build). Separately: Start in the lobby and wait 20 seconds before joining (no stop), and present your screen for a minute (no stop).

| Item | Expected | Observed | Pass/fail | Notes |
|------|----------|----------|-----------|-------|
| Date, build (spike), Meet UI language, who was in the call | | | | |
| Long monologue with pauses | Names stay on; lines named | | | Trace: count of `named` vs other reasons |
| People panel opened mid-call | Names keep coming; panel visible | | | |
| Handovers | Lines named; mixed lines "Others" | | | Wrong or missing lines by time |
| Leaving the call | Stops within ~5 s; "Stopped — the call ended"; transcript kept | | | |
| Lobby wait, presenting | No stop | | | |
| Trace files saved on stop | Both files in `Downloads/live-assist-meet/` | | | |

Notes:

## Real trace 2026-10-08 — what it showed (tasks T106–T113)

The user's third real call, recorded with the spike build: solo, with a phone joined as a second participant, about 5½ minutes, Meet in English. The anonymised trace is `tests/fixtures/meet/traces/real-2026-10-08-trace.json` (placeholder names, word times only, no text); its timeline fixture is `tests/fixtures/meet/timelines/real-2026-10-08.json`. Analysis in research R6 "Real trace 2026-10-08".

| Item | Expected | Observed | Pass/fail | Notes |
|------|----------|----------|-----------|-------|
| Trace reasons | Each line says why it got its label | Every line read `no-captions`, coverage 0, although 18 lines were named live | Fail → fixed | The recorder never learned the meeting start, so caption times stayed epoch ms. Format-2 traces keep one clock (T106–T107); the old trace converts with `--origin 1791473933400` |
| Lines and speakers | — | 24 lines: 10 the user's, 8 the phone's, 1 more of the user's (03:27), 5 one-word fillers or noise | — | 3 caption turns: the user (twice) and the phone's account |
| Named lines (live build) | SC-001 ≥ 90 % on clear turns, 0 wrong names | 18 of 19 named, 0 wrong names; all 5 fillers "Others" | Pass | The miss: 03:27, a clear 6-word line of the user's, stayed "Others" |
| Named lines (this branch) | — | 19 of 19 named, 0 wrong names; fillers still "Others" | Pass | The user's captions paused for 5.41 s inside that line's turn and split it; the turn-split threshold is now 5.5 s. The one-word filler at 03:21 sits in a 5.77 s pause and stays "Others" (T108–T109) |
| Label arrival | Name shown within a few seconds | Final label known up to 4.7 s after a line ended; by the caption timing, three lines were shown as "Others" first and then renamed | Fixed | Lines now show "…" until they settle (6 s), then the name or "Others" (design decision 37, T110–T112) |
| Caption lag | Within `LEAD_MS` | Fits the synthetic tuning (`LEAD_MS` 2000, `TAIL_MS` −500): with the start applied, the rules reproduce every live label | Pass | Offsets of 500–700 ms either side of the fitted start give the same labels |

Still open from this call: the retest steps above (People panel, leaving the call, lobby, presenting) were not part of it, and the 5.5 s threshold rests on one real trace with a thin margin (≈ 0.1 s below, ≈ 0.27 s above). The next real call (with the spike build, so the trace now carries its own start) should check both and the "…" placeholder in use.

## Sign-off — 2026-10-09 (user, real Google Meet call)

The user ran the combined sign-off checklist for 001, 002 and 006 in a real Meet call and reported: "All this seems to work." Checklist rows, all reported passing:

| # | Check | Result |
|---|---|---|
| 1 | Toolbar icon on the Meet tab → Start → consent reminder → status dots go green | Pass |
| 2 | Someone asks to join → Admit prompt visible and works | Pass |
| 3 | Own lines labelled Alex, others by name; new lines show "…" then the name | Pass |
| 4 | Meet's caption bar hidden on the user's screen; nothing different for others | Pass |
| 5 | Muted in Meet → nothing of the user's appears; Mic dot shows not sent | Pass |
| 6 | Panel closed ~20 s, reopened → no lines missing | Pass |
| 7 | Wi-Fi off ~10 s, on → carries on (optional row) | Pass (reported) |
| 8 | Gear → Settings → Back | Pass |
| 9 | Leave the call without Stop → stops by itself, says the call ended, transcript kept | Pass |

Earlier real-call evidence: capture-gesture check (T012, 2026-10-08), real-DOM inspection via Claude in Chrome (2026-10-08), solo + phone retests and the anonymised real trace `tests/fixtures/meet/traces/real-2026-10-08-trace.json` (2026-10-08).


## Real call 2026-10-09 — an interjection under the main speaker's name (tasks T114–T123)

The user's first real meeting with five or more participants (spike build; anonymised traces `tests/fixtures/meet/traces/real-2026-10-09-{0929,0931,0945}-trace.json`, placeholder names, word times only). One line labelled with a remote participant's name as confirmed held another participant's interjection ("You, you will check that? Yes, yes. Okay."). Analysis in research R6 "Real call 2026-10-09"; fixed by splitting lines at caption speaker changes (FR-027, design decision 43) and a 1.0 s silence threshold (001 FR-011a).

| Item | Expected | Observed (rules on the 0945 trace) | Pass/fail | Notes |
|------|----------|----------|-----------|-------|
| Words named where only another speaker was captioned | 0 | 12 before → 0 after | Fixed | Whole-line rule vs split (T117) |
| Lines | — | 40 → 108; 18 lines split | — | 13 lines were 32.7–35.5 s, ended by the service's ~36 s auto-commit, not silence |
| Named words | — | 1,035 → 1,593 of 1,930 | — | Mixed lines that were "Others" whole now name their clear stretches |

**Next real multi-person call (T123, user)** with the spike build: (1) when someone interjects briefly inside another person's long turn, the interjection is never under the main speaker's name — expect it as an "Others" line between that speaker's lines (an interjection shorter than about 3 s cannot be placed) or, if longer, under the interjector's name; (2) a long single-speaker monologue is not cut into pieces; (3) lines end at shorter pauses than before (1.0 s); (4) with Settings → Clean transcript on (default), fillers ("um", "uh") and false starts are left out and fewer one-word "Others" lines appear. Send the saved trace.

## Fixes after real call 2026-10-09 — captions band collapsed (tasks T124–T127)

In the sign-off call the hidden captions were invisible but still took up a large empty band above Meet's control bar (with the language / "Live captions" row). The band is now collapsed to no height while transcription runs (research R4 "Revised by the real call 2026-10-09"). To check in the next real call with captions on (production or spike build):

| Item | Expected | Observed | Pass/fail | Notes |
|------|----------|----------|-----------|-------|
| Captions band while running (T127) | After Start, no captions, no language / "Live captions" row and no empty strip above the control bar; the video uses the space | Captions hidden, but a large empty area still sat above the control bar; the video did not grow | **Fail** | If a strip is left, note what it shows (empty, the language row, something else) |
| Names while collapsed | Own lines labelled with your name, others by their Meet name, as before | Panel: "Speaker names: Unavailable — No captions seen for a while"; 46 of 47 lines "Others" (user + phone) | **Fail** | Speak and have someone else speak for at least a minute |
| Meet's own notices | Someone asking to join still shows the Admit prompt; hand raises and other notices still show | | | |
| Stop | Captions return as they were before Start (off if they were off); turning them on afterwards shows Meet's normal band | | | |

**Result 2026-10-10 (user, real call):** both rows above failed. With the band collapsed, Meet stopped delivering caption updates the adapter could read, and Meet still reserved the captions space in its own layout, so nothing was gained. The collapse is reverted; hiding is back to opacity only (decision 55 superseded by decision 58). Reclaiming the space needs a live-DOM investigation first.

## Show Meet captions (2026-10-12, design decision 61; tasks T128–T142)

The empty band under the video cannot be given back to the video (two dead ends: the collapse above, and the stage inset test in a live 5-person call on 2026-10-12; research R4), so it is accepted. Settings → `Show Meet captions` (off by default) leaves Meet's captions visible in that band while transcription runs. To check in a real Meet call with at least one other person (production or spike build), starting with Meet's captions off:

| # | Step | Expected | Observed | Pass/fail | Notes |
|---|------|----------|----------|-----------|-------|
| 1 | Default: with `Show Meet captions` unticked, press Start | As before: captions are turned on and invisible, the band under the video is empty, names arrive in the panel | | | |
| 2 | Stop, tick `Show Meet captions` in Settings, press Start | Meet's captions are turned on and visible in the band; Speaker names: On; own lines under your name, others under their Meet names | | | |
| 3 | Still running: untick `Show Meet captions` | Within a second the captions disappear from the Meet page; the band stays; Speaker names stays On; lines keep getting names; transcription does not restart (no gap in the transcript, no consent reminder) | | | Have someone talking across the change |
| 4 | Still running: tick it again | Within a second the captions are back; same as step 3 otherwise | | | |
| 5 | With captions shown, someone asks to join | Admit prompt and Meet's other notices show as usual | | | |
| 6 | Press Stop with captions shown | Meet's captions turn off (they were off before Start); nothing of live-assist is left on the page; turning captions on yourself afterwards shows Meet's normal captions | | | |
| 7 | Turn Meet's captions on yourself, then Start with `Show Meet captions` ticked, then Stop | Captions visible throughout and still on after Stop | | | |
| 8 | With captions shown, reload the Meet tab during the meeting and rejoin | After rejoining, captions are visible again (not hidden) and names resume | | | Optional |
| 9 | With captions shown, turn captions off with Meet's own button, then on again | Speaker names: Unavailable — Captions were turned off; after turning them on, On again and captions visible | | | Optional |
| 10 | Ask another participant | They see nothing different in either mode | | | |

Notes:

Show Meet captions, real check by the user 2026-10-13 (production build of 2026-10-12): steps 3 and 4 pass (ticking and unticking during a running meeting shows and hides the captions; names continue). Steps 1, 2 and 5 to 8 not done.
