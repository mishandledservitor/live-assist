// 013 T051 (FR-008, FR-009, SC-003, constitution I and II; research R10): a pinning test, in the manner of
// notes-leak.test.ts. A whole Meet meeting whose captions carry the marker sentence goes through the runtime, the
// repository and a replayed transcription session, is asked a question, and is downloaded as a transcript. The marker
// is in the `captionTurns` store and nowhere else.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captionsFile } from '@/core/export/captions-file';
import { transcriptFile } from '@/core/export/transcript-file';
import type { ChatRequest } from '@/core/chat/provider';
import { createLogger } from '@/core/log';
import type { LiveEvent } from '@/core/messaging/protocol';
import { MeetingRuntime, type MeetingStore, type MixedFrameSource } from '@/core/session/meeting-runtime';
import { DEFAULT_CHAT_SETTINGS } from '@/core/settings/schema';
import type { SessionOptions } from '@/core/transcription/provider';
import { createChatSession } from '@/entrypoints/background/chat-session';
import { createFixtureChatProvider } from '@/providers/chat/fixture-provider';
import { FakeTranscriptionProvider } from '@/providers/transcription/fake/fixture-provider';
import { ChatRepo } from '@/storage/chat-repo';
import { ContextRepo } from '@/storage/context-repo';
import { openLiveAssistDb, type LiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK, expectNoMarker, holdsMarker } from '../../support/caption-marker';
import { FakeMeetAdapter } from '../../support/fake-meet-adapter';
import { loadFixture } from '../../support/fake-websocket';

const T0 = 1_760_000_000_000;
let n = 0;
let db: LiveAssistDb;

beforeEach(async () => {
  n += 1;
  db = await openLiveAssistDb(`captions-leak-${n}`);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

/** Runs a promise to completion in 1 ms clock steps, letting fake-indexeddb's real macrotasks run in between. */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  p.then(
    () => (done = true),
    () => (done = true),
  );
  while (!done) {
    await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(1);
  }
  return p;
}

/** Every record and key of one store, as one value to search. */
async function storeDump(name: (typeof db.objectStoreNames)[number]): Promise<unknown> {
  const tx = db.transaction(name);
  const [records, keys] = await Promise.all([tx.store.getAll(), tx.store.getAllKeys()]);
  await tx.done;
  return { records, keys };
}

/** One meeting from Start to Stop, with captions carrying the marker and one question asked. */
async function meetingWithMarkerCaptions() {
  const repo = new MeetingRepo(db);
  const chats = new ChatRepo(db);
  const contexts = new ContextRepo(db);
  const inner = new FakeTranscriptionProvider([loadFixture('happy-path')]);
  const sessionOptions: SessionOptions[] = [];
  const logs: unknown[][] = [];
  const sink = {
    error: (...a: unknown[]) => void logs.push(a),
    warn: (...a: unknown[]) => void logs.push(a),
    info: (...a: unknown[]) => void logs.push(a),
  };
  // The offscreen document's store, with the caption wiring of T026: the repository itself.
  let failNextCaptionWrite = true;
  const store: MeetingStore = {
    createMeeting: (m) => repo.createMeeting(m),
    appendSegment: (s) => repo.appendSegment(s),
    updateSegment: (s) => repo.updateSegment(s),
    setSpeakerRename: (id, key, entry) => repo.setSpeakerRename(id, key, entry),
    endMeeting: (id, at, reason) => repo.endMeeting(id, at, reason),
    putCaptionTurns: (id, turns) => {
      // The first write fails once, so the failure path is logged too.
      if (failNextCaptionWrite) {
        failNextCaptionWrite = false;
        return Promise.reject(new Error(`could not write "${JSON.stringify(turns)}"`));
      }
      return repo.putCaptionTurns(id, turns);
    },
  };
  const meet = new FakeMeetAdapter({ state: 'on' });
  const runtime = new MeetingRuntime({
    provider: {
      id: inner.id,
      openSession: (opts) => {
        sessionOptions.push(opts);
        return inner.openSession(opts);
      },
    },
    store,
    adapter: meet,
    now: () => Date.now(),
    log: createLogger('runtime', sink),
  });
  const events: LiveEvent[] = [];
  runtime.subscribe((e) => void events.push(e));
  let push: (() => void) | null = null;
  const audio: MixedFrameSource = (onFrames) => {
    push = () => onFrames(new Int16Array(1600), new Int16Array(1600).fill(1));
    return Promise.resolve({ mic: { ok: true }, stop: () => Promise.resolve() });
  };
  await settle(
    runtime.begin({
      meetingId: 'm1',
      source: { url: 'https://meet.google.com/abc-defg-hij', title: 'Standup' },
      language: { kind: 'auto' },
      keyterms: ['Lighthouse'],
      userName: 'Alex',
      audio,
      speakerNameMappings: [{ captionName: 'Emma Jones', displayName: 'Emma', updatedAt: 1 }],
    }),
  );
  await contexts.set('m1', { name: 'agenda.md', source: 'file', text: 'Item one: pricing.' }, Date.now());

  const script: Record<number, () => void> = {
    300: () => meet.emitText('pg:1', 'Emma Jones', CAPTION_MARKER.slice(0, 20)),
    1_300: () => meet.emitText('pg:1', 'Emma Jones', CAPTION_MARKER),
    2_000: () => meet.emitText('pg:2', 'You', CAPTION_MARKER_GREEK, { self: true }),
    3_000: () => meet.caption('pg:1', 'Emma Jones'),
    3_300: () => meet.caption('pg:1', 'Emma Jones'),
    3_600: () => meet.caption('pg:1', 'Emma Jones'),
    5_000: () => meet.caption('pg:2', 'You', true),
    5_300: () => meet.caption('pg:2', 'You', true),
    5_600: () => meet.caption('pg:2', 'You', true),
    7_000: () => meet.emitText('pg:1', 'Emma Jones', `${CAPTION_MARKER} ${CAPTION_MARKER}`),
  };
  const done = new Set<number>();
  const from = Date.now();
  for (let t = 0; t < 12_500; t += 100) {
    for (const [at, fn] of Object.entries(script))
      if (from + Number(at) <= Date.now() && !done.has(Number(at))) {
        done.add(Number(at));
        fn();
      }
    (push as (() => void) | null)?.();
    await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(100);
  }

  // A question while the meeting runs, answered by the fixture chat provider.
  const requests: ChatRequest[] = [];
  const posts: unknown[] = [];
  const session = createChatSession({
    meetings: repo,
    chats,
    contexts,
    chatSettings: () => Promise.resolve({ ...DEFAULT_CHAT_SETTINGS, setupComplete: true }),
    credentials: {
      id: 'local-key',
      status: () => Promise.resolve({ configured: true, hint: '1234' }),
      providerFor: (p) =>
        Promise.resolve(createFixtureChatProvider({ id: p, scenario: 'complete', onRequest: (r) => requests.push(r) })),
    },
    now: () => Date.now(),
    logger: createLogger('chat', sink),
    post: (m) => void posts.push(m),
  });
  await settle(session.handle({ type: 'chat/ask', meetingId: 'm1', question: 'What did Emma say?' }));

  await settle(runtime.end('user-stop'));
  const providerSaw = { sessionOptions, sockets: inner.sockets.map((s) => ({ url: s.url, sent: s.sent })) };
  return { repo, events, logs, providerSaw, requests, posts, snapshot: runtime.snapshot() };
}

describe("where Meet's kept captions never go", () => {
  it('the marker is in captionTurns, with the meeting marked, so the checks below can fail', async () => {
    const { repo, logs } = await settle(meetingWithMarkerCaptions());
    const turns = await repo.listCaptionTurns('m1');
    expect(turns.map((t) => [t.seq, t.speakerName, t.self, t.text])).toEqual([
      [1, 'Emma Jones', false, `${CAPTION_MARKER} ${CAPTION_MARKER}`],
      [2, 'You', true, CAPTION_MARKER_GREEK],
    ]);
    expect(holdsMarker(await storeDump('captionTurns'))).toBe(true);
    expect(await repo.getMeeting('m1')).toMatchObject({ hasCaptions: true, endReason: 'user-stop' });
    // The failed first write was logged, and lines were named beside it.
    expect(logs.length).toBeGreaterThan(0);
    expect((await repo.listSegments('m1')).map((s) => s.speakerLabel)).toEqual(['Emma Jones', 'Alex']);
  });

  it('no other store holds it', async () => {
    await settle(meetingWithMarkerCaptions());
    const names = Array.from(db.objectStoreNames);
    expect(names.sort()).toEqual(['captionTurns', 'chatTurns', 'meetingContexts', 'meetings', 'segments']);
    for (const name of names) {
      if (name === 'captionTurns') continue;
      const dump = await storeDump(name);
      expect((dump as { records: unknown[] }).records.length, `${name} has records`).toBeGreaterThan(0);
      expect(holdsMarker(dump), `caption text found in "${name}"`).toBe(false);
    }
  });

  it('no provider call, live event, panel message or log line holds it', async () => {
    const { events, logs, providerSaw, requests, posts, snapshot } = await settle(meetingWithMarkerCaptions());
    expect(providerSaw.sockets.flatMap((s) => s.sent).length).toBeGreaterThan(10);
    expectNoMarker(providerSaw);
    expect(requests).toHaveLength(1);
    expectNoMarker(requests);
    expectNoMarker(posts);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['live/captions-kept', 'live/labels']));
    for (const e of events) expectNoMarker(e);
    expectNoMarker(snapshot);
    for (const call of logs) expectNoMarker(call);
  });

  it('the transcript file holds what was transcribed and none of the captions', async () => {
    const { repo } = await settle(meetingWithMarkerCaptions());
    const meeting = (await repo.getMeeting('m1'))!;
    const file = transcriptFile(meeting, await repo.listSegments('m1'));
    expect(file.body).toContain('Hello everyone.');
    expectNoMarker(file);
    // Only the captions file does, and it is built from the one store that holds them.
    expect(holdsMarker(captionsFile(meeting, await repo.listCaptionTurns('m1')).body)).toBe(true);
  });

  it('after deleting the meeting no store holds it at all', async () => {
    const { repo } = await settle(meetingWithMarkerCaptions());
    await repo.deleteMeeting('m1');
    for (const name of Array.from(db.objectStoreNames))
      expect(holdsMarker(await storeDump(name)), `caption text found in "${name}"`).toBe(false);
    expect(await db.count('captionTurns')).toBe(0);
  });
});
