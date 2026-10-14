# Data model: Meeting context

Platform-free types in `src/core/chat/notes.ts`; storage in `src/storage/`. Naming: "notes" in the UI and in types; "context" only in the store (`meetingContexts`), repo and command names, after the feature's title. Builds on 003's `ChatTurn`, `ChatRequest` and context builder (`specs/003-ask-the-transcript/data-model.md`).

## MeetingNotes and the record (IndexedDB store `meetingContexts`, schema v3)

```ts
type NotesSource = 'file' | 'paste';

interface MeetingNotes {
  /** File name as picked (trimmed, 1–255 chars), or 'Pasted notes'. */
  name: string;
  source: NotesSource;
  /** UTF-8 text, BOM removed, line endings \n, 1–100,000 characters, not whitespace only. */
  text: string;
  addedAt: number;          // epoch ms
}

interface MeetingContextRecord {
  /** The meeting's id, or NEXT_MEETING_KEY ('next') for pending notes. */
  meetingId: string;
  /** 1 on the first add; +1 on every add, replace and remove (research N3). */
  version: number;
  /** null after a remove (tombstone: keeps the version, holds no text). */
  notes: MeetingNotes | null;
  updatedAt: number;
  schemaVersion: 1;
}

const NEXT_MEETING_KEY = 'next';
const MAX_NOTES_CHARS = 100_000;
const MAX_NOTES_FILE_BYTES = 400_000;
```

Rules:
- One record per meeting (keyPath `meetingId`).
- `set(target, notes)`: new version = (existing version ?? 0) + 1; writes `notes`.
- `remove(target)`: if a record exists, version + 1 and `notes: null`; for `next` the record is deleted instead (no question ever saw pending notes, so no tombstone is needed).
- `applyPending(meetingId)`: in one transaction, if `next` has notes, write them to `meetingId` with version 1 and delete `next`; otherwise do nothing. Called by the service worker after a successful start only.
- `MeetingRepo.deleteMeeting(id)` deletes the record in the same transaction as the meeting, segments and chat turns.

## Validation (`src/core/chat/notes.ts`, pure)

```ts
type NotesErrorKind = 'empty' | 'too-long' | 'not-text' | 'wrong-type' | 'unreadable' | 'save-failed';

function decodeNotesFile(name: string, bytes: Uint8Array): { ok: true; notes: Omit<MeetingNotes, 'addedAt'> } | { ok: false; kind: NotesErrorKind };
function notesFromPaste(text: string): { ok: true; notes: Omit<MeetingNotes, 'addedAt'> } | { ok: false; kind: NotesErrorKind };
function validateNotes(input: unknown): Omit<MeetingNotes, 'addedAt'> | null;   // boundary check in the service worker
```

Order of checks: research N7. `unreadable` is the panel's own (the browser could not read the file); `save-failed` is the command failing. The command reply may also say `unknown-meeting` (the meeting was deleted meanwhile); the panel shows it with the `save-failed` text.

## ChatTurn addition (003 store `chatTurns`, no version bump)

```ts
interface NotesSent {
  /** The notes record version this turn's block was built from. */
  version: number;
  kind: 'added' | 'replaced' | 'removed';
}

interface ChatTurn {
  // …003 fields unchanged…
  /** The notes block this turn carried, by reference only (never the text). null: no block. Absent on 003 turns, read as null. */
  notesSent: NotesSent | null;
}
```

`ChatTurnView` (what the panel gets) omits `notesSent` as it omits `contextBlock` and `sentLines`.

## ChatRequest addition (003 `contracts/chat-provider.md`)

```ts
type UserTurn = { role: 'user'; notes?: string; context: string; question: string };
```

Adapters send a user turn as text blocks in the order notes (when present), context, question. The same request still produces a byte-identical body.

## Notes build (`src/core/chat/notes.ts`, pure)

Inputs: the current record for the meeting (or none) and the meeting's earlier turns.

```ts
function notesBlock(kind: NotesSent['kind'], notes: MeetingNotes | null): string;      // research N4 texts
function replayNotes(turn: ChatTurn, current: MeetingContextRecord | null): string | undefined;
function buildNotes(current: MeetingContextRecord | null, earlier: readonly ChatTurn[]): { block?: string; sent: NotesSent | null };
```

- `replayNotes`: the block for `turn.notesSent` if the turn is replayable and `turn.notesSent.version === current?.version`, else `undefined`.
- `buildNotes`: research N4 steps 2–3 over the replayable earlier turns.

`buildRequest` (003 `context.ts`) takes `current` and puts `replayNotes(turn, current)` on each replayed user turn and `buildNotes(…).block` on the new one; `estimateTokens` adds every `notes` length.

## Too-large text (`src/core/chat/messages.ts`)

`chatErrorText('too-large', provider, model, { hasNotes })`: with notes, `The meeting and your notes are too long to send to {M} in full. Remove or shorten the notes.`; without, 003's text unchanged.

## Panel state (`src/entrypoints/sidepanel/hooks/useMeetingNotes.ts`)

```ts
type NotesTarget = { kind: 'next' } | { kind: 'meeting'; meetingId: string };

interface NotesViewState {
  notes: Pick<MeetingNotes, 'name' | 'source'> & { text?: string } | null;  // text only for pasted notes (prefill)
  busy: boolean;
  error: NotesErrorKind | null;
}
```

Loaded from IndexedDB when the target changes and after every command reply; the `next` target is also reloaded when a meeting starts (its pending notes moved).

## IndexedDB schema v3 (`src/storage/db.ts`)

`DB_VERSION` 2 → 3. Upgrade from < 3 creates `meetingContexts` (keyPath `meetingId`). v1/v2 stores untouched. New `ContextRepo` (`src/storage/context-repo.ts`): `get(key)`, `set(key, notes, now)`, `remove(key, now)`, `applyPending(meetingId, now)`.
