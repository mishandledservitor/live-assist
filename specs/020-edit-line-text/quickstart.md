# Quickstart: Edit a line's text (020)

## Automated

```sh
pnpm exec vitest run tests/unit/core/messaging/protocol.test.ts tests/unit/core/transcript tests/unit/core/chat tests/unit/core/export
pnpm exec vitest run tests/integration/core/meeting-runtime.test.ts tests/integration/storage/meeting-repo.test.ts
pnpm exec vitest run tests/unit/sidepanel/text-editor.test.tsx tests/unit/sidepanel/transcript.test.tsx tests/unit/copy
pnpm build:e2e && pnpm exec playwright test tests/e2e/edit-text.spec.ts
```

Expected: every test passes; the e2e spec corrects a settled fixture line during a running meeting, sees new lines arrive with the editor open, finds the correction in `Download transcript` and in a reopened panel, and restores the original.

## By hand

See [manual-check.md](manual-check.md) (written with the tasks): a real Meet call, double-click a wrong word, type the right one, Enter; ask a question about it; download; reopen from Transcripts.
