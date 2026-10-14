// 008 T018: the request with notes (data-model "Notes build", research N4): the new turn carries the block, earlier
// turns replay theirs, and a meeting without notes gets exactly 003's request.
import { describe, expect, it } from 'vitest';
import { buildRequest, estimateTokens } from '@/core/chat/context';
import { buildNotes, notesBlock, type MeetingContextRecord } from '@/core/chat/notes';
import type { ChatTurn } from '@/core/chat/turn';

const agenda = { name: 'agenda.md', source: 'file' as const, text: 'Item one', addedAt: 1 };
const record: MeetingContextRecord = { meetingId: 'm1', version: 1, notes: agenda, updatedAt: 1, schemaVersion: 1 };

const earlierTurn: ChatTurn = {
  id: 'm1:chat:0',
  meetingId: 'm1',
  seq: 0,
  question: 'What was decided?',
  askedAt: 1,
  contextBlock: 'Transcript of the meeting so far. The person asking is Alex.\n[00:12] Jane: Pricing stays.',
  sentLines: {},
  transcriptUntilMs: 1,
  provider: 'openai',
  requestedModel: 'gpt-6-luna',
  answeredBy: 'gpt-6-luna',
  answer: 'Pricing stays [00:12].',
  status: 'complete',
  error: null,
  updatedAt: 1,
  schemaVersion: 1,
  notesSent: { version: 1, kind: 'added' },
};

describe('buildRequest with notes', () => {
  it('puts the new block on the new user turn, before the transcript block', () => {
    const notes = buildNotes(record, []);
    const r = buildRequest({
      model: 'gpt-6-luna',
      earlier: [],
      context: 'CTX',
      question: 'Q',
      notes: record,
      newNotes: notes.block,
    });
    expect(r.turns).toEqual([
      { role: 'user', notes: notesBlock('added', agenda), context: 'CTX', question: 'Question: Q' },
    ]);
  });

  it('replays an earlier turn’s block while the notes are the version it carried', () => {
    const r = buildRequest({
      model: 'gpt-6-luna',
      earlier: [earlierTurn],
      context: 'CTX',
      question: 'Q',
      notes: record,
    });
    expect(r.turns[0]).toEqual({
      role: 'user',
      notes: notesBlock('added', agenda),
      context: earlierTurn.contextBlock,
      question: 'Question: What was decided?',
    });
    expect(r.turns[2]).toEqual({ role: 'user', context: 'CTX', question: 'Question: Q' });
  });

  it('without notes the request is exactly 003’s (no notes key at all)', () => {
    const { notesSent: _n, ...plain } = earlierTurn;
    const r = buildRequest({ model: 'gpt-6-luna', earlier: [plain], context: 'CTX', question: 'Q' });
    for (const t of r.turns) expect(t).not.toHaveProperty('notes');
  });

  it('is deterministic', () => {
    const a = buildRequest({
      model: 'm',
      earlier: [earlierTurn],
      context: 'C',
      question: 'Q',
      notes: record,
      newNotes: undefined,
    });
    const b = buildRequest({
      model: 'm',
      earlier: [earlierTurn],
      context: 'C',
      question: 'Q',
      notes: record,
      newNotes: undefined,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('estimateTokens counts the notes', () => {
    const without = buildRequest({ model: 'm', earlier: [], context: 'C', question: 'Q' });
    const withNotes = buildRequest({
      model: 'm',
      earlier: [],
      context: 'C',
      question: 'Q',
      newNotes: 'x'.repeat(2500),
    });
    expect(estimateTokens(withNotes) - estimateTokens(without)).toBe(1000);
  });
});
