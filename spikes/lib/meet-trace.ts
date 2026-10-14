// 002 T079: turns an alignment trace saved by the spike build (src/core/speakers/alignment-trace.ts) into a timeline
// fixture for the R6 rules (tests/fixtures/meet/timelines/real-<name>.json), with the user's corrections applied, and
// scores it as SC-001 / SC-002. Names in a trace are placeholders already; this never sees a real name or any text.
import { attribute, labelFields } from '../../src/core/speakers/attribution';
import { CaptionTurnTracker } from '../../src/core/speakers/caption-turns';
import { TRACE_FORMAT, TRACE_FORMAT_V1, type AlignmentTrace } from '../../src/core/speakers/alignment-trace';
import { formatOffset } from '../../src/core/transcript/model';

/** Same shape as `tests/support/timeline.ts`'s `Timeline` (the fixture format). */
export interface TraceTimeline {
  userName: string;
  clearTurns: boolean;
  captions: { turnKey: string; speakerName: string; self: boolean | null; observedAtMs: number[] }[];
  segments: {
    id: string;
    startMs: number;
    endMs: number;
    timing: 'words' | 'estimated';
    words: { text: string; startMs: number; endMs: number }[];
  }[];
  expected: Record<string, string>;
}

/** Line start as the panel shows it (`mm:ss`, or `h:mm:ss`) or a segment id → `Participant X`, `$user` or `Others`. */
export type Corrections = Record<string, string>;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseCorrections(raw: unknown): Corrections {
  if (!isRec(raw)) throw new Error('The corrections file must be a JSON object: { "mm:ss" or segment id: label }.');
  const out: Corrections = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string' || v.trim() === '') throw new Error(`Correction "${k}" must be a label string.`);
    out[k] = v.trim();
  }
  return out;
}

/** A format-1 trace (before the real trace 2026-10-08): no start, captions possibly in epoch ms. */
type TraceV1 = Omit<AlignmentTrace, 'format' | 'meetingStartedAtMs'> & { format: typeof TRACE_FORMAT_V1 };

function assertTrace(trace: AlignmentTrace | TraceV1): void {
  if (
    !isRec(trace) ||
    ![TRACE_FORMAT, TRACE_FORMAT_V1].includes(trace.format) ||
    !Array.isArray(trace.captions) ||
    !Array.isArray(trace.segments)
  )
    throw new Error(`Not an alignment trace (expected "format": "${TRACE_FORMAT}").`);
}

/**
 * How far to shift caption times into meeting time. A format-2 trace with its start is meeting-relative already;
 * a format-1 trace, or one whose recorder never learned the start, needs the start by hand (`--origin <epoch ms>`).
 */
function captionShift(trace: AlignmentTrace | TraceV1, origin: number | undefined): number {
  const known = trace.format === TRACE_FORMAT && trace.meetingStartedAtMs !== null;
  if (known) {
    if (origin !== undefined) throw new Error('This trace already carries its meeting start; drop --origin.');
    return 0;
  }
  if (origin === undefined)
    throw new Error(
      'This trace has no meeting start, so its caption times are epoch ms. Pass --origin <epoch ms of the meeting start>.',
    );
  return origin;
}

export function traceToTimeline(
  trace: AlignmentTrace | TraceV1,
  corrections: Corrections,
  options: { clearTurns: boolean; origin?: number },
): TraceTimeline {
  assertTrace(trace);
  const shift = captionShift(trace, options.origin);
  const placeholders = new Set<string>();
  for (const c of trace.captions) if (c.self !== true) placeholders.add(c.speakerName);
  for (const s of trace.segments) if (s.label !== '$user' && s.label !== 'Others') placeholders.add(s.label);

  const expected: Record<string, string> = Object.fromEntries(trace.segments.map((s) => [s.id, s.label]));
  for (const [key, label] of Object.entries(corrections)) {
    if (label !== '$user' && label !== 'Others' && !placeholders.has(label))
      throw new Error(
        `Correction "${key}": unknown label "${label}". Use $user, Others or a placeholder in this trace (${[...placeholders].join(', ') || 'none'}).`,
      );
    let id: string;
    if (key in expected) id = key;
    else {
      const matches = trace.segments.filter((s) => formatOffset(s.startMs) === key);
      if (matches.length === 0) throw new Error(`Correction "${key}" matches no line (by start time or segment id).`);
      if (matches.length > 1)
        throw new Error(
          `Correction "${key}" matches ${matches.length} lines (${matches.map((s) => s.id).join(', ')}); use the segment id instead.`,
        );
      id = matches[0]!.id;
    }
    expected[id] = label;
  }

  return {
    userName: trace.userName,
    clearTurns: options.clearTurns,
    captions: trace.captions.map((c) => ({
      turnKey: c.turnKey,
      speakerName: c.speakerName,
      self: c.self,
      observedAtMs: c.observedAtMs.map((at) => at - shift),
    })),
    segments: trace.segments.map((s) => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      timing: s.timing,
      words: s.words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })),
    })),
    expected,
  };
}

export function timelineFileName(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(name))
    throw new Error(`Bad fixture name "${name}": use lower-case letters, digits and dashes.`);
  return `real-${name}.json`;
}

export interface TimelineScore {
  total: number;
  correct: number;
  wrongConfirmed: number;
  wrong: { id: string; at: string; expected: string; got: string }[];
}

/** Runs the R6 rules on the timeline as `tests/unit/core/speakers/timelines.test.ts` does. */
export function scoreTimeline(t: TraceTimeline): TimelineScore {
  const tracker = new CaptionTurnTracker(0);
  for (const c of t.captions)
    for (const at of c.observedAtMs)
      tracker.add({ turnKey: c.turnKey, speakerName: c.speakerName, self: c.self, observedAt: at });
  const score: TimelineScore = { total: 0, correct: 0, wrongConfirmed: 0, wrong: [] };
  for (const s of t.segments) {
    const fields = labelFields(attribute(s, tracker.all()), t.userName);
    const label = t.expected[s.id] ?? 'Others';
    const expected = label === '$user' ? t.userName : label;
    score.total += 1;
    if (fields.speakerLabel === expected) score.correct += 1;
    else {
      score.wrong.push({ id: s.id, at: formatOffset(s.startMs), expected: label, got: fields.speakerLabel });
      if (fields.labelSource === 'caption') score.wrongConfirmed += 1;
    }
  }
  return score;
}
