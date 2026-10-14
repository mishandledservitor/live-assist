# Quickstart & validation: Capture & Live Transcript

How to prove 001 works. Automated checks need no network, mic or key (Constitution III); the manual checks and spikes need the user's real setup and are recorded in this folder.

## Prerequisites

- Node LTS (see `.nvmrc`) and pnpm (`corepack enable`).
- Google Chrome ≥ 116 (stable).
- For manual checks and spikes only: an ElevenLabs API key with speech-to-text access, and "Improve the models for everyone" turned off in the ElevenLabs account (design decision 19).

## Automated

```sh
pnpm install
pnpm lint && pnpm typecheck
pnpm test            # Vitest unit + integration (fixtures only)
pnpm build           # production extension in .output/chrome-mv3
pnpm test:e2e        # Playwright: builds in e2e mode, loads the extension in Chromium
```

Expected: all green; CI runs the same steps on every PR.

## Manual check (required before 001 is "done", Constitution III)

1. `pnpm build`, then `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`.
2. Click the live-assist toolbar icon on any tab: the side panel opens on first-run setup. Enter your name and key; confirm the key check passes and the key shows masked; read the retention notice; grant the microphone in the tab that opens.
3. Join a Google Meet test call (a second device or a colleague). Click the toolbar icon on the Meet tab, choose language (leave Automatic), press Start, acknowledge the consent reminder.
4. Verify: you still hear the call; remote speech and yours both appear as "Others" (fallback style; revised 2026-10-08 — one mixed stream, your name arrives with 002's captions), in-progress text first, then finished lines with `mm:ss`; status shows capture active, one transcription stream active, speaker names unavailable with reason, mic active, retention text. Note roughly how long in-progress text and finished lines take to appear (SC-002) and how long setup took (SC-001).
5. Close and reopen the side panel: transcript continues and is complete.
6. Turn Wi-Fi off for ~10 s, then on: transcription shows reconnecting then active; no lines duplicated; speech during the gap appears once.
7. Press Stop: status stopped; transcript stays. Delete it: the previous meeting (if any) is shown; deleted data is gone after reopening the panel.
8. Optional long run: leave a call running ≥ 1 hour to observe a `session_time_limit_exceeded` reconnect (record the observed limit in `manual-check.md`).
9. Record date, Chrome version, OS, pass/fail per step and notes in `specs/001-capture-live-transcript/manual-check.md`.

Early check (do first, before building the panel UI): confirm that clicking the toolbar icon (which opens the side panel) grants tab capture for that tab, and that the stream reaches the offscreen document and stays audible. Record in `manual-check.md` under "Capture gesture".

## Spike A — echo without headphones

1. `pnpm build:spike` and load `.output/chrome-mv3-spike` unpacked (includes the dev-only recorder page; production builds never do).
2. In a Meet call where the other person reads a few minutes of text, click the live-assist toolbar icon on the Meet tab once, then open `chrome-extension://<extension ID>/spike-recorder.html` (ID from `chrome://extensions`), pick the Meet tab, press "Check microphone" and follow the on-screen run list: (1) headphones + echo cancellation on, (2) laptop speakers + on, (3) speakers + off, (4) speakers + `"all"` if offered. Each run saves `tab.wav`, `mic.wav` and `run.json` into `~/Downloads/live-assist-echo/run-N-…/`.
3. Move the run folders to `spikes/data/echo/` (gitignored): `mv ~/Downloads/live-assist-echo/run-* spikes/data/echo/`.
4. `export ELEVENLABS_API_KEY=…` in your shell (do not put it in a file), then `pnpm spike:echo spikes/data/echo`.
5. The script prints a table and writes `specs/001-capture-live-transcript/spike-findings/echo.md` with duplication rate per run and the recommendation (decision rule in research R7). Review it, add your notes, commit it.

## Spike B — mixed Greek/English

1. Put clips (`name.wav` or `name.mp3`) and reference transcripts (`name.txt`, what was really said) in `spikes/data/language/` (gitignored). 5–10 clips of 30–120 s with real code-switching is enough.
2. `export ELEVENLABS_API_KEY=…`, then `pnpm spike:language spikes/data/language`.
3. The script streams each clip in real time through four configurations (auto; Greek; English; Greek + English secondary) and writes `spike-findings/language.md` with WER/CER per config and the recommendation (research R8). Review, add notes, commit — no raw transcripts of real meetings unless you choose to include short excerpts.

## What "done" means for 001

All automated checks green in CI and the manual check recorded with all steps passing. The spike runs and the headphones notice (FR-028) are deferred out of v1 (design decisions 26–27, 2026-10-08); the spike harnesses below stay available.
