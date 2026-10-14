// The confidence rules that name a segment from caption turns (002 research R6). Pure. A segment is named only when
// captions cover most of its words and one speaker clearly dominates; anything else is "Others" (Principle II: a
// guess is never shown as a name). Everyone's turns count, Meet's self label for the user included (decision 29).
import { normaliseName } from '../transcript/labels';
import type { LabelSource, SpeakerKey, TranscriptSegment } from '../transcript/model';
import { OTHERS_LABEL } from '../transcript/segment-builder';
import type { CaptionTurn } from './caption-turns';

/** Tuned by the timeline fixtures and, later, a real alignment trace (research R6, R11). */
export const ATTRIBUTION = Object.freeze({
  /** A caption shows up to this long after its words are spoken (retest 2026-10-08: lags of 2–2.5 s, research R6). */
  LEAD_MS: 2000,
  /**
   * A burst's window ends this long after its last change. Negative: the last change comes after the last word (caption
   * lag, Meet's rewrites), so the window ends half a second before it (retest 2026-10-08, tuned on the fixtures).
   */
  TAIL_MS: -500,
  /** Share of a segment's word time covered by any caption turn. */
  MIN_COVERAGE: 0.6,
  /** Share of the caption-covered word time the top speaker must hold (research R6, revised by T033). */
  DOMINANCE: 0.8,
  /** Listed in data-model.md; unused since decision 29 removed the mic-vs-tab rule. */
  SELF_OVERLAP: 0.5,
  /**
   * A segment is first resolved this long after it ends (meeting time); the panel shows "…" until then. Real trace
   * 2026-10-08: final labels were known up to 4.7 s after a line's last word (research R6).
   */
  SETTLE_MS: 6000,
  /** …and may still change until this long after it ends. */
  RESOLVE_DEADLINE_MS: 10000,
  /** Captions on but silent this long while speech is transcribed → names degraded (watchdog). */
  NO_CAPTIONS_MS: 8000,
  /**
   * Real call 2026-10-09 (FR-027): the shortest caption lag the split model allows. A burst's speech starts no later
   * than its first change minus this. Real traces: 578–2,725 ms from a first word to its burst's first change.
   */
  LAG_MIN_MS: 400,
  /**
   * …and the longest. Above `LEAD_MS`, which only widens whole-line windows: real traces show lags up to 2,725 ms and
   * the `monologue-caption-lag-2s` fixture 2.5 s, where a shorter maximum placed a new speaker's first word with the
   * previous speaker. Longer only makes more words contested ("Others"), never a wrong name.
   */
  LAG_MAX_MS: 3000,
  /**
   * An older caption item still changing up to this long after a newer one started is Meet rewriting it, not its
   * speaker still talking (the `rewritten-items` fixture: about 1 s). Longer means both are talking: overlap.
   */
  REWRITE_MS: 1500,
});

export type AttributionConstants = typeof ATTRIBUTION;

export type AttributedSegment = Pick<TranscriptSegment, 'startMs' | 'endMs' | 'timing' | 'words'>;

export type Attribution = { kind: 'caption'; captionName: string; self: boolean } | { kind: 'others' };

export interface Analysis {
  /** Covered word time ÷ total word time. */
  coverage: number;
  /** Speaker key → share of the covered word time (a span covered by k speakers counts 1/k for each). */
  shares: Map<SpeakerKey, number>;
  /** Speaker key → the caption name to show for it (first turn seen). */
  names: Map<SpeakerKey, string>;
}

const keyOf = (t: CaptionTurn): SpeakerKey => (t.self === true ? 'self' : `caption:${normaliseName(t.speakerName)}`);

function spansOf(s: AttributedSegment): [number, number][] {
  const words = s.timing === 'words' ? s.words.filter((w) => w.endMs > w.startMs) : [];
  if (words.length > 0) return words.map((w) => [w.startMs, w.endMs]);
  return s.endMs > s.startMs ? [[s.startMs, s.endMs]] : [[s.startMs, s.startMs + 1]];
}

export function analyse(segment: AttributedSegment, turns: readonly CaptionTurn[], c = ATTRIBUTION): Analysis {
  // One window per burst of activity (retest 2026-10-08): a turn's quiet spells are not credited to it.
  const windows = turns.flatMap((t) =>
    (t.bursts ?? [[t.firstSeenMs, t.lastSeenMs] as const]).map(([first, last]) => ({
      key: keyOf(t),
      from: first - c.LEAD_MS,
      to: last + c.TAIL_MS,
    })),
  );
  const names = new Map<SpeakerKey, string>();
  for (const t of turns) if (!names.has(keyOf(t))) names.set(keyOf(t), t.speakerName);

  const shares = new Map<SpeakerKey, number>();
  let total = 0;
  let covered = 0;
  for (const [from, to] of spansOf(segment)) {
    total += to - from;
    // Split the span at every window edge; each piece is covered by a fixed set of speakers.
    const edges = [from, to, ...windows.flatMap((w) => [w.from, w.to]).filter((x) => x > from && x < to)].sort(
      (a, b) => a - b,
    );
    for (let i = 0; i + 1 < edges.length; i++) {
      const a = edges[i]!;
      const b = edges[i + 1]!;
      if (b <= a) continue;
      const mid = (a + b) / 2;
      const speakers = new Set(windows.filter((w) => w.from <= mid && mid <= w.to).map((w) => w.key));
      if (speakers.size === 0) continue;
      covered += b - a;
      for (const k of speakers) shares.set(k, (shares.get(k) ?? 0) + (b - a) / speakers.size);
    }
  }
  for (const [k, v] of shares) shares.set(k, v / covered);
  return { coverage: covered / total, shares, names };
}

export function attribute(segment: AttributedSegment, turns: readonly CaptionTurn[], c = ATTRIBUTION): Attribution {
  const { coverage, shares, names } = analyse(segment, turns, c);
  const ranked = [...shares].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return { kind: 'others' };
  const named = (): Attribution => ({ kind: 'caption', captionName: names.get(top[0])!, self: top[0] === 'self' });

  // Without word times the whole segment is one span: only an unambiguous, well-covered speaker is named.
  if (segment.timing === 'estimated')
    return ranked.length === 1 && coverage >= c.DOMINANCE ? named() : { kind: 'others' };
  return coverage >= c.MIN_COVERAGE && top[1] >= c.DOMINANCE ? named() : { kind: 'others' };
}

/** Words [from, to) of a segment and how they are labelled (real call 2026-10-09, FR-027). */
export interface SpeakerRun {
  from: number;
  to: number;
  attribution: Attribution;
}

interface Burst {
  key: SpeakerKey;
  first: number;
  last: number;
}

/** Where a word can be placed: one speaker, more than one (contested), or nobody (uncaptioned). */
type Placement = { kind: 'placed'; key: SpeakerKey } | { kind: 'contested' } | { kind: 'uncaptioned' };

/** Speakers whose captions could hold speech time `t` at lag `lag`: the newest burst wins unless an older one is still talking. */
function winners(bursts: readonly Burst[], t: number, lag: number, c: AttributionConstants): Set<SpeakerKey> {
  const live = bursts.filter((b) => b.first - lag <= t && t <= b.last + c.TAIL_MS);
  if (live.length === 0) return new Set();
  const newest = live.reduce((a, b) => (b.first > a.first ? b : a));
  return new Set(live.filter((b) => b.key === newest.key || b.last > newest.first + c.REWRITE_MS).map((b) => b.key));
}

function place(bursts: readonly Burst[], w: { startMs: number; endMs: number }, c: AttributionConstants): Placement {
  const lags = [c.LAG_MIN_MS, (c.LAG_MIN_MS + c.LAG_MAX_MS) / 2, c.LEAD_MS, c.LAG_MAX_MS];
  const times = [w.startMs, (w.startMs + w.endMs) / 2, w.endMs];
  const seen = new Set<SpeakerKey>();
  for (const lag of lags)
    for (const t of times) {
      const ws = winners(bursts, t, lag, c);
      if (ws.size > 1) return { kind: 'contested' };
      for (const k of ws) seen.add(k);
    }
  if (seen.size === 0) return { kind: 'uncaptioned' };
  if (seen.size > 1) return { kind: 'contested' };
  return { kind: 'placed', key: [...seen][0]! };
}

/**
 * A line split into speaker runs (research R6 "Real call 2026-10-09"). Placed words of one speaker, with uncaptioned
 * words between them, form a run; contested words inside a run, and anything between runs of different speakers, are
 * "Others"; words before the first or after the last run join it. Each named run must still pass `attribute` on its
 * own words. A line with one run gets exactly what `attribute` gives the whole line.
 */
export function speakerRuns(segment: AttributedSegment, turns: readonly CaptionTurn[], c = ATTRIBUTION): SpeakerRun[] {
  const words = segment.words;
  const whole = (): SpeakerRun[] => [{ from: 0, to: words.length, attribution: attribute(segment, turns, c) }];
  if (segment.timing !== 'words' || words.length === 0) return whole();

  const bursts: Burst[] = turns.flatMap((t) =>
    (t.bursts ?? [[t.firstSeenMs, t.lastSeenMs] as const]).map(([first, last]) => ({ key: keyOf(t), first, last })),
  );
  const placements = words.map((w) => place(bursts, w, c));

  // Raw runs: a key (named candidate) or null ("Others"), over word ranges.
  type Raw = { from: number; to: number; key: SpeakerKey | null };
  const raw: Raw[] = [];
  const anchors = placements.flatMap((p, i) => (p.kind === 'placed' ? [{ i, key: p.key }] : []));
  if (anchors.length === 0) return whole();
  let from = 0;
  for (let a = 0; a < anchors.length; a++) {
    const cur = anchors[a]!;
    const next = anchors[a + 1];
    if (!next) {
      raw.push({ from, to: words.length, key: cur.key });
      break;
    }
    const between = placements.slice(cur.i + 1, next.i);
    if (next.key === cur.key && between.every((p) => p.kind !== 'contested')) continue;
    // A change of speaker, or someone else's caption inside one speaker's speech: the gap is "Others".
    raw.push({ from, to: cur.i + 1, key: cur.key });
    if (next.i > cur.i + 1) raw.push({ from: cur.i + 1, to: next.i, key: null });
    from = next.i;
  }
  if (raw.length === 1) return whole();

  const runs: SpeakerRun[] = [];
  for (const r of raw) {
    const part = words.slice(r.from, r.to);
    const sub: AttributedSegment = {
      startMs: part[0]!.startMs,
      endMs: part[part.length - 1]!.endMs,
      timing: 'words',
      words: part,
    };
    const a: Attribution = r.key === null ? { kind: 'others' } : attribute(sub, turns, c);
    const named = a.kind === 'caption' && keyOfAttribution(a) === r.key ? a : { kind: 'others' as const };
    const prev = runs[runs.length - 1];
    if (prev && sameAttribution(prev.attribution, named)) prev.to = r.to;
    else runs.push({ from: r.from, to: r.to, attribution: named });
  }
  return runs;
}

const keyOfAttribution = (a: Extract<Attribution, { kind: 'caption' }>): SpeakerKey =>
  a.self ? 'self' : `caption:${normaliseName(a.captionName)}`;

const sameAttribution = (a: Attribution, b: Attribution): boolean =>
  a.kind === 'others' ? b.kind === 'others' : b.kind === 'caption' && keyOfAttribution(a) === keyOfAttribution(b);

/** The stored segment fields for an attribution; the user's own turns carry the meeting's user name (FR-007). */
export function labelFields(
  a: Attribution,
  userName: string,
): { speakerLabel: string; labelSource: LabelSource; captionName: string | null; captionSelf: boolean } {
  if (a.kind === 'others')
    return { speakerLabel: OTHERS_LABEL, labelSource: 'fallback', captionName: null, captionSelf: false };
  return {
    speakerLabel: a.self ? userName : a.captionName,
    labelSource: 'caption',
    captionName: a.captionName,
    captionSelf: a.self,
  };
}
