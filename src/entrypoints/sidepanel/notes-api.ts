// The side panel's notes (008 data-model "Panel state", contracts/notes-messages.md), behind one interface so the
// components are tested with fakes. Reads come from IndexedDB; every change goes through the service worker, which is
// the only writer. A file is decoded and checked here, before anything is sent.
import {
  MAX_NOTES_FILE_BYTES,
  NEXT_MEETING_KEY,
  decodeNotesFile,
  notesFromPaste,
  type MeetingContextRecord,
  type NotesErrorKind,
  type NotesInput,
  type NotesSource,
} from '../../core/chat/notes';
import {
  parseNotesRemoveReply,
  parseNotesSetReply,
  type Command,
  type NotesTarget,
} from '../../core/messaging/protocol';

export type { NotesTarget } from '../../core/messaging/protocol';

/** What the panel shows: the name, and the text only for pasted notes (to prefill the paste box). */
export interface NotesView {
  name: string;
  source: NotesSource;
  text?: string;
}

export type NotesActionResult = { ok: true } | { ok: false; kind: NotesErrorKind };

/** The part of a browser File the panel needs. */
export interface NotesFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface NotesApi {
  get(target: NotesTarget): Promise<NotesView | null>;
  addFile(target: NotesTarget, file: NotesFile): Promise<NotesActionResult>;
  paste(target: NotesTarget, text: string): Promise<NotesActionResult>;
  remove(target: NotesTarget): Promise<NotesActionResult>;
}

export interface NotesApiDeps {
  sendCommand(command: Command): Promise<unknown>;
  repo(): Promise<{ get(key: string): Promise<MeetingContextRecord | undefined> }>;
}

export const notesKey = (target: NotesTarget): string => (target.kind === 'next' ? NEXT_MEETING_KEY : target.meetingId);

export function createNotesApi(deps: NotesApiDeps): NotesApi {
  const send = async (command: Command): Promise<unknown> => {
    try {
      return await deps.sendCommand(command);
    } catch {
      return undefined;
    }
  };

  async function set(target: NotesTarget, notes: NotesInput): Promise<NotesActionResult> {
    const reply = parseNotesSetReply(await send({ type: 'context/set', target, notes }));
    if (reply.ok) return { ok: true };
    return { ok: false, kind: reply.kind === 'unknown-meeting' ? 'save-failed' : reply.kind };
  }

  return {
    async get(target) {
      const record = await (await deps.repo()).get(notesKey(target));
      const notes = record?.notes;
      if (!notes) return null;
      return notes.source === 'paste'
        ? { name: notes.name, source: notes.source, text: notes.text }
        : { name: notes.name, source: notes.source };
    },
    async addFile(target, file) {
      if (file.size > MAX_NOTES_FILE_BYTES) return { ok: false, kind: 'too-long' };
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        return { ok: false, kind: 'unreadable' };
      }
      const decoded = decodeNotesFile(file.name, bytes);
      return decoded.ok ? set(target, decoded.notes) : decoded;
    },
    async paste(target, text) {
      const notes = notesFromPaste(text);
      return notes.ok ? set(target, notes.notes) : notes;
    },
    async remove(target) {
      const reply = parseNotesRemoveReply(await send({ type: 'context/remove', target }));
      return reply.ok ? { ok: true } : { ok: false, kind: 'save-failed' };
    },
  };
}
