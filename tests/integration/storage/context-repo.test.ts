// 008 T010: IndexedDB schema v3 (`meetingContexts`, research N2) and ContextRepo (data-model "Rules").
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { NEXT_MEETING_KEY } from '@/core/chat/notes';
import { ContextRepo } from '@/storage/context-repo';
import { DB_VERSION, openLiveAssistDb } from '@/storage/db';
import { storedMeeting } from '../../support/stored-meetings';

let n = 0;
let name: string;
beforeEach(() => {
  n += 1;
  name = `context-repo-test-${n}`;
});

const agenda = { name: 'agenda.md', source: 'file' as const, text: 'Item one' };
const pasted = { name: 'Pasted notes', source: 'paste' as const, text: 'Shared doc' };

/** 012: a meeting's notes are written only while the meeting exists (late-writers.test.ts), so `m1` is stored. */
async function repo() {
  const db = await openLiveAssistDb(name);
  await db.put('meetings', storedMeeting({ id: 'm1' }));
  return new ContextRepo(db);
}

describe('schema v3', () => {
  it('upgrades a v2 database, keeping its data and adding meetingContexts', async () => {
    const v2 = await openDB(name, 2, {
      upgrade(db) {
        const meetings = db.createObjectStore('meetings', { keyPath: 'id' });
        meetings.createIndex('startedAt', 'startedAt');
        const segments = db.createObjectStore('segments', { keyPath: 'id' });
        segments.createIndex('meetingId', 'meetingId');
        segments.createIndex('meetingStart', ['meetingId', 'startMs']);
        const turns = db.createObjectStore('chatTurns', { keyPath: 'id' });
        turns.createIndex('meetingId', 'meetingId');
        turns.createIndex('meetingSeq', ['meetingId', 'seq']);
      },
    });
    await v2.put('meetings', { id: 'm1', startedAt: 1 });
    await v2.put('chatTurns', { id: 'm1:chat:0', meetingId: 'm1', seq: 0 });
    v2.close();

    const db = await openLiveAssistDb(name);
    expect(DB_VERSION).toBe(4);
    expect([...db.objectStoreNames]).toContain('meetingContexts');
    expect(await db.get('meetings', 'm1')).toEqual({ id: 'm1', startedAt: 1 });
    expect(await db.count('chatTurns')).toBe(1);
    db.close();
  });
});

describe('ContextRepo', () => {
  it('get returns undefined when a meeting has no notes', async () => {
    expect(await (await repo()).get('m1')).toBeUndefined();
  });

  it('set starts at version 1 and replace increments it', async () => {
    const r = await repo();
    expect(await r.set('m1', agenda, 10)).toBe(1);
    expect(await r.get('m1')).toEqual({
      meetingId: 'm1',
      version: 1,
      notes: { ...agenda, addedAt: 10 },
      updatedAt: 10,
      schemaVersion: 1,
    });
    expect(await r.set('m1', pasted, 20)).toBe(2);
    expect(await r.get('m1')).toMatchObject({ version: 2, notes: { ...pasted, addedAt: 20 } });
  });

  it("remove leaves a meeting's tombstone with the next version and no text", async () => {
    const r = await repo();
    await r.set('m1', agenda, 10);
    await r.remove('m1', 30);
    expect(await r.get('m1')).toEqual({ meetingId: 'm1', version: 2, notes: null, updatedAt: 30, schemaVersion: 1 });
    await r.set('m1', pasted, 40);
    expect(await r.get('m1')).toMatchObject({ version: 3, notes: { ...pasted } });
  });

  it('remove of a meeting without notes writes nothing', async () => {
    const r = await repo();
    await r.remove('m1', 30);
    expect(await r.get('m1')).toBeUndefined();
  });

  it('remove of pending notes deletes the record', async () => {
    const r = await repo();
    await r.set(NEXT_MEETING_KEY, agenda, 10);
    await r.remove(NEXT_MEETING_KEY, 20);
    expect(await r.get(NEXT_MEETING_KEY)).toBeUndefined();
  });

  it('applyPending moves pending notes to the meeting as version 1 and clears them', async () => {
    const r = await repo();
    await r.set(NEXT_MEETING_KEY, agenda, 10);
    await r.set(NEXT_MEETING_KEY, pasted, 11);
    expect(await r.applyPending('m2', 50)).toBe(true);
    expect(await r.get('m2')).toEqual({
      meetingId: 'm2',
      version: 1,
      notes: { ...pasted, addedAt: 11 },
      updatedAt: 50,
      schemaVersion: 1,
    });
    expect(await r.get(NEXT_MEETING_KEY)).toBeUndefined();
  });

  it('applyPending does nothing without pending notes', async () => {
    const r = await repo();
    expect(await r.applyPending('m2', 50)).toBe(false);
    expect(await r.get('m2')).toBeUndefined();
  });
});
