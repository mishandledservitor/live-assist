# Internal contracts: Past transcripts (012)

The seams between layers, as signatures and behaviour. Tests are written against these. No message type, port or permission is added: the side panel reads IndexedDB directly, as it already does for the stored meeting it shows.

## Core (`src/core/`, platform-free)

### `src/core/transcript/model.ts`

```ts
export interface MeetingSummary {
  v: 1;
  names: string[];
  fileLines: number;
  lastLineEndMs: number | null;
}

export interface Meeting {
  // … existing fields
  /** 012: row details derived from the lines; absent until the stopped meeting is first listed. */
  summary?: MeetingSummary;
}
```

### `src/core/history/meeting-summary.ts`

```ts
export const SUMMARY_VERSION = 1;
export type MeetingState = 'in-progress' | 'stopped' | 'interrupted';

export function summariseMeeting(meeting: Pick<Meeting, 'startedAt' | 'speakerRenames'>, segments: readonly TranscriptSegment[]): MeetingSummary;
/** The stored summary when it is current, else null. */
export function currentSummary(meeting: Pick<Meeting, 'summary'>): MeetingSummary | null;
export function meetingState(meeting: Pick<Meeting, 'id' | 'endedAt' | 'endReason'>, runningId: string | null): MeetingState;
export function meetingDurationMs(meeting: Pick<Meeting, 'startedAt' | 'endedAt'>, state: MeetingState, summary: MeetingSummary | null): number | null;
export function formatDuration(ms: number): string; // 'under 1 min' | '45 min' | '2 h' | '1 h 15 min'
export function formatMeetingDate(startedAt: number): string; // '7 Oct 2026'
export function formatMeetingTime(startedAt: number): string; // '14:30'
export function rowNames(names: readonly string[], max?: number): { shown: string[]; more: number }; // max defaults to 4
```

Pure, no `Date.now()`, local time through `Date` getters (as 007's `transcriptFileName`). `summariseMeeting` does not mutate its input.

### `src/core/history/main-view.ts`

```ts
export function showsOnMain(meeting: Pick<Meeting, 'startedAt'>, clearedAt: number | null): boolean;
```

### `src/core/export/meeting-files.ts`

```ts
export interface MeetingFile { kind: 'transcript'; name: string; body: string }
export interface MeetingFileSource {
  meeting: Pick<Meeting, 'startedAt' | 'speakerRenames'>;
  segments: readonly TranscriptSegment[];
}
/** Every file this meeting can be downloaded as, in saving order; empty when there is nothing to write. */
export function meetingFiles(source: MeetingFileSource): MeetingFile[];
```

In 012: `[]` or one file equal to `transcriptFile(meeting, segments)`. A later feature adds a file by widening `kind`, adding to `MeetingFileSource` and appending in this function; callers do not change.

## Storage (`src/storage/`)

### `MeetingRepo` (additions and changes)

```ts
/** Every stored meeting, newest first by startedAt. Rejects when the store cannot be read. */
listMeetings(): Promise<Meeting[]>;

/**
 * Reads the meeting and its lines and computes its summary in one readwrite transaction. Stores it on the record
 * only when the meeting has ended. Resolves null when the meeting does not exist.
 */
summarise(id: string, compute: (meeting: Meeting, segments: TranscriptSegment[]) => MeetingSummary): Promise<MeetingSummary | null>;
```

- `setSpeakerRename`: also removes `summary` from the record it writes.
- `setLabelOverride`: its transaction covers `segments` and `meetings`; after writing the line it removes `summary` from the meeting.
- `deleteMeeting`: unchanged (meeting, segments, chat turns, notes, one transaction).
- `latestMeeting`, `appendSegment`, `updateSegment`, `endMeeting`, `markOrphanedCrashed`: unchanged.

### `ChatRepo`

```ts
/** Writes the turn only while its meeting exists; resolves false, writing nothing, when it does not. */
putTurn(turn: ChatTurn): Promise<boolean>;
```

### `ContextRepo`

```ts
/** Adds or replaces the notes; resolves the new version, or null (writing nothing) when `key` is a meeting that does not exist. `next` is always written. */
set(key: string, notes: NotesInput, now: number): Promise<number | null>;
```

### `MainViewStore` (`src/storage/main-view-store.ts`, new)

```ts
export const MAIN_VIEW_CLEARED_KEY = 'mainViewClearedAt';
export class MainViewStore {
  constructor(area: StorageAreaLike, changes?: { subscribe(listener: (key: string) => void): () => void });
  /** null when absent or not a finite number. */
  clearedAt(): Promise<number | null>;
  clear(at: number): Promise<void>;
  /** Fires when the key changes, in any context; returns an unsubscriber. A no-op without `changes`. */
  onChange(listener: () => void): () => void;
}
```

## Background (`src/entrypoints/background/`)

- `chat-session.ts`: when the first `putTurn` of a question resolves false, post `chat/rejected` `unknown-meeting` and send nothing to a provider. When a later write resolves false, abort the stream; post nothing more for that turn. Nothing of the turn is stored either way.
- `context-commands.ts`: a `context/set` whose `ContextRepo.set` resolves null replies `{ ok: false, kind: 'unknown-meeting' }`.

No new command, reply kind or port.

## Side panel (`src/entrypoints/sidepanel/`)

### `transcripts-api.ts` (new)

```ts
export interface TranscriptsApi {
  /** Newest first. Rejects when storage cannot be read (→ P18). */
  list(): Promise<Meeting[]>;
  /** The meeting's row details, computed and cached; null when the meeting is gone. */
  summarise(id: string): Promise<MeetingSummary | null>;
  /** The meeting and every line, for reading and for downloading; null when the meeting is gone. */
  open(id: string): Promise<{ meeting: Meeting; segments: TranscriptSegment[] } | null>;
  /** Real deletion (MeetingRepo.deleteMeeting). */
  remove(id: string): Promise<void>;
}
export function createTranscriptsApi(deps: { repo(): Promise<Pick<MeetingRepo, 'listMeetings' | 'summarise' | 'getMeeting' | 'listSegments' | 'deleteMeeting'>> }): TranscriptsApi;
```

### `meeting-api.ts` (changes)

```ts
export interface MeetingApi {
  // … existing members
  /** 012: the meeting the main view showed was deleted; the main view shows no stored meeting until the next Start. */
  clearMainView(): Promise<void>;
  /** 012: the main view was cleared, here or in another window's panel; returns an unsubscriber. */
  onMainViewCleared(listener: () => void): () => void;
}
export interface MeetingApiDeps {
  // … existing members
  mainView: Pick<MainViewStore, 'clearedAt' | 'clear' | 'onChange'>;
  now(): number;
}
```

- `latestStored()` resolves `null` when the latest meeting does not pass `showsOnMain(meeting, await mainView.clearedAt())`. A `clearedAt()` that rejects counts as `null` (the meeting shows).
- `clearMainView()` calls `mainView.clear(now())`.
- `onMainViewCleared(listener)` is `mainView.onChange(listener)`.
- `deleteMeeting(id)`: unchanged.

### `save-file.ts`

```ts
export function saveFiles(files: readonly { name: string; body: string }[], save?: (name: string, body: string) => void): void;
```

### Components

```ts
// DownloadTranscript.tsx
interface DownloadTranscriptProps {
  /** Whether there is anything to save; the button is absent otherwise. */
  available: boolean;
  /** Builds the files on press only. */
  load(): MeetingFile[] | Promise<MeetingFile[]>;
  /** Accessible name when it differs from the visible `Download transcript` (a list row). */
  accessibleName?: string;
  save?: (name: string, body: string) => void;
}

// DeleteTranscript.tsx
interface DeleteTranscriptProps {
  remove(): Promise<void>;
  onDeleted(): void;
  /** Default: K6's text. */
  prompt?: string;
  accessibleName?: string;
  /** Controlled confirmation, for a list that allows one at a time; uncontrolled when absent. */
  confirming?: boolean;
  onConfirmingChange?(open: boolean): void;
}

// Transcript.tsx
interface TranscriptProps {
  // … existing props
  /** false: a stored transcript read from the top; no stick-to-bottom, scroller role `group`. Default true. */
  follow?: boolean;
}

// PanelHeader.tsx / StartControls.tsx
onOpenTranscripts?: (() => void) | undefined;
transcriptsRef?: Ref<HTMLButtonElement> | undefined;

// TranscriptsScreen.tsx (new)
interface TranscriptsScreenProps {
  api: TranscriptsApi;
  /** The meeting the live port reports as running, or null. */
  runningId: string | null;
  onBack(): void;
  /** The running meeting's row was selected. */
  onGoToRunning(): void;
  /** A meeting was deleted here. */
  onDeleted(id: string): void;
  headingRef: Ref<HTMLHeadingElement>;
  save?: (name: string, body: string) => void;
}

// App.tsx
<App … transcripts={transcriptsApi} />  // optional, like chat and notes; absent → no header control
```

`Panel` in `App.tsx`:

- Main-view delete succeeded → `await meetings.clearMainView()` (a rejection is swallowed) → `live.refresh()` → show Transcripts, focus its title.
- `TranscriptsScreen.onDeleted(id)` → when no meeting is running and `id` is the meeting the main view shows: `clearMainView()` then `live.refresh()`. Otherwise nothing.
- `meetings.onMainViewCleared` (wired in `main.tsx` from `chrome.storage.onChanged`) → `live.refresh()` when no meeting is running, so another window's panel drops a transcript deleted here.
- Back from Transcripts → main view, focus the `Transcripts` button.
