// Notes file fixtures (008 T002) and the meeting with notes used across 008's tests (T003).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readChatMeeting, type ChatMeetingFixture } from './chat-meetings';

const DIR = join(import.meta.dirname, '../fixtures/notes');

export type NotesFixtureName =
  | 'agenda.md'
  | 'agenda-bom-crlf.txt'
  | 'greek.md'
  | 'windows-1253.txt'
  | 'nul.txt'
  | 'empty.txt'
  | 'whitespace.txt'
  | 'long.txt'
  | 'notes.pdf';

/** A string that must never appear anywhere the notes must not go (008 SC-005). */
export const NOTES_SENTINEL = 'NOTES-SENTINEL-7Q';

export function readNotesBytes(name: NotesFixtureName): Uint8Array {
  return new Uint8Array(readFileSync(join(DIR, name)));
}

export function readNotesText(name: NotesFixtureName): string {
  return readFileSync(join(DIR, name), 'utf8');
}

/** 003's standup meeting with `agenda.md` as its notes (008 T003). */
export function notesStandup(): ChatMeetingFixture & { notes: { name: string; source: 'file'; text: string } } {
  return {
    ...readChatMeeting('standup-en'),
    notes: { name: 'agenda.md', source: 'file', text: readNotesText('agenda.md') },
  };
}
