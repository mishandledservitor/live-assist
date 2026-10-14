# Implementation Plan: Ask the transcript

**Branch**: `003-ask-plan` (planning; implementation on its own worktree branch) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-ask-the-transcript/spec.md`

## Summary

A question typed on the side panel's main view goes over a `chat` port to the service worker, which holds the Claude and OpenAI keys. The worker reads the meeting's finished lines and earlier questions from IndexedDB, builds an append-only conversation (each question carries only the transcript lines that are new or whose label changed since the previous question), and streams the answer from the selected provider through the official SDK, posting each delta to the panel and writing the turn to a new `chatTurns` store. Anthropic requests use automatic prompt caching, so a follow-up within five minutes reads the earlier conversation from cache; OpenAI caches implicitly and is called with `store: false`. A fixed grounding prompt requires `[mm:ss]` / `[h:mm:ss]` citations copied from line starts, a plain "not in the transcript", "Others" never turned into a name, and the question's language. The panel turns citations that match a shown line into buttons that scroll and highlight it. First-run setup gains a required chat step — OpenAI (preselected) or Claude plus its key, checked by the service worker and shown masked, beside the ElevenLabs key (decision 39, research R16). Settings get the provider choice, a fixed model list per provider (OpenAI GPT-6 Luna the overall default, design decision 40; Claude Sonnet 5.5 Claude's default), key fields that the panel can write but never read, and the selected provider's retention disclosure, which setup shows too. The conversation sits in a collapsible strip above a question box pinned under the transcript (decision 38). Details: [research.md](research.md) R1–R15, [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.9 strict (as 001).

**Primary Dependencies**: as 001 (WXT 0.21.x, React 19, idb 8) plus `@anthropic-ai/sdk` and `openai` (latest stable at implementation, pinned exactly), imported only from `src/providers/chat/` and bundled into the service worker only (research R2).

**Storage**: IndexedDB schema v2 adds `chatTurns` (R13). `chrome.storage.local`: `settings.chat` (provider, model per provider) and four credential keys (R14); never `storage.sync`.

**Testing**: Vitest — core (context builder, prompt, citations, token estimate, models, settings parse), provider adapters and the shared contract suite against recorded SSE fixtures (`tests/fixtures/chat/{anthropic,openai}/*.sse`), protocol validators, chat repo and DB upgrade (fake-indexeddb), the service-worker chat session with a fake provider and fake port, panel hooks and components (jsdom). Playwright — e2e build with a fixture chat provider: ask, stream, cite, stop, settings, axe. Privacy guard and copy scanner extended. User-run `pnpm eval:ask` for answer quality (R12).

**Target Platform**: Chrome ≥ 116 desktop (as 001).

**Project Type**: Browser extension (single project).

**Performance Goals**: first words ≤ 3 s for a 30-minute meeting in ≥ 90% of attempts (SC-001: thinking off or low effort, R4); citation scroll ≤ 0.5 s (SC-004); answer persistence at most every 250 ms while streaming.

**Constraints**: keys only in the service worker (FR-014a); content only to the selected provider, only on a question (FR-017); no truncation (FR-019); transcription unaffected by chat failures (FR-018); copy per `embody-dont-announce` (decision 33).

**Scale/Scope**: one user; meetings up to ~3 h (~60K tokens, under 7% of every model budget); a few to a few dozen questions per meeting.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | Transcript and chat go only to the selected provider and only on `chat/ask` (FR-017); key checks carry no content. Two new host permissions, both chat providers named in the constitution (R10). Keys in `chrome.storage.local` under separate keys, read only by the service worker; the panel writes a candidate and gets the last four characters (R14, FR-014a); the lint rule and the privacy guard cover the new keys and the Anthropic/OpenAI key shapes. OpenAI called with `store: false`. Setup shows the chosen provider's retention disclosure before its key is entered (R16). Chat deleted with the meeting in one transaction (FR-022). Truthful retention disclosure per provider (R11). |
| II. Grounded Answers, Raw Records | Pass | Full transcript so far in every request (R5); citations in the transcript's own format — the constitution's `[mm:ss]` is read as the transcript's timestamp notation, which 001's `formatOffset` writes as `h:mm:ss` from one hour (its doc comment already ties that to 003's citations), and a model's `[75:12]` still resolves, linked only on an exact match, else plain text (R7); "not in the transcript" rule; "Others" never named (FR-002a, red-team trap 1). Chat stored in its own store, never in segments or exports (FR-020). |
| III. Test-First with Fixtures | Pass | Recorded SSE fixtures per provider and case (C1–C14); fake provider for the service worker and e2e; no key or network in CI. Quality via user-run eval; real-meeting check in `manual-check.md`. Every task is red → green → refactor. |
| IV. Degrade Visibly | Pass | Ask area shows the model and any problem state; each error names the problem and keeps the question for retry (FR-015, FR-018); chat runs in the service worker, apart from the offscreen document, so it cannot disturb transcription. Chat provider state is shown in the Ask area rather than as a fifth status dot (the status line's four dots stay per 006). |
| V. Isolate the Fragile Edges | Pass | `ChatProvider` contract in core; vendor wire formats only in `src/providers/chat/`; the SDKs importable only there; `ChatCredentialSource` lets a company backend relay chat later (FR-021). |
| VI. Smallest Useful v1 | Pass with note | Two new dependencies (justified in R2, fallback to raw fetch noted); no Markdown renderer (plain-text answers, R7); no keep-alive, no token counting call, no optional permission flow. Recorded in Complexity Tracking. |

**Post-design re-check (after Phase 1)**: unchanged. The one open item is the placement question (FR-001), which changes layout only.

## Project Structure

### Documentation (this feature)

```text
specs/003-ask-the-transcript/
├── spec.md                 # updated 2026-10-09
├── plan.md                 # this file
├── research.md             # R1–R15
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-provider.md
│   ├── chat-messages.md
│   └── ask-ui.md
├── checklists/requirements.md
├── manual-check.md         # created during implement
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── core/chat/
│   ├── provider.ts             # NEW ChatProvider, ChatRequest, ChatEvent, ChatError, ChatErrorKind, ChatCredentialSource
│   ├── models.ts               # NEW curated lists, defaults, budgets, per-model request options, modelLabel()
│   ├── prompt.ts               # NEW GROUNDING_PROMPT, block headers
│   ├── context.ts              # NEW renderLine(), buildContext(), buildRequest(), estimateTokens()
│   ├── citations.ts            # NEW parseAnswer(), normaliseTime()
│   ├── turn.ts                 # NEW ChatTurn, AnswerStatus, replayable(), stale rule
│   └── messages.ts             # NEW error texts for the panel (ask-ui strings)
├── core/settings/schema.ts     # + chat: ChatSettings, parse with defaults
├── core/messaging/protocol.ts  # + chat commands, chat port messages, parsers, containsSecretField coverage
├── providers/chat/
│   ├── anthropic.ts            # NEW Anthropic adapter (SDK, injected fetch, R4)
│   ├── openai.ts               # NEW OpenAI adapter (SDK, injected fetch, R4)
│   ├── fixture-provider.ts     # NEW scripted provider for tests and the e2e build
│   ├── factory.ts              # NEW createChatProvider(provider, key, fetch)
│   └── base-urls.ts            # NEW ANTHROPIC_BASE_URL, OPENAI_BASE_URL
├── providers/credentials/
│   └── local-chat-key-source.ts  # NEW LocalChatKeySource implements ChatCredentialSource (status, providerFor)
├── storage/
│   ├── db.ts                   # v2: chatTurns store, versionchange close
│   ├── chat-repo.ts            # NEW ChatRepo
│   ├── meeting-repo.ts         # deleteMeeting also deletes chat turns
│   ├── preferences-store.ts    # + writePendingChatKey(provider), removeChatKey(provider)
│   └── settings-store.ts       # + chat key read/promote/discard/hints (service worker only)
└── entrypoints/
    ├── background/
    │   ├── chat-session.ts     # NEW chat/ask flow (contracts/chat-messages.md), deps injected
    │   ├── chat-keys.ts        # NEW validate-chat-key, chat-key-hints
    │   └── index.ts            # + chat port listener, two commands; e2e mode wires the fixture provider
    └── sidepanel/
        ├── chat-api.ts         # NEW ChatApi: port, commands, IndexedDB reads
        ├── hooks/useChat.ts    # NEW chat view state, waiting question, port events
        ├── components/AskDock.tsx        # NEW question box, Ask/Stop, model label, notices
        ├── components/ChatThread.tsx     # NEW turns strip, collapse toggle
        ├── components/AnswerText.tsx     # NEW text + citation buttons
        ├── components/ChatSettings.tsx   # NEW provider, model, two key sections
        ├── components/ChatRetention.tsx  # NEW selected provider's disclosure (Settings and setup)
        ├── components/Setup.tsx          # + chat step: provider, key, disclosure; chat-only step for older installs
        ├── components/Transcript.tsx     # + data-segment-id, scrollToSegment/highlight
        ├── components/ask.css            # NEW styles (kept out of style.css)
        ├── App.tsx                       # + AskDock/ChatThread in MainView, chat settings in SettingsScreen
        └── main.tsx                      # wires chatApi
wxt.config.ts                   # + host_permissions api.anthropic.com, api.openai.com
eslint.config.js                # SDK imports only in providers/chat; panel may not read *Credential keys
spikes/ask-eval.ts              # NEW user-run evaluation (R12); package.json script eval:ask

tests/
├── fixtures/chat/anthropic/*.sse, openai/*.sse, eval/*.json, meetings/*.json
├── contract/chat-provider.contract.ts
├── unit/core/chat/{models,prompt,context,citations,turn,messages}.test.ts
├── unit/core/settings/schema.test.ts            # + chat
├── unit/core/messaging/protocol.test.ts         # + chat
├── unit/providers/chat/{anthropic,openai,factory}.test.ts
├── unit/background/{chat-keys}.test.ts
├── integration/storage/{chat-repo,db-upgrade}.test.ts, meeting-repo.test.ts (+ chat delete)
├── integration/background/chat-session.test.ts
├── unit/sidepanel/{chat-api,use-chat,ask-dock,chat-thread,answer-text,chat-settings,chat-retention,transcript-cite}.test.tsx
├── unit/privacy/no-secrets.test.ts              # hosts, base URLs, key shapes
├── unit/lint/boundaries.test.ts                 # + SDK and credential rules
├── unit/copy/copy-review.test.ts + fixtures/copy/copy-review.json   # + A-entries from ask-ui.md
└── e2e/ask.spec.ts, e2e/a11y.spec.ts (+ Ask)
```

**Structure Decision**: same layering as 001/005: vendor wire formats in `providers/`, pure logic in `core/`, `chrome.*` only in entrypoints, panel UI in its own components and stylesheet. Shared files (`App.tsx`, `main.tsx`, `protocol.ts`, `db.ts`, `index.ts`) change by small, additive edits so the concurrent `002-late-captions` branch (which touches labels and the transcript) merges cleanly; `Transcript.tsx` gets only an id attribute and a scroll/highlight hook.

## User decisions (2026-10-09)

1. **Placement (spec FR-001)**: question box pinned under the transcript, conversation in a collapsible strip above it (design decision 38, research R9).
2. **Chat key at first-run setup**: yes, a required setup step with the ElevenLabs-key pattern; Settings changes it later (design decision 39, research R16). The recommendation (no) was declined.

No open questions remain.

Decided in the plan without asking (reversible): service worker makes the calls (R1); official SDKs (R2); model lists (R3; the default changed by the user on 2026-10-09 to OpenAI GPT-6 Luna, design decision 40); thinking off / low effort for latency and Anthropic's server-side refusal fallback on Sonnet/Opus 5.5, verified in Anthropic's docs (R4); append-only context with corrections (R5); 5-minute automatic caching, no keep-alive (R6); answer stops when the panel closes (R1); required host permissions (R10).

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| Two SDK dependencies (`@anthropic-ai/sdk`, `openai`) | Streaming SSE parsing, typed errors, refusal/incomplete handling and abort for two vendor APIs (FR-003, FR-018) | Hand-written fetch + SSE parser per vendor duplicates maintained code; kept as the fallback if an SDK fails in the MV3 worker (R2) |
| IndexedDB schema bump to v2 | Chat stored with the meeting and deleted with it (FR-022, constitution Storage) | Keeping chat only in panel memory loses it when the panel closes mid-meeting; `chrome.storage.local` is not meant for growing per-meeting records and is not where meeting history lives |
| Service worker becomes a second IndexedDB writer (chat only) | Keys and requests live in the worker (FR-014a) | Routing every delta through the panel to write would lose answers when the panel closes; the offscreen document does not exist after Stop |

## Analyze pass (2026-10-09)

First run, before the user's answers: no CRITICAL findings. Two HIGH, fixed: the constitution's `[mm:ss]` against the transcript's `h:mm:ss` from one hour (read as the transcript's notation, recorded in the Constitution Check, `[75:12]` still resolving); and `ChatCredentialSource` defined but unused, which left FR-021's backend swap unproven (now `status` + `providerFor`, implemented by `LocalChatKeySource`, the only way the chat session and hints reach a provider). Four MEDIUM fixed (no-key notice variants, an FR-020 assertion, the retention disclosure's Settings wiring, the e2e key check via the fixture provider).

Second run, after the user's answers (placement approved; chat key as a required setup step) and the model re-verification: no CRITICAL or HIGH findings. Two MEDIUM fixed: setup must save the whole `chat` settings object so the shallow settings merge keeps each provider's model (T068); the 006 UI contract's Setup and main-view rows needed updating (T078). Checked and consistent: FR-011a covered by T068–T072 and the e2e setup test; FR-016's setup disclosure by T068; US3 scenario 6 (removing a key later) by T070; decision 38 by T047 and `contracts/ask-ui.md`. Model list re-verified against the official pages (research R3); Claude Haiku 5.5 is a current model on Anthropic's models overview, contrary to the note received, and stays. The refusal fallback is documented by Anthropic (`fallbacks: "default"`, beta header `server-side-fallback-2026-07-01`, Claude API only) and stays, with the streaming model switch handled (research R4). LOW, left: SC-001, SC-004 and SC-006 measured in the manual check (T082), not automated. Coverage: 24 of 24 functional requirements (FR-001–FR-022 with FR-002a, FR-011a, FR-014a) have at least one task; 82 tasks.

## Fixes after real call 2026-10-09

**Failure A (manual-check step 6).** A term was mentioned at 01:44 and the user asked "What does it mean?" at about 02:12 and again at 02:25; both answers were only "That isn't in the transcript so far.". A third, later answer cited [01:44] but still gave no meaning. Diagnosis: the context builder was not the cause. Every stored line is sent with the next question (FR-002); a line is stored before the panel shows it (`MeetingRuntime.store` writes, then emits), and the 01:57 line was a separate stored line, so the 01:44 line was committed and stored well before 02:12. A line still waiting for a name is sent as "Others" and restated when named; nothing drops it (T083 tests pin this). The cause was the prompt: rule 5 ("If the transcript does not contain the answer, say so … Never guess or fill gaps from general knowledge") was absolute, rule 6 ("You may explain a term") only permissive, so for "what does X mean" the model treated the meaning as missing from the transcript. The replayed wrong answer then anchored the repeat. Fix: rule 6 now says what to do for that question (cite where the term came up, then an uncited "Background:" explanation, never the not-in-transcript sentence when the term came up), rule 5 names the exception, and a new rule says an earlier "not in the transcript" answer is no reason to repeat it without checking the lines again.

**Failure B (new step 6b, SC-002).** The user asked the assistant to say a made-up word, then asked what that word was; the answer quoted it and cited an unrelated line. Cause: rule 4 required a citation on "every statement about the meeting" and nothing said the earlier questions and answers are not the transcript. Using the fact from the conversation was correct; only the citation was wrong, so the model keeps getting every earlier question and answer in full (user constraint; a test pins the replay). Fix in the prompt: the conversation is not the transcript; what is known only from it gets no citation; a citation goes only to a line that itself says what the statement claims.

**Deterministic guard (decided here, reversible).** A prompt cannot guarantee SC-002, and the citation parser can catch the clearest case without a model: a citation group whose sentence quotes something (`"…"`, `“…”`, `«…»`) that none of the cited lines contains is shown as plain text, like a time that matches no line (FR-005). Matching ignores case and punctuation and treats an ellipsis as a gap, and it fails open: a sentence without a well-formed quotation, or with any quotation the cited lines contain, keeps its links. It does not judge unquoted paraphrase (that stays with the prompt and the eval). Rejected: checking every citation for semantic support (needs a model, so not deterministic); stripping citations from the stored answer (the stored text must stay what the model wrote, and render-time parsing already exists). A quotation translated into another language would lose its link; rule 7 already says to quote lines in their original language.

**Eval.** `pnpm eval:ask` gains questions with earlier turns (replayed append-only, as the app does), a `conversation` tag (any citation fails), and background scoring (a cited mention plus an uncited background part). New synthetic set `term-mention`.

## Waiting state and first-word limit (2026-10-13, design decision 80)

Amendment after two questions hung in a real call (spec Clarifications 2026-10-13; FR-003a, FR-018a, FR-018b). No new dependency, no schema change, no new message type.

- **Where the limit lives**: `FIRST_TEXT_LIMIT_MS = 45_000` in `src/entrypoints/background/chat-session.ts`, the one place both providers' streams are consumed. The timer runs on the session's injected `timers`, so tests fire it by hand; the limit itself can be supplied through `ChatSessionDeps.firstTextLimitMs`, which only the e2e build sets (from the `e2eChatFirstTextMs` storage value). The adapters are untouched: for them it is an ordinary abort.
- **One outcome per turn**: the timer's callback does nothing once the request is aborted or text has started, so a clear that loses a race cannot produce a second outcome. The session reads the provider's stream in a race with the abort signal, so a stream that ignores the abort cannot hold the turn open, and anything it yields later is never read.
- **New kind, not a new status**: `no-answer` joins `ChatErrorKind` (`src/core/chat/provider.ts`); the turn is `failed` like any other, so storage, replay rules, the protocol validators and the failed-turn rendering apply unchanged.
- **Panel**: the waiting mark is derived from `status === 'streaming' && answer === ''` (`ChatThread`); `useChat` hands a `no-answer` turn's question to the existing `onReturn` path; `AskArea` fills the box only when it is empty and holds the visually hidden `status` outside the scrolling strip (006 FR-023: it adds nothing to any scroll area, and the `article`'s `aria-busy` cannot hold it back).
- **Log**: the existing `chat answer` line gains `end`, `firstEventMs`, `firstTextMs`, `totalMs` (numbers and a fixed tag only; constitution I). `firstEventMs` present with `firstTextMs` null means the provider answered the request and then sent no text; both null means nothing came back at all.
- **Constitution check**: I (no content or key in the log, nothing new sent), II (a failed turn has no answer text; nothing is invented or written to the transcript), III (session, hook and component tests with injected timers; e2e on the built extension with the fixture provider silent), IV (the wait and the failure are both visible, and the failure says what to do), V (the provider contract is unchanged), VI (no new permission or destination).
