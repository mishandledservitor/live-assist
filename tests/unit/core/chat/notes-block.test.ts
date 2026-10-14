// 008 T016: the notes block a question carries, and its replay (research N4, data-model "Notes build"). Add path.
import { describe, expect, it } from 'vitest';
import { buildNotes, notesBlock, replayNotes, type MeetingContextRecord } from '@/core/chat/notes';
import type { ChatTurn, NotesSent } from '@/core/chat/turn';

const agenda = { name: 'agenda.md', source: 'file' as const, text: 'Item one\nItem two', addedAt: 1 };

function record(version: number, notes: MeetingContextRecord['notes'] = agenda): MeetingContextRecord {
  return { meetingId: 'm1', version, notes, updatedAt: 1, schemaVersion: 1 };
}

function turn(seq: number, notesSent: NotesSent | null, over: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: `m1:chat:${seq}`,
    meetingId: 'm1',
    seq,
    question: 'Q?',
    askedAt: 1,
    contextBlock: 'Transcript…',
    sentLines: {},
    transcriptUntilMs: 1,
    provider: 'openai',
    requestedModel: 'gpt-6-luna',
    answeredBy: 'gpt-6-luna',
    answer: 'A.',
    status: 'complete',
    error: null,
    updatedAt: 1,
    schemaVersion: 1,
    notesSent,
    ...over,
  };
}

describe('notesBlock', () => {
  it('writes the three blocks of research N4 exactly', () => {
    expect(notesBlock('added', agenda)).toBe(
      'Notes from the person asking (agenda.md). They were not said in the meeting.\nItem one\nItem two',
    );
    expect(notesBlock('replaced', agenda)).toBe(
      'Notes from the person asking, replacing their earlier notes (agenda.md). They were not said in the meeting; earlier notes no longer apply.\nItem one\nItem two',
    );
    expect(notesBlock('removed', null)).toBe(
      'The person asking removed their notes. Earlier notes, and anything earlier answers took from them, no longer apply.',
    );
  });
});

describe('buildNotes and replayNotes — adding notes', () => {
  it('sends nothing for a meeting without notes', () => {
    expect(buildNotes(undefined, [])).toEqual({ sent: null });
    expect(buildNotes(undefined, [turn(0, null)])).toEqual({ sent: null });
  });

  it('sends an "added" block with the record version on the first question', () => {
    expect(buildNotes(record(1), [])).toEqual({
      block: notesBlock('added', agenda),
      sent: { version: 1, kind: 'added' },
    });
  });

  it('sends an "added" block when notes arrive after earlier questions without notes', () => {
    expect(buildNotes(record(1), [turn(0, null), turn(1, null)])).toEqual({
      block: notesBlock('added', agenda),
      sent: { version: 1, kind: 'added' },
    });
  });

  it('sends nothing new once a replayable turn carried the current version, which replays byte-identical', () => {
    const earlier = [turn(0, { version: 1, kind: 'added' }), turn(1, null)];
    expect(buildNotes(record(1), earlier)).toEqual({ sent: null });
    expect(replayNotes(earlier[0]!, record(1))).toBe(notesBlock('added', agenda));
    expect(replayNotes(earlier[1]!, record(1))).toBeUndefined();
  });

  it('a failed or empty earlier turn does not count as having carried the notes', () => {
    const failed = turn(0, { version: 1, kind: 'added' }, { status: 'failed', answer: '' });
    const empty = turn(1, { version: 1, kind: 'added' }, { answer: '  ' });
    expect(buildNotes(record(1), [failed, empty])).toEqual({
      block: notesBlock('added', agenda),
      sent: { version: 1, kind: 'added' },
    });
  });

  it('reads a turn stored before 008 (no notesSent) as carrying nothing', () => {
    const old = turn(0, null);
    delete old.notesSent;
    expect(replayNotes(old, record(1))).toBeUndefined();
  });
});

describe('buildNotes and replayNotes — replacing and removing (008 T042)', () => {
  const minutes = { name: 'minutes.md', source: 'file' as const, text: 'New text', addedAt: 2 };

  it('after a replace, the old block is not replayed and the new question carries "replaced"', () => {
    const earlier = [turn(0, { version: 1, kind: 'added' })];
    expect(replayNotes(earlier[0]!, record(2, minutes))).toBeUndefined();
    expect(buildNotes(record(2, minutes), earlier)).toEqual({
      block: notesBlock('replaced', minutes),
      sent: { version: 2, kind: 'replaced' },
    });
  });

  it('after a remove, the new question carries "removed" and no notes text', () => {
    const earlier = [turn(0, { version: 1, kind: 'added' })];
    const built = buildNotes(record(2, null), earlier);
    expect(built).toEqual({ block: notesBlock('removed', null), sent: { version: 2, kind: 'removed' } });
    expect(built.block).not.toContain('Item one');
  });

  it('the "removed" block replays while the notes stay removed', () => {
    const earlier = [turn(0, { version: 1, kind: 'added' }), turn(1, { version: 2, kind: 'removed' })];
    expect(replayNotes(earlier[1]!, record(2, null))).toBe(notesBlock('removed', null));
    expect(buildNotes(record(2, null), earlier)).toEqual({ sent: null });
  });

  it('a removal no question ever saw needs no block', () => {
    expect(buildNotes(record(2, null), [turn(0, null)])).toEqual({ sent: null });
  });

  it('notes added again after a removal are announced as replacing', () => {
    const earlier = [turn(0, { version: 1, kind: 'added' }), turn(1, { version: 2, kind: 'removed' })];
    expect(buildNotes(record(3, minutes), earlier)).toEqual({
      block: notesBlock('replaced', minutes),
      sent: { version: 3, kind: 'replaced' },
    });
  });
});
