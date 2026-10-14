// 012 T025 (FR-018, spec Clarifications D5; research R6 gap 1): a write that arrives after its meeting was deleted puts
// nothing back. An answer still streaming, or notes being saved, check the meeting inside their own transaction.
import { beforeEach, describe, expect, it } from 'vitest';
import { NEXT_MEETING_KEY } from '@/core/chat/notes';
import { turnId, type ChatTurn } from '@/core/chat/turn';
import { ChatRepo } from '@/storage/chat-repo';
import { ContextRepo } from '@/storage/context-repo';
import { openLiveAssistDb, type LiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { storedCaptionTurn, storedMeeting, storedSegment } from '../../support/stored-meetings';

let n = 0;
let db: LiveAssistDb;
let meetings: MeetingRepo;
let chats: ChatRepo;
let contexts: ContextRepo;

beforeEach(async () => {
  n += 1;
  db = await openLiveAssistDb(`late-writers-test-${n}`);
  meetings = new MeetingRepo(db);
  chats = new ChatRepo(db);
  contexts = new ContextRepo(db);
  await meetings.createMeeting(storedMeeting({ id: 'm1' }));
  await meetings.appendSegment(storedSegment('m1', 0));
  await meetings.createMeeting(storedMeeting({ id: 'm2', startedAt: 5 }));
  // 013: two meetings still running, each with a kept caption turn.
  for (const [id, startedAt] of [
    ['open1', 10],
    ['open2', 20],
  ] as const) {
    await meetings.createMeeting(storedMeeting({ id, startedAt, endedAt: null, endReason: null }));
    await meetings.putCaptionTurns(id, [storedCaptionTurn(id, 1)]);
  }
});

function turn(meetingId: string, seq: number, over: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: turnId(meetingId, seq),
    meetingId,
    seq,
    question: `What was decided? ${seq}`,
    askedAt: 1_000 + seq,
    contextBlock: '[00:00] Others: Line 0.',
    sentLines: { [`${meetingId}:mixed:0`]: '[00:00] Others: Line 0.' },
    transcriptUntilMs: 1_500,
    provider: 'anthropic',
    requestedModel: 'claude-sonnet-5-5',
    answeredBy: null,
    answer: '',
    status: 'streaming',
    error: null,
    updatedAt: 1_000 + seq,
    schemaVersion: 1,
    ...over,
  };
}

const agenda = { name: 'agenda.md', source: 'file' as const, text: 'Item one' };

describe('ChatRepo.putTurn', () => {
  it('resolves true and writes while the meeting exists', async () => {
    expect(await chats.putTurn(turn('m1', 0))).toBe(true);
    expect(await chats.putTurn(turn('m1', 0, { answer: 'Pricing stays.', status: 'complete' }))).toBe(true);
    expect(await chats.listTurns('m1')).toEqual([turn('m1', 0, { answer: 'Pricing stays.', status: 'complete' })]);
  });

  it('resolves false and writes nothing once the meeting is deleted', async () => {
    await meetings.deleteMeeting('m1');
    expect(await chats.putTurn(turn('m1', 0))).toBe(false);
    expect(await chats.listTurns('m1')).toEqual([]);
    expect(await db.count('chatTurns')).toBe(0);
  });

  it('does not put back a turn that existed before the delete', async () => {
    await chats.putTurn(turn('m1', 0, { answer: 'Pri' }));
    await chats.putTurn(turn('m2', 0));
    await meetings.deleteMeeting('m1');
    expect(await chats.putTurn(turn('m1', 0, { answer: 'Pricing stays.', status: 'complete' }))).toBe(false);
    expect(await chats.listTurns('m1')).toEqual([]);
    expect(await chats.listTurns('m2')).toEqual([turn('m2', 0)]);
  });

  it('resolves false for a meeting that never existed', async () => {
    expect(await chats.putTurn(turn('nope', 0))).toBe(false);
    expect(await db.count('chatTurns')).toBe(0);
  });
});

describe('ContextRepo.set', () => {
  it('resolves the new version and writes while the meeting exists', async () => {
    expect(await contexts.set('m1', agenda, 10)).toBe(1);
    expect(await contexts.set('m1', agenda, 20)).toBe(2);
    expect(await contexts.get('m1')).toMatchObject({ version: 2, notes: { ...agenda, addedAt: 20 } });
  });

  it('resolves null and writes nothing once the meeting is deleted', async () => {
    await contexts.set('m1', agenda, 10);
    await meetings.deleteMeeting('m1');
    expect(await contexts.set('m1', agenda, 20)).toBeNull();
    expect(await contexts.get('m1')).toBeUndefined();
    expect(await db.count('meetingContexts')).toBe(0);
  });

  it('resolves null and writes nothing for a meeting that never existed', async () => {
    expect(await contexts.set('nope', agenda, 10)).toBeNull();
    expect(await db.count('meetingContexts')).toBe(0);
  });

  it('always writes the notes waiting for the next meeting', async () => {
    expect(await contexts.set(NEXT_MEETING_KEY, agenda, 10)).toBe(1);
    expect(await contexts.get(NEXT_MEETING_KEY)).toMatchObject({ version: 1, notes: { ...agenda, addedAt: 10 } });
  });
});

describe('ContextRepo.applyPending and remove are as before', () => {
  it('applyPending moves the waiting notes to the meeting as version 1', async () => {
    await contexts.set(NEXT_MEETING_KEY, agenda, 10);
    expect(await contexts.applyPending('m1', 30)).toBe(true);
    expect(await contexts.get('m1')).toMatchObject({ meetingId: 'm1', version: 1, notes: { ...agenda, addedAt: 10 } });
    expect(await contexts.get(NEXT_MEETING_KEY)).toBeUndefined();
    expect(await contexts.applyPending('m1', 40)).toBe(false);
  });

  it("remove leaves a meeting's tombstone and deletes the waiting notes outright", async () => {
    await contexts.set('m1', agenda, 10);
    await contexts.set(NEXT_MEETING_KEY, agenda, 10);
    await contexts.remove('m1', 20);
    await contexts.remove(NEXT_MEETING_KEY, 20);
    expect(await contexts.get('m1')).toEqual({
      meetingId: 'm1',
      version: 2,
      notes: null,
      updatedAt: 20,
      schemaVersion: 1,
    });
    expect(await contexts.get(NEXT_MEETING_KEY)).toBeUndefined();
  });

  it('remove writes nothing for a meeting that has no notes record', async () => {
    await meetings.deleteMeeting('m1');
    await contexts.remove('m1', 20);
    expect(await db.count('meetingContexts')).toBe(0);
  });
});

// 013 T027 (FR-010, research R7): the caption log flushes on a timer, so a write can arrive after its meeting was
// deleted, ended or marked crashed. It puts nothing back.
describe('MeetingRepo.putCaptionTurns', () => {
  const rowsOf = async (id: string) => (await db.getAll('captionTurns')).filter((t) => t.meetingId === id);

  it('resolves false and writes nothing once the meeting is deleted', async () => {
    await meetings.deleteMeeting('open1');
    expect(await rowsOf('open1')).toEqual([]);
    expect(await meetings.putCaptionTurns('open1', [storedCaptionTurn('open1', 1, { text: 'Later text.' })])).toBe(
      false,
    );
    expect(await meetings.putCaptionTurns('open1', [storedCaptionTurn('open1', 2)])).toBe(false);
    expect(await rowsOf('open1')).toEqual([]);
    expect(await meetings.getMeeting('open1')).toBeUndefined();
    expect(await rowsOf('open2')).toEqual([storedCaptionTurn('open2', 1)]);
  });

  it('resolves false and changes nothing once the meeting has ended', async () => {
    await meetings.endMeeting('open1', 50, 'user-stop');
    expect(await meetings.putCaptionTurns('open1', [storedCaptionTurn('open1', 1, { text: 'Later text.' })])).toBe(
      false,
    );
    expect(await meetings.putCaptionTurns('open1', [storedCaptionTurn('open1', 2)])).toBe(false);
    expect(await rowsOf('open1')).toEqual([storedCaptionTurn('open1', 1)]);
  });

  it('resolves false and changes nothing once the meeting was marked crashed', async () => {
    expect(await meetings.markOrphanedCrashed('open2', 60)).toEqual(['open1']);
    expect(await meetings.putCaptionTurns('open1', [storedCaptionTurn('open1', 2)])).toBe(false);
    expect(await rowsOf('open1')).toEqual([storedCaptionTurn('open1', 1)]);
    // The meeting still running keeps writing.
    expect(await meetings.putCaptionTurns('open2', [storedCaptionTurn('open2', 2)])).toBe(true);
    expect((await rowsOf('open2')).map((t) => t.seq)).toEqual([1, 2]);
  });

  it('writes nothing for a deleted meeting that ended first', async () => {
    await meetings.endMeeting('open1', 50, 'user-stop');
    await meetings.deleteMeeting('open1');
    expect(await meetings.putCaptionTurns('open1', [storedCaptionTurn('open1', 1)])).toBe(false);
    expect(await rowsOf('open1')).toEqual([]);
  });
});
