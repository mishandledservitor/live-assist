# Spikes: echo and mixed Greek/English (feature 001, user story 6)

Two checks you run with your own audio. Each writes a findings file into `specs/001-capture-live-transcript/spike-findings/` that decides something in 001: Spike A decides whether the "headphones recommended" notice ships (FR-028, research R7); Spike B decides whether automatic language detection stays the default (FR-014, research R8).

## Privacy

- Your recordings, reference transcripts and the raw results (which contain recognised text) stay in `spikes/data/`, which is gitignored. Never move them anywhere else in the repo.
- The findings files contain only metrics, clip/run names and your notes. Name clips neutrally (e.g. `standup-1.wav`), because clip names appear in the findings.
- Your ElevenLabs key lives only in your shell: `export ELEVENLABS_API_KEY=…`. Never put it in a file (no `.env`). The scripts send it to `api.elevenlabs.io` as a request header and never print it.
- Before running, turn off "Improve the models for everyone" in your ElevenLabs account (design decision 19).
- Both spikes stream audio in real time, so they take as long as the audio and use realtime transcription minutes on your account: Spike A uses two sessions per run (tab + mic), Spike B four sessions per clip.

## Setup (once)

```sh
corepack enable
pnpm install
export ELEVENLABS_API_KEY=…   # in the shell you run the spikes from
```

`ffmpeg` is optional: WAV clips (PCM16 or Float32, any sample rate, mono or stereo) are read directly; MP3/M4A/other formats need `brew install ffmpeg`.

## Spike A: echo without headphones

What it answers: when the call plays from the laptop speakers, does the mic stream transcribe the remote speakers a second time under your name, even with Chrome's echo cancellation on?

1. Build the dev-only spike variant and load it: `pnpm build:spike`, then `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3-spike`. (Unload or disable the normal build first so only one live-assist is active. The spike build additionally asks for the "downloads" permission, used only to save recordings, snapshots and traces, and "tabs", used only to list tabs by title in the recorder page.)
2. Find the extension ID on its card in `chrome://extensions` and open `chrome-extension://<ID>/spike-recorder.html` in a new tab.
3. Join a Google Meet call with a second person (or a second device) who will read text aloud for a few minutes. Click the live-assist toolbar icon on the Meet tab once (this lets Chrome capture that tab; the side panel opening is expected).
4. In the recorder tab: pick the Meet tab in "Meeting tab", press "Check microphone" (allow the mic prompt), then do the runs in order. For each run follow its on-screen instruction, press Record, let the other person read for about 2 minutes while you also say a few sentences, then press "Stop and save".
   - Run 1: headphones, echo cancellation on.
   - Run 2: laptop speakers at normal volume, echo cancellation on. This is the run the decision is based on.
   - Run 3: speakers, echo cancellation off.
   - Run 4: speakers, echo cancellation "all" — only shown if your Chrome supports it.
   - If a run says Chrome has not granted capture, click the toolbar icon on the Meet tab again and retry.
5. Each run is saved as `~/Downloads/live-assist-echo/run-N-…/` with `tab.wav`, `mic.wav` and `run.json`. Move the run folders into the repo: `mkdir -p spikes/data/echo && mv ~/Downloads/live-assist-echo/run-* spikes/data/echo/`.
6. Run `pnpm spike:echo spikes/data/echo` (default folder if omitted). It prints per-run duplication and writes `specs/001-capture-live-transcript/spike-findings/echo.md`; raw results go to `spikes/data/echo/results/`.
7. Open `echo.md`, check the recommendation against the raw results, fill in "Your notes", and commit only `echo.md`.

Rule (research R7): a mic line is an echo duplicate when it is within ±1.5 s of a tab line and at least 60 % of its words occur in that tab line. If run 2 duplicates more than 5 % of remote lines, the headphones notice ships (tasks T087–T088).

## Spike B: mixed Greek/English

What it answers: which language configuration recognises your mixed Greek/English speech best — automatic detection, Greek, English, or Greek with English as a secondary language?

1. Put 5–10 clips of 30–120 s with real code-switching in `spikes/data/language/`, each with a reference transcript of exactly what was said: `standup-1.wav` + `standup-1.txt` (UTF-8). Clips can be WAV or, with ffmpeg, MP3/M4A/etc. Files without a partner are skipped with a warning.
2. Run `pnpm spike:language spikes/data/language` (default folder if omitted). Each clip is streamed in real time through the four configurations in parallel; per-clip WER/CER is printed as it goes.
3. It writes `specs/001-capture-live-transcript/spike-findings/language.md` (mean WER/CER per configuration, per-clip rows, recommendation) and raw results with the recognised text to `spikes/data/language/results/`.
4. Review `language.md`, fill in "Your notes", and commit only `language.md`.

Rule (research R8): the configuration with the lowest mean CER is recommended. If Greek + English secondary wins clearly (at least 10 % relative), that is raised with you as a spec change (task T083) rather than built.

## Meet snapshots and alignment trace (feature 002)

The spike recorder page also has "Meet helpers": "Save Meet snapshot" saves an anonymised copy of the chosen Meet tab, and "Save alignment trace" saves the running meeting's caption turns and line timings (placeholder names, no text of any kind). Both go to `Downloads/live-assist-meet/`, each with a `…names-key-DO-NOT-COMMIT.txt` that tells you who `Participant A`, `Participant B`… are. Never commit the key. The step-by-step instructions and the result tables are in `specs/002-meet-speaker-names/manual-check.md` ("Real Meet snapshots and alignment trace").

To turn a trace into a timeline fixture for the alignment rules (no key, no network):

```sh
pnpm spike:meet-trace ~/Downloads/live-assist-meet/<stamp>-trace.json corrections.json <name> [--clear-turns]
```

`corrections.json` lists only the lines that were named wrongly: `{ "04:12": "Participant B", "07:30": "$user", "seg-41": "Others" }`. A key is the line's start time as the panel shows it, or a segment id when two lines start in the same second; a value is a placeholder from the trace, `$user` (you) or `Others`. Pass `--clear-turns` when people took clear turns (the trace then counts towards SC-001's 90 %). The command writes `tests/fixtures/meet/timelines/real-<name>.json` and prints SC-001 and SC-002 for it. Traces saved before 2026-10-09 (format 1) have no meeting start and their caption times are epoch ms: pass `--origin <epoch ms of the meeting start>` (for `real-2026-10-08-trace.json`, `1791473933400`, research R6). Format-2 traces carry the start and refuse `--origin`.

## Answer quality: `pnpm eval:ask` (feature 003)

What it answers: do live answers cite the right lines (SC-002), say "not in the transcript" instead of guessing (SC-003), come back in the language of the question (SC-005), and never give a name to an "Others" line?

1. Put the chat key in the shell you run from, never in a file: `export OPENAI_API_KEY=…` or `export ANTHROPIC_API_KEY=…`. The key goes only to that provider as a request header and is never printed.
2. Run `pnpm eval:ask --provider openai --model gpt-6-luna` or `pnpm eval:ask --provider anthropic --model claude-sonnet-5-5` (without flags: OpenAI, GPT-6 Luna). It asks every question in `tests/fixtures/chat/eval/*.json` over its synthetic meeting with the app's own context, prompt and adapter: about 20 short requests per run. Add `--set notes-agenda` to run only the meeting-notes set (feature 008: notes statements marked as from the notes, by the `From your notes:` label or by a sentence that names the notes as its source (design decision 77), and uncited; "was it said?" answered from the transcript; no "Others" line named from the notes); its table goes into `specs/008-meeting-context/manual-check.md`.
3. It prints a table of the measures against their targets and writes the raw answers to `spikes/data/ask-eval/` (gitignored). Read the answers that missed, then copy the table into `specs/003-ask-the-transcript/manual-check.md`.

The OpenAI adapter arrives with 003 Phase 5; until then an OpenAI run reports every question as `unavailable`.

## Code

- `spikes/lib/scoring.ts` — normalisation, WER/CER, echo duplicate rule.
- `spikes/lib/wav.ts` (pure) and `spikes/lib/audio-file.ts` (Node file/ffmpeg loading).
- `spikes/lib/stream.ts` — Node realtime streamer reusing the extension's URL builder and wire codec.
- `spikes/lib/echo-runs.ts`, `spikes/lib/echo.ts`, `spikes/lib/language.ts` — run conditions, decisions, findings rendering.
- `spikes/lib/meet-trace.ts` — alignment trace → timeline fixture, with corrections and SC-001/SC-002 scoring (002 T079).
- `spikes/ask-eval.ts`, `spikes/lib/ask-eval.ts` — 003 answer evaluation runner and scorer.
- `src/entrypoints/spike-recorder/` — the dev-only recorder page, built only by `pnpm build:spike`.
- Tests: `tests/unit/spikes/`, `tests/integration/spikes/` (fixtures only, no network or key).
