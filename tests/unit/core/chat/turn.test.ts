// 003 T008: ChatError (contracts/chat-provider.md) and the ChatTurn helpers (data-model "ChatTurn").
import { describe, expect, it } from 'vitest';
import { CHAT_ERROR_KINDS, ChatError, type ChatErrorKind } from '@/core/chat/provider';
import {
  STALE_STREAMING_MS,
  isStale,
  normaliseTurn,
  replayable,
  toTurnView,
  turnId,
  type AnswerStatus,
  type ChatTurn,
} from '@/core/chat/turn';

function turn(over: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: 'm1:chat:0',
    meetingId: 'm1',
    seq: 0,
    question: 'What was decided?',
    askedAt: 1_000,
    contextBlock: 'Transcript of the meeting so far. The person asking is Alex.\n[00:12] Jane: Pricing stays.',
    sentLines: { 'm1:mixed:0': '[00:12] Jane: Pricing stays.' },
    transcriptUntilMs: 16_000,
    provider: 'anthropic',
    requestedModel: 'claude-sonnet-5-5',
    answeredBy: 'claude-sonnet-5-5',
    answer: 'Pricing stays [00:12].',
    status: 'complete',
    error: null,
    updatedAt: 2_000,
    schemaVersion: 1,
    ...over,
  };
}

describe('ChatError', () => {
  it.each(CHAT_ERROR_KINDS)('%s has a fixed message naming only its kind', (kind) => {
    const error = new ChatError(kind);
    expect(error.kind).toBe(kind);
    expect(error.name).toBe('ChatError');
    expect(error.message).toBe(new ChatError(kind).message);
    expect(error).toBeInstanceOf(Error);
  });

  it('never carries its constructor input when that is not a known kind (a key passed by mistake)', () => {
    const leaked = 'sk-ant-api03-fixture-not-a-real-key';
    const error = new ChatError(leaked as ChatErrorKind);
    expect(error.kind).toBe('unknown');
    expect(error.message).not.toContain(leaked);
    expect(String(error)).not.toContain(leaked);
    expect(JSON.stringify(error)).not.toContain(leaked);
  });

  it('has a kind for a request that got no answer (FR-018a, design decision 80)', () => {
    expect(CHAT_ERROR_KINDS).toContain('no-answer');
    expect(new ChatError('no-answer').kind).toBe('no-answer');
  });

  it('gives different messages for different kinds', () => {
    expect(new Set(CHAT_ERROR_KINDS.map((k) => new ChatError(k).message)).size).toBe(CHAT_ERROR_KINDS.length);
  });
});

describe('replayable (data-model "Retry")', () => {
  it.each<[AnswerStatus, string, boolean]>([
    ['complete', 'Pricing stays [00:12].', true],
    ['cut-off', 'The team discussed', true],
    ['stopped', 'First,', true],
    ['complete', '', false],
    ['stopped', '   ', false],
    ['failed', 'partial', false],
    ['streaming', 'partial', false],
  ])('%s with answer %j → %s', (status, answer, expected) => {
    expect(replayable(turn({ status, answer }))).toBe(expected);
  });
});

describe('isStale (research R1)', () => {
  it('a streaming turn with no update for more than 60 s is stale', () => {
    expect(STALE_STREAMING_MS).toBe(60_000);
    const t = turn({ status: 'streaming', updatedAt: 10_000 });
    expect(isStale(t, 10_000 + 60_001)).toBe(true);
    expect(isStale(t, 10_000 + 60_000)).toBe(false);
    expect(isStale(t, 10_000 + 5_000)).toBe(false);
  });

  it.each<AnswerStatus>(['complete', 'cut-off', 'stopped', 'failed'])('a %s turn is never stale', (status) => {
    expect(isStale(turn({ status, updatedAt: 0 }), 10_000_000)).toBe(false);
  });
});

describe('turnId and the panel view', () => {
  it('is deterministic per meeting and seq', () => {
    expect(turnId('m1', 0)).toBe('m1:chat:0');
    expect(turnId('m1', 12)).toBe('m1:chat:12');
  });

  it('the panel view drops the prompt text (contracts/chat-messages.md ChatTurnView)', () => {
    const view = toTurnView(turn());
    expect(view).not.toHaveProperty('contextBlock');
    expect(view).not.toHaveProperty('sentLines');
    expect(view).toMatchObject({ id: 'm1:chat:0', answer: 'Pricing stays [00:12].', status: 'complete' });
  });
});

describe('notesSent (008 T006)', () => {
  it('reads as null on a turn stored before 008', () => {
    const old = turn();
    delete old.notesSent;
    expect(normaliseTurn(old).notesSent).toBeNull();
    const kept = turn({ notesSent: { version: 2, kind: 'replaced' } });
    expect(normaliseTurn(kept).notesSent).toEqual({ version: 2, kind: 'replaced' });
  });

  it('is never in the view the panel gets', () => {
    const view = toTurnView(turn({ notesSent: { version: 1, kind: 'added' } }));
    expect(view).not.toHaveProperty('notesSent');
  });
});
