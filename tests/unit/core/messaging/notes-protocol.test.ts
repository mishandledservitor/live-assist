// 008 T008: the notes commands and replies (contracts/notes-messages.md), validated at every receiving boundary.
import { describe, expect, it } from 'vitest';
import { MAX_NOTES_CHARS } from '@/core/chat/notes';
import { parseCommand, parseNotesRemoveReply, parseNotesSetReply } from '@/core/messaging/protocol';

const notes = { name: 'agenda.md', source: 'file', text: 'Item one' };

describe('context/set and context/remove commands', () => {
  it.each([[{ kind: 'next' }], [{ kind: 'meeting', meetingId: 'm1' }]])(
    'accepts context/set for target %j, file and paste',
    (target) => {
      expect(parseCommand({ type: 'context/set', target, notes })).toEqual({ type: 'context/set', target, notes });
      const paste = { name: 'Pasted notes', source: 'paste', text: 'x' };
      expect(parseCommand({ type: 'context/set', target, notes: paste })).toEqual({
        type: 'context/set',
        target,
        notes: paste,
      });
    },
  );

  it('accepts context/remove for both targets', () => {
    expect(parseCommand({ type: 'context/remove', target: { kind: 'next' } })).toEqual({
      type: 'context/remove',
      target: { kind: 'next' },
    });
    expect(parseCommand({ type: 'context/remove', target: { kind: 'meeting', meetingId: 'm1' } })).toEqual({
      type: 'context/remove',
      target: { kind: 'meeting', meetingId: 'm1' },
    });
  });

  it.each([
    ['text over the limit', { ...notes, text: 'a'.repeat(MAX_NOTES_CHARS + 1) }],
    ['empty text', { ...notes, text: '' }],
    ['empty name', { ...notes, name: '' }],
    ['a file name without .txt or .md', { ...notes, name: 'agenda.pdf' }],
    ['an unknown source', { ...notes, source: 'url' }],
    ['text that is not a string', { ...notes, text: 3 }],
  ])('rejects context/set with %s', (_label, bad) => {
    expect(parseCommand({ type: 'context/set', target: { kind: 'next' }, notes: bad })).toBeNull();
  });

  it.each([[{ kind: 'last' }], [{ kind: 'meeting' }], [{ kind: 'meeting', meetingId: 3 }], ['next'], [null]])(
    'rejects target %j',
    (target) => {
      expect(parseCommand({ type: 'context/set', target, notes })).toBeNull();
      expect(parseCommand({ type: 'context/remove', target })).toBeNull();
    },
  );
});

describe('replies', () => {
  it('parses set replies and turns anything malformed into save-failed', () => {
    expect(parseNotesSetReply({ ok: true, version: 2 })).toEqual({ ok: true, version: 2 });
    for (const kind of ['empty', 'too-long', 'not-text', 'wrong-type', 'unknown-meeting', 'save-failed'])
      expect(parseNotesSetReply({ ok: false, kind })).toEqual({ ok: false, kind });
    expect(parseNotesSetReply({ ok: false, kind: 'nope' })).toEqual({ ok: false, kind: 'save-failed' });
    expect(parseNotesSetReply(undefined)).toEqual({ ok: false, kind: 'save-failed' });
  });

  it('rejects any reply carrying notes text', () => {
    expect(parseNotesSetReply({ ok: true, version: 1, text: 'x' })).toEqual({ ok: false, kind: 'save-failed' });
    expect(parseNotesRemoveReply({ ok: true, text: 'x' })).toEqual({ ok: false, kind: 'save-failed' });
  });

  it('parses remove replies', () => {
    expect(parseNotesRemoveReply({ ok: true })).toEqual({ ok: true });
    expect(parseNotesRemoveReply({ ok: false, kind: 'unknown-meeting' })).toEqual({
      ok: false,
      kind: 'unknown-meeting',
    });
    expect(parseNotesRemoveReply(null)).toEqual({ ok: false, kind: 'save-failed' });
  });
});
