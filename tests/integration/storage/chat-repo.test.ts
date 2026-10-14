// 003 T012: IndexedDB schema v2 (`chatTurns`, research R13) and ChatRepo (data-model "IndexedDB schema v2").
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { turnId, type ChatTurn } from '@/core/chat/turn';
import { segmentId, type Meeting, type TranscriptSegment } from '@/core/transcript/model';
import { ChatRepo } from '@/storage/chat-repo';
import { DB_VERSION, openLiveAssistDb, type LiveAssistDb } from '@/storage/db';

let n = 0;
let name: string;
beforeEach(() => {
  n += 1;
  name = `chat-repo-test-${n}`;
});

const meeting: Meeting = {
  id: 'm1',
  startedAt: 1,
  endedAt: null,
  endReason: null,
  source: { url: 'https://meet.google.com/abc', title: 'Standup', platform: 'meet' },
  languageMode: { kind: 'auto' },
  userName: 'Alex',
  speakerRenames: {},
  schemaVersion: 2,
};

const segment: TranscriptSegment = {
  id: segmentId('m1', 'mixed', 0),
  meetingId: 'm1',
  stream: 'mixed',
  seq: 0,
  startMs: 12_000,
  endMs: 14_000,
  text: 'Pricing stays.',
  language: 'en',
  speakerLabel: 'Jane',
  labelSource: 'caption',
  captionName: 'Jane',
  captionSelf: false,
  labelOverride: null,
  words: [],
  timing: 'estimated',
  sessionId: 's',
  createdAt: 1,
  schemaVersion: 2,
};

function turn(meetingId: string, seq: number, over: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: turnId(meetingId, seq),
    meetingId,
    seq,
    question: `q${seq}`,
    askedAt: 1_000 + seq,
    contextBlock: 'Transcript of the meeting so far. The person asking is Alex.',
    sentLines: {},
    transcriptUntilMs: 0,
    provider: 'anthropic',
    requestedModel: 'claude-sonnet-5-5',
    answeredBy: null,
    answer: '',
    status: 'complete',
    error: null,
    updatedAt: 1_000 + seq,
    schemaVersion: 1,
    ...over,
  };
}

/** The v1 database exactly as 001's upgrade path created it. */
async function createV1(): Promise<void> {
  const db = await openDB(name, 1, {
    upgrade(d) {
      const meetings = d.createObjectStore('meetings', { keyPath: 'id' });
      meetings.createIndex('startedAt', 'startedAt');
      const segments = d.createObjectStore('segments', { keyPath: 'id' });
      segments.createIndex('meetingId', 'meetingId');
      segments.createIndex('meetingStart', ['meetingId', 'startMs']);
    },
  });
  await db.put('meetings', meeting);
  await db.put('segments', segment);
  db.close();
}

describe('schema v2 upgrade', () => {
  it('is version 4 (008 added meetingContexts, 013 captionTurns)', () => expect(DB_VERSION).toBe(4));

  it('upgrades a v1 database: meetings and segments kept, chatTurns created with its indexes', async () => {
    await createV1();
    const db = await openLiveAssistDb(name);
    expect(db.version).toBe(DB_VERSION);
    expect(await db.get('meetings', 'm1')).toEqual(meeting);
    expect(await db.get('segments', segment.id)).toEqual(segment);
    expect([...db.objectStoreNames].sort()).toEqual([
      'captionTurns',
      'chatTurns',
      'meetingContexts',
      'meetings',
      'segments',
    ]);
    const store = db.transaction('chatTurns').store;
    expect([...store.indexNames].sort()).toEqual(['meetingId', 'meetingSeq']);
    expect(store.keyPath).toBe('id');
    expect(store.index('meetingSeq').keyPath).toEqual(['meetingId', 'seq']);
    db.close();
  });

  it('creates every store on a fresh database', async () => {
    const db = await openLiveAssistDb(name);
    expect([...db.objectStoreNames].sort()).toEqual([
      'captionTurns',
      'chatTurns',
      'meetingContexts',
      'meetings',
      'segments',
    ]);
    db.close();
  });

  it('closes its connection on versionchange, so a newer version is never blocked', async () => {
    const db = await openLiveAssistDb(name);
    let blocked = false;
    const newer = await openDB(name, DB_VERSION + 1, {
      blocked: () => {
        blocked = true;
      },
    });
    expect(blocked).toBe(false);
    expect(() => db.transaction('meetings')).toThrow();
    newer.close();
  });
});

describe('ChatRepo', () => {
  let db: LiveAssistDb;
  let repo: ChatRepo;
  beforeEach(async () => {
    db = await openLiveAssistDb(name);
    repo = new ChatRepo(db);
    // 012: a turn is written only while its meeting exists (tests/integration/storage/late-writers.test.ts).
    await db.put('meetings', meeting);
    await db.put('meetings', { ...meeting, id: 'm2', startedAt: 2 });
  });

  it('putTurn is idempotent by id (the latest write wins)', async () => {
    await repo.putTurn(turn('m1', 0, { answer: 'Pri', status: 'streaming' }));
    await repo.putTurn(turn('m1', 0, { answer: 'Pricing stays.', status: 'complete' }));
    expect(await repo.listTurns('m1')).toEqual([turn('m1', 0, { answer: 'Pricing stays.', status: 'complete' })]);
  });

  it('listTurns gives one meeting in seq order', async () => {
    await repo.putTurn(turn('m1', 2));
    await repo.putTurn(turn('m2', 0));
    await repo.putTurn(turn('m1', 0));
    await repo.putTurn(turn('m1', 10));
    await repo.putTurn(turn('m1', 1));
    expect((await repo.listTurns('m1')).map((t) => t.seq)).toEqual([0, 1, 2, 10]);
    expect((await repo.listTurns('m2')).map((t) => t.id)).toEqual(['m2:chat:0']);
    expect(await repo.listTurns('none')).toEqual([]);
  });

  it('nextSeq is 0 for a meeting without turns, else one past the highest', async () => {
    expect(await repo.nextSeq('m1')).toBe(0);
    await repo.putTurn(turn('m1', 0));
    await repo.putTurn(turn('m1', 4));
    await repo.putTurn(turn('m2', 9));
    expect(await repo.nextSeq('m1')).toBe(5);
  });

  it('markStaleStreaming stops streaming turns idle for more than 60 s and returns their ids', async () => {
    const now = 1_000_000;
    await repo.putTurn(turn('m1', 0, { status: 'streaming', updatedAt: now - 61_000, answer: 'Par' }));
    await repo.putTurn(turn('m1', 1, { status: 'streaming', updatedAt: now - 5_000 }));
    await repo.putTurn(turn('m2', 0, { status: 'complete', updatedAt: 0 }));
    await repo.putTurn(turn('m2', 1, { status: 'streaming', updatedAt: 0 }));
    expect((await repo.markStaleStreaming(now)).sort()).toEqual(['m1:chat:0', 'm2:chat:1']);
    const [first, second] = await repo.listTurns('m1');
    expect(first).toMatchObject({ status: 'stopped', answer: 'Par', updatedAt: now });
    expect(second?.status).toBe('streaming');
    expect((await repo.listTurns('m2')).map((t) => t.status)).toEqual(['complete', 'stopped']);
    expect(await repo.markStaleStreaming(now)).toEqual([]);
  });
});
