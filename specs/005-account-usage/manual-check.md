# Manual check record: 005 Account & usage in panel

Real-account checks that automated tests cannot cover (Constitution III). The automated suite uses recorded ElevenLabs answers; only your real account shows whether the line matches what ElevenLabs reports, and how much a meeting actually costs in credits. This record is task T025.

## Build

From the repo root, on branch `005-account-usage`:

```sh
pnpm install
pnpm build
```

Chrome → `chrome://extensions` → reload live-assist (or Load unpacked → `.output/chrome-mv3`). Your ElevenLabs key must already be saved in live-assist. Keep elevenlabs.io → your subscription / usage page open in another tab to compare.

## Steps

About 15 minutes plus one meeting of known length.

1. **The line** — Open the side panel. Near the top, one line shows your plan, the share of credits left and the renewal, e.g. "Creator plan · 84% of credits left · renews in 12 days (Oct 20)". Compare with the ElevenLabs subscription page: plan name, credits used / limit and renewal date match. You can tell plan, roughly what is left and the renewal within about 3 seconds (SC-001), and the line fits on one line at the panel's default width (SC-002).
2. **Detail** — Expand "Details": the exact credits used, the limit and what is left, with thousands separators, plus a sentence saying the credits are shared by everything you use ElevenLabs for and that no minutes estimate is shown.
3. **Refresh** — Press the ↻ button: it greys out briefly and the line stays visible while it refreshes. Leave the panel open for 10 minutes without touching it: no further requests (optional: watch the service worker's Network tab via `chrome://extensions` → live-assist → "service worker").
4. **After a meeting** — Note "credits used" from Details. Run a meeting (or play a video in a tab) for a timed 10 minutes with live-assist transcribing, then press Stop. The line refreshes by itself. Note "credits used" again.
5. **Rate (research R2 open question)** — From step 4: credits used during the meeting ÷ minutes transcribed = credits per minute of realtime transcription. If the difference is 0, realtime transcription through the API is not drawn from these credits (billed in dollars instead, as the API pricing page says) and the line should keep showing the percentage only. If it is a steady figure, tell Claude the number: `REALTIME_STT_CREDITS_PER_MINUTE` gets that value with this measurement as its source, and the line gains "≈ N min of transcription". Check your ElevenLabs usage page for the same period too, in case other usage happened at the same time.
6. **Key without 'User: Read'** — On elevenlabs.io create a second key restricted to Speech to Text only (User: Read off). Save it in live-assist Settings (it passes the key check, which only needs speech to text), then press ↻: the line reads "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io", and Start still works. Put your normal key back afterwards and delete the test key on elevenlabs.io.
7. **Offline** — Turn off Wi-Fi and press ↻: "Could not reach ElevenLabs to check your plan." Start is still enabled. Turn Wi-Fi back on.

## Results

| Step | Date | Result (pass / fail + notes) |
|------|------|------------------------------|
| 1. The line matches ElevenLabs; readable, one line | | |
| 2. Detail | | |
| 3. Refresh; no polling | | |
| 4. Refresh after Stop | | |
| 5. Credits per minute measured (value) | | |
| 6. Key without 'User: Read' | | |
| 7. Offline | | |
