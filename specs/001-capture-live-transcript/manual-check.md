# Manual check record: 001 Capture & live transcript

Real-browser checks that automated tests cannot cover (Constitution III). Fill in each section when you run it; later sections (quickstart.md steps 1–9) are added as their tasks land.

## Capture gesture (T012) — de-risks research R5

**Question**: when the side panel is opened by clicking the toolbar icon (`openPanelOnActionClick`), does that click grant `activeTab` so the service worker can capture the tab? And does the captured tab stay audible once its stream is played through the offscreen document?

**Build** (from the repo root, on branch `001-impl-foundation` or later):

```sh
pnpm install
pnpm build
```

**Steps** — about 5 minutes. Since Phase 4 the Capture check section only appears after first-run setup (your name plus an ElevenLabs key, which is checked once with ElevenLabs); otherwise nothing is sent anywhere:

1. Chrome → `chrome://extensions` → turn on Developer mode → Load unpacked → pick `.output/chrome-mv3` in this repo. (If an older copy is loaded, press its reload icon instead.)
2. Pin the live-assist icon to the toolbar (puzzle-piece menu → pin).
3. Open a tab that plays continuous sound you can hear — e.g. a YouTube video, or a Google Meet test call (`meet.google.com` → "Check your audio and video" or a call with a second device). Start the sound.
4. **Test A — action click**: on that tab, click the live-assist toolbar icon. The side panel opens showing "Capture check (temporary)". Press **Capture this tab**.
   - Read the line that appears in the panel's log (it starts with `OK:` or `FAIL at …`). Copy it below.
   - Listen: can you still hear the tab, at the same volume and without delay?
5. Press **Stop**. The log should say the offscreen document closed. Confirm the tab still plays normally.
6. **Test B — panel already open**: switch to a *different* tab that plays sound while the panel stays open, then press **Capture this tab** without clicking the toolbar icon on that tab. Copy the log line. (Expected per research R5: `FAIL … Extension has not been invoked for the current page` — this tells us whether the panel needs the "click the toolbar icon on the meeting tab" message.) Press **Stop** if it succeeded.
7. **Test C — re-click**: on that second tab click the toolbar icon (the panel may close; click again to reopen it if so), then press **Capture this tab**. Copy the log line and note whether audio stays audible. Press **Stop**.
8. Optional: open `chrome://extensions` → live-assist → "Inspect views: service worker" and "offscreen.html" if any error text needs more detail; paste errors below.

**Record results here** (replace the blanks):

| Field | Value |
|-------|-------|
| Date | |
| Chrome version (`chrome://version`) | |
| macOS version | |
| Tab used for Test A (site) | |
| Test A log line | |
| Test A: tab still audible, no volume/delay change? (yes/no + notes) | |
| Test B log line | |
| Test C log line | |
| Test C: audible? | |
| Any errors from the inspect views | |

**Outcome** (pick one and delete the other):

- PASS — the action click grants capture and audio stays audible; research R5 stands.
- FAIL — describe what failed; research R5 must be updated before Phase 5 (T062/T067) builds on it.

Notes:

## Spikes (T047, T048) — user-run, need real audio and your ElevenLabs key

Not manual checks of the extension, but also run by you. Step-by-step instructions: `spikes/README.md` (summary in quickstart.md). Results are written by the scripts to `spike-findings/echo.md` (Spike A) and `spike-findings/language.md` (Spike B); each has a "Your notes" section to fill in before you commit it. Status: not yet run.

## Microphone permission (T054) — de-risks research R5's mic path

**Question**: after the one-time grant on the `mic-permission.html` tab, does the offscreen document get the microphone without a prompt?

**When**: the offscreen document opens the mic only once transcription is wired (tasks Phase 5, T067), so check this during the first real-meeting manual check (quickstart.md steps 2–4, task T068). Until then, step 1 below can be checked on its own. Step 2 is step 3 of the "Live transcript on a real Meet call" section at the end of this file; record it there or here.

1. Fresh install (or remove the extension's microphone permission in `chrome://settings/content/microphone`), complete setup, press "Allow microphone": a tab opens, Chrome prompts, allow it; the tab says "Microphone allowed".
2. Press Start on a meeting tab: no microphone prompt appears anywhere, and the Microphone status row shows "On" (the mic is mixed into the one stream).

| Field | Value |
|-------|-------|
| Date | |
| Chrome version | |
| Step 1: prompt shown on the permission tab, result text | |
| Step 2: offscreen mic opened without a prompt? (yes/no) | |

Notes:

### Run 1 — 2026-10-08, `openPanelOnActionClick: true` — FAIL

Test A on a YouTube tab, twice (the second time after closing the panel and opening it from the live-assist toolbar icon): `FAIL at tabCapture.getMediaStreamId: Extension has not been invoked for the current page (see activeTab permission). Chrome pages cannot be captured.` Conclusion: letting Chrome open the panel on action click does not grant `activeTab`. Research R5 as written does not hold.

### Run 2 — 2026-10-08, service worker handles `action.onClicked` and calls `sidePanel.open` itself (branch `001-capture-gesture-fix`) — PASS

| Field | Value |
|-------|-------|
| Date | 2026-10-08 |
| Test A (YouTube, after icon click) | `OK: tab stream open (), playing at 48000 Hz, state running` |
| Test A: still audible? | Yes |
| Pressing Capture again while capturing | `FAIL at tabCapture.getMediaStreamId: Cannot capture a tab with an active stream.` (expected) |
| Test B (other tab, no icon click) | `FAIL at tabCapture.getMediaStreamId: Extension has not been invoked for the current page …` (expected) |
| Test C (real Google Meet call, after icon click) | `OK: tab stream open (), playing at 24000 Hz, state running`; Stop → `OK: offscreen document closed; capture ended` |
| Test C: audible? | Yes |

**Outcome**: PASS with the revised gesture. Research R5 updated. Note Meet tab audio arrives at 24 kHz (YouTube 48 kHz); the 16 kHz context resampling handles both. The empty `()` in the OK line is the stream label, which Chrome leaves blank for tab streams.

## Live transcript on a real Meet call (T068, plus T054 step 2) — quickstart.md steps 1–5 and 7

**Question**: on a real Google Meet call, does 001 transcribe both sides live from one mixed stream (one ElevenLabs session), label every line "Others", keep the call audible, survive a panel close, keep the transcript on Stop and delete it for real? Also: does the offscreen document get the microphone without a prompt (T054)?

**Updated 2026-10-08 for the single mixed stream (tasks Phase 11, constitution v1.1.0)**: tab and mic are mixed on your computer and sent as one stream, so in 001 **every line is labelled "Others"** (fallback style), your own lines included — your name arrives with 002's captions. The status bar has one "Transcription" row instead of one row per source.

Build from branch `001-single-mixed-stream` or later; the consent reminder, language picker, automatic reconnect and full status bar are all in that build.

**Build** (from the repo root, on branch `001-impl-mvp` or later):

```sh
pnpm install
pnpm build
```

Then `chrome://extensions` → live-assist → press the reload icon (or Load unpacked → `.output/chrome-mv3` if it is not loaded). This uses your real ElevenLabs key, so the call is billed to your account: about the call length (one mixed stream).

**Steps** — about 15 minutes, with a second device or a colleague in the call:

1. Optional, for SC-001: remove the extension and Load unpacked again, then time first-run setup from clicking the toolbar icon to having Start enabled (name, key check, "Allow microphone"). Skip if you would rather keep your current setup.
2. Join a Google Meet call. On the Meet tab, click the live-assist toolbar icon; the side panel opens. Add one key term in Settings (e.g. `Northwind`) so the key-terms path is exercised.
3. Press **Start** (acknowledge the consent reminder). Check: no microphone prompt appears anywhere (T054 step 2); within a few seconds the status bar shows Capture "Capturing the meeting tab", **one** Transcription row "Transcribing (one stream: meeting tab and your microphone)", and Microphone "On — mute state unknown — mic is being sent". Optional: in your ElevenLabs account's usage page, only one realtime session is open for this call.
4. Have the other person speak a few sentences, pause, then speak again. Check: grey italic in-progress text appears with an "Others" label, then is replaced by a finished line `mm:ss Others …`; the "Others" label is dashed and italic (fallback). Roughly time speech → in-progress text (target ≤ 2 s) and end of speech → finished line (target ≤ 5 s).
5. Speak yourself. Check: your lines appear in the same transcript, also labelled "Others" in the dashed, italic fallback style (expected in 001: one mixed stream cannot tell you apart). Talk over the other person once: the overlapping speech comes out of the mix as the service returns it, with no duplicated line.
6. Throughout: can you still hear the call at the same volume and without delay (SC-006)?
7. Close the side panel (its ✕), wait ~20 s while people keep talking, then click the toolbar icon on the Meet tab again. Check: the transcript is complete, including what was said while the panel was closed, and it is still running.
8. On a different tab, click the toolbar icon. Check: that tab's panel shows the same running meeting with **Stop** (one meeting at a time; any panel follows the running meeting). Do not press Stop there; go back to the Meet tab.
9. In the Meet tab's panel press **Stop**. Check: Start is back, the status bar says stopped, the transcript stays.
10. "Not invoked" message: with the panel still open, reload the Meet tab (⌘R) and rejoin, then press **Start** without clicking the toolbar icon. Expected: a message telling you to click the live-assist icon in the Chrome toolbar on the meeting tab, then press Start again. Do that; Start should now work. Press **Stop**.
11. Press **Delete transcript** → **Delete permanently**. Check: the previous meeting (from step 10, or step 2 if you skipped it) is shown, or "No transcript yet". Close and reopen the panel: the deleted transcript does not come back.
12. Tab closed (FR-023): press Start, speak a line, then close the Meet tab. Open the panel on any tab (toolbar icon). Check: Start is available (the meeting ended) and that meeting's lines are shown.
13. If anything fails: `chrome://extensions` → live-assist → "Inspect views: service worker" (and `offscreen.html` while a meeting runs) → Console; paste errors below. Never paste your key.

**Record results here** (replace the blanks):

| Field | Value |
|-------|-------|
| Date | |
| Chrome version (`chrome://version`) | |
| macOS version | |
| Step 1: setup time (SC-001), or skipped | |
| Step 3: no mic prompt; one Transcription row, mic On? (T054 step 2) | |
| Step 4: "Others" lines appear, in-progress then finished, fallback style? | |
| Step 4: speech → in-progress (s), pause → finished line (s) (SC-002) | |
| Step 5: your lines transcribed too, labelled "Others" (fallback)? (SC-005) | |
| Step 6: call audio unchanged? (SC-006) | |
| Step 7: complete after closing and reopening the panel? | |
| Step 8: panel on another tab shows the running meeting? | |
| Step 9: Stop keeps the transcript? | |
| Step 10: not-invoked message shown; works after clicking the icon? | |
| Step 11: delete is permanent; previous meeting shown? | |
| Step 12: closing the Meet tab ends the meeting, lines kept? | |
| Key term set in step 2 caused no "invalid_request" failure? (research R2: keyterms as repeated query keys, unverified) | |
| Errors from the inspect views | |

**Outcome** (pick one and delete the other):

- PASS — all steps behave as described; T068 and T054 can be ticked.
- FAIL — say which step and what happened.

Notes:

## Reconnect on a real call (T078) — quickstart.md step 6 and optional step 8

**Question**: when the network drops briefly, or ElevenLabs ends a session at its time limit, does transcription come back by itself into the same meeting, with nothing lost or repeated, and does the status bar say what is happening?

**Build** (branch `001-single-mixed-stream` or later): `pnpm build`, then reload live-assist in `chrome://extensions`. Uses your real key (billed, about the call length — one mixed stream).

**Steps** — about 10 minutes, plus an optional long run:

1. Join a Google Meet call with a second device or a colleague. Click the live-assist icon on the Meet tab, press **Start**. Check the status bar: Capture "Capturing the meeting tab", one Transcription row "Transcribing (one stream: meeting tab and your microphone)", Speaker names "Not available here — every line is labelled Others …", Microphone "On — mute state unknown — mic is being sent", Retention text with a "What ElevenLabs keeps" link.
2. Have the other person talk continuously (reading a text works). Turn Wi-Fi off for about 10 s, then on again. Check: the Transcription row shows "Reconnecting… — Connection to ElevenLabs lost — reconnecting" while it is off, then "Transcribing … (reconnected N times)" within ~10 s of Wi-Fi coming back (SC-003). Note: the call itself also drops while Wi-Fi is off, so speech during the gap may simply not exist; what matters is that lines before and after the gap are all there and none appears twice.
3. Read the transcript around the gap. Check: no finished line is duplicated, and the line that was in progress when Wi-Fi went off appears once.
4. Optional, for the session limit (quickstart step 8): leave the call running at least an hour with some speech. Check afterwards: the Transcription row shows at least one reconnect, the transcript has no gap or duplicate around it. Note roughly when the first reconnect happened (that is the observed session limit; research R2 has it unverified).
5. Press **Stop**. Check: Start is back, transcript stays.
6. If anything fails: `chrome://extensions` → live-assist → "Inspect views: offscreen.html" → Console; paste errors below. Never paste your key.

**Record results here** (replace the blanks):

| Field | Value |
|-------|-------|
| Date | |
| Chrome version | |
| Step 1: status bar rows as described (one Transcription row)? | |
| Step 2: reconnecting shown, then transcribing again; seconds until back | |
| Step 3: no duplicated or missing finished lines around the gap? | |
| Step 4 (optional): observed session limit (minutes), reconnect seamless? | |
| Errors from the inspect views | |

**Outcome** (pick one and delete the other):

- PASS — T078 can be ticked.
- FAIL — say which step and what happened.

Notes:

## Language picker and consent reminder (Phases 7–8) — quick check, any tab

Not a separate task: fold it into T068 or T078 if convenient. About 3 minutes.

1. With the consent reminder on (Settings, default), press **Start**. Check: a reminder asks you to tell everyone the meeting is transcribed; **Cancel** closes it and the status bar still says "Not capturing". Press Start again and **I've told them — start**: transcription begins.
2. Stop. Pick **Greek** in the Language list, Start, acknowledge. Check: the list is disabled and shows Greek while it runs; Greek speech is transcribed (English speech will come out poorly — expected with a fixed language). Stop: the list is back on **Automatic (detect)**.
3. Turn the reminder off in Settings, press Start: it starts without the reminder. Stop, and turn the reminder back on if you want it.

| Field | Value |
|-------|-------|
| Date | |
| Step 1: reminder shown; Cancel captures nothing; acknowledge starts? | |
| Step 2: fixed language applied and shown; back to Automatic after Stop? | |
| Step 3: no reminder when turned off? | |

Notes:

## 001 sign-off (T093) — what is still open

001 is "done" (ROADMAP) when every section below is recorded as PASS. The automated part of quickstart.md (lint, typecheck, Vitest, both builds, Playwright including the accessibility checks) is green in CI; everything here needs a real Meet call and your key.

| Section in this file | Covers | Status |
|----------------------|--------|--------|
| Capture gesture (T012) | R5 capture gesture | PASS (Run 2, 2026-10-08) |
| Microphone permission (T054) | offscreen mic without a prompt | open — step 2 is step 3 of the T068 section |
| Live transcript on a real Meet call (T068, plus T054 step 2) | quickstart steps 1–5 and 7; SC-001, SC-002, SC-005 (all lines "Others", one session), SC-006 | open — expectations updated 2026-10-08 for the single mixed stream |
| Reconnect on a real call (T078) | quickstart step 6 and optional step 8; SC-003 | open |
| Language picker and consent reminder (Phases 7–8) | US4, US5 | open |
| Spikes (T047, T048) | echo, mixed language | deferred (design decisions 26–27) |

Optional, about 2 minutes, any tab (T092 was checked with axe in e2e; this is the real-Chrome feel): with the panel open, press Tab from the top — focus goes Language, Start, then on through the panel; press Start with Enter, Escape closes the consent reminder and focus is back on Start. With macOS VoiceOver on (⌘F5), a finished line is read out as it arrives.

| Field | Value |
|-------|-------|
| Date | |
| Keyboard order and Escape as described? | |
| VoiceOver reads new lines? (optional) | |

Notes:

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


## Key terms as a list (T123, FR-004a) — about 3 minutes, then your next real call

1. Copy a column of about 50 names and product names from wherever you keep them (a sheet column, a text file with one per line, or one line separated by commas).
2. Gear → Settings → **Key terms**. Click in **New key terms, separated by commas or one per line** and paste. Check: the names show in the field separated by commas, none run together.
3. Press **Add terms**. Check: every name is in the list as its own row, in the order pasted, after any terms that were already there; the field is empty. With more than 50 in the list, or a name longer than 20 characters, those are listed underneath as not sent, and still in the list.
4. Edit one term and remove another. Check: both changes stick after Back and reopening Settings, and typing in the screen does not lag.
5. Back, **Start** on a call and say (or have someone say) a few of the names. Check: they are spelled as in your list, and Start did not fail.

| Field | Value |
|-------|-------|
| Date | |
| Step 2: pasted names separated by commas in the field? | |
| Step 3: all names listed, in order; over-limit ones listed as not sent? | |
| Step 4: edit and remove still work; no lag with 50 terms? | |
| Step 5: Start works with 50 terms; names recognised? | |

Notes:

Key terms as a list (FR-004a), real check by the user 2026-10-13: pass (three pasted lines land comma-separated; `Add terms` adds all three).
