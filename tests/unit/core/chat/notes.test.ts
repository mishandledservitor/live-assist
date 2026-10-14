// 008 T004: decoding and validating notes (research N7, data-model "Validation").
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_NOTES_CHARS,
  MAX_NOTES_FILE_BYTES,
  PASTED_NOTES_NAME,
  decodeNotesFile,
  notesFromPaste,
  validateNotes,
} from '@/core/chat/notes';
import { readNotesBytes, readNotesText } from '../../../support/notes';

describe('decodeNotesFile', () => {
  it('accepts a UTF-8 .md file and keeps Markdown as written', () => {
    const r = decodeNotesFile('agenda.md', readNotesBytes('agenda.md'));
    expect(r).toEqual({ ok: true, notes: { name: 'agenda.md', source: 'file', text: readNotesText('agenda.md') } });
  });

  it('accepts .txt and .MD case-insensitively', () => {
    expect(decodeNotesFile('a.TXT', new TextEncoder().encode('x')).ok).toBe(true);
    expect(decodeNotesFile('a.MD', new TextEncoder().encode('x')).ok).toBe(true);
  });

  it('drops the byte-order mark and normalises CRLF and lone CR to LF', () => {
    const r = decodeNotesFile('agenda-bom-crlf.txt', readNotesBytes('agenda-bom-crlf.txt'));
    expect(r).toEqual({
      ok: true,
      notes: { name: 'agenda-bom-crlf.txt', source: 'file', text: 'Line one\nLine two\nLine three\n' },
    });
  });

  it('accepts UTF-8 Greek', () => {
    const r = decodeNotesFile('greek.md', readNotesBytes('greek.md'));
    expect(r.ok && r.notes.text).toContain('Προϋπολογισμός');
  });

  it.each([
    ['windows-1253.txt', 'not-text'],
    ['nul.txt', 'not-text'],
    ['empty.txt', 'empty'],
    ['whitespace.txt', 'empty'],
    ['long.txt', 'too-long'],
    ['notes.pdf', 'wrong-type'],
  ] as const)('%s → %s', (name, kind) => {
    expect(decodeNotesFile(name, readNotesBytes(name))).toEqual({ ok: false, kind });
  });

  it('rejects bytes over the file limit without decoding them', () => {
    const decode = vi.spyOn(TextDecoder.prototype, 'decode');
    const r = decodeNotesFile('big.txt', new Uint8Array(MAX_NOTES_FILE_BYTES + 1));
    expect(r).toEqual({ ok: false, kind: 'too-long' });
    expect(decode).not.toHaveBeenCalled();
    decode.mockRestore();
  });

  it('accepts exactly the character limit, counting code points', () => {
    expect(decodeNotesFile('a.txt', new TextEncoder().encode('α'.repeat(MAX_NOTES_CHARS))).ok).toBe(true);
    expect(decodeNotesFile('a.txt', new TextEncoder().encode('😀'.repeat(MAX_NOTES_CHARS))).ok).toBe(true);
  });
});

describe('notesFromPaste', () => {
  it('names pasted text "Pasted notes" and normalises line endings', () => {
    expect(notesFromPaste('One\r\nTwo')).toEqual({
      ok: true,
      notes: { name: PASTED_NOTES_NAME, source: 'paste', text: 'One\nTwo' },
    });
    expect(PASTED_NOTES_NAME).toBe('Pasted notes');
  });

  it('rejects whitespace-only and over-long text', () => {
    expect(notesFromPaste(' \n ')).toEqual({ ok: false, kind: 'empty' });
    expect(notesFromPaste('a'.repeat(MAX_NOTES_CHARS + 1))).toEqual({ ok: false, kind: 'too-long' });
  });
});

describe('validateNotes (service-worker boundary)', () => {
  it('accepts a valid file or paste and returns normalised notes', () => {
    expect(validateNotes({ name: ' a.md ', source: 'file', text: 'x\r\ny' })).toEqual({
      ok: true,
      notes: { name: 'a.md', source: 'file', text: 'x\ny' },
    });
    expect(validateNotes({ name: 'Pasted notes', source: 'paste', text: 'x' })).toEqual({
      ok: true,
      notes: { name: 'Pasted notes', source: 'paste', text: 'x' },
    });
  });

  it.each([
    [null, 'not-text'],
    ['text', 'not-text'],
    [{ name: 'a.md', source: 'file' }, 'not-text'],
    [{ name: 'a.md', source: 'url', text: 'x' }, 'not-text'],
    [{ name: '', source: 'file', text: 'x' }, 'wrong-type'],
    [{ name: `${'a'.repeat(253)}.md`, source: 'file', text: 'x' }, 'wrong-type'],
    [{ name: 'a.pdf', source: 'file', text: 'x' }, 'wrong-type'],
    [{ name: 'a.md', source: 'file', text: '  ' }, 'empty'],
    [{ name: 'a.md', source: 'file', text: 'a'.repeat(MAX_NOTES_CHARS + 1) }, 'too-long'],
    [{ name: 'a.md', source: 'file', text: 'a\u0000b' }, 'not-text'],
  ])('%j → %s', (input, kind) => {
    expect(validateNotes(input)).toEqual({ ok: false, kind });
  });
});
