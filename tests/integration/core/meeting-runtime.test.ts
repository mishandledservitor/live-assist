// MeetingRuntime on fixtures (T058, reworked for one mixed stream in T101): FakeTranscriptionProvider replays recorded
// ElevenLabs sessions, fake-indexeddb stores the meeting, and a scripted mixed source stands in for the tab + mic mix.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveEvent } from '@/core/messaging/protocol';
import { createLogger, type Logger } from '@/core/log';
import type { PlatformAdapter } from '@/core/platform/adapter';
import { GenericAdapter } from '@/core/platform/generic-adapter';
import { MeetingRuntime, type BeginParams, type MicInput, type MixedFrameSource } from '@/core/session/meeting-runtime';
import { WATCHDOG_REASON } from '@/core/speakers/watchdog';
import { displayLabel } from '@/core/transcript/labels';
import { CALL_ENDED_REASON, MUTE_UNKNOWN_REASON } from '@/core/status/status';
import { FakeTranscriptionProvider } from '@/providers/transcription/fake/fixture-provider';
import { openLiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { loadFixture, type Script } from '../../support/fake-websocket';
import { FakeMeetAdapter } from '../../support/fake-meet-adapter';

const T0 = 1_760_000_000_000;

/** The mixed tab + mic source; `mic` is what the capture reports about the microphone. */
function scriptedSource(mic: MicInput = { ok: true }) {
  let listener: ((tab: Int16Array, mic: Int16Array | null) => void) | null = null;
  const state = { started: 0, stopped: 0 };
  const source: MixedFrameSource = (onFrames) => {
    state.started += 1;
    listener = onFrames;
    return Promise.resolve({
      mic,
      stop: () => {
        state.stopped += 1;
        return Promise.resolve();
      },
    });
  };
  return {
    source,
    state,
    push: () => listener?.(new Int16Array(1600), mic.ok ? new Int16Array(1600).fill(1) : null),
  };
}

function failingSource(error: Error): MixedFrameSource {
  return () => Promise.reject(error);
}

let dbN = 0;
let repo: MeetingRepo;

beforeEach(async () => {
  dbN += 1;
  repo = new MeetingRepo(await openLiveAssistDb(`runtime-db-${dbN}`));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => vi.useRealTimers());

/** One session per meeting: connection 0 is the first session, later ones are reconnects. */
function setup(
  scripts: Script[] = [loadFixture('happy-path')],
  log?: Logger,
  adapter: PlatformAdapter = new GenericAdapter(),
) {
  const provider = new FakeTranscriptionProvider(scripts);
  const writes: string[] = [];
  /** Every stored version of a segment, as `${id}=${speakerLabel}`. */
  const versions: string[] = [];
  const store = {
    createMeeting: vi.fn((m: Parameters<MeetingRepo['createMeeting']>[0]) => repo.createMeeting(m)),
    appendSegment: vi.fn(async (s: Parameters<MeetingRepo['appendSegment']>[0]) => {
      await repo.appendSegment(s);
      writes.push(s.id);
      versions.push(`${s.id}=${s.speakerLabel}`);
    }),
    updateSegment: vi.fn(async (s: Parameters<MeetingRepo['updateSegment']>[0]) => {
      await repo.updateSegment(s);
      versions.push(`${s.id}=${s.speakerLabel}`);
    }),
    setSpeakerRename: vi.fn((...a: Parameters<MeetingRepo['setSpeakerRename']>) => repo.setSpeakerRename(...a)),
    endMeeting: vi.fn((id: string, at: number, r: Parameters<MeetingRepo['endMeeting']>[2]) =>
      repo.endMeeting(id, at, r),
    ),
  };
  const runtime = new MeetingRuntime({
    provider,
    store,
    adapter,
    now: () => Date.now(),
    ...(log ? { log } : {}),
  });
  const events: LiveEvent[] = [];
  runtime.subscribe((e) => {
    // Record whether the segment was already written when it was emitted.
    if (e.type === 'live/segment') expect(writes).toContain(e.segment.id);
    if (e.type === 'live/segment-updated') expect(versions).toContain(`${e.segment.id}=${e.segment.speakerLabel}`);
    events.push(e);
  });
  const mix = scriptedSource();
  const params = (over: Partial<BeginParams> = {}): BeginParams => ({
    meetingId: 'm1',
    source: { url: 'https://meet.google.com/abc-defg-hij', title: 'Standup' },
    language: { kind: 'auto' },
    keyterms: ['Northwind', 'Lighthouse'],
    userName: 'Alex',
    audio: mix.source,
    ...over,
  });
  return { provider, store, runtime, events, mix, params, versions };
}

/**
 * Runs a promise to completion in 1 ms clock steps (fake timers turn a 0 ms timer created inside a tick into 1 ms, and
 * sockets open on such timers), letting fake-indexeddb's real macrotasks run in between.
 */
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

const begin = (runtime: MeetingRuntime, params: BeginParams) => settle(runtime.begin(params));

/** Advance the fake clock, pushing one 100 ms frame per tick from the source. */
async function play(ms: number, source: { push: () => void }) {
  for (let t = 0; t < ms; t += 100) {
    source.push();
    await vi.advanceTimersByTimeAsync(100);
  }
}

describe('MeetingRuntime (one mixed stream, constitution v1.1.0)', () => {
  it('begin creates the meeting with source, language and a userName snapshot (kept for 002)', async () => {
    const { runtime, params } = setup();
    const meeting = await begin(runtime, params());
    expect(meeting).toEqual({
      id: 'm1',
      startedAt: T0,
      endedAt: null,
      endReason: null,
      source: { url: 'https://meet.google.com/abc-defg-hij', title: 'Standup', platform: 'generic' },
      languageMode: { kind: 'auto' },
      userName: 'Alex',
      // 002 data-model: meetings are v2 from 002 on, starting with no renames.
      speakerRenames: {},
      schemaVersion: 2,
    });
    expect(await repo.getMeeting('m1')).toEqual(meeting);
  });

  it('opens exactly one session (one billed stream) with the keyterms and language', async () => {
    const { runtime, params, provider, mix } = setup();
    await begin(runtime, params({ language: { kind: 'fixed', code: 'el' } }));
    await play(3000, mix);
    expect(provider.sockets).toHaveLength(1);
    const url = new URL(provider.sockets[0]!.url);
    expect(url.searchParams.getAll('keyterms')).toEqual(['Northwind', 'Lighthouse']);
    expect(url.searchParams.get('language_code')).toBe('el');
    expect(mix.state.started).toBe(1);
  });

  // Design decision 41 (001 FR-011b): clean transcript, on unless the meeting starts with it off, on every session.
  it.each([
    [{}, 'true'],
    [{ cleanTranscript: true }, 'true'],
    [{ cleanTranscript: false }, null],
  ])('clean transcript %o → no_verbatim %s on the first session and after a reconnect', async (over, expected) => {
    const { runtime, params, provider, mix } = setup([loadFixture('drop-mid-partial'), loadFixture('happy-path')]);
    await begin(runtime, params(over));
    await play(8000, mix);
    expect(provider.sockets.length).toBeGreaterThanOrEqual(2);
    for (const s of provider.sockets) expect(new URL(s.url).searchParams.get('no_verbatim')).toBe(expected);
  });

  describe('language (US4, FR-014)', () => {
    it('fixed: the session gets language_code, the meeting stores it, and lines without a detection take it', async () => {
      const { runtime, params, mix, provider } = setup([loadFixture('no-detail-after-commit')]);
      const fixed = { kind: 'fixed', code: 'ell' } as const;
      await begin(runtime, params({ language: fixed }));
      await play(5500, mix);
      expect(provider.sockets.map((s) => new URL(s.url).searchParams.get('language_code'))).toEqual(['ell']);
      expect((await repo.getMeeting('m1'))?.languageMode).toEqual(fixed);
      const [estimated] = await repo.listSegments('m1');
      expect(estimated).toMatchObject({ timing: 'estimated', language: 'ell' });
    });

    it('auto: no language_code is sent and each line stores the detected language', async () => {
      const { runtime, params, mix, provider } = setup();
      await begin(runtime, params({ language: { kind: 'auto' } }));
      await play(6000, mix);
      expect(new URL(provider.sockets[0]!.url).searchParams.has('language_code')).toBe(false);
      expect((await repo.getMeeting('m1'))?.languageMode).toEqual({ kind: 'auto' });
      expect((await repo.listSegments('m1')).map((s) => s.language)).toEqual(['en', 'el']);
    });

    it('a reconnect keeps the fixed language', async () => {
      const { runtime, params, mix, provider } = setup([loadFixture('drop-mid-partial'), loadFixture('happy-path')]);
      await begin(runtime, params({ language: { kind: 'fixed', code: 'eng' } }));
      await play(4000, mix);
      expect(provider.sockets).toHaveLength(2);
      expect(new URL(provider.sockets[1]!.url).searchParams.get('language_code')).toBe('eng');
    });
  });

  it('stores every line as "Others" (fallback) on the mixed stream, and emits each only after it is stored', async () => {
    const { runtime, params, mix, events } = setup();
    await begin(runtime, params());
    await play(6000, mix);

    const segments = await repo.listSegments('m1');
    expect(segments.map((s) => [s.id, s.stream, s.text, s.speakerLabel, s.labelSource])).toEqual([
      ['m1:mixed:0', 'mixed', 'Hello everyone.', 'Others', 'fallback'],
      ['m1:mixed:1', 'mixed', 'Καλημέρα σε όλους.', 'Others', 'fallback'],
    ]);
    // First frame went out at meeting time 0–100 ms, so word times map straight onto the meeting clock.
    expect(segments[0]).toMatchObject({ startMs: 2100, endMs: 2900, language: 'en', sessionId: 'sess-fixture-1' });
    const emitted = events.flatMap((e) => (e.type === 'live/segment' ? [e.segment.id] : []));
    expect(emitted.sort()).toEqual(segments.map((s) => s.id).sort());
    expect(runtime.snapshot().segments.map((s) => s.text)).toEqual(segments.map((s) => s.text));
  });

  it('logs a failed line write through the redacting logger and does not emit that line (T090)', async () => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const { runtime, params, mix, events, store } = setup(undefined, createLogger('runtime', sink));
    store.appendSegment.mockRejectedValue(new Error('quota exceeded near sk_1234567890abcdef'));
    await begin(runtime, params());
    await play(6000, mix);

    expect(events.some((e) => e.type === 'live/segment')).toBe(false);
    expect(sink.error).toHaveBeenCalledWith(
      'live-assist[runtime]: could not store a transcript line',
      'Error: quota exceeded near [redacted]',
    );
  });

  it('emits the partial for the mixed stream but never stores it, and clears it on commit', async () => {
    const { runtime, params, mix, events } = setup();
    await begin(runtime, params());
    await play(2500, mix);
    expect(events).toContainEqual({ type: 'live/partial', stream: 'mixed', text: 'Hello every' });
    expect(runtime.snapshot().partials).toEqual([{ stream: 'mixed', text: 'Hello every' }]);
    expect(await repo.listSegments('m1')).toEqual([]);
    await play(600, mix);
    expect(runtime.snapshot().partials).toEqual([]);
  });

  it('stores a commit whose timestamps never arrive with estimated timing', async () => {
    const { runtime, params, mix } = setup([loadFixture('no-detail-after-commit')]);
    await begin(runtime, params());
    await play(5500, mix);
    const [estimated] = await repo.listSegments('m1');
    expect(estimated).toMatchObject({ text: 'No timestamps for this one.', timing: 'estimated', startMs: 3000 });
  });

  it('transcribes the tab alone when the microphone cannot be opened, and says so (US3-5)', async () => {
    const { runtime, params, provider } = setup();
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const tabOnly = scriptedSource({ ok: false, error: denied });
    await begin(runtime, params({ audio: tabOnly.source }));
    await play(3500, tabOnly);
    const status = runtime.snapshot().status;
    expect(status.capture.state).toBe('active');
    expect(status.transcription.state).toBe('active');
    expect(status.mic.state).toBe('unavailable');
    // 006 R13: the Allow microphone button sits beside it in the expanded status line.
    expect(status.mic.reason).toBe(
      'Microphone permission needed. Only the meeting tab is being transcribed; your own speech is not.',
    );
    expect(status.mic.reason).toMatch(/only the meeting tab is being transcribed/i);
    expect(provider.sockets).toHaveLength(1);
    expect((await repo.listSegments('m1')).map((s) => s.text)).toEqual(['Hello everyone.']);
  });

  it('with the generic adapter, sends every frame with the mic mixed in at once and says mute is not followed (FR-021)', async () => {
    const { runtime, params, mix, provider } = setup();
    await begin(runtime, params());
    await play(1000, mix);
    const chunks = provider.sockets[0]?.sentOfType('input_audio_chunk') ?? [];
    expect(chunks).toHaveLength(10);
    // The scripted mic is all ones and the tab silent: every chunk carries the mic.
    const ones = btoa(String.fromCharCode(...new Uint8Array(new Int16Array(1600).fill(1).buffer)));
    expect(chunks.every((c) => c.audio_base_64 === ones)).toBe(true);
    const status = runtime.snapshot().status;
    expect(status.mic).toEqual({ state: 'active', muteFollowed: false, reason: MUTE_UNKNOWN_REASON });
    expect(status.speakerNames.state).toBe('unavailable');
    expect(status.speakerNames.reason).toBe('Speaker names work on Google Meet only.');
  });

  it('reports capture and transcription active once running', async () => {
    const { runtime, params, mix, events } = setup();
    await begin(runtime, params());
    await play(200, mix);
    const status = runtime.snapshot().status;
    expect(status.capture.state).toBe('active');
    expect(status.transcription.state).toBe('active');
    expect(events.some((e) => e.type === 'live/status')).toBe(true);
  });

  it('end closes the session, stops the source, records endedAt/endReason and sends nothing afterwards (FR-025)', async () => {
    const { runtime, params, mix, provider } = setup();
    await begin(runtime, params());
    await play(1000, mix);
    const stopAt = Date.now();
    await runtime.end('user-stop');

    expect(mix.state.stopped).toBe(1);
    expect(await repo.getMeeting('m1')).toMatchObject({ endedAt: stopAt, endReason: 'user-stop' });
    const sentBefore = provider.sockets.map((s) => s.sent.length);
    await play(1000, mix);
    expect(provider.sockets.map((s) => s.sent.length)).toEqual(sentBefore);
    const status = runtime.snapshot().status;
    expect(status.capture.state).toBe('stopped');
    expect(status.transcription.state).toBe('stopped');
  });

  // A panel connected before the end must learn it, or it keeps offering Stop until the offscreen document closes
  // (found by e2e: an auth error on the one session ends the meeting while begin is still running).
  it.each([
    ['user stop', undefined],
    ['auth error during begin', 'auth-error'],
  ] as const)('broadcasts the ended meeting to connected panels (%s)', async (_name, fixture) => {
    const { runtime, params, mix, events } = setup(fixture ? [loadFixture(fixture)] : undefined);
    await begin(runtime, params());
    if (!fixture) await runtime.end('user-stop');
    await settle(runtime.whenEnded());
    await play(200, mix);
    const last = events.filter((e) => e.type === 'live/snapshot').at(-1);
    expect(last).toMatchObject({
      type: 'live/snapshot',
      meeting: { id: 'm1', endReason: fixture ? 'failed' : 'user-stop' },
    });
    expect(last?.type === 'live/snapshot' && last.meeting?.endedAt).toEqual(expect.any(Number));
  });

  it('end stores a commit still waiting for its timestamps instead of losing it', async () => {
    const { runtime, params, mix } = setup([loadFixture('no-detail-after-commit')]);
    await begin(runtime, params());
    await play(3100, mix);
    await runtime.end('user-stop');
    expect((await repo.listSegments('m1')).map((s) => s.text)).toContain('No timestamps for this one.');
  });

  it('fails the start and ends the meeting as failed when the tab cannot be opened', async () => {
    const { runtime, params, provider } = setup();
    await expect(begin(runtime, params({ audio: failingSource(new Error('tab gone')) }))).rejects.toThrow(/tab gone/);
    expect(await repo.getMeeting('m1')).toMatchObject({ endReason: 'failed' });
    expect(runtime.snapshot().status.capture.state).toBe('failed');
    expect(provider.sockets).toHaveLength(0);
  });

  it('ends the meeting as failed, keeping its lines, when transcription fails for good', async () => {
    const { runtime, params, mix, provider } = setup([loadFixture('quota-error')]);
    await begin(runtime, params());
    await play(3000, mix);
    await settle(Promise.resolve());

    const status = runtime.snapshot().status;
    expect(status.transcription.state).toBe('failed');
    expect(status.transcription.reason).toMatch(/quota/i);
    expect(status.capture.state).toBe('failed');
    expect(status.capture.reason).toMatch(/quota/i);
    expect(await repo.getMeeting('m1')).toMatchObject({ endReason: 'failed' });
    expect(mix.state.stopped).toBe(1);
    const sent = provider.sockets.map((s) => s.sent.length);
    await play(1000, mix);
    expect(provider.sockets.map((s) => s.sent.length)).toEqual(sent);
  });

  it('reconnects a dropped session into the same meeting, with lines timed from the replayed audio', async () => {
    const { runtime, params, mix, events } = setup([loadFixture('drop-mid-partial'), loadFixture('happy-path')]);
    await begin(runtime, params());
    await play(9000, mix);

    const states = events.flatMap((e) => (e.type === 'live/status' ? [e.status.transcription.state] : []));
    expect(states).toContain('reconnecting');
    expect(runtime.snapshot().status.transcription).toMatchObject({ state: 'active', reconnects: 1 });
    const lines = await repo.listSegments('m1');
    expect(lines.map((s) => [s.text, s.seq])).toEqual([
      ['Hello everyone.', 0],
      ['Καλημέρα σε όλους.', 1],
    ]);
    // Nothing was committed before the drop, so the new session replayed from the first frame (meeting time 0).
    expect(lines[0]).toMatchObject({ startMs: 2100, sessionId: 'sess-fixture-1' });
    expect(runtime.snapshot().meeting?.endedAt).toBeNull();
  });
});

/** Plays like play(), running `script[t]` once the meeting clock reaches t (multiples of 100 ms). */
async function playScript(ms: number, source: { push: () => void }, script: Record<number, () => void>) {
  const done = new Set<number>();
  for (let t = 0; t < ms; t += 100) {
    const now = Date.now() - T0;
    for (const [at, fn] of Object.entries(script))
      if (Number(at) <= now && !done.has(Number(at))) {
        done.add(Number(at));
        fn();
      }
    source.push();
    await vi.advanceTimersByTimeAsync(100);
  }
}

/** Emma Jones says "Hello everyone." (2.1–2.9 s) and the user the Greek line (4.1–5.0 s), as Meet captions them. */
function captionsForHappyPath(meet: FakeMeetAdapter): Record<number, () => void> {
  const script: Record<number, () => void> = {};
  // Captions lag the words (2.1–2.9 s and 4.1–4.95 s) by about a second, as on the real page (retest 2026-10-08).
  for (let t = 3000; t <= 3900; t += 300) script[t] = () => meet.caption('pg:1', 'Emma Jones');
  for (let t = 5000; t <= 5900; t += 300) script[t] = () => meet.caption('pg:2', 'You', true);
  return script;
}

function meetSetup(
  state: ConstructorParameters<typeof FakeMeetAdapter>[0] = { state: 'on' },
  scripts: Script[] = [loadFixture('happy-path')],
) {
  const meet = new FakeMeetAdapter(state);
  return { meet, ...setup(scripts, undefined, meet) };
}

describe('MeetingRuntime with Meet speaker names (002 US1)', () => {
  it('records the meeting as a Meet meeting', async () => {
    const { runtime, params } = meetSetup();
    expect((await begin(runtime, params())).source.platform).toBe('meet');
  });

  it('turns captions on once, after the transcription stream is active', async () => {
    const { runtime, params, meet, mix } = meetSetup();
    const stateAtEnable: string[] = [];
    meet.onEnable = () => void stateAtEnable.push(runtime.snapshot().status.transcription.state);
    await begin(runtime, params());
    await play(2000, mix);
    expect(meet.calls.filter((c) => c === 'enable')).toHaveLength(1);
    expect(stateAtEnable).toEqual(['active']);
  });

  it("stores lines as Others first, then names them from captions — the user's under the settings name", async () => {
    const { runtime, params, meet, mix, events, versions } = meetSetup();
    await begin(runtime, params());
    await playScript(12_500, mix, captionsForHappyPath(meet));

    expect(versions).toEqual(['m1:mixed:0=Others', 'm1:mixed:1=Others', 'm1:mixed:0=Emma Jones', 'm1:mixed:1=Alex']);
    const stored = await repo.listSegments('m1');
    expect(stored.map((s) => [s.speakerLabel, s.labelSource, s.captionName, s.captionSelf])).toEqual([
      ['Emma Jones', 'caption', 'Emma Jones', false],
      ['Alex', 'caption', 'You', true],
    ]);
    const updated = events.flatMap((e) => (e.type === 'live/segment-updated' ? [e.segment] : []));
    expect(updated.map((s) => [s.id, s.speakerLabel, s.text])).toEqual([
      ['m1:mixed:0', 'Emma Jones', 'Hello everyone.'],
      ['m1:mixed:1', 'Alex', 'Καλημέρα σε όλους.'],
    ]);
    expect(runtime.snapshot().segments.map((s) => s.speakerLabel)).toEqual(['Emma Jones', 'Alex']);
  });

  // T110 (real trace 2026-10-08, design decision 37): "…" until the line settles, only while names are active.
  it('while names are active a line is stored pending and the placeholder clears when it settles', async () => {
    const { runtime, params, meet, mix, events } = meetSetup();
    await begin(runtime, params());
    await playScript(12_000, mix, captionsForHappyPath(meet));
    const added = events.flatMap((e) => (e.type === 'live/segment' ? [e.segment] : []));
    expect(added.map((s) => [s.speakerLabel, s.labelPending])).toEqual([
      ['Others', true],
      ['Others', true],
    ]);
    expect(runtime.snapshot().segments.map((s) => [s.speakerLabel, s.labelPending])).toEqual([
      ['Emma Jones', false],
      ['Alex', false],
    ]);
  });

  it('when names are unavailable a line is never pending', async () => {
    const { runtime, params, mix, events } = meetSetup({
      state: 'unavailable',
      reason: "Couldn't turn on Meet captions",
    });
    await begin(runtime, params());
    await play(12_000, mix);
    const added = events.flatMap((e) => (e.type === 'live/segment' ? [e.segment] : []));
    expect(added).toHaveLength(2);
    expect(added.some((s) => s.labelPending)).toBe(false);
  });

  it('without caption activity every line stays Others', async () => {
    const { runtime, params, mix, events } = meetSetup();
    await begin(runtime, params());
    await play(12_500, mix);
    await settle(runtime.end('user-stop'));
    expect((await repo.listSegments('m1')).map((s) => s.speakerLabel)).toEqual(['Others', 'Others']);
    // Since decision 37 the only updates clear the placeholder: the label never changes.
    const updated = events.flatMap((e) => (e.type === 'live/segment-updated' ? [e.segment] : []));
    expect(updated.map((s) => [s.speakerLabel, s.labelSource, s.labelPending])).toEqual([
      ['Others', 'fallback', false],
      ['Others', 'fallback', false],
    ]);
  });

  it('speaker names status follows the adapter', async () => {
    const { runtime, params, meet, mix } = meetSetup({ state: 'starting', reason: 'Connecting to the Meet page…' });
    await begin(runtime, params());
    expect(runtime.snapshot().status.speakerNames).toEqual({
      state: 'starting',
      reason: 'Connecting to the Meet page…',
    });
    meet.setState({ state: 'on' });
    expect(runtime.snapshot().status.speakerNames.state).toBe('active');
    meet.setState({ state: 'unavailable', reason: "Couldn't turn on Meet captions" });
    expect(runtime.snapshot().status.speakerNames).toEqual({
      state: 'degraded',
      reason: "Couldn't turn on Meet captions",
    });
    await play(200, mix);
  });

  it('resolves lines still pending when the meeting ends', async () => {
    const { runtime, params, meet, mix } = meetSetup();
    await begin(runtime, params());
    await playScript(5600, mix, captionsForHappyPath(meet)); // ends before the Greek line settles
    await settle(runtime.end('user-stop'));
    expect((await repo.listSegments('m1')).map((s) => s.speakerLabel)).toEqual(['Emma Jones', 'Alex']);
  });

  it.each([
    ['user-stop', 'happy-path'],
    ['tab-navigated', 'happy-path'],
    ['failed', 'quota-error'],
  ] as const)('restores captions before the meeting is marked ended (%s)', async (reason, fixture) => {
    const { runtime, params, meet, mix } = meetSetup({ state: 'on' }, [loadFixture(fixture)]);
    const endedAtRestore: (number | null | undefined)[] = [];
    meet.restoreImpl = async () => void endedAtRestore.push((await repo.getMeeting('m1'))?.endedAt);
    await begin(runtime, params());
    await play(3000, mix);
    if (reason !== 'failed') await settle(runtime.end(reason));
    await settle(runtime.whenEnded());
    expect(meet.calls.filter((c) => c === 'restore')).toHaveLength(1);
    expect(endedAtRestore).toEqual([null]);
    expect(meet.calls.at(-1)).toBe('dispose');
    expect(await repo.getMeeting('m1')).toMatchObject({ endReason: reason });
  });

  it('T102 (FR-024, decision 36): leaving the call ends the meeting by itself; the transcript stays', async () => {
    const { runtime, params, meet, mix } = meetSetup();
    await begin(runtime, params());
    await playScript(12_500, mix, captionsForHappyPath(meet));
    meet.endCall();
    expect(await settle(runtime.whenEnded())).toBe('call-ended');
    expect(await repo.getMeeting('m1')).toMatchObject({ endReason: 'call-ended' });
    expect((await repo.listSegments('m1')).map((s) => s.speakerLabel)).toEqual(['Emma Jones', 'Alex']);
    expect(meet.calls.filter((c) => c === 'restore')).toHaveLength(1);
    const status = runtime.snapshot().status;
    expect(status.capture).toEqual({ state: 'stopped', reason: CALL_ENDED_REASON });
    expect(status.transcription.state).toBe('stopped');
  });

  it('a page that never answers (closed tab) does not hold up the end', async () => {
    const { runtime, params, meet, mix } = meetSetup();
    meet.restoreImpl = () => new Promise(() => undefined);
    await begin(runtime, params());
    await play(1000, mix);
    await settle(runtime.end('tab-closed'));
    expect(await repo.getMeeting('m1')).toMatchObject({ endReason: 'tab-closed' });
  });

  it('remembered names from Start become remembered renames the first time their speaker is named', async () => {
    const { runtime, params, meet, mix, events } = meetSetup();
    const mappings = [{ captionName: 'Emma Jones', displayName: 'Emma', updatedAt: 1 }];
    await begin(runtime, params({ speakerNameMappings: mappings }));
    await playScript(12_500, mix, captionsForHappyPath(meet));
    const renames = { 'caption:emma jones': { name: 'Emma', origin: 'remembered' } };
    expect((await repo.getMeeting('m1'))?.speakerRenames).toEqual(renames);
    expect(events).toContainEqual({ type: 'live/labels', meetingId: 'm1', speakerRenames: renames });
    expect(runtime.snapshot().meeting?.speakerRenames).toEqual(renames);
  });
});

describe('MeetingRuntime when names are unavailable (002 US2)', () => {
  it("captions unavailable at Start: transcription runs, every line is Others (the user's included), status says why", async () => {
    const reason = "Couldn't turn on Meet captions";
    const { runtime, params, meet, mix } = meetSetup({ state: 'unavailable', reason });
    await begin(runtime, params());
    expect(runtime.snapshot().status.speakerNames).toEqual({ state: 'degraded', reason });
    await playScript(12_500, mix, {
      4500: () => meet.caption('pg:2', 'You', true), // nothing Meet would send, but even so: not on → not trusted
    });
    const status = runtime.snapshot().status;
    expect(status.transcription.state).toBe('active');
    expect(status.speakerNames).toEqual({ state: 'degraded', reason });
    expect((await repo.listSegments('m1')).map((s) => [s.speakerLabel, s.labelSource])).toEqual([
      ['Others', 'fallback'],
      ['Others', 'fallback'],
    ]);
  });

  it('captions turned off mid-meeting: earlier lines keep their names, new lines are Others', async () => {
    const { runtime, params, meet, mix } = meetSetup();
    await begin(runtime, params());
    const script = captionsForHappyPath(meet);
    for (const t of Object.keys(script)) if (Number(t) >= 4500) delete script[Number(t)];
    script[3800] = () => meet.setState({ state: 'off-by-user', reason: 'Captions were turned off' });
    await playScript(12_500, mix, script);
    expect(runtime.snapshot().status.speakerNames).toEqual({ state: 'degraded', reason: 'Captions were turned off' });
    expect((await repo.listSegments('m1')).map((s) => s.speakerLabel)).toEqual(['Emma Jones', 'Others']);
  });

  it('captions coming back: the indicator returns to active and new lines are named again', async () => {
    const { runtime, params, meet, mix } = meetSetup({ state: 'off-by-user', reason: 'Captions were turned off' });
    await begin(runtime, params());
    const script: Record<number, () => void> = { 3700: () => meet.setState({ state: 'on' }) };
    for (let t = 4500; t <= 5400; t += 300) script[t] = () => meet.caption('pg:2', 'You', true);
    await playScript(12_500, mix, script);
    expect(runtime.snapshot().status.speakerNames.state).toBe('active');
    expect((await repo.listSegments('m1')).map((s) => s.speakerLabel)).toEqual(['Others', 'Alex']);
  });

  it('captions on but silent while speech is transcribed: degraded within 10 s, active again on the next caption', async () => {
    const { runtime, params, meet, mix } = meetSetup({ state: 'on' });
    await begin(runtime, params());
    await play(7000, mix);
    expect(runtime.snapshot().status.speakerNames.state).toBe('active');
    await play(3000, mix);
    expect(runtime.snapshot().status.speakerNames).toEqual({ state: 'degraded', reason: WATCHDOG_REASON });
    meet.caption('pg:9', 'Emma Jones');
    expect(runtime.snapshot().status.speakerNames.state).toBe('active');
    // Lines kept arriving throughout: naming never pauses the transcript.
    expect(await repo.listSegments('m1')).toHaveLength(2);
  });

  it('caption activity that arrives while captions are not on is ignored', async () => {
    const { runtime, params, meet, mix } = meetSetup({
      state: 'starting',
      reason: 'Join the call to get speaker names',
    });
    await begin(runtime, params());
    await playScript(12_500, mix, captionsForHappyPath(meet));
    expect((await repo.listSegments('m1')).map((s) => s.speakerLabel)).toEqual(['Others', 'Others']);
  });

  it('a non-Meet tab (generic adapter): every line Others and "available on Google Meet only" (FR-012)', async () => {
    const { runtime, params, mix } = setup();
    await begin(runtime, params({ source: { url: 'https://www.youtube.com/watch?v=x', title: 'Video' } }));
    await play(6000, mix);
    expect(runtime.snapshot().status.speakerNames).toEqual({
      state: 'unavailable',
      reason: 'Speaker names work on Google Meet only.',
    });
    expect((await repo.listSegments('m1')).map((s) => s.speakerLabel)).toEqual(['Others', 'Others']);
  });
});

// T057: label commands from the panel over the live port (contracts/live-port-and-labels.md, US4).
describe('MeetingRuntime label commands (002 US4)', () => {
  const shown = (runtime: MeetingRuntime) => {
    const { meeting, segments } = runtime.snapshot();
    return segments.map((s) => displayLabel(s, meeting));
  };

  it('labels/rename stores the rename, broadcasts live/labels, and names future lines of that speaker (US4-1)', async () => {
    const { runtime, params, meet, mix, events } = meetSetup();
    await begin(runtime, params());
    await play(500, mix);
    await settle(
      runtime.command({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'caption:emma jones', name: 'Emma' }),
    );
    const renames = { 'caption:emma jones': { name: 'Emma', origin: 'manual' } };
    expect((await repo.getMeeting('m1'))?.speakerRenames).toEqual(renames);
    expect(events).toContainEqual({ type: 'live/labels', meetingId: 'm1', speakerRenames: renames });
    await playScript(12_000, mix, captionsForHappyPath(meet));
    expect(shown(runtime).map((l) => [l.text, l.source])).toEqual([
      ['Emma', 'caption'],
      ['Alex', 'caption'],
    ]);
  });

  it('renaming a key back to its original label removes the entry', async () => {
    const { runtime, params, meet, mix } = meetSetup();
    await begin(runtime, params());
    await playScript(12_500, mix, captionsForHappyPath(meet));
    const rename = (name: string) =>
      settle(runtime.command({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'caption:emma jones', name }));
    await rename('Emma');
    await rename('Emma Jones');
    expect((await repo.getMeeting('m1'))?.speakerRenames).toEqual({});
    expect(runtime.snapshot().meeting?.speakerRenames).toEqual({});
  });

  it('labels/override sets and clears one line and broadcasts live/segment-updated (US4-2)', async () => {
    const { runtime, params, mix, events } = meetSetup();
    await begin(runtime, params());
    await play(12_500, mix);
    await settle(runtime.command({ type: 'labels/override', meetingId: 'm1', segmentId: 'm1:mixed:1', name: 'Bob' }));
    expect((await repo.listSegments('m1')).map((s) => s.labelOverride)).toEqual([null, 'Bob']);
    expect(events).toContainEqual({
      type: 'live/segment-updated',
      segment: expect.objectContaining({ id: 'm1:mixed:1', labelOverride: 'Bob' }) as unknown,
    });
    expect(shown(runtime).map((l) => [l.text, l.source])).toEqual([
      ['Others', 'fallback'],
      ['Bob', 'manual'],
    ]);
    await settle(runtime.command({ type: 'labels/override', meetingId: 'm1', segmentId: 'm1:mixed:1', name: null }));
    expect((await repo.listSegments('m1')).map((s) => s.labelOverride)).toEqual([null, null]);
  });

  it('an override survives a later attribution and a later rename of its original key (US4-4)', async () => {
    const { runtime, params, meet, mix } = meetSetup();
    await begin(runtime, params());
    const script = captionsForHappyPath(meet);
    await playScript(3600, mix, script);
    // The Emma line is stored as Others and still pending its name when it is overridden.
    expect(runtime.snapshot().segments[0]?.speakerLabel).toBe('Others');
    await settle(runtime.command({ type: 'labels/override', meetingId: 'm1', segmentId: 'm1:mixed:0', name: 'Tom' }));
    await playScript(6000, mix, script);
    expect(runtime.snapshot().segments[0]?.speakerLabel).toBe('Emma Jones');
    await settle(
      runtime.command({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'caption:emma jones', name: 'Emma' }),
    );
    expect(shown(runtime)[0]?.text).toBe('Tom');
    expect((await repo.listSegments('m1'))[0]).toMatchObject({ labelOverride: 'Tom', speakerLabel: 'Emma Jones' });
  });

  it('renaming two keys to one name shows both under it (US4-5)', async () => {
    const { runtime, params, meet, mix } = meetSetup();
    await begin(runtime, params());
    await playScript(12_500, mix, captionsForHappyPath(meet));
    await settle(
      runtime.command({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'caption:emma jones', name: 'Team' }),
    );
    await settle(runtime.command({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'self', name: 'Team' }));
    expect(shown(runtime).map((l) => l.text)).toEqual(['Team', 'Team']);
  });

  // Red-team 2026-10-08 (T092, decision 35): "Others" holds the user's own lines too; it is never renamed everywhere.
  it('ignores a rename of others: nothing stored, nothing broadcast, every line stays the fallback (US4-3)', async () => {
    const { runtime, params, mix, events } = meetSetup({
      state: 'unavailable',
      reason: "Couldn't turn on Meet captions",
    });
    await begin(runtime, params());
    await play(3500, mix);
    const others = { type: 'labels/rename', meetingId: 'm1', speakerKey: 'others', name: 'Bob' };
    await settle(runtime.command(others as unknown as Parameters<typeof runtime.command>[0]));
    await play(6000, mix);
    expect(shown(runtime).map((l) => [l.text, l.source, l.confirmed])).toEqual([
      ['Others', 'fallback', false],
      ['Others', 'fallback', false],
    ]);
    expect(runtime.snapshot().meeting?.speakerRenames).toEqual({});
    expect((await repo.getMeeting('m1'))?.speakerRenames).toEqual({});
    expect(events.some((e) => e.type === 'live/labels')).toBe(false);
  });

  it('ignores commands for another meeting', async () => {
    const { runtime, params, mix, events } = meetSetup();
    await begin(runtime, params());
    await play(12_500, mix);
    await settle(runtime.command({ type: 'labels/rename', meetingId: 'other', speakerKey: 'self', name: 'X' }));
    await settle(runtime.command({ type: 'labels/override', meetingId: 'other', segmentId: 'm1:mixed:0', name: 'X' }));
    expect(runtime.snapshot().meeting?.speakerRenames).toEqual({});
    expect((await repo.listSegments('m1')).map((s) => s.labelOverride)).toEqual([null, null]);
    expect(events.some((e) => e.type === 'live/labels')).toBe(false);
  });
});

// T119 (real call 2026-10-09, FR-027): one committed line spoken by Emma then Tom is split when it settles.
describe('MeetingRuntime splitting a line at a speaker change', () => {
  /** Emma speaks 1.0–4.5 s, Tom 5.0–9.0 s (meet-handover.jsonl), both captioned about 0.8 s late. */
  const handoverCaptions = (meet: FakeMeetAdapter) => {
    const script: Record<number, () => void> = {};
    for (let t = 1800; t <= 5000; t += 400) script[t] = () => meet.caption('pg:1', 'Emma Jones');
    for (let t = 5800; t <= 9800; t += 400) script[t] = () => meet.caption('pg:2', 'Tom Brown');
    return script;
  };
  const handover = () => meetSetup({ state: 'on' }, [loadFixture('meet-handover')]);

  it('stores the first piece over the line and the others as new lines, each broadcast after its write', async () => {
    const { runtime, params, meet, mix, events, versions } = handover();
    await begin(runtime, params());
    await playScript(17_000, mix, handoverCaptions(meet));
    expect(versions).toEqual([
      'm1:mixed:0=Others',
      'm1:mixed:0=Emma Jones',
      'm1:mixed:0.w3=Others',
      'm1:mixed:0.w7=Tom Brown',
    ]);
    const stored = await repo.listSegments('m1');
    expect(stored.map((s) => [s.id, s.speakerLabel, s.text])).toEqual([
      ['m1:mixed:0', 'Emma Jones', 'We ship on'],
      ['m1:mixed:0.w3', 'Others', 'Friday, right? Tom, yours.'],
      ['m1:mixed:0.w7', 'Tom Brown', 'Yes, I can take it this week then.'],
    ]);
    const after = events.slice(events.findIndex((e) => e.type === 'live/segment-updated'));
    expect(
      after.map((e) =>
        e.type === 'live/segment' || e.type === 'live/segment-updated' ? [e.type, e.segment.id] : e.type,
      ),
    ).toEqual(
      expect.arrayContaining([
        ['live/segment-updated', 'm1:mixed:0'],
        ['live/segment', 'm1:mixed:0.w3'],
        ['live/segment', 'm1:mixed:0.w7'],
      ]),
    );
    expect(runtime.snapshot().segments.map((s) => [s.id, s.speakerLabel, s.labelPending])).toEqual([
      ['m1:mixed:0', 'Emma Jones', false],
      ['m1:mixed:0.w3', 'Others', false],
      ['m1:mixed:0.w7', 'Tom Brown', false],
    ]);
  });

  it('a rename of a speaker applies to their piece like any line', async () => {
    const { runtime, params, meet, mix } = handover();
    await begin(runtime, params());
    await playScript(17_000, mix, handoverCaptions(meet));
    await settle(
      runtime.command({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'caption:tom brown', name: 'Tom' }),
    );
    const { meeting, segments } = runtime.snapshot();
    expect(segments.map((s) => displayLabel(s, meeting).text)).toEqual(['Emma Jones', 'Others', 'Tom']);
  });

  it('a line overridden before it settles is not split', async () => {
    const { runtime, params, meet, mix } = handover();
    await begin(runtime, params());
    await playScript(11_000, mix, handoverCaptions(meet));
    await settle(runtime.command({ type: 'labels/override', meetingId: 'm1', segmentId: 'm1:mixed:0', name: 'Bob' }));
    await play(6000, mix);
    const stored = await repo.listSegments('m1');
    expect(stored.map((s) => [s.id, s.labelOverride, s.speakerLabel])).toEqual([['m1:mixed:0', 'Bob', 'Others']]);
  });

  it('a piece can be overridden on its own', async () => {
    const { runtime, params, meet, mix } = handover();
    await begin(runtime, params());
    await playScript(17_000, mix, handoverCaptions(meet));
    await settle(
      runtime.command({ type: 'labels/override', meetingId: 'm1', segmentId: 'm1:mixed:0.w3', name: 'Tom Brown' }),
    );
    expect((await repo.listSegments('m1')).map((s) => s.labelOverride)).toEqual([null, 'Tom Brown', null]);
  });
});
