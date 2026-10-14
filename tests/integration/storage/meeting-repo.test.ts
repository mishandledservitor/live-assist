import { beforeEach, describe, expect, it } from 'vitest';
import { openLiveAssistDb, type LiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { segmentId, type Meeting, type TranscriptSegment } from '@/core/transcript/model';

let dbCounter = 0;
let repo: MeetingRepo;
let db: LiveAssistDb;

beforeEach(async () => {
  dbCounter += 1;
  db = await openLiveAssistDb(`test-db-${dbCounter}`);
  repo = new MeetingRepo(db);
});

function meeting(id: string, startedAt: number): Meeting {
  return {
    id,
    startedAt,
    endedAt: null,
    endReason: null,
    source: { url: 'https://meet.google.com/abc', title: 'Standup', platform: 'generic' },
    languageMode: { kind: 'auto' },
    userName: 'Alex',
    speakerRenames: {},
    schemaVersion: 1,
  };
}

function seg(meetingId: string, seq: number, startMs: number, text = `line${seq}`) {
  const s: TranscriptSegment = {
    id: segmentId(meetingId, 'mixed', seq),
    meetingId,
    stream: 'mixed',
    seq,
    startMs,
    endMs: startMs + 400,
    text,
    language: null,
    speakerLabel: 'Others',
    labelSource: 'fallback',
    captionName: null,
    captionSelf: false,
    labelOverride: null,
    schemaVersion: 2,
    words: [],
    timing: 'estimated',
    sessionId: 'sess',
    createdAt: 1,
  };
  return s;
}

describe('MeetingRepo', () => {
  it('creates and reads a meeting', async () => {
    await repo.createMeeting(meeting('m1', 100));
    expect(await repo.getMeeting('m1')).toEqual(meeting('m1', 100));
    expect(await repo.getMeeting('nope')).toBeUndefined();
  });

  it('appends segments idempotently on the same id', async () => {
    await repo.createMeeting(meeting('m1', 100));
    await repo.appendSegment(seg('m1', 0, 50, 'first'));
    await repo.appendSegment(seg('m1', 0, 50, 'first'));
    expect(await repo.listSegments('m1')).toHaveLength(1);
  });

  it('lists only that meeting’s segments in FR-013 order', async () => {
    await repo.createMeeting(meeting('m1', 100));
    await repo.createMeeting(meeting('m2', 200));
    await repo.appendSegment(seg('m1', 2, 1_000));
    await repo.appendSegment(seg('m1', 1, 2_000));
    await repo.appendSegment(seg('m1', 0, 1_000));
    await repo.appendSegment(seg('m2', 0, 0));
    const ids = (await repo.listSegments('m1')).map((s) => s.id);
    expect(ids).toEqual(['m1:mixed:0', 'm1:mixed:2', 'm1:mixed:1']);
  });

  it('ends a meeting with time and reason', async () => {
    await repo.createMeeting(meeting('m1', 100));
    await repo.endMeeting('m1', 5_000, 'user-stop');
    expect(await repo.getMeeting('m1')).toMatchObject({ endedAt: 5_000, endReason: 'user-stop' });
  });

  it('does not overwrite an already ended meeting', async () => {
    await repo.createMeeting(meeting('m1', 100));
    await repo.endMeeting('m1', 5_000, 'user-stop');
    await repo.endMeeting('m1', 9_000, 'failed');
    expect(await repo.getMeeting('m1')).toMatchObject({ endedAt: 5_000, endReason: 'user-stop' });
  });

  it('marks orphaned open meetings crashed, except the live one', async () => {
    await repo.createMeeting(meeting('old', 100));
    await repo.createMeeting(meeting('live', 200));
    await repo.createMeeting({ ...meeting('done', 50), endedAt: 60, endReason: 'user-stop' });
    const marked = await repo.markOrphanedCrashed('live', 9_999);
    expect(marked).toEqual(['old']);
    expect(await repo.getMeeting('old')).toMatchObject({ endReason: 'crashed', endedAt: 9_999 });
    expect(await repo.getMeeting('live')).toMatchObject({ endReason: null, endedAt: null });
    expect(await repo.getMeeting('done')).toMatchObject({ endReason: 'user-stop' });
  });

  it('marks every open meeting crashed when nothing is live', async () => {
    await repo.createMeeting(meeting('a', 100));
    expect(await repo.markOrphanedCrashed(null, 1)).toEqual(['a']);
  });

  it('hard-deletes a meeting and all of its segments', async () => {
    await repo.createMeeting(meeting('m1', 100));
    await repo.createMeeting(meeting('m2', 200));
    await repo.appendSegment(seg('m1', 0, 0));
    await repo.appendSegment(seg('m1', 1, 0));
    await repo.appendSegment(seg('m2', 0, 0));
    await repo.deleteMeeting('m1');
    expect(await repo.getMeeting('m1')).toBeUndefined();
    expect(await repo.listSegments('m1')).toEqual([]);
    expect(await repo.countSegments()).toBe(1);
  });

  it('finds the latest meeting by start time', async () => {
    expect(await repo.latestMeeting()).toBeUndefined();
    await repo.createMeeting(meeting('a', 300));
    await repo.createMeeting(meeting('b', 100));
    await repo.createMeeting(meeting('c', 200));
    expect((await repo.latestMeeting())?.id).toBe('a');
    await repo.deleteMeeting('a');
    expect((await repo.latestMeeting())?.id).toBe('c');
  });
});

describe('MeetingRepo — 002 label additions (contracts/live-port-and-labels.md)', () => {
  it('updateSegment replaces the stored segment with the same id', async () => {
    await repo.createMeeting(meeting('m1', 100));
    await repo.appendSegment(seg('m1', 0, 50));
    const named = {
      ...seg('m1', 0, 50),
      speakerLabel: 'Emma Jones',
      labelSource: 'caption' as const,
      captionName: 'Emma Jones',
    };
    await repo.updateSegment(named);
    expect(await repo.listSegments('m1')).toEqual([named]);
  });

  it('setSpeakerRename sets, replaces and removes one key, leaving the others', async () => {
    await repo.createMeeting(meeting('m1', 100));
    await repo.setSpeakerRename('m1', 'caption:emma jones', { name: 'Emma', origin: 'remembered' });
    await repo.setSpeakerRename('m1', 'others', { name: 'Bob', origin: 'manual' });
    await repo.setSpeakerRename('m1', 'caption:emma jones', { name: 'Emma C.', origin: 'manual' });
    expect((await repo.getMeeting('m1'))?.speakerRenames).toEqual({
      'caption:emma jones': { name: 'Emma C.', origin: 'manual' },
      others: { name: 'Bob', origin: 'manual' },
    });
    await repo.setSpeakerRename('m1', 'caption:emma jones', null);
    expect((await repo.getMeeting('m1'))?.speakerRenames).toEqual({ others: { name: 'Bob', origin: 'manual' } });
  });

  it('setSpeakerRename on an unknown meeting does nothing', async () => {
    await repo.setSpeakerRename('nope', 'others', { name: 'A', origin: 'manual' });
    expect(await repo.getMeeting('nope')).toBeUndefined();
  });

  it('setLabelOverride sets and clears one line’s override', async () => {
    await repo.createMeeting(meeting('m1', 100));
    await repo.appendSegment(seg('m1', 0, 50));
    await repo.appendSegment(seg('m1', 1, 60));
    await repo.setLabelOverride('m1', 'm1:mixed:0', 'Jane');
    const [first, second] = await repo.listSegments('m1');
    expect(first?.labelOverride).toBe('Jane');
    expect(second?.labelOverride).toBeNull();
    await repo.setLabelOverride('m1', 'm1:mixed:0', null);
    const [cleared] = await repo.listSegments('m1');
    expect(cleared?.labelOverride).toBeNull();
  });

  it('setLabelOverride ignores a segment of another meeting or one that does not exist', async () => {
    await repo.createMeeting(meeting('m1', 100));
    await repo.appendSegment(seg('m1', 0, 50));
    await repo.setLabelOverride('m2', 'm1:mixed:0', 'Jane');
    await repo.setLabelOverride('m1', 'm1:mixed:9', 'Jane');
    expect((await repo.listSegments('m1'))[0]?.labelOverride).toBeNull();
    expect(await repo.countSegments()).toBe(1);
  });

  it('reads v1 records back normalised', async () => {
    const { speakerRenames: _r, ...v1Meeting } = meeting('m1', 100);
    const { captionName: _n, captionSelf: _s, labelOverride: _o, schemaVersion: _v, ...v1Segment } = seg('m1', 0, 50);
    await db.put('meetings', v1Meeting as Meeting);
    await db.put('segments', v1Segment as TranscriptSegment);
    expect(await repo.getMeeting('m1')).toEqual(meeting('m1', 100));
    expect((await repo.latestMeeting())?.speakerRenames).toEqual({});
    expect(await repo.listSegments('m1')).toEqual([{ ...seg('m1', 0, 50), schemaVersion: 1 }]);
  });

  it('deleteMeeting still removes the meeting and every segment, overrides included', async () => {
    await repo.createMeeting(meeting('m1', 100));
    await repo.appendSegment(seg('m1', 0, 50));
    await repo.setLabelOverride('m1', 'm1:mixed:0', 'Jane');
    await repo.setSpeakerRename('m1', 'others', { name: 'Bob', origin: 'manual' });
    await repo.deleteMeeting('m1');
    expect(await repo.getMeeting('m1')).toBeUndefined();
    expect(await repo.countSegments()).toBe(0);
  });
});

// 003 T014 (FR-022, Principle I): deleting a meeting deletes its chat too, in the same transaction.
describe('MeetingRepo — 003 chat turns', () => {
  const chatTurn = (meetingId: string, seq: number) => ({
    id: `${meetingId}:chat:${seq}`,
    meetingId,
    seq,
    question: 'q',
    askedAt: 1,
    contextBlock: 'c',
    sentLines: {},
    transcriptUntilMs: 0,
    provider: 'anthropic' as const,
    requestedModel: 'claude-sonnet-5-5',
    answeredBy: null,
    answer: 'a',
    status: 'complete' as const,
    error: null,
    updatedAt: 1,
    schemaVersion: 1 as const,
  });

  it('deleteMeeting deletes that meeting’s chat turns in one transaction and leaves another meeting’s', async () => {
    await repo.createMeeting(meeting('m1', 1));
    await repo.createMeeting(meeting('m2', 2));
    await repo.appendSegment(seg('m1', 0, 0));
    for (const t of [chatTurn('m1', 0), chatTurn('m1', 1), chatTurn('m2', 0)]) await db.put('chatTurns', t);

    type Tx = (...args: unknown[]) => unknown;
    const target = db as unknown as { transaction: Tx };
    const original: Tx = target.transaction.bind(db);
    const scopes: string[][] = [];
    target.transaction = (...args: unknown[]) => {
      const stores = args[0];
      scopes.push((Array.isArray(stores) ? (stores as string[]) : [String(stores)]).sort());
      return original(...args);
    };
    try {
      await repo.deleteMeeting('m1');
    } finally {
      target.transaction = original;
    }

    expect(scopes).toEqual([['captionTurns', 'chatTurns', 'meetingContexts', 'meetings', 'segments']]);
    expect((await db.getAll('chatTurns')).map((t) => t.id)).toEqual(['m2:chat:0']);
    expect(await repo.getMeeting('m1')).toBeUndefined();
    expect(await repo.getMeeting('m2')).toBeDefined();
  });
});

describe('MeetingRepo — 008 notes', () => {
  it('deleteMeeting deletes that meeting’s notes in the same transaction, leaving another meeting’s and pending notes', async () => {
    await repo.createMeeting(meeting('m1', 1));
    await repo.createMeeting(meeting('m2', 2));
    const record = (meetingId: string) => ({
      meetingId,
      version: 1,
      notes: { name: 'agenda.md', source: 'file' as const, text: 'x', addedAt: 1 },
      updatedAt: 1,
      schemaVersion: 1 as const,
    });
    for (const id of ['m1', 'm2', 'next']) await db.put('meetingContexts', record(id));

    type Tx = (...args: unknown[]) => unknown;
    const target = db as unknown as { transaction: Tx };
    const original: Tx = target.transaction.bind(db);
    const scopes: string[][] = [];
    target.transaction = (...args: unknown[]) => {
      const stores = args[0];
      scopes.push((Array.isArray(stores) ? (stores as string[]) : [String(stores)]).sort());
      return original(...args);
    };
    try {
      await repo.deleteMeeting('m1');
    } finally {
      target.transaction = original;
    }

    expect(scopes).toEqual([['captionTurns', 'chatTurns', 'meetingContexts', 'meetings', 'segments']]);
    expect((await db.getAllKeys('meetingContexts')).sort()).toEqual(['m2', 'next']);
  });
});
