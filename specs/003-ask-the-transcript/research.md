# Research: Ask the transcript

Phase 0 for `plan.md`. Each entry: decision, rationale, alternatives. Sources checked 2026-10-09; anything marked **verify at implementation** is re-checked against the live page when its task runs, and the recorded fixtures are refreshed from it.

## R1. Where chat requests are made: the service worker

**Decision**: The service worker makes every chat request. The side panel opens a long-lived port named `chat` and sends `chat/ask` and `chat/stop`; the service worker reads the transcript and chat from IndexedDB, reads the key from `chrome.storage.local`, calls the provider, and posts each text delta back over the port while writing the answer to IndexedDB. The panel never holds a key (spec FR-014a, 001 FR-003a, decision 31).

**Rationale**:
- Keys stay where the ElevenLabs key already lives; the panel's `PanelSettingsStore` and the lint rule that forbids it from importing `SettingsStore` stay valid unchanged.
- Service-worker lifetime (developer.chrome.com, "The extension service worker lifecycle"): 30 s idle termination, reset by extension events and API calls; since Chrome 114 every message sent over a long-lived port keeps the worker alive; a `fetch()` whose response takes more than 30 s to *arrive* ends the worker. A streamed answer posts a port message per delta, so the worker stays alive while it streams; the response headers arrive in about a second (R4 turns thinking off or down), well inside 30 s.
- The offscreen document only exists while a meeting runs (001), and asking about a stopped meeting is in scope (spec Clarifications), so it cannot host chat. Keeping chat out of the offscreen document also keeps any provider failure away from transcription (FR-018).

**Consequences**:
- If the panel closes mid-answer, the port disconnects; the worker aborts the request and stores the answer as `stopped` (spec edge case). Without the panel's messages the worker would be idle-terminated anyway, so continuing in the background is not reliable.
- If the worker is terminated for any other reason mid-stream, the panel sees the port disconnect; the stored turn still says `streaming`. On the next `chat/ask` or panel open the worker marks any `streaming` turn older than 60 s without an update as `stopped` (data-model "Answer status").

**Alternatives**: Calling from the side panel with the `anthropic-dangerous-direct-browser-access` header — rejected: the panel would have to read the key. Calling from the offscreen document — rejected above.

## R2. Library: the official SDKs, injected `fetch`, explicit base URLs

**Decision**: `@anthropic-ai/sdk` and `openai` in the service worker, each constructed per request with `apiKey`, `dangerouslyAllowBrowser: true` (the worker is a browser-like runtime; for Anthropic this also sends the `anthropic-dangerous-direct-browser-access: true` header its CORS check requires), an explicit `baseURL` constant (`ANTHROPIC_BASE_URL = 'https://api.anthropic.com'`, `OPENAI_BASE_URL = 'https://api.openai.com/v1'`), `maxRetries: 0` (the user retries; no hidden repeat of a transcript send), and an injected `fetch` so tests feed recorded SSE bodies. Only `src/providers/chat/` imports either SDK (ESLint `no-restricted-imports` elsewhere).

**Rationale**: The project's Claude API guidance is to use the official SDK in a TypeScript project rather than hand-rolling HTTP. Both SDKs parse SSE, expose typed errors with HTTP status and error type, support `AbortSignal`, and accept a custom `fetch` — which makes recorded-fixture tests straightforward (constitution III). Explicit base URLs keep every network destination visible to the privacy guard (R10).

**Cost**: two runtime dependencies (constitution VI: justified by FR-011/FR-012). They are bundled into the service worker chunk only; the side panel bundle does not grow. **Verify at implementation**: both SDKs run in an MV3 service worker (no `window`); if either fails there, its adapter falls back to `fetch` plus a 40-line SSE reader behind the same `ChatProvider` contract, with the same fixtures.

**Alternatives**: Raw `fetch` for both, as the ElevenLabs code does — viable and smaller, kept as the fallback; rejected as the default because SSE parsing, error typing and refusal/incomplete handling are exactly what the SDKs maintain as the APIs change.

## R3. Curated model lists and defaults

**Decision** (fixed dropdowns, decision 21):

| Provider | Label in Settings | Model ID | Context window | Max input (our budget) | Max output | Price in / out per MTok | Source |
|---|---|---|---|---|---|---|---|
| Claude | Claude Sonnet 5.5 (Claude's default) | `claude-sonnet-5-5` | 1M | 1M shared with output → 996K with our 4K output | 128K | $2 / $10, cache reads $0.20 | [models overview](https://platform.claude.com/docs/en/about-claude/models/overview) |
| Claude | Claude Opus 5.5 | `claude-opus-5-5` | 1M | 996K | 128K | $4 / $20 | models overview |
| Claude | Claude Haiku 5.5 | `claude-haiku-5-5` | 1M | 996K | 128K | $0.10 / $0.50 up to 100K-token prompts, $0.50 / $2.50 above | [Haiku 5.5 page](https://platform.claude.com/docs/en/models/haiku-5-5/overview) (released 2026-10-07) |
| OpenAI | GPT-6.1 Sol | `gpt-6.1-sol` | 1.05M | 922K | 128K | $2 / $10, cached $0.10; ×2 input above 272K | [gpt-6.1-sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) |
| OpenAI | GPT-6 Astra | `gpt-6-astra` | 1.05M | 922K | 128K | $10 / $50, cached $1; ×2 input above 272K | [gpt-6-astra](https://developers.openai.com/api/docs/models/gpt-6-astra) |
| OpenAI | GPT-6 Luna (default) | `gpt-6-luna` | 1.05M | 922K | 128K | $0.10 / $0.50, cached $0.01 | [gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna) |

Every ID re-checked against the official pages on 2026-10-09 (user request). Anthropic's models overview lists the current lineup as Claude Fable 5.1 (`claude-fable-5-1`), Claude Opus 5.5, Claude Sonnet 5.5 and Claude Haiku 5.5 (`claude-haiku-5-5`), all 1M context and 128K output; Claude Haiku 4.5 (`claude-haiku-4-5-20251001`, 200K context) is listed under legacy models. The coordinator's note that there is no Haiku 5.5 does not match the official page, so Haiku 5.5 stays in the list. Fable 5.1 ($10 / $50) is left out: it is built for long agentic work and costs 5× the default per question. Anthropic does not publish a separate input limit; the 1M window holds input plus output, so the budget is 1M minus `max_tokens`. OpenAI publishes max input 922K for all three; Astra's reasoning effort values are low, medium, high, xhigh and max (no default stated).

**Rationale**: three per provider — balanced, strongest, cheapest — is enough choice for a personal tool (VI). The plan first made Claude Sonnet 5.5 the default and GPT-6.1 Sol OpenAI's; the user changed it on 2026-10-09 (constitution v1.1.1, design decision 40): OpenAI GPT-6 Luna is the default and setup preselects OpenAI. Claude Sonnet 5.5 stays Claude's default model.

The list lives in one core module (`src/core/chat/models.ts`) with label, ID, provider, `maxInputTokens`, and request options (R4). A stored model ID that is no longer in the list (removed by an app update) reads as that provider's default.

## R4. Request shape per provider

**Anthropic** (`client.messages.stream`, Messages API):
- `system`: the fixed grounding prompt (R7), identical for every request.
- `messages`: alternating `user` / `assistant` turns built by the context builder (R5). Assistant turns are replayed as plain text.
- `max_tokens: 4000` (answers are chat-length; a hit is shown as "cut off", FR-018).
- `cache_control: { type: 'ephemeral' }` at the top level (automatic caching, R6).
- Thinking and effort, chosen for first-words latency (SC-001) on a retrieval-style task:
  - Sonnet 5.5: `thinking: { type: 'between_tools' }` (thinking off; `{type:'disabled'}` is a 400 on this model) with `output_config: { effort: 'high' }` or lower — use `low`.
  - Opus 5.5: thinking cannot be turned off; omit `thinking`, `output_config: { effort: 'low' }`.
  - Haiku 5.5: `thinking: { type: 'disabled' }` (accepted at effort `high` or below), `effort: 'low'`.
- Refusal fallback (verified 2026-10-09 against [Refusals and fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback)): on Sonnet 5.5 and Opus 5.5, `fallbacks: 'default'` with beta header `server-side-fallback-2026-07-01` (beta, Claude API only), so a safety decline is retried by Anthropic on its recommended model for that refusal category inside the same call; categories with no recommended fallback still end in `refusal`. On a streaming request the retry happens on the same stream: a decline before output makes `message_start` name the fallback model; a decline mid-output closes the open block and adds a `fallback` content block whose `to.model` names the serving model, which then continues from the partial text. The adapter emits `model` from `message_start` and again from a `fallback` block's `to.model`, so the answer shows the model that actually wrote it (FR-015). Haiku 5.5 has no server-side fallback; its `stop_reason: 'refusal'` becomes the "declined" error.
- Stream events used: `content_block_delta` with `delta.type === 'text_delta'` → text; final `message_delta.delta.stop_reason`: `end_turn` → complete, `max_tokens` → cut off, `refusal` → declined (any partial text is discarded from the answer and the turn shows the declined error). Thinking blocks, if any arrive (Opus), are ignored and not stored.
- Errors (typed, by status): 401 → `invalid-key`; 403 → `forbidden`; 402 → `billing`; 404 → `model-unavailable`; 413, or 400 whose message says the prompt is too long → `too-large`; 429 → `rate-limited`; 500 → `unavailable`; 529 → `overloaded`; network/`APIConnectionError` → `network`; abort → stopped, not an error.

**OpenAI** (`client.responses.create({ stream: true })`, Responses API):
- `instructions`: the same grounding prompt; `input`: the same turns as `user` / `assistant` messages.
- `store: false` (OpenAI then keeps no application state; abuse-monitoring logs still up to 30 days — R11).
- `max_output_tokens: 4000`; `reasoning: { effort }`: Sol `low` (its lowest), Luna `none`, Astra `low` (verify).
- Caching: implicit mode (default) — OpenAI places the breakpoint at the end of the latest message; no `prompt_cache_key` (it would add a per-meeting identifier and is optional from GPT-5.6 on).
- Stream events used: `response.output_text.delta` (`delta`) → text; `response.completed` → complete; `response.incomplete` with `incomplete_details.reason: 'max_output_tokens'` → cut off, `'content_filter'` → declined; refusal content (`response.refusal.delta`) → declined; `response.failed` / `error` → mapped like HTTP errors. **Verify at implementation**: the exact wire names of `response.incomplete`, `response.failed` and refusal events against the streaming-events reference, and record fixtures from it.
- Errors: 401 → `invalid-key`; 403 → `forbidden`; 404 → `model-unavailable`; 429 with `insufficient_quota` → `billing`, otherwise `rate-limited`; 400 `context_length_exceeded` → `too-large`; 5xx → `unavailable`; network → `network`.
- **Verified 2026-10-09 (T002)** against the `openai` 7.31.0 type definitions (`resources/responses/responses.d.ts`): `response.incomplete` (with `response.incomplete_details.reason` one of `max_output_tokens`, `max_messages`, `content_filter`, `steered`), `response.failed` (with `response.error.code`), `response.refusal.delta` / `response.refusal.done`, and a mid-stream `error` event (`code`, `message`, `param`). The recorded fixtures in `tests/fixtures/chat/openai/` use these names. The Anthropic fallback fixtures follow the documented stream shape: no dedicated SSE event, the switch arrives as an ordinary `content_block_start` / `content_block_stop` pair of type `fallback` with `from.model` and `to.model`.

**Key check (FR-013)**: one free, content-free request with the candidate key — Anthropic `models.list({ limit: 1 })`, OpenAI `models.list()` — 200 → valid; 401 → rejected; 403 → not allowed; network → couldn't reach. No transcript or chat is sent (FR-017).

## R5. Context layout: append-only turns with corrections

**Decision**: The conversation sent to the model is append-only. Each question's `user` turn is:

1. a transcript block holding every finished line not yet sent in this meeting's chat, plus every line already sent whose rendered form (`[time] Label: text`) has changed since (a late caption name, a rename, an override); then
2. the question.

The first turn's block starts with a fixed header naming the user; later blocks start with a fixed one-line header. The exact transcript block sent with each question is stored on that question (data-model `ChatTurn.contextBlock` and `sentLines`), so every later request replays earlier turns byte-for-byte and the cache prefix never changes.

**Rationale**:
- FR-002 needs the current labels; 002 renames lines after the fact (late captions within about 10 s, renames any time). Re-sending only the changed lines, after the earlier ones, keeps the model's view current without editing earlier turns — an edit would invalidate the cache from that point (Claude API caching is a byte-prefix match).
- The system prompt tells the model that a line restated later with the same timestamp replaces the earlier version (R7).
- A rename-everywhere restates every line of that speaker once; that costs one block of tokens, then caches like any other.

**Alternatives**: (a) the whole transcript first, then the chat — simplest, but every new transcript line during a live meeting changes the first message, so the whole conversation is re-written to the cache on every question (a 1.25× write of everything each time instead of a 0.1× read); (b) a rebuild whenever anything earlier changed — rejected in favour of corrections, which give the same view with no rebuild.

## R6. Prompt caching

**Decision**: Anthropic: top-level automatic caching (`cache_control: {type: 'ephemeral'}`, 5-minute TTL). OpenAI: implicit caching (on by default). No keep-alive and no 1-hour TTL.

**Rationale**:
- With R5's append-only layout, automatic caching places the breakpoint on the last block of each request; the next question's request contains that prefix unchanged plus one assistant turn and one user turn (2 positions, far inside the 20-block lookback), so it reads the whole earlier conversation from cache. The minimum cacheable prefix on the current Claude models is 512 tokens; a first question over a few minutes of transcript already exceeds it.
- Economics (Sonnet 5.5): cache write 1.25× of $2/MTok, read $0.20/MTok. A two-hour meeting (~40K tokens) costs about $0.10 to send uncached and $0.01 from cache. Questions in a meeting are often more than 5 minutes apart, in which case the entry has expired and the request pays the write once more; the 1-hour TTL (2× write) or a keep-alive would only pay off with several questions per hour, and a keep-alive would send transcript in the background, which FR-017 forbids.
- Verification: the adapter returns `usage` (cache read / write tokens) in its `done` event; the service worker logs the counts (numbers only) through the redacting logger, and the manual check confirms reads on a second question within 5 minutes.

## R7. Grounding prompt and citation format

**Decision**: one fixed system prompt (`src/core/chat/prompt.ts`), no per-meeting or per-request content, so it is byte-identical across requests. Its rules:

1. You answer questions about a meeting using only its transcript, given in the user turns as lines `[time] Speaker: text`. `time` is `mm:ss` from the meeting start, or `h:mm:ss` after an hour.
2. A line given again later with the same time and a different speaker or text replaces the earlier version.
3. Speaker names are as identified. "Others" means a speaker who was not identified; it can be several people, including the person asking. Never say an "Others" line was said by a named person; you may say "someone (not identified) said…". The person asking is named in the first transcript block.
4. Support every statement about the meeting with the time of the line(s) it relies on, in square brackets, exactly as written at the start of those lines, e.g. `[12:40]` or `[1:05:12]`; several are written as `[12:40] [13:05]`. Never cite a time that is not at the start of a line. Cite a line only if that line itself says what the statement claims.
5. The earlier questions and answers of this chat are not the transcript. Something known only from them (e.g. what the person asked you earlier) gets no citation. If an earlier answer said something is not in the transcript, check all the lines again before repeating it. (Added after the real call 2026-10-09, plan.md "Fixes after real call".)
6. If the transcript does not contain the answer, say so plainly in one sentence (in English: "That isn't in the transcript so far."). If only part is covered, answer that part and say which part is not in the transcript. Never guess or fill gaps from general knowledge about the people or the company. This does not apply to what a term or concept that came up in the meeting means (rule 7).
7. When asked what a term or concept that came up in the meeting means, answer it: cite where it came up and what was said there, then explain it in its own sentence or paragraph starting with "Background:" (translated into the answer's language), with no citation, even if no one in the meeting explained it; never answer such a question with the not-in-transcript sentence when the term came up. Background may be added to other answers too. (Was a permissive "You may explain" that rule 6 overrode in the real call.)
8. Write in the language of the question, even if the transcript is in another language. Quote transcript lines in their original language.
9. Plain text only: short paragraphs or lines starting with "- ". No headings, bold, tables or code blocks. Be brief.

The first transcript block header: `Transcript of the meeting so far. The person asking is {userName}.` Later headers: `Transcript lines added or changed since the previous question:` or, when none, `No new transcript lines since the previous question.` (English, fixed: the model handles language per rule 8).

**Citation parsing** (`src/core/chat/citations.ts`): tokens matching `\[(\d{1,3}):([0-5]\d)(?::([0-5]\d))?\]` are candidates. `[m:ss]` with m ≥ 60 is normalised to `h:mm:ss` (`[75:12]` → 1:15:12). A candidate links to the first segment (meeting order) whose `formatOffset(startMs)` equals it; if none, it renders as plain text (FR-005). Matching runs on the current segments at render time, so a citation to a line that later scrolls in still resolves. Quotation guard (real call 2026-10-09): a citation group whose sentence quotes text (`"…"`, `“…”`, `«…»`) that none of the cited lines contains, ignoring case and punctuation and treating an ellipsis as a gap, renders as plain text too; a sentence without a well-formed quotation, or with any quotation the cited lines contain, keeps its links.

Feature 008 widens rule 1 to the notes of the person asking and appends the notes rules after rule 9 (`specs/008-meeting-context/research.md` N5).

**Rationale**: the citation format equals what the panel already shows (`formatOffset`), so a user can also find a citation by eye; exact matching against shown times keeps "matches no line" well defined. Rules 3 and 6 carry Principle II and red-team trap 1 into the prompt. Rule 9 avoids a Markdown renderer (VI) — the panel shows text with line breaks preserved.

**Quality check**: the prompt's effect on SC-002/003/005 cannot be tested without a live model; automated tests assert the prompt's rules are present and the request carries them, and a user-run evaluation (R12) scores live answers.

## R8. Long meetings and context limits (FR-019)

**Decision**: Before sending, the service worker estimates the request's input tokens as `ceil(chars / 2.5)` over system prompt plus all turns (a deliberate over-estimate: Greek and mixed text tokenise denser than English) and compares it with the model's budget from R3: 1,000,000 − 4,000 = 996,000 for the Claude models (input and output share the 1M window); 922,000 published max input for the OpenAI models. Over budget → no request; the turn fails with `too-large` ("The meeting is too long to send to {model} in full."). A provider's own too-large rejection maps to the same kind. Nothing is ever truncated or summarised.

**Rationale**: a three-hour meeting is ~30K words, ~60K tokens even with the over-estimate — under a tenth of every budget — so the guard exists for correctness, not as an expected path. An exact `count_tokens` call would add a round trip before every answer for no practical gain. OpenAI's long-prompt pricing (×2 above 272K on Sol) is not reached by realistic meetings either.

## R9. Panel placement (spec FR-001)

**Decision** (user, 2026-10-09, design decision 38; was the recommendation): a question box pinned under the transcript on the 006 main view. Once there is a conversation, the exchanges show in a strip between the transcript and the box: it opens to the latest exchange, is at most about 40% of the panel height (older exchanges scroll inside it), and can be collapsed to one line showing the latest question. Clicking a citation scrolls the transcript above and highlights the line; the answer stays where it is.

**Why**: decision 32 gave the transcript the panel and passed over tabs; the bottom dock keeps the transcript the largest region and keeps answer and cited line visible together (SC-004). A Transcript | Ask tab switch would hide one whenever the user follows a citation.

The UI contract (`contracts/ask-ui.md`) is written for this layout.

## R10. Manifest and privacy guard

**Decision**:
- `host_permissions`: `['https://api.elevenlabs.io/*', 'https://api.anthropic.com/*', 'https://api.openai.com/*']`, required (not optional). With host permission the service worker's requests are exempt from CORS; Anthropic additionally requires the direct-browser-access header (R2).
- `tests/unit/privacy/no-secrets.test.ts`: the network allowlist becomes the three hosts; `ALLOWED_DESTINATIONS` admits SDK clients constructed only with `baseURL: ANTHROPIC_BASE_URL | OPENAI_BASE_URL`; a source scan fails on any `baseURL` that is not one of those constants; the manifest assertion becomes the three-host list; the real-looking-key scan adds the Anthropic (`sk-ant-…`) and OpenAI (`sk-…`, `sk-proj-…`) shapes for tracked files and the built extension.
- Constitution I already allows "the user's selected chat model provider". Content goes only to the selected provider and only on a question; a key check goes to the provider whose key is being checked and carries no content.

**Alternatives**: `optional_host_permissions` requested when a key is saved — fewer install-time warnings, but a second permission flow and a failure mode (permission denied) for a personal tool; rejected (VI).

## R11. What the providers retain (FR-016)

**Decision**: the Settings screen shows the disclosure for the selected provider only (strings in `contracts/ask-ui.md`):
- Anthropic: API inputs and outputs are deleted within 30 days; content flagged by its safety systems can be kept up to 2 years; API data is not used for training (privacy.claude.com article 7996866; platform.claude.com "API and data retention").
- OpenAI: requests are sent with storage off (`store: false`); abuse-monitoring logs are kept up to 30 days; API data is not used for training by default (developers.openai.com "Your data").

**Verify at implementation**: re-read both pages when writing the strings; the no-training statements were only partly visible in the search excerpts. If a page's wording differs, the string follows the page.

## R12. Evaluation without keys in CI

**Decision**: automated tests (Vitest, Playwright) use recorded SSE fixtures for both providers (`tests/fixtures/chat/`) and assert the requests (prompt rules present, layout, caching field, `store:false`, no key in any message). Answer quality (SC-002, SC-003, SC-005) is measured by a user-run harness, `pnpm eval:ask` (`spikes/ask-eval.ts`, same key rule as the spikes: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` from the shell, never a file), over an evaluation set of synthetic and redacted transcripts with questions tagged `supported` (with the line times that support it), `absent`, `partial`, `background`, and language `en`/`el`. It scores: citation precision against the tagged times (SC-002), "not in the transcript" detection for `absent` (SC-003, by the presence of no citation plus the localised phrase family), and answer language by script (SC-005). Results go to `spikes/data/` (gitignored) and a summary into `manual-check.md`.

## R13. Storage: chat in IndexedDB, written by the service worker

**Decision**: IndexedDB schema v2 adds a `chatTurns` store (key `id`, index `meetingId` and `[meetingId, seq]`). The service worker is its only writer during asking; `MeetingRepo.deleteMeeting` deletes the meeting's chat turns in the same transaction (Principle I, FR-022). The panel reads the chat for the meeting it shows on open and on `chat/*` port events.

**Rationale**: constitution "Storage: meeting history (transcript, labels, chat) in IndexedDB" and decision 6; 004 then reuses the same store for history. The upgrade from v1 only creates the store (no data migration). Every extension context opens the database with the same version constant, so after an update all contexts run the same code; each connection closes itself on `versionchange` so a lingering old page cannot block the upgrade.

## R14. Keys: separate storage keys per provider

**Decision**: new `chrome.storage.local` keys `anthropicCredential`, `openaiCredential` (saved keys, plain strings) and `pendingAnthropicCredential`, `pendingOpenaiCredential` (write-only candidate slots), separate from the existing `credentials` object.

**Rationale**: the existing `SettingsStore.readCredentials()` keeps only `elevenLabsApiKey` and `promotePendingKey()` writes the object back, so chat keys stored inside `credentials` would be wiped whenever the ElevenLabs key is replaced. Separate keys also let the panel remove one provider's key with a single `remove` (it can never read-modify-write a credential object). The panel gets hints through a new `settings/chat-key-hints` command and validation through `settings/validate-chat-key`, mirroring 001's ElevenLabs flow.

## R15. Second question while streaming (FR-009)

**Decision**: the panel holds at most one waiting question. Pressing Ask while an answer streams adds the question to the conversation as waiting; when the answer completes or is stopped, the panel sends it. The service worker accepts one `chat/ask` per meeting at a time and replies `busy` to another (defence in depth).

## R16. Chat provider and key in first-run setup (spec FR-011a, design decision 39)

**Decision** (user, 2026-10-09): setup gains a chat step on the same form as the name and the ElevenLabs key: a `radiogroup` `Answers from` (OpenAI preselected, design decision 40), one key field labelled for the chosen provider, and the chosen provider's retention disclosure next to ElevenLabs'. On submit the panel writes both candidates to their write-only slots and asks the service worker to check each (`settings/validate-key`, then `settings/validate-chat-key`); setup completes only when both pass, saving `firstRunComplete: true` and `chat.setupComplete: true` with the chosen provider. A failed check names the failing key and keeps the other one if it passed (a passed key is already promoted; re-submitting re-checks only what is still missing). After success, the saved screen shows both keys masked.

**Existing installs**: `chat.setupComplete` defaults to `false`, so an install set up before 003 sees setup once with only the chat step (provider, key, disclosure). The flag, not key presence, decides this, so removing a chat key later in Settings never brings setup back; it only disables Ask (FR-011a). Start's readiness (`isReadyToStart`) is unchanged: the chat key is required to finish setup, not to transcribe.

**Rationale**: the user wants the provider ready from the beginning; reusing the ElevenLabs key pattern (write-only pending slot, service-worker check, masked hint) keeps FR-014a intact and adds no new mechanism. Showing the provider disclosure before its key is entered puts constitution I's truthful-retention statement in front of the user at the moment of choice.

**Alternatives**: a separate setup screen after the ElevenLabs step — one more screen for the same pattern; rejected. Gating setup on key presence — would re-open setup after a deliberate key removal; rejected.
