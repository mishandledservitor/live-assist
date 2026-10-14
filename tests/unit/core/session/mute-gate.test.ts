// T048: the mute gate in front of the mixer (research R8, data-model.md "Mute gate"). Tab and mic frames are held
// MUTE_GUARD_MS, so a mute reading can still silence mic audio captured just before it was detected (FR-014).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mixFrames,
  MUTE_DETECT_SLACK_MS,
  MUTE_GUARD_MS,
  MUTE_INITIAL_WAIT_MS,
  MUTE_STALE_GRACE_MS,
  MuteGate,
  type GateFrame,
  type GateMode,
} from '@/core/session/mute-gate';

const T0 = 1_760_000_000_000;
const FRAME_MS = 100;
const SAMPLES = 1600;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

const tone = (v: number) => new Int16Array(SAMPLES).fill(v);
const silent = (f: Int16Array | null) => f !== null && f.every((s) => s === 0);

function setup(supported = true) {
  const released: GateFrame[] = [];
  const modes: [GateMode, boolean | null][] = [];
  const gate = new MuteGate({
    supported,
    now: () => Date.now(),
    release: (f) => void released.push(f),
    onMode: (mode, muted) => void modes.push([mode, muted]),
  });
  /** One 100 ms frame of each input arriving now (the audio that ended just now); each frame's tab value is its index. */
  let n = 0;
  const tick = (ms = FRAME_MS) => {
    vi.advanceTimersByTime(ms);
    n += 1;
    gate.push({ tab: tone(n), mic: tone(1000 + n), atMs: Date.now() - FRAME_MS });
  };
  const run = (frames: number) => {
    for (let i = 0; i < frames; i++) tick();
  };
  const reading = (muted: boolean | null, observedAt = Date.now()) => gate.reading({ muted, observedAt });
  return { gate, released, modes, tick, run, reading };
}

/** Released mic frames whose audio overlaps [from, to). */
const overlapping = (released: GateFrame[], from: number, to: number) =>
  released.filter((f) => f.atMs < to && f.atMs + FRAME_MS > from);

describe('MuteGate on a supported platform', () => {
  it('starts awaiting the first reading with the mic silenced', () => {
    const { gate, released, modes, run } = setup();
    expect(gate.mode).toBe('awaiting-first');
    expect(modes).toEqual([['awaiting-first', null]]);
    run(20);
    expect(released.length).toBeGreaterThan(0);
    expect(released.every((f) => silent(f.mic))).toBe(true);
  });

  it(`holds both inputs ${MUTE_GUARD_MS} ms and releases them in order, paired, with their original atMs`, () => {
    const { released, run, reading } = setup();
    reading(false);
    run(10);
    // Frames end at T0+100…T0+1000; those ended at least the guard ago are out.
    expect(released.map((f) => f.tab[0])).toEqual([1, 2, 3, 4, 5]);
    expect(released.map((f) => f.atMs)).toEqual([0, 100, 200, 300, 400].map((d) => T0 + d));
    for (const f of released) expect(f.mic?.[0]).toBe(1000 + f.tab[0]!);
  });

  it('never alters tab frames, muted or not', () => {
    const { released, run, reading } = setup();
    reading(true);
    run(10);
    reading(false);
    run(10);
    released.forEach((f, i) => expect(f.tab.every((s) => s === i + 1)).toBe(true));
  });

  it(`a reading stamped t silences every held mic frame whose audio ends after t − ${MUTE_DETECT_SLACK_MS} ms`, () => {
    const { released, run, reading, gate } = setup();
    reading(false);
    run(10); // now T0+1000; frames 6–10 (T0+500…T0+1000) are held
    const t = Date.now() - 300; // the user muted at T0+700, seen 300 ms late
    reading(true, t);
    run(10);
    gate.flush();
    for (const f of released) {
      const shouldBeSilent = f.atMs + FRAME_MS > t - MUTE_DETECT_SLACK_MS;
      expect(silent(f.mic)).toBe(shouldBeSilent);
    }
    // The frame ending exactly at t − slack keeps its audio; the next one is silenced.
    expect(silent(released.find((f) => f.atMs === T0 + 400)!.mic)).toBe(false);
    expect(silent(released.find((f) => f.atMs === T0 + 500)!.mic)).toBe(true);
  });

  it('silenced mic frames are all-zero and the same length', () => {
    const { released, run, reading } = setup();
    reading(true);
    run(10);
    for (const f of released) {
      expect(f.mic).toHaveLength(SAMPLES);
      expect(silent(f.mic)).toBe(true);
    }
  });

  it('an unmute reading at t lets through mic audio that starts at or after t', () => {
    const { released, run, reading, gate } = setup();
    reading(true);
    run(10);
    const t = Date.now() - 250; // T0+750
    reading(false, t);
    run(10);
    gate.flush();
    for (const f of released) expect(silent(f.mic)).toBe(f.atMs < t);
  });

  it('rapid toggling: the latest reading wins and each applies from its own time', () => {
    const { released, run, reading, gate } = setup();
    reading(false);
    const spans: [number, number][] = [];
    let mutedAt = 0;
    for (let i = 0; i < 20; i++) {
      run(2 + (i % 3));
      const muted = i % 2 === 0;
      reading(muted);
      if (muted) mutedAt = Date.now();
      else spans.push([mutedAt - MUTE_DETECT_SLACK_MS, Date.now()]);
    }
    run(10);
    gate.flush();
    for (const [from, to] of spans) {
      const hit = overlapping(released, from, to);
      expect(hit.length).toBeGreaterThan(0);
      expect(hit.every((f) => silent(f.mic))).toBe(true);
    }
    expect(released.some((f) => !silent(f.mic))).toBe(true);
  });

  // T094, design decision 34: on Meet the gate fails closed — no reading never means "send the mic".
  it(`no reading within ${MUTE_INITIAL_WAIT_MS} ms → unreadable, and the mic stays silenced`, () => {
    const { gate, released, modes, run } = setup();
    run(MUTE_INITIAL_WAIT_MS / FRAME_MS);
    expect(gate.mode).toBe('unreadable');
    expect(modes.at(-1)).toEqual(['unreadable', null]);
    run(50);
    gate.flush();
    expect(released.length).toBeGreaterThan(50);
    expect(released.every((f) => silent(f.mic))).toBe(true);
  });

  it('a null reading while awaiting the first does not open the gate early', () => {
    const { gate, reading, run } = setup();
    reading(null);
    run(5);
    expect(gate.mode).toBe('awaiting-first');
  });

  it(`a lost reading while muted holds the mic silenced through the ${MUTE_STALE_GRACE_MS} ms grace and after it`, () => {
    const { gate, modes, released, run, reading } = setup();
    reading(true);
    run(5);
    reading(null);
    expect(gate.mode).toBe('stale-muted');
    expect(modes.at(-1)).toEqual(['stale-muted', null]);
    run(MUTE_STALE_GRACE_MS / FRAME_MS);
    expect(gate.mode).toBe('unreadable');
    expect(modes.at(-1)).toEqual(['unreadable', null]);
    run(30);
    gate.flush();
    expect(released.every((f) => silent(f.mic))).toBe(true);
  });

  it('a reading during the grace follows it', () => {
    const { gate, released, run, reading } = setup();
    reading(true);
    run(5);
    reading(null);
    run(20);
    reading(true);
    expect(gate.mode).toBe('following');
    run(MUTE_STALE_GRACE_MS / FRAME_MS + 10);
    gate.flush();
    expect(released.every((f) => silent(f.mic))).toBe(true);
  });

  it(`a lost reading while unmuted → unreadable at once, mic silenced from ${MUTE_DETECT_SLACK_MS} ms before`, () => {
    const { gate, released, run, reading } = setup();
    reading(false);
    run(10);
    const lostAt = Date.now();
    reading(null);
    expect(gate.mode).toBe('unreadable');
    run(20);
    gate.flush();
    for (const f of released) expect(silent(f.mic)).toBe(f.atMs + FRAME_MS > lostAt - MUTE_DETECT_SLACK_MS);
  });

  it('unreadable → following on the next reading; an unmuted reading sends the mic again from its time', () => {
    const { gate, modes, released, run, reading } = setup();
    run(MUTE_INITIAL_WAIT_MS / FRAME_MS + 10);
    expect(gate.mode).toBe('unreadable');
    reading(true);
    expect(gate.mode).toBe('following');
    expect(modes.at(-1)).toEqual(['following', true]);
    run(5);
    const back = Date.now();
    reading(false);
    expect(modes.at(-1)).toEqual(['following', false]);
    run(10);
    gate.flush();
    for (const f of released) expect(silent(f.mic)).toBe(f.atMs < back);
  });

  it('reports each following reading as a mode change', () => {
    const { modes, reading } = setup();
    reading(false);
    reading(true);
    reading(true);
    reading(false);
    expect(modes).toEqual([
      ['awaiting-first', null],
      ['following', false],
      ['following', true],
      ['following', false],
    ]);
  });

  it('frames without a mic (tab-only mix) pass with mic null', () => {
    const { gate, released, reading } = setup();
    reading(true);
    vi.advanceTimersByTime(FRAME_MS);
    gate.push({ tab: tone(7), mic: null, atMs: Date.now() - FRAME_MS });
    gate.flush();
    expect(released).toEqual([{ tab: tone(7), mic: null, atMs: T0 }]);
  });

  it('dispose() drops held frames and stops the timers', () => {
    const { gate, released, modes, run, reading } = setup();
    reading(false);
    run(10);
    const before = released.length;
    gate.dispose();
    gate.push({ tab: tone(1), mic: tone(1), atMs: Date.now() });
    vi.advanceTimersByTime(60_000);
    expect(released).toHaveLength(before);
    expect(modes.at(-1)).toEqual(['following', false]);
  });
});

describe('MuteGate where mute cannot be read (other sites)', () => {
  it('passes every frame through at once, untouched, and never reports a mode', () => {
    const { gate, released, modes, tick } = setup(false);
    tick();
    expect(gate.mode).toBe('unsupported');
    expect(released).toHaveLength(1);
    expect(released[0]!.mic).toEqual(tone(1001));
    vi.advanceTimersByTime(60_000);
    expect(modes).toEqual([]);
  });
});

describe('mixFrames', () => {
  it('sums the inputs sample by sample, clipping at the PCM16 range', () => {
    const tab = Int16Array.from([100, -200, 30_000, -30_000]);
    const mic = Int16Array.from([1, 2, 10_000, -10_000]);
    expect([...mixFrames(tab, mic)]).toEqual([101, -198, 32_767, -32_768]);
  });

  it('is the tab alone without a mic, and the tab alone with a silenced mic', () => {
    const tab = Int16Array.from([5, -6]);
    expect([...mixFrames(tab, null)]).toEqual([5, -6]);
    expect([...mixFrames(tab, new Int16Array(2))]).toEqual([5, -6]);
  });
});
