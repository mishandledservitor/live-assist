# Quickstart: Merged download (016)

## Run the checks

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run tests/unit/core/export        # the merge, its repeats, its speed, which file a press saves
pnpm exec vitest run tests/unit/sidepanel tests/unit/copy
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm build:e2e && pnpm exec playwright test tests/e2e/captions-download.spec.ts tests/e2e/transcripts.spec.ts tests/e2e/download.spec.ts
```

Expected: every test passes; `captions-download.spec.ts` saves a plain `… — Transcript.txt` after Stop from the main view, a row and the single-meeting view (same bytes), and the zip from `Download originals`.

## See it by hand

1. `pnpm build`, reload the unpacked extension in `chrome://extensions`, reload the Meet tab, click the toolbar icon.
2. Hold a Meet call with captions available, Start, talk with someone for a few minutes, Stop with the panel open.
3. Press `Download transcript`: one `.txt` in Downloads, `Meeting — … — Transcript.txt`, names on lines the panel showed as "Others".
4. Open the Transcripts screen, open the meeting: `Download transcript`, `Download originals`, `Delete transcript`. `Download originals` saves the zip with the live transcript and Meet's captions.

## Local parity check (never committed)

`spikes/data/` is gitignored. With the six recorded calls in place, `pnpm exec tsx spikes/data/016-parity/parity.ts <dir-with-m1..m6>` prints per call: words, removed repeats, `Others` share live and merged, agreement with the reference merge and with live, and the time taken. Results go into research.md R7 as metrics only.
