// 013 T003 (research R5): DB_VERSION 3 → 4 adds the `captionTurns` store and touches nothing else. Every record a
// version-3 database held, in every store, is deep-equal afterwards, and an older open connection never blocks it.
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_VERSION, openLiveAssistDb } from '@/storage/db';
import { spokenBy, storedMeeting, storedSegment } from '../../support/stored-meetings';

let n = 0;
let name: string;

beforeEach(() => {
  n += 1;
  name = `migration-v4-test-${n}`;
});

/** A meeting as it was stored before 002: no renames, no schema version, a development-build stream on its line. */
const pre002Meeting = {
  id: 'old',
  startedAt: 1_000,
  endedAt: 61_000,
  endReason: 'user-stop',
  source: { url: 'https://example.test/call', title: 'Old call', platform: 'generic' },
  languageMode: { kind: 'auto' },
  userName: 'Alex',
};
const pre002Segment = {
  id: 'old:tab:0',
  meetingId: 'old',
  stream: 'tab',
  seq: 0,
  startMs: 0,
  endMs: 900,
  text: 'An invented line from an old record.',
  language: null,
  speakerLabel: 'Others',
  labelSource: 'fallback',
  words: [],
  timing: 'estimated',
  sessionId: 's0',
  createdAt: 1,
};

const meetings = [
  pre002Meeting,
  storedMeeting({ id: 'm1', speakerRenames: { self: { name: 'Si', origin: 'manual' } } }),
  storedMeeting({
    id: 'm2',
    startedAt: 5_000_000,
    endedAt: null,
    endReason: null,
    summary: { v: 1, names: ['Jane'], fileLines: 2, lastLineEndMs: 3_500 },
  }),
];
const segments = [
  pre002Segment,
  storedSegment('m1', 0, spokenBy('Jane')),
  storedSegment('m1', 1, { labelOverride: 'Mike' }),
  storedSegment('m2', 0),
];
const chatTurns = [
  {
    id: 'm1:chat:0',
    meetingId: 'm1',
    seq: 0,
    question: 'What was decided?',
    answer: 'Pricing stays.',
    status: 'complete',
  },
  { id: 'm2:chat:0', meetingId: 'm2', seq: 0, question: 'Who spoke?', answer: '', status: 'streaming' },
];
const contexts = [
  {
    meetingId: 'm1',
    version: 1,
    notes: { name: 'agenda.md', source: 'file', text: 'Item one', addedAt: 3 },
    updatedAt: 3,
    schemaVersion: 1,
  },
  { meetingId: 'next', version: 2, notes: null, updatedAt: 9, schemaVersion: 1 },
];

/** A database exactly as version 3 of src/storage/db.ts made it, holding the records above. */
async function seedV3(): Promise<void> {
  const db = await openDB(name, 3, {
    upgrade(d) {
      const m = d.createObjectStore('meetings', { keyPath: 'id' });
      m.createIndex('startedAt', 'startedAt');
      const s = d.createObjectStore('segments', { keyPath: 'id' });
      s.createIndex('meetingId', 'meetingId');
      s.createIndex('meetingStart', ['meetingId', 'startMs']);
      const c = d.createObjectStore('chatTurns', { keyPath: 'id' });
      c.createIndex('meetingId', 'meetingId');
      c.createIndex('meetingSeq', ['meetingId', 'seq']);
      d.createObjectStore('meetingContexts', { keyPath: 'meetingId' });
    },
  });
  for (const r of meetings) await db.put('meetings', r);
  for (const r of segments) await db.put('segments', r);
  for (const r of chatTurns) await db.put('chatTurns', r);
  for (const r of contexts) await db.put('meetingContexts', r);
  db.close();
}

const byKey = (key: string) => (a: object, b: object) =>
  String((a as Record<string, unknown>)[key]).localeCompare(String((b as Record<string, unknown>)[key]));

describe('IndexedDB version 4 (013)', () => {
  it('is version 4', () => expect(DB_VERSION).toBe(4));

  it('upgrades a version-3 database: an empty captionTurns store, every earlier record as it was', async () => {
    await seedV3();
    const db = await openLiveAssistDb(name);
    expect(db.version).toBe(4);
    expect([...db.objectStoreNames].sort()).toEqual([
      'captionTurns',
      'chatTurns',
      'meetingContexts',
      'meetings',
      'segments',
    ]);
    const store = db.transaction('captionTurns').store;
    expect(store.keyPath).toEqual(['meetingId', 'seq']);
    expect([...store.indexNames]).toEqual([]);
    expect(store.autoIncrement).toBe(false);
    expect(await db.count('captionTurns')).toBe(0);

    const raw = db as unknown as { getAll(store: string): Promise<Record<string, unknown>[]> };
    expect((await raw.getAll('meetings')).sort(byKey('id'))).toEqual([...meetings].sort(byKey('id')));
    expect((await raw.getAll('segments')).sort(byKey('id'))).toEqual([...segments].sort(byKey('id')));
    expect((await raw.getAll('chatTurns')).sort(byKey('id'))).toEqual([...chatTurns].sort(byKey('id')));
    expect((await raw.getAll('meetingContexts')).sort(byKey('meetingId'))).toEqual(
      [...contexts].sort(byKey('meetingId')),
    );
    // The indexes the earlier stores had are still there.
    expect([...db.transaction('segments').store.indexNames].sort()).toEqual(['meetingId', 'meetingStart']);
    expect([...db.transaction('chatTurns').store.indexNames].sort()).toEqual(['meetingId', 'meetingSeq']);
    expect([...db.transaction('meetings').store.indexNames]).toEqual(['startedAt']);
    db.close();
  });

  it('creates all five stores on a fresh database', async () => {
    const db = await openLiveAssistDb(name);
    expect([...db.objectStoreNames].sort()).toEqual([
      'captionTurns',
      'chatTurns',
      'meetingContexts',
      'meetings',
      'segments',
    ]);
    expect(db.transaction('captionTurns').store.keyPath).toEqual(['meetingId', 'seq']);
    db.close();
  });

  it('an older connection that closes on versionchange does not block the upgrade', async () => {
    await seedV3();
    // What a panel left open by the previous build does: it holds version 3 and closes when a newer version asks.
    const old = await openDB(name, 3);
    old.addEventListener('versionchange', () => old.close());
    let blocked = false;
    const request = indexedDB.open(name, DB_VERSION);
    request.onblocked = () => {
      blocked = true;
    };
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(String(request.error)));
    });
    expect(blocked).toBe(false);
    expect(request.result.version).toBe(4);
    expect(() => old.transaction('meetings')).toThrow();
    request.result.close();

    const db = await openLiveAssistDb(name);
    expect(await db.count('meetings')).toBe(meetings.length);
    db.close();
  });
});
