# Quickstart: Account & usage in panel

## Automated

```sh
pnpm exec vitest run tests/unit/core/account tests/unit/providers/account tests/unit/sidepanel/account-api.test.ts tests/unit/sidepanel/account-status.test.tsx tests/unit/core/messaging/protocol.test.ts
pnpm build:e2e && pnpm exec playwright test tests/e2e/account.spec.ts
pnpm test   # includes the privacy guard
```

Expected: the line reads "Creator plan · 84% of credits left · renews in 12 days (Oct 20)" for the success fixture; the permission fixture shows "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io"; Start stays enabled in both.

## Manual (real account)

See `manual-check.md`: load `.output/chrome-mv3`, open the panel with a real key, compare the line with the ElevenLabs subscription page, check refresh and after-Stop refresh, try a key without 'User: Read', and measure credits used by a timed meeting (research R2 open question).
