// 013 T005 (FR-003, FR-010, research R5, R7; contracts/files-and-storage.md "Storage"): caption turns are written only
// for a meeting that exists and has not ended, in one transaction with the meeting's `hasCaptions` mark, and read
// back one meeting at a time in `seq` order.
import { beforeEach, describe, expect, it } from 'vitest';
import { openLiveAssistDb, type LiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { storedCaptionTurn, storedMeeting, storedSegment } from '../../support/stored-meetings';

let n = 0;
let db: LiveAssistDb;
let repo: MeetingRepo;

const open = { endedAt: null, endReason: null } as const;

beforeEach(async () => {
  n += 1;
  db = await openLiveAssistDb(`caption-turns-test-${n}`);
  repo = new MeetingRepo(db);
  await repo.createMeeting(storedMeeting({ id: 'm1', ...open }));
  await repo.createMeeting(storedMeeting({ id: 'm2', startedAt: 5, ...open }));
});

describe('MeetingRepo.putCaptionTurns', () => {
  it('writes the rows of an open meeting and resolves true', async () => {
    const turns = [storedCaptionTurn('m1', 1), storedCaptionTurn('m1', 2, { speakerName: 'You', self: true })];
    expect(await repo.putCaptionTurns('m1', turns)).toBe(true);
    expect(await db.getAll('captionTurns')).toEqual(turns);
  });

  it('sets hasCaptions with the first write and leaves every other field as it was', async () => {
    await repo.setSpeakerRename('m1', 'self', { name: 'Si', origin: 'manual' });
    const before = await db.get('meetings', 'm1');
    expect(before).not.toHaveProperty('hasCaptions');

    await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 1)]);
    expect(await db.get('meetings', 'm1')).toEqual({ ...before, hasCaptions: true });
    expect(await db.get('meetings', 'm2')).not.toHaveProperty('hasCaptions');

    // A later write changes nothing on the meeting.
    await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 2)]);
    expect(await db.get('meetings', 'm1')).toEqual({ ...before, hasCaptions: true });
  });

  it('keeps a stored summary when it sets hasCaptions', async () => {
    const summary = { v: 1 as const, names: ['Jane'], fileLines: 1, lastLineEndMs: 1_500 };
    await db.put('meetings', { ...storedMeeting({ id: 'm3', startedAt: 9, ...open }), summary });
    await repo.putCaptionTurns('m3', [storedCaptionTurn('m3', 1)]);
    expect(await db.get('meetings', 'm3')).toMatchObject({ summary, hasCaptions: true });
  });

  it('replaces the row when the same seq is put again', async () => {
    await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 1, { text: 'Good morn' })]);
    await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 1, { text: 'Good morning, everyone.' })]);
    expect(await db.getAll('captionTurns')).toEqual([storedCaptionTurn('m1', 1, { text: 'Good morning, everyone.' })]);
  });

  it('resolves true for an empty list and writes nothing, not even hasCaptions', async () => {
    const before = await db.get('meetings', 'm1');
    expect(await repo.putCaptionTurns('m1', [])).toBe(true);
    expect(await db.count('captionTurns')).toBe(0);
    expect(await db.get('meetings', 'm1')).toEqual(before);
  });

  it('resolves false for an unknown meeting and leaves both stores unchanged', async () => {
    const before = await db.getAll('meetings');
    expect(await repo.putCaptionTurns('nope', [storedCaptionTurn('nope', 1)])).toBe(false);
    expect(await db.count('captionTurns')).toBe(0);
    expect(await db.getAll('meetings')).toEqual(before);
  });

  it('resolves false for an ended meeting and leaves both stores unchanged', async () => {
    await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 1)]);
    await repo.endMeeting('m1', 99_000, 'user-stop');
    const meetings = await db.getAll('meetings');
    const turns = await db.getAll('captionTurns');

    expect(await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 1, { text: 'Changed.' })])).toBe(false);
    expect(await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 2)])).toBe(false);
    expect(await db.getAll('meetings')).toEqual(meetings);
    expect(await db.getAll('captionTurns')).toEqual(turns);
  });

  it('never marks a meeting that ended before its first caption turn', async () => {
    await repo.endMeeting('m2', 99_000, 'user-stop');
    expect(await repo.putCaptionTurns('m2', [storedCaptionTurn('m2', 1)])).toBe(false);
    expect(await db.get('meetings', 'm2')).not.toHaveProperty('hasCaptions');
  });

  it('writes nothing when a turn belongs to another meeting', async () => {
    await expect(
      repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 1), storedCaptionTurn('m2', 2)]),
    ).rejects.toThrow();
    expect(await db.count('captionTurns')).toBe(0);
    expect(await db.get('meetings', 'm1')).not.toHaveProperty('hasCaptions');
  });
});

describe('MeetingRepo.listCaptionTurns', () => {
  it("returns one meeting's rows in seq order, never another meeting's", async () => {
    await repo.putCaptionTurns('m2', [storedCaptionTurn('m2', 1, { text: 'Other meeting.' })]);
    await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 10), storedCaptionTurn('m1', 2)]);
    await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 1)]);
    expect((await repo.listCaptionTurns('m1')).map((t) => t.seq)).toEqual([1, 2, 10]);
    expect(await repo.listCaptionTurns('m2')).toEqual([storedCaptionTurn('m2', 1, { text: 'Other meeting.' })]);
  });

  it('returns [] for a meeting without rows and for an unknown meeting', async () => {
    await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 1)]);
    expect(await repo.listCaptionTurns('m2')).toEqual([]);
    expect(await repo.listCaptionTurns('nope')).toEqual([]);
  });

  it('does not match a meeting whose id merely begins with the same characters', async () => {
    await repo.createMeeting(storedMeeting({ id: 'm10', startedAt: 7, ...open }));
    await repo.putCaptionTurns('m10', [storedCaptionTurn('m10', 1)]);
    expect(await repo.listCaptionTurns('m1')).toEqual([]);
  });
});

describe('hasCaptions survives every other write to the meeting', () => {
  beforeEach(async () => {
    await repo.appendSegment(storedSegment('m1', 0));
    await repo.putCaptionTurns('m1', [storedCaptionTurn('m1', 1)]);
  });

  it('setSpeakerRename keeps it', async () => {
    await repo.setSpeakerRename('m1', 'self', { name: 'Si', origin: 'manual' });
    await repo.setSpeakerRename('m1', 'self', null);
    expect(await db.get('meetings', 'm1')).toMatchObject({ hasCaptions: true });
  });

  it('setLabelOverride keeps it', async () => {
    await repo.endMeeting('m1', 99_000, 'user-stop');
    await repo.summarise('m1', () => ({ v: 1, names: [], fileLines: 1, lastLineEndMs: 1_500 }));
    await repo.setLabelOverride('m1', storedSegment('m1', 0).id, 'Jane');
    const stored = await db.get('meetings', 'm1');
    expect(stored).toMatchObject({ hasCaptions: true });
    expect(stored).not.toHaveProperty('summary');
  });

  it('endMeeting and summarise keep it', async () => {
    await repo.endMeeting('m1', 99_000, 'user-stop');
    expect(await db.get('meetings', 'm1')).toMatchObject({ hasCaptions: true, endedAt: 99_000 });
    await repo.summarise('m1', () => ({ v: 1, names: [], fileLines: 1, lastLineEndMs: 1_500 }));
    expect(await db.get('meetings', 'm1')).toMatchObject({ hasCaptions: true, summary: { fileLines: 1 } });
    expect(await repo.getMeeting('m1')).toMatchObject({ hasCaptions: true });
    expect((await repo.listMeetings()).find((m) => m.id === 'm1')).toMatchObject({ hasCaptions: true });
  });
});
