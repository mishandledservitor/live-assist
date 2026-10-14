---

description: "Task list for 003 Ask the transcript"
---

# Tasks: Ask the transcript

**Input**: Design documents from `specs/003-ask-the-transcript/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R15), data-model.md, contracts/chat-provider.md, contracts/chat-messages.md, contracts/ask-ui.md, quickstart.md; 001, 002, 005, 006 merged on main. User decisions 2026-10-09: placement per design decision 38, chat provider and key as a required first-run setup step per design decision 39 (research R16). No open questions.

**Tests**: Required. Constitution III and CLAUDE.md rule 9: every "Write failing tests" task is written first and run, and must fail for the right reason (missing module, wrong value — not a typo or a broken fixture) before the implementation task that follows it. No automated test may use the network or a real key; provider answers come from the recorded SSE fixtures in `tests/fixtures/chat/` through an injected `fetch`, and the e2e build uses the fixture chat provider.

**Concurrency note**: `002-late-captions` edits labels (`src/core/transcript/labels.ts`, a pending "…" label), the transcript component and specs/006. Keep chat UI in its own components and `ask.css`; change `Transcript.tsx`, `App.tsx`, `main.tsx`, `protocol.ts`, `db.ts` and `background/index.ts` by small additive edits; render labels only through `displayLabel()` and treat any non-confirmed label as `Others` (so the pending label needs no change here).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup

- [X] T001 Add `@anthropic-ai/sdk` and `openai` (latest stable, exact versions) to `dependencies` in `package.json` and `pnpm-lock.yaml`; write a failing test `tests/unit/providers/chat/sdk-runtime.test.ts` that, in a worker-like global (no `window`, no `document`), constructs each SDK client with `apiKey: 'test-key'`, `dangerouslyAllowBrowser: true`, `maxRetries: 0`, an explicit `baseURL` and an injected `fetch` returning a one-delta recorded stream, and reads the delta; make it pass. If an SDK cannot run there, record it in research R2 and switch that adapter to the fetch + SSE-reader fallback in T029/T057 (contract unchanged)
- [X] T002 [P] Record SSE fixtures in `tests/fixtures/chat/anthropic/` and `tests/fixtures/chat/openai/`, one file per contract case C1–C14 (`contracts/chat-provider.md`), each `{ "status": number, "headers": {…}, "body": "<raw SSE text>" }`, built from the providers' current streaming references (research R4: verify the OpenAI `response.incomplete` / `response.failed` / refusal event names and Anthropic `refusal` + fallback shapes at this point). Bodies hold short synthetic answers with `[00:12]`-style citations; no key-shaped strings
- [X] T003 [P] Add fixture meetings in `tests/fixtures/chat/meetings/`: `standup-en.json` (20 min, three named speakers, some "Others" lines, the user's own lines), `long-1h20.json` (lines past one hour), `relabel.json` (the same meeting before and after a late caption name and a rename-everywhere), `empty.json` (meeting, no segments); each `{ meeting, segments }` in the stored shapes of `src/core/transcript/model.ts`

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: types, settings, storage, keys, protocol, permissions and the contract suite every story uses.

- [X] T004 [P] Write failing tests in `tests/unit/core/chat/models.test.ts`: three Claude models and three OpenAI models with the IDs, labels and budgets of research R3 (re-check each ID against the official model pages linked there before writing the test); exactly one default per provider (`claude-sonnet-5-5`, `gpt-6-luna`; the default provider is OpenAI, design decision 40); per-model request options per R4 (Sonnet `between_tools` + effort `low` + fallback; Opus effort `low` + fallback, no thinking field; Haiku `disabled` + `low`, no fallback; Sol `low`, Luna `none`, Astra `low`); `modelLabel` of a listed ID and of an unknown ID; `defaultModel(provider)`
- [X] T005 Implement `src/core/chat/models.ts` so T004 passes
- [X] T006 [P] Write failing tests in `tests/unit/core/settings/chat-settings.test.ts` for `parseSettings`: missing `chat` → defaults (`setupComplete: false`); unknown provider → the default, `openai`; a model ID not in the provider's list → that provider's default; valid values kept; no field named like a key survives parsing
- [X] T007 Add `chat: ChatSettings` to `Settings`, `DEFAULT_SETTINGS` and `parseSettings` in `src/core/settings/schema.ts` so T006 passes (existing settings tests stay green)
- [X] T008 [P] Write failing tests in `tests/unit/core/chat/turn.test.ts`: `ChatError` message is a fixed text per kind and never contains its constructor input; `replayable(turn)` true only for `complete` / `cut-off` / `stopped` with a non-empty answer; `isStale(turn, now)` true for `streaming` with `updatedAt` older than 60 s; `turnId(meetingId, seq)`
- [X] T009 Implement `src/core/chat/provider.ts` (types incl. `ChatCredentialSource` with `status` and `providerFor`, and `ChatError`, per `contracts/chat-provider.md`) and `src/core/chat/turn.ts` (data-model `ChatTurn`, `AnswerStatus`, helpers) so T008 passes
- [X] T010 [P] Write failing tests in `tests/unit/core/messaging/chat-protocol.test.ts` (own file): `parseCommand` accepts `settings/chat-key-hints` and `settings/validate-chat-key` with a valid provider and rejects others; `parseChatPortIn` accepts `chat/ask` (trims, 1–2,000 chars, string meetingId) and `chat/stop`, rejects the rest; `parseChatPortOut` accepts every service-worker message of `contracts/chat-messages.md` and rejects a `ChatTurnView` carrying `contextBlock`, `sentLines` or any secret-looking field (`containsSecretField`); `parseChatKeyHintsReply`, `parseValidateChatKeyReply`
- [X] T011 Add the chat commands, port message types and parsers to `src/core/messaging/protocol.ts` so T010 passes
- [X] T012 [P] Write failing tests in `tests/integration/storage/chat-repo.test.ts` (fake-indexeddb): opening a v1 database created by the old upgrade path upgrades to v2, keeps meetings and segments, and creates `chatTurns` with `meetingId` and `meetingSeq` indexes; a connection closes on `versionchange`; `ChatRepo.putTurn` is idempotent by id; `listTurns(meetingId)` in seq order and only that meeting; `nextSeq`; `markStaleStreaming(now)` turns stale `streaming` turns into `stopped` and returns their ids
- [X] T013 Implement schema v2 in `src/storage/db.ts` (and update its header comment: the offscreen document writes meetings and segments, the service worker writes chat turns) and `src/storage/chat-repo.ts` so T012 passes
- [X] T014 [P] Write a failing test in `tests/integration/storage/meeting-repo.test.ts`: `deleteMeeting(id)` also deletes that meeting's chat turns, in the same transaction, and leaves another meeting's turns
- [X] T015 Extend `MeetingRepo.deleteMeeting` in `src/storage/meeting-repo.ts` so T014 passes
- [X] T016 [P] Write failing tests in `tests/unit/storage/chat-credentials.test.ts` over the fake chrome storage: `PreferencesStore.writePendingChatKey(provider, key)` does one `set` of `pendingAnthropicCredential` / `pendingOpenaiCredential` and reads nothing; `removeChatKey(provider)` does one `remove` of saved + pending; `SettingsStore.readChatKey`, `readPendingChatKey`, `promotePendingChatKey`, `discardPendingChatKey`, `chatKeyHints()` (last four or null); replacing the ElevenLabs key (`promotePendingKey`) leaves both chat keys untouched (research R14)
- [X] T017 Implement the chat key methods in `src/storage/preferences-store.ts` and `src/storage/settings-store.ts` so T016 passes
- [X] T018 [P] Write failing tests: in `tests/unit/lint/boundaries.test.ts`, importing `@anthropic-ai/sdk` or `openai` outside `src/providers/chat/` is an ESLint error; in `tests/unit/privacy/no-secrets.test.ts`, the network allowlist is exactly `api.elevenlabs.io`, `api.anthropic.com`, `api.openai.com`; SDK clients may be constructed only with `baseURL: ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` (a self-test with a literal or other `baseURL` fails); the manifest's `host_permissions` equal the three hosts; real-looking `sk-ant-…`, `sk-proj-…` and `sk-…` keys are found in tracked files and the built extension (self-tests with synthetic samples); `src/entrypoints/sidepanel/` never contains `readChatKey`, `readPendingChatKey` or the saved `*Credential` key names
- [X] T019 Make T018 pass: `src/providers/chat/base-urls.ts`, the ESLint rule in `eslint.config.js`, `host_permissions` in `wxt.config.ts`, and the updated allowlists in `tests/unit/privacy/no-secrets.test.ts`
- [X] T020 [P] Write the shared contract suite `tests/contract/chat-provider.contract.ts` (cases C1–C14 of `contracts/chat-provider.md`, parameterised by a provider factory and a fixture loader) and a failing test `tests/unit/providers/chat/fixture-provider.test.ts` that runs it against the fixture provider
- [X] T021 Implement `src/providers/chat/fixture-provider.ts` (scripted events and errors by scenario name, honours abort) so T020 passes

**Checkpoint**: settings, storage, keys, protocol, permissions and the contract suite are in place; no UI yet.

---

## Phase 3: User Story 1 — Catch up on what I missed (Priority: P1) — MVP

**Goal**: ask on the main view, stream a grounded answer, click a citation to the transcript line.

**Independent test**: with `standup-en.json` stored, a Claude key in storage and the Anthropic C1 fixture as the response, ask "What was decided about pricing?": the answer streams into the conversation strip, `[00:12]` is a button, clicking it scrolls the transcript to that line and highlights it while the answer stays visible.

- [X] T022 [P] [US1] Write failing tests in `tests/unit/core/chat/context.test.ts` for `renderLine`, `buildContext` and `buildRequest` (data-model "Context build") with `standup-en.json` and `relabel.json`: first block has the first-turn header with the user's name and every finished line in meeting order as `[mm:ss] Label: text`; lines past an hour use `h:mm:ss`; newlines in text collapse; a second question's block holds only new lines; after a late caption name or a rename the changed lines are restated in the next block; with nothing new the block is the no-new-lines header; failed and empty turns are neither replayed nor counted as sent; each user turn is `{context, question}`; the request is deterministic (same input → deep-equal output); `estimateTokens` is `ceil(chars / 2.5)`; `fitsBudget` false over the model budget
- [X] T023 [US1] Implement `src/core/chat/context.ts` so T022 passes
- [X] T024 [P] [US1] Write failing tests in `tests/unit/core/chat/prompt.test.ts`: `GROUNDING_PROMPT` contains research R7 rules 1, 2, 4 and 8 (line format, later restatement replaces, citation format with both examples, plain text) and is a constant (no interpolation); the three block headers equal the data-model strings
- [X] T025 [US1] Implement `src/core/chat/prompt.ts` with rules 1, 2, 4 and 8 and the headers so T024 passes
- [X] T026 [P] [US1] Write failing tests in `tests/unit/core/chat/citations.test.ts` for `parseAnswer(answer, segments)`: `[12:40]` → citation to the first segment at 12:40; `[1:15:12]` and `[75:12]` → the same 1:15:12 segment with the label as written; two adjacent citations; `[99:99]`, `[12:4]`, `[ 12:40 ]` → text or unmatched as specified; text between citations kept exactly
- [X] T027 [US1] Implement `src/core/chat/citations.ts` so T026 passes
- [X] T028 [P] [US1] Write failing tests in `tests/unit/providers/chat/anthropic.test.ts`: run the contract suite against the Anthropic adapter with `tests/fixtures/chat/anthropic/`; plus the Anthropic request assertions of `contracts/chat-provider.md` (URL, headers incl. `anthropic-dangerous-direct-browser-access`, `system`, top-level `cache_control`, per-model options and the fallback beta header exactly when `fallbacks` is sent, two text blocks per user turn, one fetch per request, byte-identical bodies for the same request), and that `usage` maps cache read/write tokens
- [X] T029 [US1] Implement `src/providers/chat/anthropic.ts` and `src/providers/chat/factory.ts` (`createChatProvider('anthropic', key, fetch)`) so T028 passes
- [X] T030 [P] [US1] Write failing tests in `tests/unit/providers/credentials/local-chat-key-source.test.ts` for `LocalChatKeySource` (`status` gives configured + last four, `providerFor` returns null without a key and an adapter built with the saved key otherwise, the key never appears in a returned value's enumerable fields) and in `tests/integration/background/chat-session.test.ts` (fake-indexeddb, fake port, a fake `ChatCredentialSource` returning the fixture provider) for `createChatSession(deps)` per `contracts/chat-messages.md`: happy path posts `chat/turn`, `chat/model`, `chat/delta`…, `chat/end{complete}` and stores the turn with `contextBlock`, `sentLines`, `answeredBy`; the answer is written at most every 250 ms (fake timers) and once at the end; `chat/stop` and port disconnect abort and store `stopped`; a second `chat/ask` while one runs → `chat/rejected{busy}`; no finished segment → `chat/rejected{empty-transcript}` and the provider is never called; no key → `missing-key`; over-budget estimate → stored `failed{too-large}` and no provider call; provider error → `failed{kind}`; a stale `streaming` turn is marked `stopped` on the next ask; the logger receives only kind, model, status and usage numbers (assert no question, answer, transcript text or key reaches it); no segment or meeting record is written by the session (FR-020)
- [X] T031 [US1] Implement `src/providers/credentials/local-chat-key-source.ts` and `src/entrypoints/background/chat-session.ts` (depends on `ChatCredentialSource`, never on a key) so T030 passes
- [X] T032 [P] [US1] Write failing tests in `tests/unit/background/chat-port.test.ts` for `acceptChatPort(port, deps)`: a port named `chat` from the extension's side panel URL is accepted and wired to a session; a port from another URL or extension is disconnected; incoming messages go through `parseChatPortIn`
- [X] T033 [US1] Implement `acceptChatPort` in `src/entrypoints/background/chat-session.ts` and register `chrome.runtime.onConnect` in `src/entrypoints/background/index.ts` (production: `LocalChatKeySource` with global `fetch`; e2e mode: a fixture `ChatCredentialSource` whose provider is the fixture provider keyed by the `e2eScenario` storage value, as 001's e2e transcription provider) so T032 passes
- [X] T034 [P] [US1] Write failing tests in `tests/unit/sidepanel/chat-api.test.ts` for `createChatApi(deps)`: `ask`/`stop` post validated port messages; invalid incoming messages are dropped; `listTurns(meetingId)` reads through `ChatRepo`; reconnects the port lazily after a disconnect
- [X] T035 [US1] Implement `src/entrypoints/sidepanel/chat-api.ts` so T034 passes
- [X] T036 [P] [US1] Write failing tests in `tests/unit/sidepanel/use-chat.test.tsx` for `useChat(api, meetingId)`: loads turns when the meeting changes and clears them for null; applies `chat/turn`, `chat/model`, `chat/delta`, `chat/end`; a `chat/rejected` sets `notice`; asking while a turn streams sets `waiting`, which is sent when that turn ends (R15); stop sends `chat/stop` for the streaming turn
- [X] T037 [US1] Implement `src/entrypoints/sidepanel/hooks/useChat.ts` so T036 passes
- [X] T038 [P] [US1] Write failing tests in `tests/unit/sidepanel/answer-text.test.tsx`: text with line breaks kept; each matched citation is a `button` with the written `[12:40]` text and accessible name `Go to 12:40 in the transcript` calling `onCite(segmentId)`; unmatched times are plain text; no HTML from the answer is rendered as markup
- [X] T039 [US1] Implement `src/entrypoints/sidepanel/components/AnswerText.tsx` so T038 passes
- [X] T040 [P] [US1] Write failing tests in `tests/unit/sidepanel/chat-thread.test.tsx` per `contracts/ask-ui.md` "Turn rendering": `region` `Questions and answers`; question and answer `article` named by the question; `aria-busy` while streaming; `Stopped`; `The answer was cut off.` + `Try again`; failed → `alert` with the ask-ui error text and `Try again` that puts the question back in the box; the model label under a finished answer; `Waiting…` for the waiting question; `Hide answers` / `Show answers` toggle with `aria-expanded`, collapsed showing the latest question on one line; opens scrolled to the latest turn
- [X] T041 [US1] Implement `src/entrypoints/sidepanel/components/ChatThread.tsx` and the error texts in `src/core/chat/messages.ts` so T040 passes
- [X] T042 [P] [US1] Write failing tests in `tests/unit/sidepanel/ask-dock.test.tsx`: `textbox` `Question` with placeholder `Ask about this meeting`; Enter sends, Shift+Enter adds a line; `Ask` disabled when empty, with no key or with no meeting; `Stop` replaces `Ask` while streaming; the selected model's label after the box; notices `Add a Claude key in Settings to ask questions.` (and the OpenAI / either-provider variants) and `Nothing transcribed yet.`
- [X] T043 [US1] Implement `src/entrypoints/sidepanel/components/AskDock.tsx` so T042 passes
- [X] T044 [P] [US1] Write failing tests in `tests/unit/sidepanel/transcript-cite.test.tsx`: each line has `data-segment-id`; `scrollToSegment(id)` (imperative handle or prop) scrolls the line into view, sets `aria-current="true"` and `line-cited` for 2 s, and stops auto-follow like a manual scroll-up; live lines keep arriving; existing transcript tests stay green
- [X] T045 [US1] Add the segment id attribute and the scroll/highlight handle to `src/entrypoints/sidepanel/components/Transcript.tsx` so T044 passes
- [X] T046 [P] [US1] Write failing tests in `tests/unit/sidepanel/app-ask.test.tsx` (own file): the main view renders the conversation strip and question box under the transcript for the meeting shown (running or stopped); clicking a citation highlights the transcript line and the answer stays in the document; Settings screen and setup unaffected; without a `chat` API the main view renders as before
- [X] T047 [US1] Wire `AskDock` and `ChatThread` into `MainView` in `src/entrypoints/sidepanel/App.tsx`, `chatApi` in `src/entrypoints/sidepanel/main.tsx`, layout in `src/entrypoints/sidepanel/components/ask.css` (strip ≤ 40% height, scrolls internally; design decision 38) so T046 passes
- [X] T048 [US1] Write a failing Playwright test `tests/e2e/ask.spec.ts` (e2e build, fixture chat provider, a Claude key and `standup-en.json` seeded through storage/IndexedDB): ask → answer streams → click `[00:12]` → that line is highlighted and in view; Stop mid-stream → `Stopped`; close and reopen the panel mid-stream → `Stopped`
- [X] T049 [US1] Make T048 pass (fix wiring only; no new behaviour)

**Checkpoint**: US1 works end to end against fixtures. Real use needs a key entered through US3's settings (or seeded storage).

**Implementation notes (Phase 3, 2026-10-09)**:
- One `chat` port per question (`chat-api.ts`): the offscreen document also receives every `chrome.runtime.connect` port and holds ones it ignores, so a long-lived port could outlive a restarted service worker and swallow the next question. The port closes after `chat/end` or `chat/rejected`; a panel closed mid-answer still disconnects it, and the service worker stores the turn `stopped`.
- The service worker now has a `runtime.onConnect` listener, so it receives the panel's `live` and Meet's ports too. Disconnecting any receiving end closes a port for its opener, so `foreign-ports.ts` holds those ports while the offscreen document is open and lets go when it is absent or closed (`meeting-control.ts` `onOffscreenClosed`). Without this the panel's `live` port never closed when nothing ran and the stored meeting did not show (caught by the e2e suite).
- `settings/chat-key-hints` is routed now (`chat-keys.ts` `answerChatKeyHints`, part of T058/T059) so the Ask area can say which key is missing.
- Until T057, `createChatProvider('openai')` returns a stand-in that fails every question as `unavailable` and sends nothing.
- `panel-layout.spec.ts`: the main view's only text box is now `Question`, and the transcript keeps at least 70% of the panel height (was 80%) with the question box pinned under it (design decision 38).

---

## Phase 4: User Story 2 — Honest answers, never invented ones (Priority: P1)

**Goal**: the model is told to say "not in the transcript", label background, never name "Others"; declines are handled; quality is measurable.

**Independent test**: the request for any question carries rules 3, 5 and 6 and the user's name; "Others" and fallback lines are sent as `Others`; a refusal fixture ends the turn as `declined` with no partial answer shown; `pnpm eval:ask` scores an evaluation set.

- [X] T050 [P] [US2] Write failing tests: in `tests/unit/core/chat/prompt.test.ts`, `GROUNDING_PROMPT` contains rules 3, 5 and 6 of research R7 ("Others" is unidentified and may include the person asking, never attributed to a named person; the plain not-in-transcript sentence and partial answers; "Background:" paragraphs without citations); in `tests/unit/core/chat/context.test.ts`, a `fallback` line and any non-confirmed display label render as `Others` while confirmed labels (including the user's name for Meet's "You") render as shown (FR-002a)
- [X] T051 [US2] Add rules 3, 5, 6 to `src/core/chat/prompt.ts` and the non-confirmed → `Others` rule to `renderLine` in `src/core/chat/context.ts` so T050 passes
- [X] T052 [P] [US2] Write failing tests for declines: in `tests/integration/background/chat-session.test.ts`, the Anthropic and OpenAI refusal fixtures end the turn `failed{declined}` with `answer` cleared and `chat/end` sent; with the Anthropic fallback fixture the turn completes with `answeredBy` set to the fallback model; in `tests/unit/sidepanel/chat-thread.test.tsx`, a declined turn shows `{M} declined to answer this question.` and no partial text, and an answer written by a model outside the list shows its raw ID
- [X] T053 [US2] Make T052 pass in `src/entrypoints/background/chat-session.ts` and `src/entrypoints/sidepanel/components/ChatThread.tsx`
- [X] T054 [P] [US2] Add the evaluation set `tests/fixtures/chat/eval/*.json` (synthetic and redacted transcripts; questions tagged `supported` with supporting times, `absent`, `partial`, `background`, `others-attribution`; languages `en` and `el`) and write failing tests in `tests/unit/spikes/ask-eval.test.ts` for the scorer: citation precision against tagged times (SC-002), absent detection (no citation and the localised not-in-transcript phrase family, SC-003), language by script (SC-005), an `others-attribution` answer that names a person for an "Others" line counts as a failure
- [X] T055 [US2] Implement `spikes/ask-eval.ts` (reads `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` from the shell only, uses the real adapters through `createChatProvider`, writes raw results to `spikes/data/ask-eval/`) and the `eval:ask` script in `package.json`, documented in `spikes/README.md`, so T054 passes

**Checkpoint**: US1 + US2 are the grounded MVP.

**Implementation notes (Phase 4, 2026-10-09)**:
- T052: the OpenAI refusal fixtures cannot run through an adapter until T057, so the session test covers an OpenAI-selected decline with the scripted fixture provider; T056 runs the OpenAI refusal fixtures through the contract suite. The two ChatThread assertions (declined shows no partial text, a model outside the list shows its raw ID) already held after T041 and stand as regression guards; the service-worker change (clearing a declined answer) was test-first.
- T054/T055: the evaluation set is `tests/fixtures/chat/eval/{standup-en,long-1h20}.json` over the synthetic meeting fixtures (20 questions, all five tags, English and Greek); the scorer is `spikes/lib/ask-eval.ts`, the runner `spikes/ask-eval.ts` (`pnpm eval:ask`).
- `specs/003-ask-the-transcript/manual-check.md` was written now (part of T079) with the real-use steps for an OpenAI key and GPT-6 Luna; it needs Phase 5 to run.

---

## Phase 5: User Story 3 — Set up the model provider from the start, change it later (Priority: P2)

**Goal**: chat provider and key as a required first-run setup step, provider and model choice in Settings, key check, OpenAI adapter, retention disclosure.

**Independent test**: a fresh profile completes setup choosing OpenAI with a key the fixture check accepts (shown as `••••abcd`); ask against the OpenAI C1 fixture → the answer shows `GPT-6 Luna`; in Settings switch to Claude, enter a key and ask against the Anthropic fixture → `Claude Sonnet 5.5`; an install set up before 003 sees only the chat step once; no key appears in any message, log or the panel.

- [X] T056 [P] [US3] Write failing tests in `tests/unit/providers/chat/openai.test.ts`: run the contract suite against the OpenAI adapter with `tests/fixtures/chat/openai/`; plus the OpenAI request assertions of `contracts/chat-provider.md` (Responses URL, Bearer header, `stream`, `store: false`, `instructions`, `reasoning.effort` per model, no `prompt_cache_key` / `metadata` / `user`, one fetch, byte-identical bodies), `insufficient_quota` → `billing`, `context_length_exceeded` → `too-large`
- [X] T057 [US3] Implement `src/providers/chat/openai.ts` and the OpenAI branch of `src/providers/chat/factory.ts` so T056 passes
- [X] T058 [P] [US3] Write failing tests in `tests/unit/background/chat-keys.test.ts` for `validatePendingChatKey(provider, deps)` and `answerChatKeyHints(source)` (hints through `ChatCredentialSource.status`): success promotes the candidate and returns the hint; 401/403/network discard it and return the kind; no candidate → `missing-key`; the check request carries no transcript or chat (captured fetch); hints are last-four or null and never the key
- [X] T059 [US3] Implement `src/entrypoints/background/chat-keys.ts` and route `settings/validate-chat-key` and `settings/chat-key-hints` in `src/entrypoints/background/index.ts` (e2e mode: the key check uses the fixture provider's `checkKey`, so T073 needs no network) so T058 passes
- [X] T060 [P] [US3] Write failing tests in `tests/unit/sidepanel/settings-api-chat.test.ts`: `load()` includes chat settings and both hints; `replaceChatKey(provider, key)` writes the candidate then sends `settings/validate-chat-key`; `removeChatKey(provider)`; `saveChatSettings({provider, model})`; a malformed reply → `unknown`
- [X] T061 [US3] Extend `src/entrypoints/sidepanel/settings-api.ts` so T060 passes
- [X] T062 [P] [US3] Write failing tests in `tests/unit/sidepanel/chat-settings.test.tsx` per `contracts/ask-ui.md` rows 4a–4c: heading `Questions`; `radiogroup` `Answers from` (OpenAI default); `combobox` `Model` listing the selected provider's labels with its default; switching provider changes the list and keeps each provider's own choice; `Claude API key` and `OpenAI API key` sections with saved hint or `No key saved.`, `New key`, `Check and replace key`, `Remove key` and the result strings; the key text box is cleared after a check
- [X] T063 [US3] Implement `src/entrypoints/sidepanel/components/ChatSettings.tsx` and render it in the Settings screen after `Key terms` in `src/entrypoints/sidepanel/App.tsx` / `Settings.tsx` so T062 passes
- [X] T064 [P] [US3] Write failing tests in `tests/unit/sidepanel/chat-retention.test.tsx`: with Claude selected, heading `What Anthropic keeps`, the Anthropic disclosure and link `Anthropic privacy policy`; with OpenAI, `What OpenAI keeps`, its disclosure and link `OpenAI data controls`; placed after `What ElevenLabs keeps`
- [X] T065 [US3] Re-read the providers' retention pages (research R11), adjust the disclosure strings in `contracts/ask-ui.md` if the pages differ, implement `src/entrypoints/sidepanel/components/ChatRetention.tsx`, and render it after `RetentionNotice` in the Settings screen in `src/entrypoints/sidepanel/App.tsx` so T064 passes
- [X] T066 [P] [US3] Write failing tests: in `tests/integration/background/chat-session.test.ts`, the session uses the provider and model in the current settings at ask time (switching between two asks sends the second to the other provider) and stores `provider` / `requestedModel`; in `tests/unit/sidepanel/ask-dock.test.tsx`, the label follows the selected model and the no-key notice names the selected provider
- [X] T067 [US3] Make T066 pass in `src/entrypoints/background/chat-session.ts` and `src/entrypoints/sidepanel/components/AskDock.tsx`
- [X] T068 [P] [US3] Write failing tests in `tests/unit/sidepanel/setup-chat.test.tsx` per `contracts/ask-ui.md` "First-run setup additions": the setup form shows `radiogroup` `Answers from` (OpenAI checked, design decision 40), a key field labelled `OpenAI API key` that becomes `Claude API key` when Claude is chosen, and the chosen provider's disclosure after `What ElevenLabs keeps`; submit writes both candidates, then sends `settings/validate-key`, then `settings/validate-chat-key`; only when both pass it saves `{ userName, firstRunComplete: true, chat: { ...current chat settings, provider, setupComplete: true } }` (the whole `chat` object, so the per-provider models survive the shallow settings merge); an empty, rejected, forbidden or unreachable chat key shows its ask-ui error, keeps the other fields and does not finish, and a re-submit does not re-check an ElevenLabs key that already passed; button `Check keys and save` / `Checking keys…` (006 copy-review R28); saved screen `Keys saved on this computer only: ElevenLabs ••••{hint}, Claude ••••{hint}` (R29); no key value is ever rendered
- [X] T069 [US3] Add the chat step to `src/entrypoints/sidepanel/components/Setup.tsx` (using the settings API from T061 and `ChatRetention` from T065) so T068 passes; existing setup tests change only for R28 and R29
- [X] T070 [P] [US3] Write failing tests in `tests/unit/sidepanel/app-setup-gating.test.tsx`: `!firstRunComplete` → full setup; `firstRunComplete && !chat.setupComplete` → the chat-only step (provider, key, disclosure, `Check key and save`, saved `Key saved on this computer only: ••••{hint}` and `Done`), then the main view; once `chat.setupComplete`, removing the chat key in Settings shows the Ask notice and never brings setup back; Start readiness (`isReadyToStart`) is unchanged by the chat key
- [X] T071 [US3] Implement the gating in `src/entrypoints/sidepanel/App.tsx` and the chat-only mode of `src/entrypoints/sidepanel/components/Setup.tsx` so T070 passes
- [X] T072 [US3] Update `tests/e2e/setup.spec.ts` so it fails first: a fresh profile completes setup with the ElevenLabs key (route-stubbed as today) and an OpenAI key with the preselected OpenAI (e2e fixture check), the saved screen shows both masked, and the main view's Ask box is enabled; a profile with `firstRunComplete` and no `chat.setupComplete` sees only the chat step; then make it pass
- [X] T073 [US3] Write a failing Playwright test in `tests/e2e/ask-settings.spec.ts`: from a profile set up with OpenAI, Settings → Questions → Claude → paste a key (fixture check passes) → `…` hint shown → back → ask → answer labelled `Claude Sonnet 5.5`; then make it pass

**Checkpoint**: all P1–P2 stories work; the extension is usable with a real key.

---

## Phase 6: User Story 4 — Ask in my own language (Priority: P3)

**Goal**: answers in the question's language, citations still linked.

**Independent test**: a Greek question over `standup-en.json` produces a request carrying rule 7; with a recorded Greek answer fixture the citations link to the English lines.

- [X] T074 [P] [US4] Write failing tests: in `tests/unit/core/chat/prompt.test.ts`, rule 7 (answer in the question's language; quote lines in their original language); in `tests/unit/sidepanel/answer-text.test.tsx`, a Greek answer fixture's citations resolve against English segments; add a Greek-answer fixture `tests/fixtures/chat/anthropic/greek-answer.sse`
- [X] T075 [US4] Add rule 7 to `src/core/chat/prompt.ts` so T074 passes

**Implementation notes (Phases 5-7, 2026-10-09)**:
- T065: both retention pages re-read 2026-10-09 (Anthropic "How long do you store my organization's data" and "Is my data used for model training"; OpenAI "Your data"). Anthropic's no-training statement is "by default", so its disclosure gains those words (`contracts/ask-ui.md` updated); the OpenAI text matched. The two links are listed in the privacy guard as non-network URLs.
- T066: the session already read the provider and model at ask time, and AskDock already followed its props, so those assertions stand as regression guards. The red part was the main view: the Ask area held key hints fetched once per meeting, so a key added or removed in Settings did not show until the panel reopened. It now takes them from the loaded settings, and `ChatApi.keyHints` is gone.
- T068-T071: Setup takes `initial` (the loaded settings) and `mode` (`full` or `chat`). A re-submit skips an ElevenLabs key that already passed only while its text is unchanged.
- T072: `seedSettings` in `tests/e2e/helpers.ts` now marks the chat step done (otherwise every seeded e2e profile would land on the chat step); the ask seed moved there as `seedAskMeeting(panel, delayMs, provider)`.
- T076: the copy entries passed on first run (the strings had been written to ask-ui.md as they were implemented); they stand as guards. ChatRetention's headings became whole literals so the scanner sees them.
- T079: `manual-check.md` already existed (written in Phase 4); this pass removed its "before Phase 5" note and added the Greek step (6a).
- T080: decisions 44–47 recorded; `CLAUDE.md` "Current status" is left to the main session (the file is hook-locked for subagents).
- T074: the Greek answer fixture is `tests/fixtures/chat/anthropic/greek-answer.json`, in the same `{status, headers, body, answer}` shape as the other recorded streams (the task named it `.sse`). Its citation assertions held before rule 7 (matching is language-independent) and stand as a guard; rule 7 itself was test-first.

---

## Phase 7: Polish & cross-cutting

- [X] T076 [P] Write failing copy checks: add `A`-entries to `tests/fixtures/copy/copy-review.json` from `contracts/ask-ui.md` (every string under Strings, First-run setup and Settings as `present`; every Delete / never-add string as `absent`), entries for 006 copy-review R28 and R29, and the Keep strings (incl. K36, K37) to `tests/unit/copy/keep-strings.test.tsx`; fix any string that fails
- [X] T077 [P] Extend `tests/e2e/a11y.spec.ts`: axe passes on the main view with a conversation (streaming and finished) and on the Settings screen with the Questions section, in light and dark
- [X] T078 [P] Update the 006 UI contract `specs/006-panel-redesign/contracts/panel-ui.md` (Setup row: the chat step and the chat-only step; Settings rows 4a–4c and 8a by reference to `contracts/ask-ui.md`; main view: the conversation strip and question box under the transcript) and the 001/005 contract docs that the change touches: `specs/001-capture-live-transcript/contracts/extension-messages.md` (chat commands and port, pointer to `contracts/chat-messages.md`) and `specs/001-capture-live-transcript/contracts/credential-source.md` (chat credentials live beside it, `ChatCredentialSource`)
- [X] T079 Create `specs/003-ask-the-transcript/manual-check.md` from `quickstart.md` "Manual check" (steps 1–10 with SC references and result fields) and the `pnpm eval:ask` summary table
- [X] T080 Record the remaining plan decisions in `.specify/memory/design-decisions.md` (decisions 38 and 39 are already there; add the OpenAI list and default, calls from the service worker, append-only context and caching under the next free numbers); update ROADMAP 003 status, `CHANGELOG.md`, and CLAUDE.md "Current status" per standing rule 5
- [X] T081 Run `quickstart.md` "Automated" end to end (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:e2e`, `pnpm test:e2e`) and fix anything red
- [ ] T082 Real-meeting check and `pnpm eval:ask` run by the user; results into `manual-check.md` (constitution III: required before 003 is called done)

---

## Fixes after real call 2026-10-09

Two failures in the user's real Meet call (manual-check steps 6 and 6b). Diagnosis and the guard decision: plan.md "Fixes after real call 2026-10-09". Test data is synthetic; the real transcript is not committed.

- [X] T083 Diagnose failure A (step 6, "What does X mean?" answered "That isn't in the transcript so far."): add context-builder tests that a line committed before the question is sent in the first block, that a pending-name line is sent as "Others" and restated once named, and that a repeated question replays the earlier answer; result in plan.md (the builder was not the cause; the prompt was)
- [X] T084 Write failing prompt tests (`tests/unit/core/chat/prompt.test.ts`): a "what does X mean" question about a term that came up is answered with the cited mention plus an uncited "Background:" sentence, never with the not-in-transcript sentence; the not-in-transcript rule names that exception; an earlier answer that said "not in the transcript" is not repeated without checking again
- [X] T085 Write failing prompt tests: the earlier questions and answers are not the transcript; something known only from the conversation gets no citation; a citation goes only to a line that itself supports the statement
- [X] T086 Rewrite rules 4–6 of `GROUNDING_PROMPT` (`src/core/chat/prompt.ts`) and research R7 to pass T084–T085
- [X] T087 Write failing citation tests (`tests/unit/core/chat/citations.test.ts`): a citation whose sentence quotes text that none of the cited lines contains is shown as plain text (`unmatched`); quotes the line contains, quotes with an ellipsis, sentences without quotes, adjacent citation groups and Greek quotes «…» keep their links
- [X] T088 Implement the quotation guard in `parseAnswer` (`src/core/chat/citations.ts`); FR-005 and data-model "Citation" updated
- [X] T089 Write failing eval tests (`tests/unit/spikes/ask-eval.test.ts`): eval questions may carry earlier turns, replayed append-only like the app does; new tag `conversation` (a fact from the chat itself: scored as failed if it cites anything); `background` scored for a cited mention plus an uncited background part; both reported in the summary table
- [X] T090 Implement T089 in `spikes/lib/ask-eval.ts` and `spikes/ask-eval.ts`; add the synthetic meeting `tests/fixtures/chat/meetings/term-mention.json` and eval set `tests/fixtures/chat/eval/term-mention.json` reproducing both patterns (term mentioned but not explained, asked fresh and after a wrong first answer, in English and Greek; a word the user asked the assistant to say, asked about later)
- [X] T090a Guard test (`tests/unit/core/chat/context.test.ts`): every earlier question and answer is still replayed in full, conversation-only facts included (user constraint: failure B is fixed by citations, never by withholding turns)
- [X] T091 `manual-check.md`: step 6 result recorded as failed, step 6b added for the conversation-citation case; step 7 reworded (every follow-up gets the whole conversation; the 5 minutes only matter for the cache check); re-run 6 and 6b in a real call
- [ ] T092 User: `pnpm eval:ask` (both providers) and steps 6 and 6b in a real call; results into `manual-check.md`

---

## Fixes after real call 2026-10-10

Real Meet call and `pnpm eval:ask` (OpenAI GPT-6 Luna) of 2026-10-10. Step 6b failed again: `Say exactly "QZVRT" in chat`, then "What was the word I asked you to say?" was answered "That isn't in the transcript so far." Cause: the 2026-10-09 rule said facts from the chat get no citation but never said to answer from the chat, and rule 1 said "using only its transcript"; the eval passed because `conversation` only checked for citations. Eval misses: citation precision 90.3% came only from three correct notes-others answers whose fixture listed no supported times; the absent miss ("How much is the launch budget in euros?") was a correct partial answer citing [02:00] for the approval. Test data is synthetic.

- [X] T093 Write failing prompt tests (`tests/unit/core/chat/prompt.test.ts`): rule 1 names this chat's earlier questions and answers as a source; a question about the chat itself is answered from them and never with "That isn't in the transcript so far."; the not-in-transcript rule names that exception
- [X] T094 Reword rules 1, 5 and 6 of `GROUNDING_PROMPT` (`src/core/chat/prompt.ts`) to pass T093; FR-006 updated
- [X] T095 Write failing eval tests (`tests/unit/spikes/ask-eval.test.ts`): a `conversation` question names the word it `expect`s and an answer without it fails (an uncited refusal no longer passes); every conversation question in the set has `expect`; absent questions may list `related` lines a partial answer may cite, and a "not mentioned / not given" denial (English, Greek) counts; a citation outside `related` is still invented; the summary row reads "Facts from the chat itself cited or not given"
- [X] T096 Implement T095 in `spikes/lib/ask-eval.ts`; `term-mention` set: `expect` on the word questions plus the call's exact wording; `standup-en` `budget-figure` gets `related: ["02:00"]`
- [ ] T097 User: `pnpm eval:ask` (both providers) and step 6b in a real call; results into `manual-check.md`

---

## Waiting state and first-word limit (2026-10-13, design decision 80)

Real call of 2026-10-12/13: two questions showed their turn and then nothing until Stop (cause not established). Spec Clarifications 2026-10-13, FR-003a, FR-018a, FR-018b; plan "Waiting state and first-word limit". Each test task is written and seen failing before the task after it.

- [X] T098 Amend `spec.md` (Clarifications 2026-10-13 with decided and assumed points, edge case, FR-003a, FR-018a, FR-018b), `plan.md`, `data-model.md` (`no-answer`, the transition), `contracts/chat-messages.md` (flow step 5a, log fields, e2e limit), `contracts/chat-provider.md`, `contracts/ask-ui.md` (waiting mark, string, copy review) and `manual-check.md` (step 10a)
- [X] T099 Write failing tests for the new kind (`tests/unit/core/chat/turn.test.ts`, `messages.test.ts`, `tests/unit/core/messaging/chat-protocol.test.ts`): `no-answer` is a `ChatErrorKind` with its own `ChatError` message; `chatErrorText('no-answer', …)` is `No answer came back. Ask again.` for either provider and names neither; `chat/end` and a stored turn view with `no-answer` pass the validators
- [X] T100 Add `no-answer` to `CHAT_ERROR_KINDS` (`src/core/chat/provider.ts`) and its text to `src/core/chat/messages.ts`
- [X] T101 Write failing session tests (`tests/unit/background/chat-session-first-text.test.ts`, fake timers injected): no text within the limit → request aborted, `chat/end` `failed`/`no-answer`, stored turn failed with an empty answer; the timer is set for `FIRST_TEXT_LIMIT_MS` (45,000) when the request is sent; a `model` event does not stop it; the first text does, and a late fire then changes nothing (answer completes); Stop during the wait → `stopped`, a later fire changes nothing; panel closed during the wait → stored `stopped`; a provider that ignores the abort still ends, and text it yields afterwards is neither posted nor stored; the next question in the same session works; both providers' ids; the meeting deleted during the wait (final write finds no meeting) → no `chat/end`; the log line holds `end`, `firstEventMs`, `firstTextMs`, `totalMs` for a complete, a stopped, a panel-closed, a failed and a no-answer turn and no question, answer, transcript text or key
- [X] T102 Implement T101 in `src/entrypoints/background/chat-session.ts`: `FIRST_TEXT_LIMIT_MS`, `ChatSessionDeps.firstTextLimitMs`, the first-text timer, reading the stream in a race with the abort signal, the log fields
- [X] T103 Write failing fixture-provider tests (`tests/unit/providers/chat/fixture-provider.test.ts`): scenario `silent` yields the model and then nothing until aborted, then ends without `done`
- [X] T104 Implement `silent` in `src/providers/chat/fixture-provider.ts`; e2e builds read the limit from `e2eChatFirstTextMs` (`src/entrypoints/background/e2e-chat-source.ts`, wired in `index.ts` under `MODE === 'e2e'` only)
- [X] T105 Write failing panel tests: `chat-thread.test.tsx` (a streaming turn with no text shows an `img` named `Waiting for the answer` inside the answer's place and no `Stopped`; it is gone once text exists, after Stop and after a failure; a `no-answer` turn is an `alert` reading `No answer came back. Ask again.` with `Try again`); `use-chat.test.tsx` (`chat/end` with `no-answer` hands the turn's question to `onReturn`, other failures do not, a stopped turn does not; a question queued behind it is then sent); `app-ask.test.tsx` (the `status` says `Waiting for the answer` only while a turn waits for its first text; after `no-answer` the question is in the box; text typed meanwhile is kept)
- [X] T106 Implement T105: `ChatThread.tsx` (mark), `useChat.ts` (return path), `AskArea.tsx` (status, empty-box rule), `ask.css` (dots, one line high, `prefers-reduced-motion`)
- [X] T107 Copy: `specs/006-panel-redesign/copy-review.md` (K45, dated note), `tests/fixtures/copy/copy-review.json` entry A10 (present and never-add), entry count in `tests/unit/copy/copy-review.test.ts`, Keep check in `tests/unit/copy/keep-strings.test.tsx`; written failing first
- [X] T108 Write the e2e (`tests/e2e/ask.spec.ts`, built extension, fixture provider): with a paced answer the waiting mark shows, and the turn is exactly as tall once the first word has replaced it; with the provider `silent` and the limit set short the mark shows, then `No answer came back. Ask again.`, the question is back in the box, `Ask` is offered again and the page does not scroll (006 FR-023); axe passes with the mark showing (`a11y.spec.ts`). Written after T102–T106, so it was not seen failing first; it passes against the built e2e extension
- [X] T109 `CHANGELOG.md`; run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:e2e`, `pnpm test:e2e`
- [ ] T110 User: manual-check step 10a in a real call, and on the next question that gets no answer, copy the `chat answer` log line into `manual-check.md`

---

## Dependencies & execution order

- Phase 1 → Phase 2 → stories. T002/T003 can run alongside T001.
- Within Phase 2: T004–T005 and T008–T009 first (types); T010–T011 need T009; T012–T015 need T009; T016–T017 independent; T018–T019 need T001; T020–T021 need T002, T009.
- US1 (Phase 3) needs all of Phase 2. Inside: T022–T027 (core) in parallel; T028–T029 need T020; T030–T031 need T023, T025, T029 (or the fixture provider), T013, T017; T032–T033 need T031; T034–T047 panel tasks need T011, T013; T047 needs the FR-001 answer; T048–T049 last.
- US2 needs T025, T023, T031, T041. US3 needs T020, T031, T041–T043; its setup tasks need T058–T061 and T065. US4 needs T025, T039.
- Polish after the stories it covers; T082 last.

## Parallel examples

- Phase 2: T004, T006, T008, T016, T018 together (different files); then T010, T012, T014, T020.
- US1: T022, T024, T026, T028 together; then T034, T036, T038, T040, T042, T044 together once T031 is green.
- US3: T056, T058, T060, T062, T064 together; then T068 and T070.

## Implementation strategy

- **MVP**: Phases 1–4 (US1 + US2): asking with grounded, cited answers from Claude, proven on fixtures. A real meeting needs a chat key, which arrives with US3's setup step; take T058–T061, T065 and the setup tasks right after Phase 4 if a real check is wanted before the rest of US3.
- **Increment 2**: US3 (setup step, OpenAI, full settings, retention disclosure) — the point at which the user can install and use it end to end.
- **Increment 3**: US4 and polish; then the real-meeting check.
- Suggested worktree split (CLAUDE.md rule 6): Phase 2 core/storage (T004–T017) and the provider adapters (T020–T021, T028–T029, T056–T057) are independent of the panel tasks and can run as separate worktree subagents; the panel tasks (T034–T047, T060–T065) share `App.tsx` and run on one branch.
