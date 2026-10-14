// T033, T117: the attribution rules on every timeline fixture, scored as SC-001 (≥ 90 % named correctly on clear
// turn-taking, the user's own lines included) and SC-002 (no wrong name ever shown as confirmed), per line and, since
// the real call 2026-10-09, per word: lines are split at speaker changes (FR-027) and no word may be shown under a
// name other than the person who spoke it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attribute, ATTRIBUTION, labelFields, speakerRuns, type Attribution } from '@/core/speakers/attribution';
import { CaptionTurnTracker, type CaptionTurn } from '@/core/speakers/caption-turns';
import type { AlignmentTrace } from '@/core/speakers/alignment-trace';
import { expectedPieces, loadTimeline, truthOf, type Timeline } from '../../../support/timeline';

const DIR = join(import.meta.dirname, '../../../fixtures/meet/timelines');
const TRACES = join(import.meta.dirname, '../../../fixtures/meet/traces');
const NAMES = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'format-example.json')
  .map((f) => f.replace(/\.json$/, ''));

interface Piece {
  label: string;
  words: number;
  confirmed: boolean;
}

function turnsOf(captions: Timeline['captions']): CaptionTurn[] {
  const tracker = new CaptionTurnTracker(0);
  for (const c of captions)
    for (const at of c.observedAtMs)
      tracker.add({ turnKey: c.turnKey, speakerName: c.speakerName, self: c.self, observedAt: at });
  return tracker.all();
}

const pieceOf = (a: Attribution, words: number, userName: string): Piece => {
  const f = labelFields(a, userName);
  return { label: f.speakerLabel, words, confirmed: f.labelSource === 'caption' };
};

/** The pieces each line becomes under the split rules (after) or the whole-line rule (before). */
function run(t: Timeline, mode: 'after' | 'before' = 'after'): Map<string, Piece[]> {
  const turns = turnsOf(t.captions);
  return new Map(
    t.segments.map((s) => [
      s.id,
      mode === 'before'
        ? [pieceOf(attribute(s, turns), s.words.length, t.userName)]
        : speakerRuns(s, turns).map((r) => pieceOf(r.attribution, r.to - r.from, t.userName)),
    ]),
  );
}

/** Each word's label and whether it is shown as a confirmed name. */
const perWord = (pieces: Piece[]) =>
  pieces.flatMap((p) => Array.from({ length: p.words }, () => ({ label: p.label, confirmed: p.confirmed })));

interface WordScore {
  /** Words whose speaker is known and is a name. */
  namedTruth: number;
  /** …of those, shown under that name. */
  namedRight: number;
  /** Words shown under a confirmed name that is not who spoke them (speaker known). */
  wrong: number;
}

function scoreWords(t: Timeline, mode: 'after' | 'before'): WordScore {
  const out = run(t, mode);
  const score: WordScore = { namedTruth: 0, namedRight: 0, wrong: 0 };
  for (const s of t.segments) {
    const truth = truthOf(t, s.id);
    perWord(out.get(s.id)!).forEach((w, i) => {
      const who = truth[i]!;
      if (who !== '?' && who !== 'Others') {
        score.namedTruth += 1;
        if (w.label === who) score.namedRight += 1;
      }
      if (w.confirmed && who !== '?' && w.label !== who) score.wrong += 1;
      // A word of unknown speaker (overlap) must never carry a name either.
      if (w.confirmed && who === '?' && t.spokenBy?.[s.id]) score.wrong += 1;
    });
  }
  return score;
}

describe('timeline fixtures (SC-001, SC-002)', () => {
  it('has the fixtures the plan lists', () => {
    expect(NAMES.sort()).toEqual(
      [
        'caption-lag-3s',
        'clear-turns-3-speakers-and-user',
        'dropped-older-text',
        'estimated-timing',
        'interjection-in-long-turn',
        'long-monologue-pauses',
        'monologue-caption-lag-2s',
        'no-captions',
        'overlap',
        'overlap-mid-line',
        'quick-exchange',
        'rapid-back-and-forth',
        'real-2026-10-08',
        'rewritten-items',
        'same-name-twice',
        'self-unrecognised-greek',
        'short-interjection',
        'uncaptioned-gap',
        'user-talks-over-remote',
      ].sort(),
    );
  });

  it.each(NAMES)('%s: every line becomes its expected pieces with their labels', (name) => {
    const t = loadTimeline(name);
    const out = run(t);
    const got = t.segments.map((s) => [s.id, out.get(s.id)!.map(({ label, words }) => ({ label, words }))]);
    const want = t.segments.map((s) => [s.id, expectedPieces(t, s.id)]);
    expect(got).toEqual(want);
  });

  it.each(NAMES)('%s: no word is shown under a name other than who spoke it', (name) => {
    expect(scoreWords(loadTimeline(name), 'after').wrong).toBe(0);
  });

  // Where the whole-line rule named no word wrongly, the split must not lose a single correctly named word. Where it
  // did (an interjection or overlap under the main speaker's name), the words around it may become "Others" instead.
  it.each(NAMES)('%s: named-word accuracy does not drop where the whole-line rule was right', (name) => {
    const t = loadTimeline(name);
    const before = scoreWords(t, 'before');
    const after = scoreWords(t, 'after');
    if (before.wrong === 0) expect(after.namedRight).toBeGreaterThanOrEqual(before.namedRight);
    else expect(after.wrong).toBe(0);
  });

  it('the split fixes the real call: before, the whole-line rule showed words under the wrong name', () => {
    const before = ['interjection-in-long-turn', 'rapid-back-and-forth', 'short-interjection'].map(
      (n) => scoreWords(loadTimeline(n), 'before').wrong,
    );
    expect(before.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('scores SC-001 ≥ 90 % on clear turns and SC-002 = 0 wrong confirmed names, per piece and per word', () => {
    let clearTotal = 0;
    let clearCorrect = 0;
    let wrongConfirmed = 0;
    const rows: string[] = [];
    const sum = {
      before: { namedTruth: 0, namedRight: 0, wrong: 0 },
      after: { namedTruth: 0, namedRight: 0, wrong: 0 },
    };
    for (const name of NAMES.sort()) {
      const t = loadTimeline(name);
      const out = run(t);
      for (const s of t.segments) {
        const want = expectedPieces(t, s.id);
        out.get(s.id)!.forEach((p, i) => {
          const e = want[i];
          if (t.clearTurns) {
            clearTotal += 1;
            if (e?.label === p.label && e.words === p.words) clearCorrect += 1;
          }
          if (p.confirmed && p.label !== e?.label) wrongConfirmed += 1;
        });
      }
      const b = scoreWords(t, 'before');
      const a = scoreWords(t, 'after');
      for (const k of ['namedTruth', 'namedRight', 'wrong'] as const) {
        sum.before[k] += b[k];
        sum.after[k] += a[k];
      }
      rows.push(
        `${name}: named words ${b.namedRight}/${b.namedTruth} → ${a.namedRight}/${a.namedTruth}; wrong-name words ${b.wrong} → ${a.wrong}`,
      );
    }
    const sc001 = clearCorrect / clearTotal;
    console.info(
      [
        `SC-001 named correctly: ${(sc001 * 100).toFixed(1)}% (${clearCorrect}/${clearTotal}); SC-002 wrong confirmed names: ${wrongConfirmed}`,
        ...rows,
        `all: named words ${sum.before.namedRight}/${sum.before.namedTruth} → ${sum.after.namedRight}/${sum.after.namedTruth}; wrong-name words ${sum.before.wrong} → ${sum.after.wrong}`,
      ].join('\n'),
    );
    expect(clearTotal).toBeGreaterThan(10);
    expect(sc001).toBeGreaterThanOrEqual(0.9);
    expect(wrongConfirmed).toBe(0);
    expect(sum.after.wrong).toBe(0);
  });
});

// T117: the real traces have no per-word truth, so they are checked against the captions themselves: a word shown
// under a name must lie where that speaker's caption windows could hold it, or where nobody else's could.
describe('real traces: no named word where only another speaker was captioned', () => {
  const traces = readdirSync(TRACES).filter((f) => f.endsWith('.json'));

  it('has the real traces', () => {
    expect(traces.sort()).toEqual(
      [
        'real-2026-10-08-trace.json',
        'real-2026-10-09-0929-trace.json',
        'real-2026-10-09-0931-trace.json',
        'real-2026-10-09-0945-trace.json',
      ].sort(),
    );
  });

  it.each(traces.filter((f) => f !== 'real-2026-10-08-trace.json'))('%s', (file) => {
    const trace = JSON.parse(readFileSync(join(TRACES, file), 'utf8')) as AlignmentTrace;
    const turns = turnsOf(trace.captions);
    const windows = turns.flatMap((t) =>
      (t.bursts ?? [[t.firstSeenMs, t.lastSeenMs] as const]).map(([f, l]) => ({
        who: t.self === true ? '$user' : t.speakerName,
        from: f - ATTRIBUTION.LEAD_MS,
        to: l + ATTRIBUTION.TAIL_MS,
      })),
    );
    const holds = (who: string, w: { startMs: number; endMs: number }) =>
      windows.some((x) => x.who === who && x.from < w.endMs && w.startMs < x.to);
    let before = 0;
    let after = 0;
    let beforeNamed = 0;
    let afterNamed = 0;
    for (const s of trace.segments) {
      const nameOf = (a: Attribution) => (a.kind === 'others' ? null : a.self ? '$user' : a.captionName);
      const check = (who: string | null, w: { startMs: number; endMs: number }) => {
        if (who === null) return 0;
        const mid = (w.startMs + w.endMs) / 2;
        const other = windows.some((x) => x.who !== who && x.from <= mid && mid <= x.to);
        return !holds(who, w) && other ? 1 : 0;
      };
      const whole = nameOf(attribute(s, turns));
      for (const w of s.words) {
        before += check(whole, w);
        if (whole !== null) beforeNamed += 1;
      }
      for (const r of speakerRuns(s, turns))
        for (const w of s.words.slice(r.from, r.to)) {
          after += check(nameOf(r.attribution), w);
          if (r.attribution.kind === 'caption') afterNamed += 1;
        }
    }
    console.info(
      `${file}: named words ${beforeNamed} → ${afterNamed}; outside their speaker's captions ${before} → ${after}`,
    );
    expect(after).toBe(0);
  });
});
