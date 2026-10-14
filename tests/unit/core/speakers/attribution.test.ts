// T031: the pure confidence rules that name a segment from caption turns (research R6). One case per rule.
import { describe, expect, it } from 'vitest';
import { CaptionTurnTracker, type CaptionTurn } from '@/core/speakers/caption-turns';
import {
  analyse,
  attribute,
  ATTRIBUTION,
  labelFields,
  speakerRuns,
  type AttributedSegment,
  type Attribution,
} from '@/core/speakers/attribution';

const turn = (speakerName: string, firstSeenMs: number, lastSeenMs = firstSeenMs, self: boolean | null = null) =>
  ({ turnKey: `${speakerName}:${firstSeenMs}`, speakerName, self, firstSeenMs, lastSeenMs }) satisfies CaptionTurn;

/** A segment of evenly spread words between start and end. */
function seg(startMs: number, endMs: number, timing: 'words' | 'estimated' = 'words', n = 4): AttributedSegment {
  const step = (endMs - startMs) / n;
  const words =
    timing === 'words'
      ? Array.from({ length: n }, (_, i) => ({
          text: `w${i}`,
          startMs: startMs + i * step,
          endMs: startMs + (i + 1) * step,
        }))
      : [];
  return { startMs, endMs, timing, words };
}

const { LEAD_MS, TAIL_MS } = ATTRIBUTION;

/** A turn whose caption window is exactly [fromMs, toMs] under the current constants. */
const windowTurn = (speakerName: string, fromMs: number, toMs: number, self: boolean | null = null) =>
  turn(speakerName, fromMs + LEAD_MS, toMs - TAIL_MS, self);

describe('attribution rules (research R6)', () => {
  it('exports its constants as one object (data-model.md)', () => {
    expect(ATTRIBUTION).toMatchObject({
      // Retest 2026-10-08 (research R6): windows shifted for caption lag, tuned on the timeline fixtures.
      LEAD_MS: 2000,
      TAIL_MS: -500,
      MIN_COVERAGE: 0.6,
      DOMINANCE: 0.8,
      SETTLE_MS: 6000,
      RESOLVE_DEADLINE_MS: 10000,
      NO_CAPTIONS_MS: 8000,
    });
  });

  it('a single clear turn names the segment', () => {
    expect(attribute(seg(1000, 3000), [turn('Emma Jones', 1400, 3300)])).toEqual({
      kind: 'caption',
      captionName: 'Emma Jones',
      self: false,
    });
  });

  it('a clear "You" turn gives the user\'s settings name, captionSelf and captionName "You" (FR-007)', () => {
    const a = attribute(seg(1000, 3000), [turn('You', 1400, 3300, true)]);
    expect(a).toEqual({ kind: 'caption', captionName: 'You', self: true });
    expect(labelFields(a, 'Mary Smith')).toEqual({
      speakerLabel: 'Mary Smith',
      labelSource: 'caption',
      captionName: 'You',
      captionSelf: true,
    });
  });

  it('a remote name keeps its caption name as the label', () => {
    expect(labelFields({ kind: 'caption', captionName: 'Emma Jones', self: false }, 'Mary')).toEqual({
      speakerLabel: 'Emma Jones',
      labelSource: 'caption',
      captionName: 'Emma Jones',
      captionSelf: false,
    });
  });

  it('"Others" is a fallback with no caption name', () => {
    expect(labelFields({ kind: 'others' }, 'Mary')).toEqual({
      speakerLabel: 'Others',
      labelSource: 'fallback',
      captionName: null,
      captionSelf: false,
    });
  });

  it(`caption lead: first seen ${LEAD_MS - 100} ms after the first word still covers it; ${LEAD_MS + 100} ms does not`, () => {
    const s = seg(1000, 3000);
    const lastSeen = 3000 - TAIL_MS + 100;
    expect(analyse(s, [turn('Emma Jones', 1000 + LEAD_MS - 100, lastSeen)]).coverage).toBe(1);
    const late = analyse(s, [turn('Emma Jones', 1000 + LEAD_MS + 100, lastSeen)]);
    expect(late.coverage).toBeLessThan(1);
    expect(late.coverage).toBeCloseTo(0.95);
  });

  it(`caption tail: a turn last seen more than ${TAIL_MS} ms before the end leaves the end uncovered`, () => {
    expect(analyse(seg(0, 2000), [turn('A', 1000, 2000 - TAIL_MS)]).coverage).toBe(1);
    expect(analyse(seg(0, 2000), [turn('A', 1000, 2000 - TAIL_MS - 200)]).coverage).toBeCloseTo(0.9);
  });

  it('two remote speakers overlapping a segment 50/50 → Others', () => {
    const turns = [windowTurn('Emma Jones', 0, 2000), windowTurn('Tom Brown', 2000, 4000)];
    expect(attribute(seg(0, 4000), turns)).toEqual({ kind: 'others' });
  });

  it('the user and a remote speaker overlapping 50/50 → Others (US1-5)', () => {
    const turns = [windowTurn('You', 0, 2000, true), windowTurn('Tom Brown', 2000, 4000)];
    expect(attribute(seg(0, 4000), turns)).toEqual({ kind: 'others' });
  });

  it('a word covered by two speakers counts half for each', () => {
    const a = analyse(seg(0, 2000), [windowTurn('A', 0, 2000), windowTurn('B', 0, 2000)]);
    expect(a.coverage).toBe(1);
    expect([...a.shares.values()]).toEqual([0.5, 0.5]);
  });

  it('85/15 → the dominant name', () => {
    const s = seg(0, 10_000, 'words', 20);
    const turns = [windowTurn('Emma Jones', 0, 8500), windowTurn('Tom Brown', 8500, 10_500)];
    expect(attribute(s, turns)).toEqual({
      kind: 'caption',
      captionName: 'Emma Jones',
      self: false,
    });
  });

  it('coverage 0.5 → Others', () => {
    const s = seg(0, 4000);
    const turns = [windowTurn('Emma Jones', -500, 2000)];
    expect(analyse(s, turns).coverage).toBe(0.5);
    expect(attribute(s, turns)).toEqual({ kind: 'others' });
  });

  it('dominance is measured on the covered time: one speaker covering 75 % of a segment is named (3 s caption lag)', () => {
    // Window [1000, 4500] over a 0–4000 segment: coverage 0.75, all of it one speaker.
    const s = seg(0, 4000);
    const turns = [windowTurn('Emma Jones', 1000, 4500)];
    const a = analyse(s, turns);
    expect(a.coverage).toBe(0.75);
    expect(a.shares.get('caption:emma jones')).toBe(1);
    expect(attribute(s, turns)).toMatchObject({ kind: 'caption' });
  });

  it("no turns → Others, the user's speech included", () => {
    expect(attribute(seg(0, 2000), [])).toEqual({ kind: 'others' });
  });

  it('estimated timing: one candidate with coverage ≥ 0.8 → name', () => {
    expect(attribute(seg(1000, 3000, 'estimated'), [windowTurn('Emma Jones', 1000, 3000)])).toEqual({
      kind: 'caption',
      captionName: 'Emma Jones',
      self: false,
    });
  });

  it('estimated timing: two candidates → Others, even if one covers most of it', () => {
    const s = seg(0, 10_000, 'estimated');
    const turns = [windowTurn('Emma Jones', 0, 9500), windowTurn('Tom Brown', 9500, 10_500)];
    expect(attribute(s, turns)).toEqual({ kind: 'others' });
  });

  it('estimated timing: one candidate with too little coverage → Others', () => {
    expect(attribute(seg(0, 4000, 'estimated'), [windowTurn('Emma Jones', 0, 2000)])).toEqual({ kind: 'others' });
  });

  it('two participants with the same name are one speaker', () => {
    expect(attribute(seg(0, 4000), [turn('Emma Jones', 1500), turn('emma  jones', 3500)])).toEqual({
      kind: 'caption',
      captionName: 'Emma Jones',
      self: false,
    });
  });

  it("an unrecognised self word (self: null) names the line with that word, never the user's name", () => {
    const a = attribute(seg(1000, 3000), [turn('Εσύ', 1400, 3300, null)]);
    expect(a).toEqual({ kind: 'caption', captionName: 'Εσύ', self: false });
    expect(labelFields(a, 'Mary').speakerLabel).toBe('Εσύ');
  });

  it('a segment with words of zero length falls back to its own span', () => {
    const s: AttributedSegment = {
      startMs: 1000,
      endMs: 2000,
      timing: 'words',
      words: [{ text: 'x', startMs: 1500, endMs: 1500 }],
    };
    expect(attribute(s, [windowTurn('A', 1000, 2000)])).toEqual({ kind: 'caption', captionName: 'A', self: false });
  });
});

// T099 (retest 2026-10-08): a turn's windows come from its bursts of activity, not first-to-last sighting.
describe('turn bursts (retest 2026-10-08)', () => {
  const twoBursts: CaptionTurn = {
    ...turn('Emma Jones', 2000, 35000),
    bursts: [
      [2000, 11000],
      [25000, 35000],
    ],
  };

  it('a stretch between two bursts of one turn, with no caption activity, is not credited to the turn', () => {
    expect(attribute(seg(12500, 22000), [twoBursts])).toEqual({ kind: 'others' });
  });

  it('words inside either burst are still named', () => {
    expect(attribute(seg(1000, 9000), [twoBursts])).toMatchObject({ kind: 'caption', captionName: 'Emma Jones' });
    expect(attribute(seg(24000, 33000), [twoBursts])).toMatchObject({ kind: 'caption', captionName: 'Emma Jones' });
  });
});

// T115 (real call 2026-10-09, FR-027): a line spoken by more than one person is split into speaker runs. Words are
// placed only when every caption lag the model allows gives the same speaker; anything else is "Others".
describe('speaker runs (real call 2026-10-09)', () => {
  /** Caption activity as it arrives, turned into turns by the real tracker (bursts included). */
  const turnsFrom = (...items: { name: string; at: number[]; self?: boolean }[]): CaptionTurn[] => {
    const tracker = new CaptionTurnTracker(0);
    items.forEach((it, i) => {
      for (const at of it.at)
        tracker.add({ turnKey: `t:${i}`, speakerName: it.name, self: it.self ?? null, observedAt: at });
    });
    return tracker.all();
  };
  /** Every `stepMs` from `fromMs` to `toMs` inclusive. */
  const every = (fromMs: number, toMs: number, stepMs = 400) =>
    Array.from({ length: Math.floor((toMs - fromMs) / stepMs) + 1 }, (_, i) => fromMs + i * stepMs);
  /** Back-to-back 500 ms words over each [from, to) stretch, in order. */
  const line = (...stretches: [number, number][]): AttributedSegment => {
    const words = stretches.flatMap(([from, to]) =>
      Array.from({ length: Math.round((to - from) / 500) }, (_, i) => ({
        text: 'w',
        startMs: from + i * 500,
        endMs: from + (i + 1) * 500,
      })),
    );
    return { startMs: words[0]!.startMs, endMs: words[words.length - 1]!.endMs, timing: 'words', words };
  };
  const labelOf = (a: Attribution) => (a.kind === 'others' ? 'Others' : a.captionName);
  /** The label each word ends up with. */
  const wordLabels = (s: AttributedSegment, turns: CaptionTurn[]) =>
    speakerRuns(s, turns).flatMap((r) => Array.from({ length: r.to - r.from }, () => labelOf(r.attribution)));
  /** Hannah talks from 0, someone interjects at 10300 for `ms`, Hannah resumes 300 ms later; all captioned ~0.8 s late. */
  const interjection = (interjector: { name: string; self?: boolean }, ms = 2000) =>
    turnsFrom(
      { name: 'Hannah', at: [...every(800, 10_600), 11_000] },
      { ...interjector, at: every(11_100, 11_100 + ms) },
      { name: 'Hannah', at: every(11_400 + ms, 18_800 + ms) },
    );
  const interjectionLine = (ms = 2000) => line([0, 10_000], [10_300, 10_300 + ms], [10_600 + ms, 18_000 + ms]);

  it('exports the split constants with the others', () => {
    expect(ATTRIBUTION).toMatchObject({ LAG_MIN_MS: 400, LAG_MAX_MS: 3000, REWRITE_MS: 1500 });
  });

  it('a single-speaker line is one run with the same label as the whole-line rule', () => {
    const s = line([1000, 5000]);
    const turns = turnsFrom({ name: 'Emma Jones', at: every(1800, 5400) });
    const runs = speakerRuns(s, turns);
    expect(runs).toEqual([{ from: 0, to: s.words.length, attribution: attribute(s, turns) }]);
    expect(labelOf(runs[0]!.attribution)).toBe('Emma Jones');
  });

  it('estimated timing is never split', () => {
    const s: AttributedSegment = { startMs: 1000, endMs: 9000, timing: 'estimated', words: [] };
    const turns = turnsFrom({ name: 'A', at: every(1800, 5000) }, { name: 'B', at: every(5800, 9600) });
    expect(speakerRuns(s, turns)).toEqual([{ from: 0, to: 0, attribution: attribute(s, turns) }]);
  });

  it('a handover inside a line: two named runs, the words the lag cannot place between them are "Others"', () => {
    // Emma speaks 1000–4500, Tom 5000–9000; both captioned about 0.8 s late.
    const s = line([1000, 4500], [5000, 9000]);
    const turns = turnsFrom(
      { name: 'Emma Jones', at: every(1800, 5000) },
      { name: 'Tom Brown', at: every(5800, 9800) },
    );
    expect(attribute(s, turns)).toEqual({ kind: 'others' }); // before: the whole line was "Others"
    const labels = wordLabels(s, turns);
    // Tom's caption at the longest lag (3 s) could hold speech from 2800: Emma's words from 2500 are not placed.
    expect(labels.slice(0, 3)).toEqual(Array(3).fill('Emma Jones'));
    expect(labels.slice(3, 7)).toEqual(Array(4).fill('Others'));
    expect(labels.slice(7)).toEqual(Array(8).fill('Tom Brown'));
  });

  it("an interjection inside a long turn is never under the main speaker's name (the real call)", () => {
    // Hannah 0–10000, Oliver interjects 10300–12300, Hannah resumes 12600–20000; one committed line.
    const s = interjectionLine();
    const turns = interjection({ name: 'Oliver' });
    // Before: the whole line was Hannah's, Oliver's words included.
    expect(attribute(s, turns)).toMatchObject({ kind: 'caption', captionName: 'Hannah' });
    const labels = wordLabels(s, turns);
    const oliver = s.words.flatMap((w, i) => (w.startMs >= 10_300 && w.endMs <= 12_300 ? [i] : []));
    expect(oliver).toHaveLength(4);
    for (const i of oliver) expect(labels[i]).toBe('Others');
    expect(labels.slice(0, 14)).toEqual(Array(14).fill('Hannah'));
    expect(labels.slice(-10)).toEqual(Array(10).fill('Hannah'));
    // Two seconds is shorter than the lag band: no word of Oliver's can be placed, so none is named.
    expect(speakerRuns(s, turns).map((r) => labelOf(r.attribution))).toEqual(['Hannah', 'Others', 'Hannah']);
  });

  it("a longer interjection gets its own named line between the main speaker's lines", () => {
    const s = interjectionLine(5000);
    const turns = interjection({ name: 'Oliver' }, 5000);
    expect(speakerRuns(s, turns).map((r) => labelOf(r.attribution))).toEqual([
      'Hannah',
      'Others',
      'Oliver',
      'Others',
      'Hannah',
    ]);
  });

  it('a one-word interjection too short to place is "Others", never the main speaker', () => {
    const s = line([0, 8000], [8200, 8700], [9000, 16_000]);
    const turns = turnsFrom(
      { name: 'Hannah', at: [...every(800, 8400), 8800] },
      { name: 'Oliver', at: [9100, 9400] },
      { name: 'Hannah', at: every(9800, 16_800) },
    );
    const labels = wordLabels(s, turns);
    const i = s.words.findIndex((w) => w.startMs === 8200);
    expect(labels[i]).toBe('Others');
    expect(labels).not.toContain('Oliver');
    expect(labels[0]).toBe('Hannah');
    expect(labels[labels.length - 1]).toBe('Hannah');
  });

  it("Meet rewriting the previous item after the next speaker starts does not cut the next speaker's line", () => {
    // Emma's item keeps changing for 1 s after the user's item starts (rewritten-items); the line is all the user's.
    const s = line([9500, 15_500]);
    const turns = turnsFrom(
      { name: 'Emma Jones', at: every(2500, 12_100) },
      { name: 'You', self: true, at: every(11_100, 18_200) },
    );
    const runs = speakerRuns(s, turns);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.attribution).toEqual(attribute(s, turns));
  });

  it('overlapping speech (the older item keeps changing well after the newer one starts) is "Others", never the newcomer', () => {
    const s = line([500, 9000]);
    const turns = turnsFrom(
      { name: 'Emma Jones', at: every(1000, 9400) },
      { name: 'Tom Brown', at: every(4000, 9400) },
    );
    const labels = wordLabels(s, turns);
    expect(labels).not.toContain('Tom Brown');
    expect(labels.slice(-6)).toEqual(Array(6).fill('Others'));
  });

  it("the user's own interjection is named with the self key", () => {
    const named = speakerRuns(interjectionLine(5000), interjection({ name: 'You', self: true }, 5000)).filter(
      (r) => r.attribution.kind === 'caption',
    );
    expect(named.map((r) => r.attribution)).toContainEqual({ kind: 'caption', captionName: 'You', self: true });
  });

  it('runs cover every word once, in order, and neighbours differ', () => {
    const s = interjectionLine();
    const runs = speakerRuns(s, interjection({ name: 'Oliver' }));
    expect(runs[0]!.from).toBe(0);
    expect(runs[runs.length - 1]!.to).toBe(s.words.length);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]!.from).toBe(runs[i - 1]!.to);
      expect(labelOf(runs[i]!.attribution)).not.toBe(labelOf(runs[i - 1]!.attribution));
    }
  });
});
