# Quickstart: validating Meeting context

Contracts: [notes-messages](contracts/notes-messages.md), [notes-ui](contracts/notes-ui.md). Data: [data-model](data-model.md).

## Automated (no keys, no network)

```sh
pnpm install
pnpm lint && pnpm typecheck
pnpm exec vitest run tests/unit/core/chat/notes.test.ts tests/unit/core/chat/context.test.ts tests/unit/core/chat/prompt.test.ts
pnpm exec vitest run tests/integration/storage/context-repo.test.ts tests/integration/background/chat-session.test.ts
pnpm test                                   # everything, incl. privacy guard and copy scanner
pnpm build:e2e && pnpm exec playwright test tests/e2e/notes.spec.ts
```

Expected:
- File decoding: `.txt` / `.md` UTF-8 (with and without BOM, CRLF) accepted and normalised; empty, whitespace-only, 100,001 characters, over 400,000 bytes, Windows-1253, NUL bytes and `.pdf` rejected with their kinds.
- Requests: notes added before the first question → one `added` block before the transcript block; added mid-meeting → earlier turns byte-identical, new turn carries the block; replaced → earlier turns lose the old block, new turn carries `replaced`; removed → no notes text anywhere in the request, new turn carries `removed`; no notes → bodies byte-identical to 003.
- Storage: schema v3 upgrade keeps v2 data; `applyPending` moves `next` to the meeting; delete meeting removes its record; after remove or replace no store holds the old text.
- Privacy: `offscreen/begin`, the live port, segments, the 007 download and logs never contain a fixture notes sentinel string.
- e2e: add a file beside Start → chip; Start → chip in the Ask area; ask → answer streams (fixture provider records that the request had the notes block); paste replaces; remove; axe passes on the menu, chip and dialog in light and dark.

## User-run quality evaluation (key in the shell only)

```sh
OPENAI_API_KEY=… pnpm eval:ask --provider openai --model gpt-6-luna --set notes-agenda
```

Expected: SC-002 ≥ 95% notes statements marked (the label, or a sentence naming the notes as its source; decision 77) and uncited, none presented as said; SC-003 ≥ 95% not-in-transcript on `notes-vs-said`, no citation on the notes fact; SC-004 no "Others" line named from the notes.

## Manual check on a real meeting (recorded in `manual-check.md`)

1. Before Start, `Add notes` → `Choose file…` → an agenda `.md`. The chip shows beside Start. Repeat with a ~100,000-character file: the chip shows within 1 s (SC-001).
2. Start on a Meet call. The chip is in the Ask area; nothing beside Start.
3. After a few minutes ask "Which agenda items haven't we covered?" — cited transcript parts and an uncited "From your notes:" passage.
4. Ask whether something only in the notes was said — "That isn't in the transcript so far." plus at most a labelled notes passage.
5. Mid-call, `Paste text` with new notes and save (a replace). Ask: the service-worker log shows `notes: 'replaced'` and a cache write; the old notes are not quoted any more.
6. Ask in Greek — the notes label is in Greek.
7. Remove the notes, ask — no notes passage; the log shows `notes: 'removed'`.
8. Stop, reopen the panel, ask — answered over the full transcript. Delete transcript — the meeting's notes go with it.
9. SC-007: start a second meeting without notes, ask once, then add notes and ask again within 5 minutes — the log shows `cacheRead` > 0 and `notes: 'added'`.
