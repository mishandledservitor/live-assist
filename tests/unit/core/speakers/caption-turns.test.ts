// T029: caption activity → caption turns on the meeting clock (data-model.md "Caption turn", research R5).
import { describe, expect, it } from 'vitest';
import { attribute, labelFields } from '@/core/speakers/attribution';
import { ACTIVITY_GAP_MS, CaptionTurnTracker, PRUNE_MARGIN_MS } from '@/core/speakers/caption-turns';
import { loadTimeline } from '../../../support/timeline';

const STARTED = 1_760_000_000_000;
const act = (turnKey: string, atMs: number, speakerName = 'Emma Jones', self: boolean | null = null) => ({
  turnKey,
  speakerName,
  self,
  observedAt: STARTED + atMs,
});

describe('CaptionTurnTracker', () => {
  it('turns activity into turns in meeting time, keeping first and last seen per turn key', () => {
    const t = new CaptionTurnTracker(STARTED);
    t.add(act('p:1', 1000));
    t.add(act('p:1', 1800));
    t.add(act('p:2', 2500, 'You', true));
    expect(t.all()).toEqual([
      {
        turnKey: 'p:1',
        speakerName: 'Emma Jones',
        self: null,
        firstSeenMs: 1000,
        lastSeenMs: 1800,
        bursts: [[1000, 1800]],
      },
      { turnKey: 'p:2', speakerName: 'You', self: true, firstSeenMs: 2500, lastSeenMs: 2500, bursts: [[2500, 2500]] },
    ]);
  });

  it('add() returns the updated turn, and lastSeenMs never goes backwards', () => {
    const t = new CaptionTurnTracker(STARTED);
    t.add(act('p:1', 2000));
    expect(t.add(act('p:1', 1500))).toMatchObject({ firstSeenMs: 1500, lastSeenMs: 2000 });
  });

  it('finds turns whose seen span touches a time window', () => {
    const t = new CaptionTurnTracker(STARTED);
    t.add(act('a', 1000));
    t.add(act('a', 2000));
    t.add(act('b', 5000));
    t.add(act('c', 9000));
    expect(t.inWindow(2000, 5000).map((x) => x.turnKey)).toEqual(['a', 'b']);
    expect(t.inWindow(2001, 4999)).toEqual([]);
    expect(t.inWindow(0, 100_000)).toHaveLength(3);
  });

  it(`prunes turns that ended more than ${PRUNE_MARGIN_MS} ms before the oldest pending segment`, () => {
    const t = new CaptionTurnTracker(STARTED);
    t.add(act('old', 1000));
    t.add(act('recent', 50_000));
    t.prune(1000 + PRUNE_MARGIN_MS + 1);
    expect(t.all().map((x) => x.turnKey)).toEqual(['recent']);
  });
});

// T099 (retest 2026-10-08): bursts of activity per turn; a gap longer than ACTIVITY_GAP_MS starts a new burst.
describe('CaptionTurnTracker bursts', () => {
  const every = (from: number, to: number, step = 500) =>
    Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

  it(`splits a turn at a gap longer than ${ACTIVITY_GAP_MS} ms and keeps shorter gaps in one burst`, () => {
    const t = new CaptionTurnTracker(STARTED);
    for (const at of [...every(0, 10_000), 10_000 + ACTIVITY_GAP_MS, ...every(24_000, 34_000)]) t.add(act('p:1', at));
    expect(t.all()[0]!.bursts).toEqual([
      [0, 10_000 + ACTIVITY_GAP_MS],
      [24_000, 34_000],
    ]);
  });

  it('late activity that bridges two bursts merges them', () => {
    const t = new CaptionTurnTracker(STARTED);
    t.add(act('p:1', 0));
    t.add(act('p:1', 2 * ACTIVITY_GAP_MS));
    expect(t.all()[0]!.bursts).toHaveLength(2);
    t.add(act('p:1', ACTIVITY_GAP_MS));
    expect(t.all()[0]!.bursts).toEqual([[0, 2 * ACTIVITY_GAP_MS]]);
  });
});

// T108 (real trace 2026-10-08): ACTIVITY_GAP_MS sits between two real pauses in the user's caption activity. A pause
// of 5,406 ms inside a clear line (seg-18) must not split the turn; a 5,772 ms pause holding only a one-word filler
// with no caption activity of its own (seg-17) must, so the filler stays "Others".
describe('ACTIVITY_GAP_MS on the real trace (both margins)', () => {
  const real = loadTimeline('real-2026-10-08');
  const label = (id: string, gapMs?: number) => {
    const t = new CaptionTurnTracker(0, gapMs === undefined ? {} : { activityGapMs: gapMs });
    for (const c of real.captions)
      for (const at of c.observedAtMs)
        t.add({ turnKey: c.turnKey, speakerName: c.speakerName, self: c.self, observedAt: at });
    const s = real.segments.find((x) => x.id === id)!;
    return { label: labelFields(attribute(s, t.all()), real.userName).speakerLabel, turns: t.all() };
  };

  it('keeps the 5,406 ms pause in one burst and splits at the 5,772 ms pause', () => {
    const user = label('seg-18').turns.find((t) => t.turnKey === '0ae75765:3')!;
    const spans = (from: number, to: number) => user.bursts!.some(([a, b]) => a <= from && b >= to);
    expect(spans(207_421, 212_827)).toBe(true);
    expect(spans(200_932, 206_704)).toBe(false);
    expect(ACTIVITY_GAP_MS).toBeGreaterThanOrEqual(5406);
    expect(ACTIVITY_GAP_MS).toBeLessThan(5772);
  });

  it('names the clear line (seg-18) and leaves the filler (seg-17) as Others', () => {
    expect(label('seg-18').label).toBe(real.userName);
    expect(label('seg-17').label).toBe('Others');
  });

  it('the upper margin is real: a gap of 5,800 ms names the filler', () => {
    expect(label('seg-17', 5800).label).toBe(real.userName);
  });
});
