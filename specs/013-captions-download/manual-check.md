# Manual check record: 013 Captions download

Real-browser checks that automated tests cannot cover (constitution III; SC-007, SC-010). Not yet run: the steps below are for the user, in a real Google Meet call. Nothing said in the call is copied into this file: record pass or fail and a short note in your own words, never a caption or a transcript line.

Automated coverage already in place: `tests/e2e/captions-capture.spec.ts` (captions kept on a saved Meet page, an interruption, deletion, the same reminder on a Meet call and on any other tab, and captions kept on a Meet call with the reminder on and off), `tests/e2e/captions-download.spec.ts` (the zip unpacked with `unzip` and compared byte for byte from the main view and the Transcripts screen, a running meeting, a meeting with only one of the two files, a database from before this build, no caption text in any request, a 3-hour meeting within two seconds, axe), `tests/unit/platforms/meet/captions-off-on.test.ts` (captions off and on, `Show Meet captions`), `tests/unit/core/export/zip.test.ts` (the zip against an archive made by Python), `tests/integration/privacy/captions-leak.test.ts` and `tests/unit/core/chat/context-captions.test.ts` (caption text reaches no provider and not Ask), `tests/unit/manifest/permissions.test.ts` (no new permission).

**Build** (from the repo root, on `main` after 013 is merged):

```sh
pnpm install --frozen-lockfile
pnpm build
```

Reload the unpacked extension in `chrome://extensions`, reload the Meet tab, click the toolbar icon on the Meet tab. Chrome should not ask to accept any new permission.

**Before the call**: Settings → `Show Meet captions` on, so Meet's own captions can be compared with the file afterwards. At least three people in the call, at least 30 minutes (SC-007); a phone as an extra participant is fine. Steps 9, 14 and 15 need more than that and can be left for another day.

## Steps

1. With the reminder on, press Start on the Meet tab. Expect: the reminder appears at once and reads `Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs and the transcript is kept on this computer. You can turn this reminder off in Settings.` It has no sentence about Meet's captions (decision 79). Cancel.
2. Open a tab that is not Meet (any page with sound), click the toolbar icon there, press Start. Expect: the same reminder, word for word. Cancel.
3. Back on the Meet tab, with captions already on and a few turns showing, press Start and acknowledge; let people talk for a minute; press `Download transcript`. Expect: one file, `Meeting — DD-MM-YYYY at HHhMM.zip`. Double-click it (Archive Utility): a folder with `Meeting — … — Transcript.txt` and `Meeting — … — Meet captions.txt`, both names with the long dash intact, both opening as text. No turn from before Start is in the captions file.
4. Read the captions file. Expect: lines `[mm:ss] Name: text` with a blank line between them and nothing above the first. Your own turns under your name, not `You`. A person you renamed (now, or remembered from an earlier call) under the name the transcript shows.
5. Download again a minute later. Expect: the turn that was being spoken at step 3 now has its later text; the turns since are there; transcription never paused; the panel shows nothing new.
6. Ask a question about the meeting. Expect: the answer cites the transcript as before. (That no caption text is sent is proved by the automated suite; there is nothing to see here.)
7. After 30 minutes with three or more speakers: download, and compare the captions file with what Meet's captions showed (scroll Meet's captions). Expect: at least 95% of the turns Meet showed after Start are in the file, each with Meet's last text; no turn appears twice (O4).
8. One person talks without a break for 5 minutes; download. Expect: that turn is one line and begins with their first words, not with words from minutes later (O3). Note whether Meet's own captions still showed the beginning.
9. Keep the call going past 60 minutes; download. Expect: the first turns after Start are still in the file (O1). If one person was the only one captioned for more than an hour, their line goes on past the hour mark and ends with what they said last. Note whether Meet's own captions still show the first turns when scrolled to the top.
10. Reload the Meet tab mid-call and rejoin; wait for `Speaker names: On`; let people talk; download. Expect: turns from before the reload are there once each, with their old times; turns after the reload are there; the times show a gap for the reload (O2). Note what Meet's captions showed right after the reload: nothing, or earlier turns again.
11. Turn Meet's captions off with Meet's own button, wait a minute while people talk, turn them on again; let people talk; download. Expect: the panel says `Captions were turned off`, then recovers, as before this build. The file has a gap for that minute and nothing else about it; no turn from before the gap appears twice, and none from before Start appears (O7). Note what Meet's captions showed when they came back: an empty band, or the earlier turns again. Then switch Settings → `Show Meet captions` off and on while someone talks, and download. Expect: that person's turn is one line, and no line is doubled.
12. Press Stop; `Download transcript`; then `Delete transcript`. Expect: the zip again, the last turn with its last words (at most a few seconds short). The confirmation reads `Delete this transcript permanently? Meet's captions of this meeting are deleted too. It cannot be recovered.` After confirming, the Transcripts screen opens without that meeting and the main view is clean.
13. On the Transcripts screen, pick a meeting from before this build: Download, then look at its Delete confirmation and cancel. Expect: one `.txt` named `Meeting — … — Transcript.txt`; the confirmation does not mention captions. Then start and stop a short Meet call with captions, and look at its Delete confirmation there. Expect: `Delete the transcript of {date}, {time} permanently? Its questions, answers, notes and Meet's captions are deleted too. It cannot be recovered.`
14. Optional, if a Windows machine is at hand: copy a zip there and open it in Explorer. Expect: both names show the long dash (O5).
15. Optional, with Meet's interface in Greek: one short call. Expect: your own turns under your name in the captions file, or under Meet's Greek word for "You" until you rename it once (O6).

## Results

| Step | Result (pass / fail / note) |
|------|-----------------------------|
| 1 | |
| 2 | |
| 3 | |
| 4 | |
| 5 | |
| 6 | |
| 7 | |
| 8 | |
| 9 | |
| 10 | |
| 11 | |
| 12 | |
| 13 | |
| 14 | |
| 15 | |

## Record

- Date, call length, number of participants:
- SC-007 (step 7), turns Meet showed / turns in the file:
- O1 (step 9), does Meet remove old turns from its page in a long call:
- O2 (step 10), what a reload does to Meet's caption history:
- O3 (step 8), does Meet drop the beginning of a long turn, and does the file still have it:
- O4 (step 7), any turn twice in an ordinary call:
- O5 (step 14), the zip's names in Windows Explorer:
- O6 (step 15), Meet's Greek word for the user:
- O7 (step 11), what Meet shows when captions come back on, and any line twice:
- Anything that did not match:

Real check by the user 2026-10-13 (walkthrough `live-assist-test-run-2026-10-12.html`, production build of 2026-10-12): step 2 pass (non-Meet reminder unchanged), steps 3 and 4 pass (zip with both files, names and line shape), step 12 pass (zip after Stop; main-view confirmation names Meet's captions), step 13 pass for an older meeting (plain `… — Transcript.txt`, confirmation without captions). Not marked by the user: step 1 (the Meet reminder sentence on the production build) — the zip in step 3 shows captions were kept in that call, so whether the sentence was shown still has to be confirmed. Not done: steps 5 to 11 (second download, 30 and 60 minutes, monologue, reload, captions off/on), 14, 15.

Step 1, real check by the user 2026-10-13 (production build): pass. On the Meet call tab, with the toolbar icon clicked, the reminder includes `Meet's captions of the meeting are kept on this computer too.` and the panel's `chrome.tabs.query` returns the call's address. Earlier the same day the user saw the unchanged reminder on a panel whose tab was not identified; most likely a tab the extension had no access to (no toolbar click since a reload), in which case nothing is kept either. Not verified: that the panel and the background can never disagree; they decide separately.

Amended 2026-10-13 (decision 79, superseding decision 71): steps 1 and 2 now expect one reminder text on every tab. The two records above are of the 2026-10-12 build, whose reminder on a Meet call had the sentence about Meet's captions; steps 1 and 2 have not been run on a build with this change. The question left open above, whether the panel and the background could disagree about the tab, no longer arises: the panel does not ask about the tab. The rule that captions must not be kept by a build whose reminder does not say so is withdrawn by the same decision.
