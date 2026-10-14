// Every string the notes controls show (008 contracts/notes-ui.md, copy review K41). Reviewed with
// embody-dont-announce: labels, actions, and errors that say what happened and what to do; nothing explains the
// interface. The character limit comes from notes.ts so a changed default changes the text with it.
import { MAX_NOTES_CHARS, NOTES_FILE_EXTENSIONS, type NotesErrorKind } from './notes';

const LIMIT = MAX_NOTES_CHARS.toLocaleString('en-US');

export const NOTES_STRINGS = Object.freeze({
  add: 'Add notes',
  addForNext: 'Add notes for the next meeting',
  chooseFile: 'Choose file…',
  pasteText: 'Paste text',
  remove: 'Remove notes',
  removeForNext: 'Remove notes for the next meeting',
  dialog: 'Notes',
  save: 'Save notes',
  cancel: 'Cancel',
});

/** The chip's accessible name. */
export const notesChipName = (name: string, forNext: boolean): string =>
  forNext ? `Notes for the next meeting: ${name}` : `Notes: ${name}`;

/** `accept` for the file picker: the allowed extensions and their media types. */
export const NOTES_ACCEPT = [...NOTES_FILE_EXTENSIONS, 'text/plain', 'text/markdown'].join(',');

/** What went wrong with a file, a paste or a save; `name` is the file's name. */
export function notesErrorText(kind: NotesErrorKind, from: 'file' | 'paste' | 'remove', name: string): string {
  switch (kind) {
    case 'empty':
      return `${name} is empty.`;
    case 'too-long':
      return from === 'paste'
        ? `These notes have more than ${LIMIT} characters. Shorten them and save again.`
        : `${name} has more than ${LIMIT} characters. Shorten it and add it again.`;
    case 'not-text':
      return `${name} isn't UTF-8 text. Save it as UTF-8 and add it again.`;
    case 'wrong-type':
      return `Only ${NOTES_FILE_EXTENSIONS.join(' and ')} files can be added.`;
    case 'unreadable':
      return `Couldn't read ${name}. Try again.`;
    default:
      return "Couldn't save the notes. Try again.";
  }
}
