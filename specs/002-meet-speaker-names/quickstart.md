# Quickstart & validation: Meet speaker names

How to prove 002 works. Automated checks need no meeting, network, mic or key (Constitution III). The manual check needs a real Meet call and is recorded in `manual-check.md` in this folder.

## Prerequisites

As [001's quickstart](../001-capture-live-transcript/quickstart.md). For the manual check: a Meet call with at least two other people (or two other devices signed in as different named accounts), headphones, and your ElevenLabs key.

## Automated

```sh
pnpm lint && pnpm typecheck
pnpm test                               # includes Meet snapshot tests, alignment timelines, mute-gate suite
pnpm exec vitest run tests/unit/platforms/meet      # Meet DOM locators and content-script behaviour on snapshots
pnpm exec vitest run tests/unit/core/speakers       # alignment rules on timeline fixtures (prints SC-001 / SC-002 scores, the user's lines included)
pnpm exec vitest run tests/integration/core/mute-gate.test.ts   # SC-004: no muted mic audio reaches the mixer or the provider
pnpm build:e2e && pnpm test:e2e         # includes meet.spec.ts: fixture Meet page routed at meet.google.com
```

Expected: all green. The alignment suite reports `named correctly ≥ 90%` on clear-turn timelines (SC-001) and `wrong confirmed names = 0` across all timelines (SC-002).

## Manual check (required before 002 is "done")

Build with `pnpm build`, load `.output/chrome-mv3` unpacked (reload the extension if already loaded). Record each result in `manual-check.md`.

1. **Captions on and hidden** — Join the call with captions off. Click the toolbar icon on the Meet tab, press Start. Within a few seconds the status shows speaker names active; no caption band is visible; the call layout looks unchanged (note any blank band where captions would be). Ask another participant whether they saw anything change (SC-006).
2. **Names** — Have two others take clear turns for a few minutes. Their lines carry their names in the confirmed style; your lines carry your settings name (from Meet's "You" captions — there is no separate mic stream any more). Count wrong or missing names (SC-001: ≥ 90% correct; SC-002: no wrong name shown as confirmed).
3. **Quick exchange** — Have two people talk over each other briefly. Overlapping lines show "Others" (fallback), not a guessed name.
4. **Stop restores** — Press Stop: captions are off again and nothing is hidden. Repeat Start with captions already on: after Stop they stay on.
5. **Captions turned off by you** — During transcription press `c` in Meet (or the CC button): status shows "Captions were turned off"; new lines are "Others", yours included; turn them back on → names resume.
6. **Mute** — Mute in Meet and talk: nothing you say appears (your mic is silenced before it is mixed with the meeting audio), the others are still transcribed, status "Muted in Meet — not sent". Unmute: your lines return within about a second. Toggle quickly several times while talking; nothing you said while muted ever appears. Start once while already muted: nothing of yours appears until you unmute. Try push-to-talk (hold space while muted) and note what happens.
7. **Layout changes** — Present your screen, then switch Meet to full screen and back: names keep arriving, or the status says why not. If the mic button disappears while presenting, the mic shows "Not sent — can't see Meet's mute button" and nothing you say appears until the button is back (decision 34).
8. **Reload** — Reload the Meet tab mid-transcription (stay in the call): status briefly shows the page reconnecting, then names and mute following come back on their own.
9. **Lobby** — Press Start on the pre-join screen: status says "Join the call to get speaker names"; after joining, captions turn on and names appear.
10. **Rename** — Rename a speaker: every line of theirs changes at once (under 10 s, SC-005). Override one "Others" line to a name: only that line changes, and an "Others" line offers no rename-everywhere (decision 35). In Settings → Remembered names the rename is listed; start a new meeting with the same person and their lines show the remembered name.
11. **Non-Meet tab** — Start on a YouTube tab: status says speaker names are available on Google Meet only; the mic shows "mute state unknown — mic is being sent".
12. **Greek UI (optional but useful)** — Switch your Google account language to Greek, repeat steps 1, 2 and 6 briefly; your own lines should carry your settings name; if they show Meet's Greek word for "You" instead, rename it once and check the rename is remembered in the next meeting (and note the word, for the self-word table).
13. **Snapshots and trace** — With `pnpm build:spike`, save one Meet snapshot with captions on and one in the lobby, and one alignment trace from step 2; anonymise and review them as `tests/fixtures/meet/README.md` describes, then commit (tasks Phase 7).
14. **Show Meet captions** (2026-10-12, design decision 61) — Tick Settings → `Show Meet captions` and press Start: captions are on and visible in the band under the video, names as in step 2. Untick and tick it during the meeting: the captions disappear and come back within a second, names keep arriving. Stop: captions are as they were before Start. Full steps in `manual-check.md` "Show Meet captions".
