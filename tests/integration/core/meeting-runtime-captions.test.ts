// 013 T022 (FR-001, FR-003, FR-004, FR-006–FR-009, FR-015; contracts/captions-capture.md "Runtime"): MeetingRuntime
// keeps the text of Meet's captions through a CaptionLog, beside and apart from everything it did before. A fake Meet
// adapter plays text events, a fake store records what it is asked to write, the transcription provider replays a
// recorded session. Every caption sentence is invented.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTION_STORE_FLUSH_MS } from '@/core/captions/caption-log';
import type { StoredCaptionTurn } from '@/core/captions/model';
import type { Logger } from '@/core/log';
import type { LiveEvent } from '@/core/messaging/protocol';
import type { PlatformAdapter } from '@/core/platform/adapter';
import { GenericAdapter } from '@/core/platform/generic-adapter';
import {
  CAPTIONS_CLOSE_TIMEOUT_MS,
  MeetingRuntime,
  RESTORE_TIMEOUT_MS,
  type BeginParams,
  type MeetingStore,
  type MixedFrameSource,
} from '@/core/session/meeting-runtime';
import type { Meeting, SpeakerKey, SpeakerRename, TranscriptSegment } from '@/core/transcript/model';
import type { SessionOptions } from '@/core/transcription/provider';
import { FakeTranscriptionProvider } from '@/providers/transcription/fake/fixture-provider';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK, expectNoMarker, holdsMarker } from '../../support/caption-marker';
import { FakeMeetAdapter } from '../../support/fake-meet-adapter';
import { loadFixture } from '../../support/fake-websocket';

const T0 = 1_760_000_000_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

/** An in-memory MeetingStore that records every call in order. */
function fakeStore() {
  const calls: string[] = [];
  const rows = new Map<number, StoredCaptionTurn>();
  const puts: { meetingId: string; turns: StoredCaptionTurn[]; at: number }[] = [];
  const renames: { meetingId: string; key: SpeakerKey; entry: SpeakerRename | null }[] = [];
  const segments: TranscriptSegment[] = [];
  const state = {
    meeting: null as Meeting | null,
    /** What putCaptionTurns does next: store and answer true, answer false, or reject. */
    captions: 'store' as 'store' | 'refuse' | 'reject' | 'hang',
  };
  const store: Required<MeetingStore> = {
    createMeeting: (m) => {
      calls.push('createMeeting');
      state.meeting = m;
      return Promise.resolve();
    },
    appendSegment: (s) => {
      calls.push('appendSegment');
      segments.push(s);
      return Promise.resolve();
    },
    updateSegment: () => {
      calls.push('updateSegment');
      return Promise.resolve();
    },
    setSpeakerRename: (meetingId, key, entry) => {
      calls.push('setSpeakerRename');
      renames.push({ meetingId, key, entry });
      return Promise.resolve();
    },
    endMeeting: () => {
      calls.push('endMeeting');
      return Promise.resolve();
    },
    putCaptionTurns: (meetingId, turns) => {
      calls.push('putCaptionTurns');
      puts.push({ meetingId, turns: turns.map((t) => ({ ...t })), at: Date.now() });
      if (state.captions === 'reject') return Promise.reject(new Error(`could not write "${CAPTION_MARKER}"`));
      if (state.captions === 'hang') return new Promise<boolean>(() => undefined);
      if (state.captions === 'refuse') return Promise.resolve(false);
      for (const t of turns) rows.set(t.seq, { ...t });
      return Promise.resolve(true);
    },
  };
  return { store, calls, rows, puts, renames, segments, state, stored: () => [...rows.values()] };
}

function setup(adapter: PlatformAdapter = new FakeMeetAdapter({ state: 'on' })) {
  const inner = new FakeTranscriptionProvider([loadFixture('happy-path')]);
  const sessionOptions: SessionOptions[] = [];
  const provider = {
    id: inner.id,
    openSession: (opts: SessionOptions) => {
      sessionOptions.push(opts);
      return inner.openSession(opts);
    },
  };
  const logged: unknown[][] = [];
  const log: Logger = {
    error: (...a) => void logged.push(a),
    warn: (...a) => void logged.push(a),
    info: (...a) => void logged.push(a),
  };
  const fake = fakeStore();
  const runtime = new MeetingRuntime({ provider, store: fake.store, adapter, now: () => Date.now(), log });
  const events: LiveEvent[] = [];
  runtime.subscribe((e) => void events.push(e));
  let listener: ((tab: Int16Array, mic: Int16Array | null) => void) | null = null;
  const audio: MixedFrameSource = (onFrames) => {
    listener = onFrames;
    return Promise.resolve({ mic: { ok: true }, stop: () => Promise.resolve() });
  };
  const params = (over: Partial<BeginParams> = {}): BeginParams => ({
    meetingId: 'm1',
    source: { url: 'https://meet.google.com/abc-defg-hij', title: 'Standup' },
    language: { kind: 'auto' },
    keyterms: ['Lighthouse'],
    userName: 'Alex',
    audio,
    ...over,
  });
  /** Everything the transcription provider was given: the session options and every message on every socket. */
  const providerSaw = () => ({ sessionOptions, sockets: inner.sockets.map((s) => ({ url: s.url, sent: s.sent })) });
  return { ...fake, runtime, events, logged, params, providerSaw, push: () => listener?.(new Int16Array(1600), null) };
}

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

/** Advances the clock, one audio frame per 100 ms, running `script` entries when their meeting time has come. */
async function play(ms: number, push: () => void, script: Record<number, () => void> = {}) {
  const done = new Set<number>();
  const from = Date.now();
  for (let t = 0; t < ms; t += 100) {
    for (const [at, fn] of Object.entries(script))
      if (from + Number(at) <= Date.now() && !done.has(Number(at))) {
        done.add(Number(at));
        fn();
      }
    push();
    await vi.advanceTimersByTimeAsync(100);
  }
}

const meetOf = (adapter: PlatformAdapter) => adapter as FakeMeetAdapter;

describe('MeetingRuntime keeps caption text (013)', () => {
  it(`text events reach the store within ${CAPTION_STORE_FLUSH_MS} ms, with the meeting's id, seq and start`, async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, puts, stored } = setup(meet);
    await settle(runtime.begin(params()));
    const began = Date.now() - T0;
    await play(1_000, push);
    meet.emitText('pg:1', 'Emma Jones', 'Good morning');
    const at = Date.now();
    await play(300, push);
    meet.emitText('pg:2', 'You', 'Yes, it is up.', { self: true });
    meet.emitText('pg:1', 'Emma Jones', 'Good morning, can everyone see the slide?', { firstSeenAt: at });
    await play(CAPTION_STORE_FLUSH_MS - 300, push);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.meetingId).toBe('m1');
    expect(puts[0]!.at - at).toBeLessThanOrEqual(CAPTION_STORE_FLUSH_MS);
    expect(stored()).toEqual([
      {
        meetingId: 'm1',
        seq: 1,
        startMs: began + 1_000,
        speakerName: 'Emma Jones',
        self: false,
        text: 'Good morning, can everyone see the slide?',
        schemaVersion: 1,
      },
      {
        meetingId: 'm1',
        seq: 2,
        startMs: began + 1_300,
        speakerName: 'You',
        self: true,
        text: 'Yes, it is up.',
        schemaVersion: 1,
      },
    ]);
  });

  it('killed at any moment, the store lacks at most the last flush interval of changes', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, rows } = setup(meet);
    await settle(runtime.begin(params()));
    const started = Date.now();
    /** Every text the turn has had, with when it got it. */
    const history: { at: number; text: string }[] = [];
    let text = '';
    for (let step = 0; step < 90; step += 1) {
      if (step % 3 === 0) {
        text += ` word${step}`;
        meet.emitText('pg:1', 'Emma Jones', text.trim(), { firstSeenAt: started });
        history.push({ at: Date.now(), text: text.trim() });
      }
      await play(100, push);
      // "Killed now": no end(), nothing more happens. What the store holds must be recent.
      const now = Date.now();
      const due = history.filter((h) => h.at <= now - CAPTION_STORE_FLUSH_MS).at(-1);
      if (due) expect((rows.get(1)?.text ?? '').length).toBeGreaterThanOrEqual(due.text.length);
    }
    expect(history.length).toBe(30);
  });

  it('after end() no event is stored, and the last flush happens before the meeting is marked ended', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, calls, puts, stored } = setup(meet);
    await settle(runtime.begin(params()));
    await play(500, push);
    meet.emitText('pg:1', 'Emma Jones', 'Said just before Stop.');
    await play(300, push);
    expect(puts).toEqual([]);
    await settle(runtime.end('user-stop'));
    expect(stored().map((t) => t.text)).toEqual(['Said just before Stop.']);
    expect(calls.lastIndexOf('putCaptionTurns')).toBeLessThan(calls.indexOf('endMeeting'));
    expect(calls.indexOf('endMeeting')).toBeGreaterThan(-1);

    meet.emitText('pg:1', 'Emma Jones', 'Said just before Stop. And after it.');
    meet.emitText('pg:2', 'Tom Brown', 'A turn after Stop.');
    await vi.advanceTimersByTimeAsync(CAPTION_STORE_FLUSH_MS * 3);
    expect(puts).toHaveLength(1);
    expect(stored().map((t) => t.text)).toEqual(['Said just before Stop.']);
  });

  it('an event that arrives while the meeting is ending is not stored', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, stored } = setup(meet);
    await settle(runtime.begin(params()));
    await play(500, push);
    meet.emitText('pg:1', 'Emma Jones', 'Before.');
    const ending = runtime.end('user-stop');
    meet.emitText('pg:2', 'Tom Brown', 'During the end.');
    await settle(ending);
    expect(stored().map((t) => t.text)).toEqual(['Before.']);
  });

  it.each([
    [{ state: 'off-by-user', reason: 'Captions were turned off' }],
    [{ state: 'unavailable', reason: "Couldn't turn on Meet captions" }],
    [{ state: 'starting', reason: 'Turning on Meet captions…' }],
  ] as const)('events are stored while the captions state is $state too', async (state) => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, stored } = setup(meet);
    await settle(runtime.begin(params()));
    meet.setState(state);
    meet.emitText('pg:1', 'Emma Jones', 'The page decides what it sends.');
    await play(CAPTION_STORE_FLUSH_MS, push);
    expect(stored().map((t) => t.text)).toEqual(['The page decides what it sends.']);
  });

  it('emits live/captions-kept once, after the first stored write, and the snapshot then says so', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, events, calls } = setup(meet);
    await settle(runtime.begin(params()));
    const kept = () => events.filter((e) => e.type === 'live/captions-kept');
    meet.emitText('pg:1', 'Emma Jones', 'First.');
    await play(CAPTION_STORE_FLUSH_MS - 100, push);
    expect(kept()).toEqual([]);
    expect(runtime.snapshot().meeting).not.toHaveProperty('hasCaptions');
    await play(100, push);
    expect(calls).toContain('putCaptionTurns');
    expect(kept()).toEqual([{ type: 'live/captions-kept', meetingId: 'm1' }]);
    expect(runtime.snapshot().meeting).toMatchObject({ id: 'm1', hasCaptions: true });

    meet.emitText('pg:1', 'Emma Jones', 'First. Second.');
    meet.emitText('pg:2', 'Tom Brown', 'Third.');
    await play(CAPTION_STORE_FLUSH_MS * 2, push);
    expect(kept()).toHaveLength(1);
    await settle(runtime.end('user-stop'));
    expect(kept()).toHaveLength(1);
    expect(runtime.snapshot().meeting).toMatchObject({ hasCaptions: true, endReason: 'user-stop' });
  });

  it('never says captions are kept when the store refused the first write', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, events, state } = setup(meet);
    state.captions = 'refuse';
    await settle(runtime.begin(params()));
    meet.emitText('pg:1', 'Emma Jones', 'Not kept.');
    await play(CAPTION_STORE_FLUSH_MS * 2, push);
    expect(events.filter((e) => e.type === 'live/captions-kept')).toEqual([]);
    expect(runtime.snapshot().meeting).not.toHaveProperty('hasCaptions');
  });
});

describe('remembered names for the captions file (spec P2)', () => {
  const mappings = [
    { captionName: 'Emma Jones', displayName: 'Emma', updatedAt: 1 },
    { captionName: 'You', displayName: 'Not me', updatedAt: 1 },
  ];

  it("the first kept turn of a remembered caption name stores a 'remembered' rename and tells the panel", async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, renames, events } = setup(meet);
    await settle(runtime.begin(params({ speakerNameMappings: mappings })));
    meet.emitText('pg:1', '  emma   JONES ', 'Good morning.');
    meet.emitText('pg:2', 'Tom Brown', 'Hello.');
    await play(300, push);
    const expected = { 'caption:emma jones': { name: 'Emma', origin: 'remembered' } };
    expect(renames).toEqual([
      { meetingId: 'm1', key: 'caption:emma jones', entry: { name: 'Emma', origin: 'remembered' } },
    ]);
    expect(events).toContainEqual({ type: 'live/labels', meetingId: 'm1', speakerRenames: expected });
    expect(runtime.snapshot().meeting?.speakerRenames).toEqual(expected);
    // Once: a second turn of the same name stores nothing more.
    meet.emitText('pg:3', 'Emma Jones', 'And again.');
    await play(300, push);
    expect(renames).toHaveLength(1);
  });

  it('never over a rename the meeting already has', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, renames } = setup(meet);
    await settle(runtime.begin(params({ speakerNameMappings: mappings })));
    await settle(
      runtime.command({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'caption:emma jones', name: 'E. Jones' }),
    );
    meet.emitText('pg:1', 'Emma Jones', 'Good morning.');
    await play(300, push);
    expect(renames).toEqual([
      { meetingId: 'm1', key: 'caption:emma jones', entry: { name: 'E. Jones', origin: 'manual' } },
    ]);
    expect(runtime.snapshot().meeting?.speakerRenames).toEqual({
      'caption:emma jones': { name: 'E. Jones', origin: 'manual' },
    });
  });

  it("never for a self turn, even when Meet's word for the user has a remembered name", async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, renames } = setup(meet);
    await settle(runtime.begin(params({ speakerNameMappings: mappings })));
    meet.emitText('pg:1', 'You', 'This is me.', { self: true });
    await play(300, push);
    expect(renames).toEqual([]);
  });

  it('a name without a remembered mapping stores nothing', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, renames, events } = setup(meet);
    await settle(runtime.begin(params({ speakerNameMappings: mappings })));
    meet.emitText('pg:1', 'Tom Brown', 'Hello.');
    await play(300, push);
    expect(renames).toEqual([]);
    expect(events.filter((e) => e.type === 'live/labels')).toEqual([]);
  });
});

describe('captions never get in the way of the transcript (constitution IV)', () => {
  it('a rejected caption write does not delay or break the transcript lines', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, segments, state, puts, events } = setup(meet);
    state.captions = 'reject';
    await settle(runtime.begin(params()));
    await play(12_500, push, { 500: () => meet.emitText('pg:1', 'Emma Jones', 'A caption the store rejects.') });
    expect(puts.length).toBeGreaterThan(2);
    expect(segments.map((s) => s.text)).toEqual(['Hello everyone.', 'Καλημέρα σε όλους.']);
    expect(events.filter((e) => e.type === 'live/segment')).toHaveLength(2);
    expect(runtime.snapshot().status.capture.state).toBe('active');
    // The store recovers: the turn is written, with nothing lost.
    state.captions = 'store';
    await play(CAPTION_STORE_FLUSH_MS, push);
    await settle(runtime.end('user-stop'));
    expect(puts.at(-1)!.turns.map((t) => t.text)).toEqual(['A caption the store rejects.']);
  });

  it('a caption write that never returns does not hold up a transcript line', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, segments, state } = setup(meet);
    state.captions = 'hang';
    await settle(runtime.begin(params()));
    await play(12_500, push, { 500: () => meet.emitText('pg:1', 'Emma Jones', 'A caption the store never answers.') });
    expect(segments.map((s) => s.text)).toEqual(['Hello everyone.', 'Καλημέρα σε όλους.']);
  });

  it('a caption write that never returns does not hold up the end of the meeting', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, state, calls } = setup(meet);
    state.captions = 'hang';
    await settle(runtime.begin(params()));
    await play(500, push);
    meet.emitText('pg:1', 'Emma Jones', 'A caption the store never answers.');
    await play(300, push);
    const before = Date.now();
    await settle(runtime.end('user-stop'));
    expect(calls).toContain('endMeeting');
    expect(Date.now() - before).toBeLessThanOrEqual(CAPTIONS_CLOSE_TIMEOUT_MS + RESTORE_TIMEOUT_MS + 100);
    expect(runtime.snapshot().meeting).toMatchObject({ endReason: 'user-stop' });
  });

  it('a refused write stops further caption writes, and the meeting runs on', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, segments, state, puts, calls } = setup(meet);
    state.captions = 'refuse';
    await settle(runtime.begin(params()));
    await play(12_500, push, {
      500: () => meet.emitText('pg:1', 'Emma Jones', 'Refused.'),
      4_000: () => meet.emitText('pg:1', 'Emma Jones', 'Refused. More.'),
      6_000: () => meet.emitText('pg:2', 'Tom Brown', 'Another turn.'),
    });
    expect(puts).toHaveLength(1);
    expect(segments).toHaveLength(2);
    await settle(runtime.end('user-stop'));
    expect(puts).toHaveLength(1);
    expect(calls).toContain('endMeeting');
  });
});

describe('caption text goes to the store and nowhere else (FR-008, FR-009)', () => {
  it('is in no live event, no provider call and no log line', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const { runtime, params, push, events, logged, providerSaw, state, puts, stored } = setup(meet);
    await settle(runtime.begin(params({ speakerNameMappings: [] })));
    await play(12_500, push, {
      300: () => meet.emitText('pg:1', 'Emma Jones', CAPTION_MARKER),
      900: () => meet.emitText('pg:2', 'You', CAPTION_MARKER_GREEK, { self: true }),
      // Naming goes on beside it, from activity only.
      3_000: () => meet.caption('pg:1', 'Emma Jones'),
      3_300: () => meet.caption('pg:1', 'Emma Jones'),
      5_000: () => meet.caption('pg:2', 'You', true),
      5_300: () => meet.caption('pg:2', 'You', true),
      // The store fails for a while, so the failure is logged.
      6_000: () => void (state.captions = 'reject'),
      6_100: () => meet.emitText('pg:1', 'Emma Jones', `${CAPTION_MARKER} ${CAPTION_MARKER}`),
      10_500: () => void (state.captions = 'store'),
    });
    await settle(runtime.end('user-stop'));

    // The test can fail: the marker did reach the store, and the failure was logged.
    expect(holdsMarker(stored())).toBe(true);
    expect(holdsMarker(puts)).toBe(true);
    expect(logged.length).toBeGreaterThan(0);

    for (const e of events) expectNoMarker(e);
    expectNoMarker(runtime.snapshot());
    expectNoMarker(providerSaw());
    expect(providerSaw().sockets.flatMap((s) => s.sent).length).toBeGreaterThan(10);
    for (const call of logged) expectNoMarker(call);
    expect(events.map((e) => e.type)).toContain('live/captions-kept');
  });
});

describe('a platform without captions', () => {
  it('has no caption log: nothing is written, nothing is announced', async () => {
    const { runtime, params, push, calls, events } = setup(new GenericAdapter());
    await settle(runtime.begin(params()));
    await play(CAPTION_STORE_FLUSH_MS * 2, push);
    await settle(runtime.end('user-stop'));
    expect(calls).not.toContain('putCaptionTurns');
    expect(events.filter((e) => e.type === 'live/captions-kept')).toEqual([]);
    expect(runtime.snapshot().meeting).not.toHaveProperty('hasCaptions');
  });

  it('a store that cannot keep captions keeps none, and the meeting is as it was before 013', async () => {
    const meet = new FakeMeetAdapter({ state: 'on' });
    const s = setup(meet);
    const { putCaptionTurns: _none, ...withoutCaptions } = s.store;
    const runtime = new MeetingRuntime({
      provider: new FakeTranscriptionProvider([loadFixture('happy-path')]),
      store: withoutCaptions,
      adapter: meet,
      now: () => Date.now(),
    });
    const events: LiveEvent[] = [];
    runtime.subscribe((e) => void events.push(e));
    await settle(
      runtime.begin(
        s.params({ speakerNameMappings: [{ captionName: 'Emma Jones', displayName: 'Emma', updatedAt: 1 }] }),
      ),
    );
    meet.emitText('pg:1', 'Emma Jones', 'Nobody keeps this.');
    await play(CAPTION_STORE_FLUSH_MS * 2, s.push);
    await settle(runtime.end('user-stop'));
    expect(s.calls).not.toContain('putCaptionTurns');
    expect(s.renames).toEqual([]);
    expect(events.filter((e) => e.type === 'live/captions-kept' || e.type === 'live/labels')).toEqual([]);
    expect(meetOf(meet).calls).toContain('dispose');
  });
});
