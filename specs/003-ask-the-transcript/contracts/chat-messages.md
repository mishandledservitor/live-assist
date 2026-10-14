# Contract: chat messages (side panel ↔ service worker)

Extends `src/core/messaging/protocol.ts`; every message is validated at the receiving boundary (`parse*` functions), and `containsSecretField` must be false for every message the service worker sends.

## Commands (`chrome.runtime.sendMessage`, panel → service worker, one reply)

| Command | Reply | Notes |
|---|---|---|
| `{ type: 'settings/chat-key-hints' }` | `{ anthropic: string \| null; openai: string \| null }` | last four characters only |
| `{ type: 'settings/validate-chat-key'; provider }` | `{ ok: true; hint: string } \| { ok: false; kind: 'invalid-key' \| 'forbidden' \| 'network' \| 'unknown' \| 'missing-key' }` | reads `pending{Provider}Credential`, runs `checkKey`, promotes on success, discards on failure — same shape as 001's `settings/validate-key` |

First-run setup (research R16) uses the same two commands as Settings: it writes the chat candidate and sends `settings/validate-chat-key` after the ElevenLabs check.

Writing a candidate (`pending…Credential`, one `set`) and removing a key (one `remove` of saved + pending) are done by the panel's `PanelSettingsStore` directly; neither reads anything.

## Port `chat` (`chrome.runtime.connect({ name: 'chat' })`)

Accepted only from the extension's own side panel page (`sender.id === chrome.runtime.id` and `sender.url` is the side panel URL).

Panel → service worker:

| Message | Effect |
|---|---|
| `{ type: 'chat/ask'; meetingId: string; question: string }` | question trimmed, 1–2,000 chars; one active ask per port (another → `chat/rejected{busy}`) |
| `{ type: 'chat/stop'; turnId: string }` | aborts that turn's request; turn ends `stopped` |

Service worker → panel:

| Message | When |
|---|---|
| `{ type: 'chat/rejected'; kind: 'empty-transcript' \| 'missing-key' \| 'busy' \| 'unknown-meeting' }` | before any turn or request exists |
| `{ type: 'chat/turn'; turn: ChatTurnView }` | turn created (status `streaming`, or `failed` for `too-large`) |
| `{ type: 'chat/model'; turnId; model: string }` | the answering model is known |
| `{ type: 'chat/delta'; turnId; text: string }` | each text delta, in order |
| `{ type: 'chat/end'; turnId; status: 'complete' \| 'cut-off' \| 'stopped' \| 'failed'; error: ChatErrorKind \| null }` | final; the stored turn already has this state. `failed` with `error: 'no-answer'` when no answer text started within the limit (FR-018a) |

`ChatTurnView` is `ChatTurn` without `contextBlock` and `sentLines` (the panel never needs the prompt text).

Port disconnect (panel closed) → the service worker aborts any active request and stores the turn as `stopped`.

## Live updates the panel does not get from this port

The panel reads `chatTurns` for the meeting it shows from IndexedDB when the meeting changes and when the panel opens; port events patch that state. Delete transcript removes the turns in the same repo transaction as the meeting.

## Notes (008)

The notes commands (`context/set`, `context/remove`) and the notes steps of this flow (load the meeting's notes record, `buildNotes`, store `notesSent`, the `notes` log flag) are in `specs/008-meeting-context/contracts/notes-messages.md`.

## Service-worker flow for `chat/ask` (tested with fakes)

1. Mark stale `streaming` turns `stopped` (data-model).
2. Load meeting, finished segments, replayable turns; no meeting → `unknown-meeting`; no finished segment → `empty-transcript`.
3. Read chat settings; `ChatCredentialSource.providerFor(selected)`; null → `missing-key`.
4. Build context (data-model "Context build"); estimate tokens; over budget → store a `failed{too-large}` turn and send `chat/turn` + `chat/end`.
5. Store the new turn `streaming`; send `chat/turn`; stream from the provider, posting `chat/model` / `chat/delta`, writing the answer at most every 250 ms.
5a. First-text limit (FR-018a, design decision 80): as the request is handed to the provider, one timer of `FIRST_TEXT_LIMIT_MS` (45,000; `chat-session.ts`, the injected `timers`) starts. The first `text` event cancels it; `model` events do not. If it fires while the request is still running and no text has arrived, the request is aborted and the turn ends `failed` with `no-answer`. It does nothing when the request was already aborted (Stop, panel closed, meeting deleted) or text has started, so a turn has one outcome. The session stops reading the provider's stream the moment the request is aborted, so a provider that ignores the abort cannot hold the turn open and text arriving afterwards is discarded.
6. On `done` / error / abort: store the final state; send `chat/end`; log via `createLogger` only: `status`, `kind`, `model`, `notes`, usage counts, and (FR-018b) `end` (`done`, `stopped`, `panel-closed`, `no-first-text`, `error`), `firstEventMs` (request sent → the provider's first event of any kind, null if none), `firstTextMs` (request sent → first answer text, null if none) and `totalMs`. Never a question, answer, transcript line or key.

The panel (FR-018a): on `chat/end` with `error: 'no-answer'` the question of that turn goes back into the box through the same path as a `chat/rejected` question, and only into a box that is empty.

e2e builds only: the limit is read from the test's `e2eChatFirstTextMs` storage value when it is a number, so a test does not wait 45 s; the fixture scenario `silent` sends the model's name and then nothing.
