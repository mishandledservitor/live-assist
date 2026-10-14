# Manual check record: 006 Side-panel redesign

Real-browser checks that automated tests cannot cover (constitution III). Not yet run: the steps below are for the user, in a real Google Meet call. Automated coverage already in place: `tests/e2e/panel-layout.spec.ts` (transcript share of height, one-line status, Settings round trip, built-output copy scan), `tests/e2e/account.spec.ts` (badge), `tests/e2e/a11y.spec.ts` (axe in light and dark), `tests/unit/copy/` (copy scanner and Keep strings).

**Build** (from the repo root, on branch `006-impl` or later):

```sh
pnpm install
pnpm build
```

Load `.output/chrome-mv3` unpacked in `chrome://extensions` (or press reload on the loaded copy). Join a real Meet call with captions available.

## Steps

1. Open the side panel from the toolbar icon on the Meet tab and drag it to its narrowest width (320 px). Expect: one header line (Start, language, badge, gear); one status line (it may wrap to two lines below about 360 px); the transcript below filling the panel; no visible "live-assist" heading; no settings, retention or account text on the main view.
2. Press Start, acknowledge the consent reminder, talk for a minute. Expect: four dots on one line, all calm; hovering a dot shows "{label}: {state}", e.g. "Speaker names: On", "Microphone: Live".
3. Mute in Meet, then unmute. Expect: "Microphone: Muted in Meet — not sent" in the microphone dot's tooltip, line not expanded; back to "Microphone: Live".
4. Turn Meet captions off. Expect: the status line expands with `Speaker names` `Unavailable — Captions were turned off`; if names recover, it collapses again.
5. Open the gear during the meeting, change nothing, wait 30 s, press Back (then try Escape from the Settings heading). Expect: every line spoken meanwhile is in the transcript; focus returns to the gear.
6. Activate the credits badge. Expect: Settings opens at "ElevenLabs account" with the plan line, exact credits and caveat, no "Details" disclosure; the badge's tooltip is the full account line.
7. Switch macOS to Dark appearance and repeat steps 1 and 6. Expect: all text, dots and the badge readable; an error dot is visibly square, not round.
8. Stop the meeting. Expect: `Delete transcript` appears after the last line; the badge refreshes.
9. Reviewer re-check of the copy (copy-review "Checking the result") on the built extension: compare what is on screen with the Rewrite and Keep lists in `copy-review.md`, and confirm no string outside those lists changed. The automated scans already confirm every deleted fragment is absent from `.output/chrome-mv3-e2e/`.
10. (Added 2026-10-12, FR-023.) In a call of 30 minutes or more, with a few questions asked, look at the panel's right edge and follow a citation. Expect: two scrollbars at most (transcript, answers), none on the panel itself; Stop and the language picker stay in view the whole time.

## Results

Not run yet. Fill in after the call.

| Step | Result (pass / fail / note) |
|------|-----------------------------|
| 1 Narrow panel layout | |
| 2 Healthy status, tooltips | |
| 3 Mute in Meet | |
| 4 Captions off expands the line | |
| 5 Settings round trip during a meeting | |
| 6 Badge opens the account section | |
| 7 Dark appearance | |
| 8 Stop: Delete after the last line, badge refresh | |
| 9 Copy re-check on the built extension | |
| 10 No page scrollbar in a long call (2026-10-12) | |

- [ ] Signed off by the user (date):

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

Step 10, real check by the user 2026-10-13: pass (citation jumps to the line; no scrollbar on the panel itself; Stop stays in view).
