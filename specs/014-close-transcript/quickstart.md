# Quickstart: Close transcript

Prerequisites: `pnpm install`, Node per `.nvmrc`.

## Automated

```sh
pnpm exec vitest run tests/unit/sidepanel/meeting-api.test.ts tests/unit/sidepanel/use-live.test.tsx tests/unit/sidepanel/use-chat-close.test.tsx tests/unit/sidepanel/close-transcript.test.tsx tests/unit/sidepanel/app-close.test.tsx tests/unit/copy
pnpm build:e2e && pnpm exec playwright test tests/e2e/close.spec.ts
```

Expected: all pass. The e2e spec covers close then reload (still clean, meeting listed on Transcripts), a fixture Start/Stop then reload (clean), a reload during a running meeting (live), and Start after a close (the new meeting shows).

## By hand (unpacked build)

1. Start and stop a meeting with the panel open: the transcript stays with `Download transcript`, `Close transcript`, `Delete transcript`.
2. Press `Close transcript`: `No transcript yet.`; focus on the Transcripts control; the meeting is at the top of Transcripts.
3. Start and stop again, close the panel, open it: clean.

Real-call steps: [manual-check.md](manual-check.md).
