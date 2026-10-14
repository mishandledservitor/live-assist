# Quickstart: validating Ask the transcript

How to prove the feature works. Contracts: [chat-provider](contracts/chat-provider.md), [chat-messages](contracts/chat-messages.md), [ask-ui](contracts/ask-ui.md). Data: [data-model](data-model.md).

## Automated (no keys, no network)

```sh
pnpm install
pnpm lint && pnpm typecheck
pnpm exec vitest run tests/unit/core/chat tests/contract/chat-provider.contract.ts tests/unit/providers/chat
pnpm exec vitest run tests/integration/storage/chat-repo.test.ts tests/integration/background/chat-session.test.ts
pnpm test                                   # everything, incl. the privacy guard and copy scanner
pnpm build:e2e && pnpm exec playwright test tests/e2e/ask.spec.ts
```

Expected:
- Context builder: first question sends every finished line with the user's name in the header; a second question sends only new lines plus lines whose label changed; "Others" and pending lines go as `Others`.
- Both adapters pass contract cases C1–C14 from recorded fixtures; captured requests carry `store:false` (OpenAI), top-level `cache_control` (Anthropic), and never the key outside the auth header.
- Citations: `[12:40]` links to the 12:40 line; `[75:12]` links to the 1:15:12 line; `[99:99]` is plain text.
- Service worker: ask → `chat/turn`, deltas, `chat/end{complete}`, turn stored; port disconnect mid-stream → turn `stopped`; empty transcript → `chat/rejected{empty-transcript}` and no fetch; over-budget estimate → `failed{too-large}` and no fetch.
- Delete transcript removes the meeting's chat turns.
- Privacy guard: hosts are exactly ElevenLabs, Anthropic, OpenAI; no real-looking `sk-ant-` / `sk-` key in tracked files or the build; the side panel cannot import `SettingsStore` or read `*Credential` keys.
- e2e (fixture chat provider in the e2e build): ask over a fixture meeting, answer streams, clicking `[00:12]` highlights that line, Stop leaves `Stopped`, axe passes in light and dark.

## User-run quality evaluation (needs a key in the shell, never a file)

```sh
ANTHROPIC_API_KEY=… pnpm eval:ask --provider anthropic --model claude-sonnet-5-5
OPENAI_API_KEY=… pnpm eval:ask --provider openai --model gpt-6-luna
```

Expected: citation precision ≥ 95% (SC-002); "not in the transcript" on ≥ 95% of absent questions and no invented answer (SC-003); answer language matches the question for all Greek and English questions (SC-005). Raw results go to `spikes/data/ask-eval/` (gitignored); the summary goes into `manual-check.md`.

## Manual check on a real meeting (recorded in `manual-check.md`)

1. Load `.output/chrome-mv3` unpacked (Chrome shows the new host access for api.anthropic.com and api.openai.com on reload).
2. First-run setup on a fresh profile: name, ElevenLabs key, `Answers from` OpenAI (preselected), an OpenAI key → `Check keys and save` → both keys shown masked (an existing install: the chat-only step appears once). Settings → Questions shows GPT-6 Luna selected.
3. Start on a Meet call; after a few minutes ask "What have we covered so far?" — first words within 3 s (SC-001), citations clickable and highlight the line while the transcript keeps moving (SC-004).
4. Ask a question the meeting has not covered → plainly not in the transcript (SC-003).
5. Ask in Greek → answer in Greek with working citations (SC-005).
6. Ask a second question within 5 minutes; the service-worker console shows cache read tokens > 0 (research R6).
7. Switch to Claude with a key; ask; the answer shows `Claude Sonnet 5.5`.
8. Close the panel mid-answer, reopen: the answer shows `Stopped`.
9. Stop the meeting, ask about it: answered over the full transcript. Delete transcript: the questions and answers are gone too.
10. Fresh profile timing: install → setup with both keys → first answer under 2 minutes (SC-006).
