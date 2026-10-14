# Contract: storage, files and the zip (013)

Signatures and behaviour of the platform-free and storage seams. Extends 012's `contracts/internal-api.md` (`meetingFiles`, `saveFiles`, `DownloadTranscript`, `DeleteTranscript`).

## Core: captions (`src/core/captions/`)

```ts
// model.ts
export interface StoredCaptionTurn {
  meetingId: string; seq: number; startMs: number; speakerName: string; self: boolean; text: string; schemaVersion: 1;
}

// caption-log.ts
export const CAPTION_STORE_FLUSH_MS = 2000;
export const MAX_CAPTION_TURNS = 20_000;

export interface CaptionLogDeps {
  meetingId: string;
  /** Epoch ms of the meeting's clock zero. */
  startedAt: number;
  /** Writes the changed turns; false = the meeting is gone or has ended. */
  put(turns: StoredCaptionTurn[]): Promise<boolean>;
  /** The first kept turn of a caption name that is not the user's. */
  onSpeaker?(speakerName: string): void;
  /** The first successful write. */
  onKept?(): void;
  log: Logger;
}

export class CaptionLog {
  constructor(deps: CaptionLogDeps);
  update(event: CaptionText): void;
  /** Writes what is dirty now. Resolves when stored (or refused). */
  flush(): Promise<void>;
  /** Flushes, then accepts nothing more. Idempotent. */
  close(): Promise<void>;
}
```

Rules: data-model.md "Caption log". A failed write (the store rejects) leaves the turns dirty for the next flush and logs a message without any caption text or name; a refused write (`false`) closes the log. Flushes never overlap: one runs at a time, and a turn changed during a write is written by the next. `src/core/captions/` imports nothing outside `src/core/` (ESLint boundary), and nothing in `src/core/chat/`, `src/core/transcript/` or `src/core/speakers/` imports it.

## Core: files (`src/core/export/`)

```ts
// download-names.ts
export function meetingBaseName(startedAt: number): string;         // 'Meeting — DD-MM-YYYY at HHhMM', local time
export function transcriptDownloadName(startedAt: number): string;  // base + ' — Transcript.txt'
export function captionsFileName(startedAt: number): string;        // base + ' — Meet captions.txt'
export function downloadZipName(startedAt: number): string;         // base + '.zip'

// transcript-file.ts — unchanged API. transcriptFileName(startedAt) stays base + '.txt' (004's inbox name) and is built on meetingBaseName.

// captions-file.ts
export function captionSpeaker(turn: Pick<StoredCaptionTurn, 'speakerName' | 'self'>, meeting: Pick<Meeting, 'userName' | 'speakerRenames'>): string;
export function captionsFileLines(meeting: Pick<Meeting, 'userName' | 'speakerRenames'>, turns: readonly StoredCaptionTurn[]): string[];
export function captionsFile(meeting: Pick<Meeting, 'startedAt' | 'userName' | 'speakerRenames'>, turns: readonly StoredCaptionTurn[]): { name: string; body: string };

// meeting-files.ts
export interface MeetingFile { kind: 'transcript' | 'captions'; name: string; body: string }
export interface MeetingFileSource {
  meeting: Pick<Meeting, 'startedAt' | 'userName' | 'speakerRenames'>;
  segments: readonly TranscriptSegment[];
  captionTurns?: readonly StoredCaptionTurn[];
}
/** Transcript first, then captions; each only when it has a line. The transcript's name is transcriptDownloadName. */
export function meetingFiles(source: MeetingFileSource): MeetingFile[];

// meeting-download.ts
export interface MeetingDownload { name: string; type: 'text/plain;charset=utf-8' | 'application/zip'; data: string | Uint8Array<ArrayBuffer> }
/** What one press saves: null for no file, the one file as text, or a zip of two. `at` stamps the zip's entries. */
export function meetingDownload(source: MeetingFileSource, at: Date): MeetingDownload | null;

// zip.ts
export function crc32(bytes: Uint8Array): number;                    // unsigned 32-bit
export function zipStored(entries: readonly { name: string; data: Uint8Array }[], modifiedAt: Date): Uint8Array<ArrayBuffer>;
```

- `captionSpeaker`: research R8. Never returns "Others"; never applies a line override.
- `captionsFileLines`: turns sorted by `startMs`, then `seq`; a turn whose collapsed text is empty is skipped (cannot happen for stored rows; the formatter does not rely on it).
- `meetingFiles`: the transcript body equals `transcriptFile(meeting, segments).body`; its name does not (`— Transcript`). Nothing but the meeting, its lines and its caption turns can reach a file (constitution II): the source type has no field for chat or notes.
- `meetingDownload`: one file → `data` is the body string; two files → `data` is `zipStored` of both bodies encoded as UTF-8 (no byte-order mark), in `meetingFiles` order. Pure: the same source and `at` give the same bytes.
- All of `src/core/export/` uses `TextEncoder` only for UTF-8 encoding (a language built-in present in every context; if the core lint boundary objects, the encoder is passed in).

## The zip, byte for byte

Little-endian throughout. `n` = UTF-8 byte length of the entry name; `s` = byte length of the entry data; `crc` = CRC-32 of the data (APPNOTE 4.4.7); `time`/`date` = MS-DOS time and date of `modifiedAt` in local time (`time = h << 11 | m << 5 | s >> 1`, `date = (y − 1980) << 9 | mo << 5 | d`; a year before 1980 is written as 1980-01-01 00:00).

For each entry, a local file header then the data:

| Offset | Size | Value |
|---|---|---|
| 0 | 4 | `0x04034b50` |
| 4 | 2 | version needed: 20 |
| 6 | 2 | flags: `0x0800` (bit 11, UTF-8 names) |
| 8 | 2 | method: 0 (stored) |
| 10 | 2 | time |
| 12 | 2 | date |
| 14 | 4 | crc |
| 18 | 4 | compressed size: `s` |
| 22 | 4 | uncompressed size: `s` |
| 26 | 2 | name length: `n` |
| 28 | 2 | extra length: 0 |
| 30 | n | name, UTF-8 |

Then, for each entry in the same order, a central directory header:

| Offset | Size | Value |
|---|---|---|
| 0 | 4 | `0x02014b50` |
| 4 | 2 | version made by: `0x0314` (Unix, 2.0) |
| 6 | 2 | version needed: 20 |
| 8 | 2 | flags: `0x0800` |
| 10 | 2 | method: 0 |
| 12 | 2 | time |
| 14 | 2 | date |
| 16 | 4 | crc |
| 20 | 4 | `s` |
| 24 | 4 | `s` |
| 28 | 2 | `n` |
| 30 | 2 | extra length: 0 |
| 32 | 2 | comment length: 0 |
| 34 | 2 | disk number: 0 |
| 36 | 2 | internal attributes: 0 |
| 38 | 4 | external attributes: `0o100644 << 16` (`0x81A40000`) |
| 42 | 4 | offset of the entry's local header |
| 46 | n | name, UTF-8 |

Then the end of central directory record: `0x06054b50`; disk 0; directory disk 0; entries on this disk; entries total; directory size; directory offset; comment length 0 (22 bytes).

Not written: data descriptors, extra fields, zip64 records, comments, directories. Names are used as given: no path separators are added, and `zipStored` throws on an empty name, a name containing `/` or `\`, more than 65,535 entries, or an entry or archive of 4 GiB or more (none can occur here; the checks keep a wrong archive from being written silently).

**Known-good archive**: `tests/fixtures/zip/known-good.zip`, written by `tests/fixtures/zip/make-known-good.py` with Python's `zipfile` (`ZIP_STORED`, `ZipInfo.create_system = 3`, `external_attr = 0o100644 << 16`, a fixed `date_time`), from two entries named `Σύσκεψη — 07-10-2026 at 14h30 — Transcript.txt` and `Σύσκεψη — 07-10-2026 at 14h30 — Meet captions.txt` with invented Greek and English bodies. `zipStored` on the same inputs must equal it byte for byte. The script is run by hand when the fixture is made, and the fixture is checked once with `unzip -t` and `ditto -x -k` before it is committed; CI never runs Python.

## Storage (`src/storage/`)

```ts
// db.ts
export const DB_VERSION = 4;   // 4: adds `captionTurns` (013)
// LiveAssistSchema gains:
captionTurns: { key: [string, number]; value: StoredCaptionTurn };
// upgrade: if (oldVersion < 4) db.createObjectStore('captionTurns', { keyPath: ['meetingId', 'seq'] });

// meeting-repo.ts
/**
 * Writes the turns only while their meeting exists and has not ended; sets Meeting.hasCaptions with the first.
 * One transaction over `meetings` and `captionTurns`. Resolves false, writing nothing, otherwise. Every turn must
 * carry `meetingId`; an empty list resolves true and writes nothing.
 */
putCaptionTurns(meetingId: string, turns: readonly StoredCaptionTurn[]): Promise<boolean>;
/** The meeting's turns in `seq` order; [] when it has none. */
listCaptionTurns(meetingId: string): Promise<StoredCaptionTurn[]>;
```

- `deleteMeeting`: its transaction adds `captionTurns` and deletes `IDBKeyRange.bound([id, -Infinity], [id, Infinity])` there.
- `withoutSummary`, `endMeeting`, `setSpeakerRename`, `summarise` keep `hasCaptions` because they write back the record they read.
- No other store changes. `ChatRepo` and `ContextRepo` open the same version.

## Side panel (`src/entrypoints/sidepanel/`)

```ts
// save-file.ts
export type SaveBlob = (name: string, data: BlobPart, type: string) => void;
export const saveBlob: SaveBlob;   // the one anchor download: a local blob, one click, the URL freed later
export function saveDownload(download: MeetingDownload, save?: SaveBlob): void;
// saveFiles (012) and saveTextFile (007) are removed with their last callers. (Changed with the implementation,
// 2026-10-12: the plan kept saveTextFile "for callers that save text"; none was left.)

// components/DownloadTranscript.tsx
interface DownloadTranscriptProps {
  available: boolean;
  /** Builds the download on press only; null or a rejection saves nothing. */
  load(): MeetingDownload | null | Promise<MeetingDownload | null>;
  accessibleName?: string;
  save?: SaveBlob;
}

// meeting-api.ts
interface MeetingApi {
  // … existing members
  /** The meeting's stored caption turns, read at the moment of a download; [] when it has none. Rejects when storage cannot be read. */
  captionTurns(meetingId: string): Promise<StoredCaptionTurn[]>;
}

// Withdrawn 2026-10-13 (decision 79): ConsentDialog's `platform` prop, MeetingApi.startPlatform() and
// MeetingApiDeps.activeTabUrl(). ConsentDialog and the Start flow are what they were before 013.

// transcripts-api.ts (012)
open(id): Promise<{ meeting: Meeting; segments: TranscriptSegment[]; captionTurns: StoredCaptionTurn[] } | null>;
// captionTurns is [] without reading the store when the meeting has no `hasCaptions`; a store that cannot be read rejects.

// components/MeetingRow.tsx, components/PastTranscript.tsx (012)
// MeetingRow:     load(id: string): Promise<MeetingDownload | null>   (was loadFiles)
// PastTranscript: load(): Promise<MeetingDownload | null>             (new; it no longer builds a file itself)
```

Call sites:

- **Main view** (`App.tsx`): `available = hasTranscriptFileLines(segments) || meeting.hasCaptions === true`; `load = async () => meetingDownload({ meeting, segments, captionTurns: meeting.hasCaptions ? await meetings.captionTurns(meeting.id) : [] }, new Date())`; `DeleteTranscript` gets `prompt={C3}` when `meeting.hasCaptions`. `useLive` sets `hasCaptions` on its meeting when `live/captions-kept` arrives for it.
- **Transcripts screen** (012's `MeetingRow`, `PastTranscript`, `TranscriptsScreen`): Download is present when `summary.fileLines > 0 || meeting.hasCaptions === true`; its `load` opens the meeting and calls `meetingDownload`; the confirmation is C4 when `meeting.hasCaptions`, else P13. `PastTranscript` with no line keeps `Nothing was transcribed.` and shows Download beside Delete when the meeting has captions. One `load` in `TranscriptsScreen` serves the rows and the single-meeting view, so both read the meeting again at the press and save the same file (FR-019); the view's state holds the meeting and its lines, never its caption turns. (Changed with the implementation, 2026-10-12: in 012 the single-meeting view built its file from the lines on screen without reading storage.)
- **Start** (`StartControls.tsx`): unchanged by this feature. Start shows the reminder at once when its setting is on and starts on acknowledge; the tab's platform is not asked. (Amended 2026-10-13, decision 79. The 2026-10-12 build asked `api.startPlatform()` before the reminder and again on acknowledge.)
- The caption turns a `load` reads are used for that one download and dropped; they are never put in React state, a ref that outlives the press, or a prop.
