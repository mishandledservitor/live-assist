# Data model: Ask the transcript

Platform-free types live in `src/core/chat/`; storage in `src/storage/`. Builds on 001's `Meeting` / `TranscriptSegment` and 002's `displayLabel()` (`src/core/transcript/`).

## ChatSettings (in `Settings`, `chrome.storage.local` key `settings`)

```ts
type ChatProviderId = 'anthropic' | 'openai';

interface ChatSettings {
  provider: ChatProviderId;                 // default 'openai' (design decision 40)
  models: { anthropic: AnthropicModelId; openai: OpenAIModelId };  // defaults 'claude-sonnet-5-5', 'gpt-6-luna'
  /** The first-run setup step for chat is done (research R16, FR-011a). Default false, so installs set up before 003 see that step once. */
  setupComplete: boolean;
}
// Settings gains `chat: ChatSettings`; schemaVersion stays 1 (additive field, parsed with defaults).
```

Validation (`parseSettings`): a missing or malformed `chat` reads as the defaults (`setupComplete: false`); an unknown provider reads as the default provider, `openai`; a model ID not in that provider's curated list (R3) reads as that provider's default. No key ever appears here.

Setup gating (panel): the setup screen shows when `!firstRunComplete` (full setup: name, ElevenLabs key, chat step) or when `firstRunComplete && !chat.setupComplete` (chat step only). `isReadyToStart` is unchanged.

## Curated model (`src/core/chat/models.ts`)

```ts
interface ChatModel {
  id: string;                    // e.g. 'claude-sonnet-5-5'
  provider: ChatProviderId;
  label: string;                 // 'Claude Sonnet 5.5' — shown in Settings, the Ask area and on each answer
  isDefault: boolean;            // exactly one per provider
  maxInputTokens: number;        // R8 budget: Claude 996_000, OpenAI 922_000
  options: AnthropicOptions | OpenAIOptions;  // thinking / effort / fallback per R4
}
```

`modelLabel(id)` returns the label of a listed model, or the raw ID (for an answer written by a fallback model not in the list).

## Chat credentials (`chrome.storage.local`, service worker reads only)

| Key | Value | Written by | Read by |
|---|---|---|---|
| `anthropicCredential` | saved key (string) | service worker (promotion after a successful check) | service worker |
| `openaiCredential` | saved key (string) | service worker | service worker |
| `pendingAnthropicCredential` | candidate (string) | panel (one `set`) | service worker (check, then promote or discard) |
| `pendingOpenaiCredential` | candidate (string) | panel | service worker |

The panel removes a provider's key with one `remove([saved, pending])`. Hints (last four characters) reach the panel only through `settings/chat-key-hints`.

## ChatTurn (IndexedDB store `chatTurns`, schema v2)

One question and its answer.

```ts
interface ChatTurn {
  id: string;                    // `${meetingId}:chat:${seq}` (deterministic, idempotent writes)
  meetingId: string;
  seq: number;                   // 0, 1, 2… in asking order
  question: string;              // trimmed, 1–2,000 chars
  askedAt: number;               // epoch ms
  /** Exact transcript block sent with this question (R5); replayed byte-for-byte in later requests. */
  contextBlock: string;
  /** What this turn sent: segment id → rendered line, so the next turn can find new and changed lines. */
  sentLines: Record<string, string>;
  /** Transcript extent: the last segment's endMs included, for display/debugging. */
  transcriptUntilMs: number;
  provider: ChatProviderId;
  /** Model asked for. */
  requestedModel: string;
  /** Model that wrote the answer (differs after a server-side fallback); null until known. */
  answeredBy: string | null;
  answer: string;                // streamed text so far ('' until the first delta)
  status: AnswerStatus;
  error: ChatErrorKind | null;   // set when status = 'failed'
  /** 008: the notes block this turn carried, by version only (never the text); absent on 003 turns. */
  notesSent?: { version: number; kind: 'added' | 'replaced' | 'removed' } | null;
  updatedAt: number;
  schemaVersion: 1;
}

type AnswerStatus = 'streaming' | 'complete' | 'stopped' | 'cut-off' | 'failed';

type ChatErrorKind =
  | 'missing-key' | 'invalid-key' | 'forbidden' | 'billing' | 'model-unavailable'
  | 'rate-limited' | 'overloaded' | 'unavailable' | 'network'
  | 'too-large' | 'declined' | 'empty-transcript' | 'busy' | 'unknown'
  | 'no-answer';   // set by the chat session, never by a provider (FR-018a)
```

Indexes: `meetingId`; `meetingSeq` = `[meetingId, seq]`.

### State transitions

```
(new) ──ask──▶ streaming ──end_turn / completed──▶ complete
                   │──max_tokens / incomplete(max_output_tokens)──▶ cut-off   (answer kept)
                   │──user Stop / port disconnect──▶ stopped                 (answer kept)
                   │──provider error / refusal / too-large──▶ failed         (answer cleared for 'declined')
                   │──no answer text within 45 s of the request──▶ failed    (error 'no-answer'; answer is '')
                   └──stale (no update for 60 s, found on next ask or panel open)──▶ stopped
```

`empty-transcript`, `too-large` (estimate), `missing-key` and `busy` fail before any request; `empty-transcript`, `missing-key` and `busy` are answered without creating a turn (the panel shows the message beside the box), `too-large` creates a failed turn so the question can be retried after switching model.

`no-answer` (FR-018a, design decision 80): the service worker gives up on a request whose answer text has not started 45 s (`FIRST_TEXT_LIMIT_MS`) after it was sent. The stored turn is an ordinary failed turn with an empty answer; it is not replayed and its `sentLines` do not count as sent, so the resent question carries the same transcript lines again. A turn that is waiting has `status: 'streaming'` and `answer: ''`; nothing else marks it, and the panel derives the waiting mark from those two fields. The limit (45 s) is below `STALE_STREAMING_MS` (60 s), so a waiting turn is never taken for an orphan.

Retry (FR-018) creates a new turn with the same question; the failed turn stays in the conversation but is never replayed to the model (only `complete`, `cut-off` and `stopped` turns with a non-empty answer are replayed as assistant turns; a failed or empty turn's question is not replayed either, and its `sentLines` do not count as sent).

Writes: the service worker writes the turn on ask, then the answer at most every 250 ms while streaming and once at the end (bounded IndexedDB churn; a crash loses at most 250 ms of answer text).

## Context build (`src/core/chat/context.ts`, pure)

Inputs: the meeting (for `userName` and `speakerRenames`), its finished segments in meeting order, earlier replayable turns.

1. Render each segment: `[${formatOffset(startMs)}] ${label}: ${text}` where `label` is `displayLabel(segment, meeting).text` if confirmed, else `Others` (fallback and pending both, FR-002a). Newlines inside text are collapsed to spaces.
2. `known` = fold of earlier replayable turns' `sentLines` (later wins).
3. New block lines = every rendered segment whose id is absent from `known` or whose rendering differs, in meeting order.
4. Header: first replayable turn → `Transcript of the meeting so far. The person asking is ${userName}.`; later → `Transcript lines added or changed since the previous question:` or `No new transcript lines since the previous question.`
5. `contextBlock` = header + `\n` + lines joined by `\n`; `sentLines` = those lines by segment id.

Request turns = for each earlier replayable turn: `user` [`contextBlock`, `Question: ${question}`], `assistant` [`answer`]; then the new `user` turn. The `user` content is two text blocks (context, question) so the question never merges into the transcript text.

Validation: no request if there is no finished segment (`empty-transcript`); the R8 estimate over system + all turns must fit the model budget (`too-large`).

## Citation (`src/core/chat/citations.ts`, derived, not stored)

```ts
type AnswerPart =
  | { kind: 'text'; text: string }
  | { kind: 'citation'; label: string; segmentId: string }   // label as written, e.g. '12:40'
  | { kind: 'unmatched'; text: string };                      // '[99:99]' shown as plain text
```

`parseAnswer(answer, segments)` splits the answer into parts per R7 (normalising `[75:12]` to `1:15:12` for matching while keeping the written label); a citation group whose sentence quotes text none of its cited lines contains becomes `unmatched` too (R7 quotation guard).

## Panel chat state (`src/entrypoints/sidepanel/hooks/useChat.ts`)

```ts
interface ChatViewState {
  meetingId: string | null;
  turns: ChatTurn[];            // from IndexedDB, then patched by port events
  waiting: string | null;       // FR-009 queued question (R15)
  notice: ChatErrorKind | null; // pre-request failure shown beside the box (no turn)
  keyHints: { anthropic: string | null; openai: string | null };
}
```

## IndexedDB schema v2 (`src/storage/db.ts`)

`DB_VERSION` 1 → 2. Upgrade from <2 creates `chatTurns` with its two indexes; v1 stores untouched. Every `openLiveAssistDb` connection closes itself on `versionchange`. `MeetingRepo.deleteMeeting(id)` deletes meeting, segments and chat turns in one transaction. New `ChatRepo` (`src/storage/chat-repo.ts`): `listTurns(meetingId)`, `putTurn(turn)`, `nextSeq(meetingId)`, `markStaleStreaming(now)`.
