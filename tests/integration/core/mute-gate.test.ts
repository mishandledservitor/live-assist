// T050, SC-004: nothing said while muted in Meet leaves the machine. MeetingRuntime + a scripted Meet adapter + the mute
// gate and mixer + FakeTranscriptionProvider recording every chunk actually sent on the single session (replays
// included) + a tap on the mic input as it enters the mixer. The tab is silent and every mic frame carries its own
// non-zero id, so a sent chunk is either all-zero (mic silenced) or names exactly the mic frame it came from.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeetingRuntime, type BeginParams, type MixedFrameSource } from '@/core/session/meeting-runtime';
import {
  MUTE_DETECT_SLACK_MS,
  MUTE_INITIAL_WAIT_MS,
  MUTE_STALE_GRACE_MS,
  type GateFrame,
} from '@/core/session/mute-gate';
import { MUTE_CHECKING_REASON, MUTE_UNREADABLE_REASON, MUTED_REASON } from '@/core/status/status';
import { FakeTranscriptionProvider } from '@/providers/transcription/fake/fixture-provider';
import { openLiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { loadFixture, type Script } from '../../support/fake-websocket';
import { FakeMeetAdapter } from '../../support/fake-meet-adapter';

const T0 = 1_760_000_000_000;
const FRAME_MS = 100;
const SAMPLES = 1600;

let dbN = 0;
let repo: MeetingRepo;

beforeEach(async () => {
  dbN += 1;
  repo = new MeetingRepo(await openLiveAssistDb(`mute-gate-db-${dbN}`));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

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

function decode(b64: string): Int16Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Int16Array(bytes.buffer);
}

/** A muted interval as the user lived it, in epoch ms: [from, to). */
type Interval = [number, number];

function setup(scripts: Script[] = [loadFixture('happy-path')]) {
  const meet = new FakeMeetAdapter({ state: 'on' });
  const provider = new FakeTranscriptionProvider(scripts);
  const tapped: GateFrame[] = [];
  const store = {
    createMeeting: (m: Parameters<MeetingRepo['createMeeting']>[0]) => repo.createMeeting(m),
    appendSegment: (s: Parameters<MeetingRepo['appendSegment']>[0]) => repo.appendSegment(s),
    updateSegment: (s: Parameters<MeetingRepo['updateSegment']>[0]) => repo.updateSegment(s),
    setSpeakerRename: (...a: Parameters<MeetingRepo['setSpeakerRename']>) => repo.setSpeakerRename(...a),
    endMeeting: (id: string, at: number, r: Parameters<MeetingRepo['endMeeting']>[2]) => repo.endMeeting(id, at, r),
  };
  const runtime = new MeetingRuntime({
    provider,
    store,
    adapter: meet,
    now: () => Date.now(),
    onMixerInput: (f) => void tapped.push(f),
  });

  let listener: ((tab: Int16Array, mic: Int16Array | null) => void) | null = null;
  /** Epoch ms at which mic frame id N (1-based) ended. */
  const endedAt: number[] = [0];
  const source: MixedFrameSource = (onFrames) => {
    listener = onFrames;
    return Promise.resolve({ mic: { ok: true }, stop: () => Promise.resolve() });
  };
  const push = () => {
    endedAt.push(Date.now());
    listener?.(new Int16Array(SAMPLES), new Int16Array(SAMPLES).fill(endedAt.length - 1));
  };

  const muted: Interval[] = [];
  let mutedSince: number | null = null;
  /** The user mutes or unmutes in Meet; the reading reaches the runtime `lateMs` after the page changed. */
  const setMuted = (value: boolean | null, lateMs = 0) => {
    const at = Date.now() - lateMs;
    if (value === true && mutedSince === null) mutedSince = at;
    if (value === false && mutedSince !== null) {
      muted.push([mutedSince, at]);
      mutedSince = null;
    }
    meet.setMuted(value, at);
  };

  async function play(ms: number, script: Record<number, () => void> = {}) {
    const done = new Set<string>();
    for (let t = 0; t < ms; t += FRAME_MS) {
      for (const [at, fn] of Object.entries(script))
        if (Number(at) <= Date.now() - T0 && !done.has(at)) {
          done.add(at);
          fn();
        }
      push();
      await vi.advanceTimersByTimeAsync(FRAME_MS);
    }
  }

  const params: BeginParams = {
    meetingId: 'm1',
    source: { url: 'https://meet.google.com/abc-defg-hij', title: 'Standup' },
    language: { kind: 'auto' },
    keyterms: [],
    userName: 'Alex',
    audio: source,
  };

  /** Every chunk sent on every connection, decoded. */
  const sent = () =>
    provider.sockets.flatMap((s) => s.sentOfType('input_audio_chunk').map((m) => decode(m.audio_base_64 as string)));
  /** Mic frame ids that reached the service (non-zero chunks). */
  const sentIds = () => sent().flatMap((f) => (f.every((v) => v === 0) ? [] : [f[0]!]));

  /** Muted intervals extended back by the detection slack, with a still-open one closed at `openUntil`. */
  const mutedIntervals = (openUntil: number): Interval[] => [
    ...muted.map(([a, b]): Interval => [a - MUTE_DETECT_SLACK_MS, b]),
    ...(mutedSince === null ? [] : [[mutedSince - MUTE_DETECT_SLACK_MS, openUntil] as Interval]),
  ];
  const overlaps = (id: number, [a, b]: Interval) => endedAt[id]! - FRAME_MS < b && endedAt[id]! > a;

  /** SC-004: no mic frame overlapping a muted interval reaches the mixer or the service. */
  function assertNothingMutedSent(intervals: Interval[]) {
    for (const f of tapped) {
      if (!f.mic) continue;
      const id = endedAt.findIndex((t) => t === f.atMs + FRAME_MS);
      if (intervals.some((iv) => overlaps(id, iv))) expect(f.mic.every((v) => v === 0)).toBe(true);
    }
    for (const id of sentIds()) for (const iv of intervals) expect(overlaps(id, iv)).toBe(false);
    // Every sent frame for a muted span is the tab-only mix, which is silence here.
    for (const f of sent()) {
      const id = f[0]!;
      if (id !== 0) expect(f.every((v) => v === id)).toBe(true);
    }
  }

  return {
    runtime,
    meet,
    provider,
    tapped,
    params,
    play,
    setMuted,
    sentIds,
    mutedIntervals,
    assertNothingMutedSent,
    endedAt,
  };
}

const begin = (s: ReturnType<typeof setup>) => settle(s.runtime.begin(s.params));

describe('SC-004: mic not sent while muted in Meet', () => {
  it('mute mid-speech: nothing from the muted span is sent, speech before and after is', async () => {
    const s = setup();
    s.setMuted(false);
    await begin(s);
    await s.play(6000, { 1500: () => s.setMuted(true), 3500: () => s.setMuted(false) });
    await s.runtime.end('user-stop');
    s.assertNothingMutedSent(s.mutedIntervals(Infinity));
    const ids = s.sentIds();
    expect(ids.some((id) => s.endedAt[id]! < T0 + 1300)).toBe(true);
    expect(ids.some((id) => s.endedAt[id]! > T0 + 3700)).toBe(true);
  });

  it('a mute reading that arrives 300 ms late still silences the audio from the real mute moment', async () => {
    const s = setup();
    s.setMuted(false);
    await begin(s);
    await s.play(5000, { 2000: () => s.setMuted(true, 300), 4000: () => s.setMuted(false) });
    await s.runtime.end('user-stop');
    s.assertNothingMutedSent(s.mutedIntervals(Infinity));
  });

  it('rapid toggling every 150–400 ms for 10 s', async () => {
    const s = setup();
    s.setMuted(false);
    await begin(s);
    const script: Record<number, () => void> = {};
    const gaps = [150, 400, 250, 300, 200, 350];
    let mute = true;
    for (let t = 500, i = 0; t < 10_500; t += gaps[i % gaps.length]!, i++) {
      const m = mute;
      script[Math.round(t / 100) * 100] ??= () => s.setMuted(m);
      mute = !mute;
    }
    await s.play(11_000, { ...script, 10_600: () => s.setMuted(false) });
    await s.runtime.end('user-stop');
    s.assertNothingMutedSent(s.mutedIntervals(Infinity));
    expect(s.sentIds().length).toBeGreaterThan(0);
  });

  it('muted at Start: no mic audio is sent until the user unmutes; the panel says checking, then muted', async () => {
    const s = setup();
    const micStates: string[] = [];
    s.runtime.subscribe((e) => {
      if (e.type === 'live/status' && e.status.mic.reason) micStates.push(e.status.mic.reason);
    });
    await begin(s);
    expect(micStates).toContain(MUTE_CHECKING_REASON);
    await s.play(4000, { 1000: () => s.setMuted(true), 3000: () => s.setMuted(false) });
    await s.runtime.end('user-stop');
    expect(micStates).toContain(MUTED_REASON);
    // Before the first reading the gate was closed too.
    s.assertNothingMutedSent([[-Infinity, T0 + 3000]]);
  });

  it('a mute already known when Start is pressed applies from the first frame', async () => {
    const s = setup();
    s.setMuted(true);
    await begin(s);
    await s.play(3000);
    await s.runtime.end('user-stop');
    expect(s.sentIds()).toEqual([]);
    expect(s.runtime.snapshot().status.mic.reason).toBe(MUTED_REASON);
  });

  it('mute while the session is reconnecting (replay buffer non-empty): replayed audio is gated too', async () => {
    // The first session drops at 2.5 s with nothing committed; the next one replays every frame since the start.
    const s = setup([loadFixture('drop-mid-partial'), loadFixture('happy-path')]);
    s.setMuted(false);
    await begin(s);
    await s.play(7000, { 1000: () => s.setMuted(true), 2700: () => s.setMuted(false) });
    await s.runtime.end('user-stop');
    expect(s.provider.sockets.length).toBeGreaterThanOrEqual(2);
    s.assertNothingMutedSent(s.mutedIntervals(Infinity));
    // The replay re-sent the muted span: as silence.
    const replayed = s.provider.sockets[1]!.sentOfType('input_audio_chunk').map((m) =>
      decode(m.audio_base_64 as string),
    );
    expect(replayed.some((f) => f.every((v) => v === 0))).toBe(true);
  });

  // T094, design decision 34: on Meet the gate fails closed — the mic is never sent on "unknown".
  it(`page lost while muted: the mic stays silenced through the ${MUTE_STALE_GRACE_MS} ms grace and after it`, async () => {
    const s = setup();
    s.setMuted(false);
    await begin(s);
    await s.play(12_000, {
      1000: () => s.setMuted(true),
      2000: () => s.meet.setMuted(null),
    });
    expect(s.sentIds().every((id) => s.endedAt[id]! <= T0 + 1000 - MUTE_DETECT_SLACK_MS + FRAME_MS)).toBe(true);
    expect(s.runtime.snapshot().status.mic).toEqual({
      state: 'muted',
      reason: MUTE_UNREADABLE_REASON,
      muteFollowed: true,
    });
    await s.runtime.end('user-stop');
  });

  it("page lost while unmuted: the mic is silenced at once and the panel says Meet's mute button can't be seen", async () => {
    const s = setup();
    s.setMuted(false);
    await begin(s);
    let lostAt = 0;
    await s.play(6000, {
      1000: () => {
        lostAt = Date.now();
        s.meet.setMuted(null);
      },
    });
    expect(s.sentIds().length).toBeGreaterThan(0);
    expect(s.sentIds().every((id) => s.endedAt[id]! <= lostAt - MUTE_DETECT_SLACK_MS)).toBe(true);
    expect(s.runtime.snapshot().status.mic).toEqual({
      state: 'muted',
      reason: MUTE_UNREADABLE_REASON,
      muteFollowed: true,
    });
    expect(MUTE_UNREADABLE_REASON).toBe("Not sent — can't see Meet's mute button");
    await s.runtime.end('user-stop');
  });

  it('no reading at all after Start: nothing from the mic is ever sent, and the panel says why', async () => {
    const s = setup();
    await begin(s);
    await s.play(MUTE_INITIAL_WAIT_MS + 5000);
    expect(s.sentIds()).toEqual([]);
    expect(s.runtime.snapshot().status.mic).toMatchObject({ state: 'muted', reason: MUTE_UNREADABLE_REASON });
    await s.runtime.end('user-stop');
  });

  it('readings come back after being lost: an unmuted reading sends the mic again', async () => {
    const s = setup();
    await begin(s);
    let backAt = 0;
    await s.play(MUTE_INITIAL_WAIT_MS + 3000, {
      [MUTE_INITIAL_WAIT_MS + 1000]: () => {
        backAt = Date.now();
        s.setMuted(false);
      },
    });
    expect(s.sentIds().length).toBeGreaterThan(0);
    expect(s.sentIds().every((id) => s.endedAt[id]! - FRAME_MS >= backAt)).toBe(true);
    expect(s.runtime.snapshot().status.mic).toEqual({ state: 'active', muteFollowed: true });
    await s.runtime.end('user-stop');
  });

  it('closes within one frame of the reading and reopens within 1 s (FR-015)', async () => {
    const s = setup();
    s.setMuted(false);
    await begin(s);
    await s.play(2000);
    const mutedAt = Date.now();
    s.setMuted(true);
    // The very next frame entering the mixer that overlaps the mute is already silent.
    await s.play(100);
    const tappedAfter = s.tapped.filter((f) => f.atMs + FRAME_MS > mutedAt - MUTE_DETECT_SLACK_MS);
    expect(tappedAfter.every((f) => f.mic!.every((v) => v === 0))).toBe(true);
    await s.play(1000);
    const unmutedAt = Date.now();
    s.setMuted(false);
    await s.play(1000);
    expect(s.sentIds().some((id) => s.endedAt[id]! - FRAME_MS >= unmutedAt)).toBe(true);
    await s.runtime.end('user-stop');
  });
});
