# Quickstart: validating the side-panel redesign

Prerequisites: `002-impl-polish` merged into `main`; 006 branch rebased on it; Node 24, `corepack enable`, `pnpm install`.

## Automated

```sh
pnpm lint && pnpm typecheck
pnpm test                                   # includes tests/unit/copy/copy-review.test.ts
pnpm build:e2e && pnpm test:e2e             # includes tests/e2e/panel-layout.spec.ts and the extended a11y.spec.ts
```

Expected: all green. `copy-review.test.ts` reports any Delete fragment still present or Rewrite fragment missing by copy-review ID; `panel-layout.spec.ts` asserts the same Delete fragments are absent from `.output/chrome-mv3-e2e/`.

## Manual (record in `specs/006-panel-redesign/manual-check.md`)

1. `pnpm build`, load `.output/chrome-mv3` unpacked, open a Google Meet call and the side panel at its narrowest width (320 px).
   - Expect: one header line (Start, language, badge, gear), one status line, transcript below filling the panel; no "live-assist" heading visible; no settings, retention or account text on the main view.
2. Press Start, acknowledge the consent reminder, talk for a minute.
   - Expect: status dots all healthy on one line; hovering a dot shows "{label}: {state}".
3. Turn Meet captions off.
   - Expect: the status line expands with `Speaker names` `Unavailable — Captions were turned off`; turning captions back on (if the adapter recovers) collapses it.
4. Open the gear during the meeting, change nothing, wait 30 s, press Back.
   - Expect: every line spoken meanwhile is in the transcript; focus is on the gear.
5. Activate the credits badge.
   - Expect: Settings opens at "ElevenLabs account" with the plan line, exact credits and caveat, no "Details" disclosure.
6. Switch macOS to Dark appearance and repeat steps 1 and 5.
   - Expect: all text and dots readable; error dot visibly square.
7. Stop the meeting.
   - Expect: `Delete transcript` appears after the last line; the badge refreshes.
8. Spot-check the copy: compare what is on screen with `copy-review.md` Rewrite and Keep lists; confirm no string outside those lists changed.
