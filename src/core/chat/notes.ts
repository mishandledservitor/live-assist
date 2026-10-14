// Meeting notes (008 data-model): the user's own material for a meeting, kept apart from what was said. Pure.
// The limits and names live here only, so a change to a default (spec A1–A4) is one edit.
import { replayable, type ChatTurn, type NotesSent } from './turn';

export type NotesSource = 'file' | 'paste';

export interface MeetingNotes {
  /** File name as picked (trimmed), or PASTED_NOTES_NAME. */
  name: string;
  source: NotesSource;
  /** UTF-8 text, BOM removed, line endings \n, not whitespace only, at most MAX_NOTES_CHARS code points. */
  text: string;
  addedAt: number;
}

export type NotesInput = Omit<MeetingNotes, 'addedAt'>;

export interface MeetingContextRecord {
  /** The meeting's id, or NEXT_MEETING_KEY for notes waiting for the next Start. */
  meetingId: string;
  /** 1 on the first add; +1 on every add, replace and remove (research N3). */
  version: number;
  /** null after a remove: the record keeps only the version. */
  notes: MeetingNotes | null;
  updatedAt: number;
  schemaVersion: 1;
}

/** Spec A2. */
export const MAX_NOTES_CHARS = 100_000;
/** The most MAX_NOTES_CHARS code points can take in UTF-8; anything larger is refused unread. */
export const MAX_NOTES_FILE_BYTES = MAX_NOTES_CHARS * 4;
export const MAX_NOTES_NAME_CHARS = 255;
/** Spec A1. */
export const PASTED_NOTES_NAME = 'Pasted notes';
export const NEXT_MEETING_KEY = 'next';
/** Spec decision 51. */
export const NOTES_FILE_EXTENSIONS: readonly string[] = ['.txt', '.md'];

export type NotesErrorKind = 'empty' | 'too-long' | 'not-text' | 'wrong-type' | 'unreadable' | 'save-failed';

export type NotesResult = { ok: true; notes: NotesInput } | { ok: false; kind: NotesErrorKind };

const hasAllowedExtension = (name: string) => NOTES_FILE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

const normaliseLineEndings = (text: string) => text.replace(/\r\n?/g, '\n');

function checkText(text: string): NotesErrorKind | null {
  if (text.includes('\u0000')) return 'not-text';
  if (text.trim() === '') return 'empty';
  let count = 0;
  for (const _ of text) if (++count > MAX_NOTES_CHARS) return 'too-long';
  return null;
}

function checkName(name: string): boolean {
  return name.length > 0 && name.length <= MAX_NOTES_NAME_CHARS && hasAllowedExtension(name);
}

/** A picked file's bytes → notes, in the order of research N7. */
export function decodeNotesFile(rawName: string, bytes: Uint8Array): NotesResult {
  const name = rawName.trim();
  if (!checkName(name)) return { ok: false, kind: 'wrong-type' };
  if (bytes.byteLength > MAX_NOTES_FILE_BYTES) return { ok: false, kind: 'too-long' };
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, kind: 'not-text' };
  }
  const text = normaliseLineEndings(decoded);
  const problem = checkText(text);
  return problem ? { ok: false, kind: problem } : { ok: true, notes: { name, source: 'file', text } };
}

export function notesFromPaste(raw: string): NotesResult {
  const text = normaliseLineEndings(raw.replace(/^\uFEFF/, ''));
  const problem = checkText(text);
  return problem
    ? { ok: false, kind: problem }
    : { ok: true, notes: { name: PASTED_NOTES_NAME, source: 'paste', text } };
}

/** The service worker's boundary check of what the panel sent (contracts/notes-messages.md). */
export function validateNotes(input: unknown): NotesResult {
  if (typeof input !== 'object' || input === null) return { ok: false, kind: 'not-text' };
  const { name, source, text } = input as Record<string, unknown>;
  if (typeof name !== 'string' || typeof text !== 'string' || (source !== 'file' && source !== 'paste'))
    return { ok: false, kind: 'not-text' };
  const trimmed = name.trim();
  if (source === 'file' ? !checkName(trimmed) : trimmed !== PASTED_NOTES_NAME) return { ok: false, kind: 'wrong-type' };
  const normalised = normaliseLineEndings(text.replace(/^\uFEFF/, ''));
  const problem = checkText(normalised);
  return problem ? { ok: false, kind: problem } : { ok: true, notes: { name: trimmed, source, text: normalised } };
}

// ── What a question tells the model about the notes (research N4) ──

/** Block texts, English and fixed: the model translates the "From your notes:" label itself (prompt rules). */
export function notesBlock(kind: NotesSent['kind'], notes: Pick<MeetingNotes, 'name' | 'text'> | null): string {
  if (kind === 'removed' || notes === null)
    return 'The person asking removed their notes. Earlier notes, and anything earlier answers took from them, no longer apply.';
  if (kind === 'replaced')
    return `Notes from the person asking, replacing their earlier notes (${notes.name}). They were not said in the meeting; earlier notes no longer apply.\n${notes.text}`;
  return `Notes from the person asking (${notes.name}). They were not said in the meeting.\n${notes.text}`;
}

/** An earlier turn's notes block, rebuilt from the current record; only while the notes are the version it carried. */
export function replayNotes(turn: ChatTurn, current: MeetingContextRecord | undefined): string | undefined {
  const sent = turn.notesSent ?? null;
  if (!sent || !current || !replayable(turn) || sent.version !== current.version) return undefined;
  return notesBlock(sent.kind, current.notes);
}

/** The block (if any) the next question carries, and what to store on its turn. */
export function buildNotes(
  current: MeetingContextRecord | undefined,
  earlier: readonly ChatTurn[],
): { block?: string; sent: NotesSent | null } {
  if (!current) return { sent: null };
  const announced = earlier.filter((t) => replayable(t) && t.notesSent);
  // Already told: the turn that carried this version replays its block.
  if (announced.some((t) => t.notesSent?.version === current.version)) return { sent: null };
  const toldBefore = announced.length > 0;
  // Removed before any question heard of them: nothing to say.
  if (!current.notes && !toldBefore) return { sent: null };
  const kind: NotesSent['kind'] = !current.notes ? 'removed' : toldBefore ? 'replaced' : 'added';
  const sent: NotesSent = { version: current.version, kind };
  return { block: notesBlock(kind, current.notes), sent };
}
