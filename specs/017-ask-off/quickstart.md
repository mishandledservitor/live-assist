# Quickstart: Turn Ask off

Prerequisites: `pnpm install`, Node per `.nvmrc`.

## Automated

```sh
pnpm exec vitest run tests/unit/core/settings/settings.test.ts tests/unit/sidepanel/app-ask-off.test.tsx tests/unit/sidepanel/setup.test.tsx tests/unit/sidepanel/setup-chat.test.tsx tests/unit/copy
pnpm build:e2e && pnpm exec playwright test tests/e2e/ask-off.spec.ts
```

Expected: all pass. The e2e spec unticks Ask in Settings, checks the main view has no question box, `Ask` button, model label or notes control, reloads the panel and checks it is still off, then ticks it again and checks the box is back.

## By hand (unpacked build)

1. Settings → Questions: untick `Ask questions about the meeting`; provider, model, keys and the retention text disappear.
2. Back: no question box, `Ask`, model label, or notes control beside Start or in the dock.
3. Close and reopen the panel: still off. Tick it again: the box, earlier answers and the stored key are back.

Real-panel steps: [manual-check.md](manual-check.md).
