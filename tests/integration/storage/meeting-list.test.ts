// 012 T007 (FR-005, FR-006, FR-009, SC-006; research R2, R3): the list of stored meetings, and the row details cached
// on a stopped meeting's own record and dropped by every label edit.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Meeting, MeetingSummary, TranscriptSegment } from '@/core/transcript/model';
import { openLiveAssistDb, type LiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { spokenBy, storedMeeting, storedSegment } from '../../support/stored-meetings';

let n = 0;
let db: LiveAssistDb;
let repo: MeetingRepo;

beforeEach(async () => {
  n += 1;
  db = await openLiveAssistDb(`meeting-list-test-${n}`);
  repo = new MeetingRepo(db);
});

const SUMMARY: MeetingSummary = { v: 1, names: ['Jane'], fileLines: 2, lastLineEndMs: 3_500 };
const compute = () => SUMMARY;

async function store(meeting: Meeting, segments: TranscriptSegment[] = []) {
  await repo.createMeeting(meeting);
  for (const s of segments) await repo.appendSegment(s);
}

describe('listMeetings', () => {
  it('is empty when nothing is stored', async () => {
    expect(await repo.listMeetings()).toEqual([]);
  });

  it('returns every meeting, newest first by start time', async () => {
    await store(storedMeeting({ id: 'b', startedAt: 2_000 }));
    await store(storedMeeting({ id: 'd', startedAt: 4_000, endedAt: null, endReason: null }));
    await store(storedMeeting({ id: 'a', startedAt: 1_000, endReason: 'crashed' }));
    await store(storedMeeting({ id: 'c', startedAt: 3_000, summary: SUMMARY }));
    const list = await repo.listMeetings();
    expect(list.map((m) => m.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(list[1]).toEqual(storedMeeting({ id: 'c', startedAt: 3_000, summary: SUMMARY }));
  });

  it('normalises records stored before 002', async () => {
    const { speakerRenames: _renames, schemaVersion: _version, ...old } = storedMeeting({ id: 'old' });
    await db.put('meetings', old as Meeting);
    expect(await repo.listMeetings()).toEqual([{ ...old, speakerRenames: {}, schemaVersion: 1 }]);
  });

  it('lists 200 meetings in under 100 ms (SC-006)', async () => {
    const tx = db.transaction('meetings', 'readwrite');
    for (let i = 0; i < 200; i += 1) {
      void tx.store.put(storedMeeting({ id: `m${i}`, startedAt: 1_000 + i * 3_600_000, summary: SUMMARY }));
    }
    await tx.done;
    const t0 = performance.now();
    const list = await repo.listMeetings();
    expect(performance.now() - t0).toBeLessThan(100);
    expect(list).toHaveLength(200);
    expect(list[0]?.id).toBe('m199');
    expect(list[199]?.id).toBe('m0');
  });
});

describe('summarise', () => {
  it('passes the normalised meeting and its lines in time order to compute', async () => {
    const { speakerRenames: _renames, schemaVersion: _version, ...old } = storedMeeting({ id: 'm1' });
    await db.put('meetings', old as Meeting);
    await repo.appendSegment(storedSegment('m1', 1, { startMs: 5_000 }));
    await repo.appendSegment(storedSegment('m1', 0, { startMs: 9_000, ...spokenBy('Jane') }));
    await repo.appendSegment(storedSegment('other', 0));
    const seen = vi.fn(compute);
    expect(await repo.summarise('m1', seen)).toEqual(SUMMARY);
    expect(seen).toHaveBeenCalledTimes(1);
    const [meeting, segments] = seen.mock.calls[0] as unknown as [Meeting, TranscriptSegment[]];
    expect(meeting).toEqual({ ...old, speakerRenames: {}, schemaVersion: 1 });
    expect(segments.map((s) => s.id)).toEqual(['m1:mixed:1', 'm1:mixed:0']);
  });

  it('stores the summary on an ended meeting and leaves every other field as it was', async () => {
    const meeting = storedMeeting({ speakerRenames: { self: { name: 'S.', origin: 'manual' } } });
    await store(meeting, [storedSegment('m1', 0)]);
    await repo.summarise('m1', compute);
    expect(await db.get('meetings', 'm1')).toEqual({ ...meeting, summary: SUMMARY });
  });

  it('stores it for a meeting marked as crashed', async () => {
    await store(storedMeeting({ endReason: 'crashed' }));
    await repo.summarise('m1', compute);
    expect((await repo.getMeeting('m1'))?.summary).toEqual(SUMMARY);
  });

  it('computes but does not store for an open record', async () => {
    const meeting = storedMeeting({ endedAt: null, endReason: null });
    await store(meeting, [storedSegment('m1', 0)]);
    expect(await repo.summarise('m1', compute)).toEqual(SUMMARY);
    expect(await db.get('meetings', 'm1')).toEqual(meeting);
  });

  it('resolves null for an unknown id, computes nothing and writes nothing', async () => {
    const seen = vi.fn(compute);
    expect(await repo.summarise('gone', seen)).toBeNull();
    expect(seen).not.toHaveBeenCalled();
    expect(await db.count('meetings')).toBe(0);
  });

  it('replaces an earlier summary', async () => {
    await store(storedMeeting({ summary: { v: 1, names: [], fileLines: 0, lastLineEndMs: null } }));
    await repo.summarise('m1', compute);
    expect((await repo.getMeeting('m1'))?.summary).toEqual(SUMMARY);
  });
});

describe('label edits drop the stored summary', () => {
  it('setSpeakerRename removes it and still stores the rename', async () => {
    await store(storedMeeting({ summary: SUMMARY }), [storedSegment('m1', 0, spokenBy('Jane'))]);
    await repo.setSpeakerRename('m1', 'caption:jane', { name: 'Jane D.', origin: 'manual' });
    const renamed = await db.get('meetings', 'm1');
    expect(renamed).toEqual(
      storedMeeting({ speakerRenames: { 'caption:jane': { name: 'Jane D.', origin: 'manual' } } }),
    );
    expect(renamed).not.toHaveProperty('summary');
  });

  it('setSpeakerRename with null removes the rename and the summary', async () => {
    await store(storedMeeting({ summary: SUMMARY, speakerRenames: { self: { name: 'S.', origin: 'manual' } } }));
    await repo.setSpeakerRename('m1', 'self', null);
    const stored = await db.get('meetings', 'm1');
    expect(stored).toEqual(storedMeeting());
    expect(stored).not.toHaveProperty('summary');
  });

  it('setLabelOverride removes it and still stores the override', async () => {
    await store(storedMeeting({ summary: SUMMARY }), [storedSegment('m1', 0), storedSegment('m1', 1)]);
    await repo.setLabelOverride('m1', 'm1:mixed:1', 'Sarah');
    expect((await repo.listSegments('m1')).map((s) => s.labelOverride)).toEqual([null, 'Sarah']);
    const stored = await db.get('meetings', 'm1');
    expect(stored).toEqual(storedMeeting());
    expect(stored).not.toHaveProperty('summary');
  });

  it('setLabelOverride with null clears the override and removes the summary', async () => {
    await store(storedMeeting({ summary: SUMMARY }), [storedSegment('m1', 0, { labelOverride: 'Sarah' })]);
    await repo.setLabelOverride('m1', 'm1:mixed:0', null);
    expect((await repo.listSegments('m1'))[0]?.labelOverride).toBeNull();
    expect(await db.get('meetings', 'm1')).not.toHaveProperty('summary');
  });

  it("setLabelOverride for another meeting's line changes neither the line nor either summary", async () => {
    await store(storedMeeting({ id: 'm1', summary: SUMMARY }), [storedSegment('m1', 0)]);
    await store(storedMeeting({ id: 'm2', startedAt: 5, summary: SUMMARY }), [storedSegment('m2', 0)]);
    await repo.setLabelOverride('m2', 'm1:mixed:0', 'Sarah');
    expect((await repo.listSegments('m1'))[0]?.labelOverride).toBeNull();
    expect((await repo.getMeeting('m1'))?.summary).toEqual(SUMMARY);
    expect((await repo.getMeeting('m2'))?.summary).toEqual(SUMMARY);
  });

  it('a summary worked out after the edit shows the new label', async () => {
    await store(storedMeeting({ summary: SUMMARY }), [storedSegment('m1', 0)]);
    await repo.setLabelOverride('m1', 'm1:mixed:0', 'Sarah');
    const fresh = await repo.summarise('m1', (_meeting, segments) => ({
      v: 1,
      names: segments.flatMap((s) => (s.labelOverride ? [s.labelOverride] : [])),
      fileLines: segments.length,
      lastLineEndMs: null,
    }));
    expect(fresh?.names).toEqual(['Sarah']);
    expect((await repo.getMeeting('m1'))?.summary).toEqual(fresh);
  });
});

describe('writers that must keep unrelated fields', () => {
  const renames: Meeting['speakerRenames'] = { self: { name: 'S.', origin: 'manual' } };

  it('endMeeting keeps the renames and everything else', async () => {
    const open = storedMeeting({ endedAt: null, endReason: null, speakerRenames: renames });
    await store(open);
    await repo.endMeeting('m1', 9_999, 'call-ended');
    expect(await db.get('meetings', 'm1')).toEqual({ ...open, endedAt: 9_999, endReason: 'call-ended' });
  });

  it('endMeeting on an ended meeting keeps its summary', async () => {
    const ended = storedMeeting({ summary: SUMMARY });
    await store(ended);
    await repo.endMeeting('m1', 1, 'failed');
    expect(await db.get('meetings', 'm1')).toEqual(ended);
  });

  it('markOrphanedCrashed keeps the renames of the record it closes and leaves ended records alone', async () => {
    const open = storedMeeting({ id: 'open', endedAt: null, endReason: null, speakerRenames: renames });
    const ended = storedMeeting({ id: 'ended', startedAt: 5, summary: SUMMARY });
    await store(open);
    await store(ended);
    expect(await repo.markOrphanedCrashed(null, 7_777)).toEqual(['open']);
    expect(await db.get('meetings', 'open')).toEqual({ ...open, endedAt: 7_777, endReason: 'crashed' });
    expect(await db.get('meetings', 'ended')).toEqual(ended);
  });
});

describe('deleteMeeting', () => {
  it('removes a record that carries a summary, and its lines', async () => {
    await store(storedMeeting({ id: 'm1', summary: SUMMARY }), [storedSegment('m1', 0)]);
    await store(storedMeeting({ id: 'm2', startedAt: 5, summary: SUMMARY }), [storedSegment('m2', 0)]);
    await repo.deleteMeeting('m1');
    expect(await db.get('meetings', 'm1')).toBeUndefined();
    expect(await repo.listSegments('m1')).toEqual([]);
    expect((await repo.listMeetings()).map((m) => m.id)).toEqual(['m2']);
    expect(await repo.listSegments('m2')).toHaveLength(1);
  });
});
