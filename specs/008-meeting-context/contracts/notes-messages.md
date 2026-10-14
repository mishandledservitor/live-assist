# Contract: notes messages (side panel ↔ service worker) and request changes

Extends `src/core/messaging/protocol.ts` (003 `contracts/chat-messages.md`). Every message is validated at the receiving boundary.

## Commands (`chrome.runtime.sendMessage`, panel → service worker, one reply)

```ts
type NotesTargetMsg = { kind: 'next' } | { kind: 'meeting'; meetingId: string };

| { type: 'context/set'; target: NotesTargetMsg; notes: { name: string; source: 'file' | 'paste'; text: string } }
| { type: 'context/remove'; target: NotesTargetMsg }
```

| Command | Reply |
|---|---|
| `context/set` | `{ ok: true; version: number } \| { ok: false; kind: 'empty' \| 'too-long' \| 'not-text' \| 'wrong-type' \| 'unknown-meeting' \| 'save-failed' }` |
| `context/remove` | `{ ok: true } \| { ok: false; kind: 'unknown-meeting' \| 'save-failed' }` |

- `parseCommand` rejects a `context/set` whose `text` is not a string of 1–100,000 characters (after the core normalisation), whose `name` is not 1–255 characters, or whose file `name` does not end in `.txt` / `.md`; the service worker re-runs `validateNotes` and answers with the error kind instead of storing.
- A `meeting` target must name a stored meeting (`unknown-meeting` otherwise). `next` is accepted whether or not a meeting runs (the panel only offers it while none does).
- The offscreen document also receives these commands and ignores them; it never reads `meetingContexts`.
- Replies carry no notes text. The panel reads the stored record from IndexedDB after an `ok` reply.

## Service worker at Start (`meeting-control.ts`)

After `offscreen/begin` replies `ok` and the active meeting is recorded: `contexts.applyPending(meetingId, now)`. A failure is logged (kind only) and leaves the notes pending; Start still succeeds. `offscreen/begin` gains no field.

## Chat session (003 `chat-session.ts` flow, changed steps)

2a. Load the meeting's notes record with the turns (`ContextRepo.get(meetingId)`).
4. `buildContext` as 003; `buildNotes(record, earlier)`; `buildRequest({ …, notes: record })` puts replayed and new notes blocks on the user turns; the estimate counts them; over budget → `failed{too-large}` (the panel picks the notes wording when the meeting has notes).
5. The stored turn gets `notesSent`.
6. The log line gains `notes: 'none' | 'kept' | 'added' | 'replaced' | 'removed'` (what this request did), never a name or text.

## Provider adapters (003 `contracts/chat-provider.md`)

- Anthropic: a user turn's content is `[{type:'text', text: notes}]` (when present) followed by the existing context and question blocks.
- OpenAI: the same order with `input_text` parts.
- New request assertions: order notes → context → question; no notes block when `notes` is absent (003 bodies unchanged byte-for-byte); deterministic body with notes.

## Never

- No notes in `offscreen/begin`, the ElevenLabs token request, keyterms, the `live` port, segments, `Meeting`, the 007 download, logs, or any `ChatTurnView`.
