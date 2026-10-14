// T079: alignment trace (saved by the spike build, T067/T078) → timeline fixture (T071), with the user's corrections.
import { describe, expect, it } from 'vitest';
import { TRACE_FORMAT, TRACE_USER, type AlignmentTrace } from '@/core/speakers/alignment-trace';
import { parseTimeline } from '../../support/timeline';
import { parseCorrections, scoreTimeline, timelineFileName, traceToTimeline } from '../../../spikes/lib/meet-trace';

const words = (startMs: number, endMs: number) => [
  { text: 'w0', startMs, endMs: (startMs + endMs) / 2 },
  { text: 'w1', startMs: (startMs + endMs) / 2, endMs },
];

function seg(id: string, startMs: number, endMs: number, label: string) {
  return {
    id,
    startMs,
    endMs,
    timing: 'words' as const,
    words: words(startMs, endMs),
    label,
    labelSource: label === 'Others' ? ('fallback' as const) : ('caption' as const),
  };
}

const TRACE: AlignmentTrace = {
  format: TRACE_FORMAT,
  userName: TRACE_USER,
  meetingStartedAtMs: 1_791_473_933_400,
  captions: [
    { turnKey: 'p1:1', speakerName: 'Participant A', self: null, observedAtMs: [1400, 1900, 2600, 3300] },
    { turnKey: 'p1:2', speakerName: 'You', self: true, observedAtMs: [5400, 6100, 6900] },
    { turnKey: 'p1:3', speakerName: 'Participant B', self: null, observedAtMs: [61_400, 62_000, 62_900] },
  ],
  segments: [
    seg('seg-0', 1000, 3000, 'Participant A'),
    seg('seg-1', 5000, 6800, '$user'),
    seg('seg-2', 9000, 9800, 'Others'),
    seg('seg-3', 61_000, 63_000, 'Participant B'),
    seg('seg-4', 61_500, 61_900, 'Participant B'),
  ],
};

describe('traceToTimeline', () => {
  it('keeps captions and segment timing, takes the traced labels as expected, and passes parseTimeline', () => {
    const t = traceToTimeline(TRACE, {}, { clearTurns: false });
    expect(parseTimeline(JSON.parse(JSON.stringify(t)))).toEqual(t);
    expect(t.userName).toBe(TRACE_USER);
    expect(t.clearTurns).toBe(false);
    expect(t.captions).toEqual(TRACE.captions);
    expect(t.segments[0]).toEqual({
      id: 'seg-0',
      startMs: 1000,
      endMs: 3000,
      timing: 'words',
      words: words(1000, 3000),
    });
    expect(t.expected).toEqual({
      'seg-0': 'Participant A',
      'seg-1': '$user',
      'seg-2': 'Others',
      'seg-3': 'Participant B',
      'seg-4': 'Participant B',
    });
  });

  it('applies corrections by mm:ss of the line start (as the panel shows it) or by segment id', () => {
    const t = traceToTimeline(TRACE, { '00:09': 'Participant B', 'seg-0': '$user' }, { clearTurns: true });
    expect(t.clearTurns).toBe(true);
    expect(t.expected['seg-2']).toBe('Participant B');
    expect(t.expected['seg-0']).toBe('$user');
    expect(t.expected['seg-1']).toBe('$user');
  });

  it('rejects an mm:ss that matches two lines, or none, naming it', () => {
    expect(() => traceToTimeline(TRACE, { '01:01': 'Others' }, { clearTurns: false })).toThrow(/"01:01".*2 lines/);
    expect(() => traceToTimeline(TRACE, { '00:30': 'Others' }, { clearTurns: false })).toThrow(/"00:30".*no line/);
    expect(() => traceToTimeline(TRACE, { 'seg-99': 'Others' }, { clearTurns: false })).toThrow(/"seg-99"/);
  });

  it('rejects unknown placeholders and names that are not placeholders', () => {
    expect(() => traceToTimeline(TRACE, { 'seg-0': 'Participant Z' }, { clearTurns: false })).toThrow(
      /"Participant Z"/,
    );
    expect(() => traceToTimeline(TRACE, { 'seg-0': 'Emma Jones' }, { clearTurns: false })).toThrow(/"Emma Jones"/);
  });

  it('rejects a file that is not an alignment trace', () => {
    expect(() => traceToTimeline({ ...TRACE, format: 'x' } as never, {}, { clearTurns: false })).toThrow(/trace/i);
  });
});

// T106 (real trace 2026-10-08): format-1 traces hold epoch caption times; the meeting start is given by hand.
describe('traceToTimeline: the meeting start', () => {
  const ORIGIN = 1_791_473_933_400;
  const V1 = {
    format: 'live-assist-alignment-trace/1',
    userName: TRACE_USER,
    captions: TRACE.captions.map((c) => ({ ...c, observedAtMs: c.observedAtMs.map((x) => x + ORIGIN) })),
    segments: TRACE.segments,
  };

  it('a format-1 trace converts with origin: captions move into meeting time', () => {
    const t = traceToTimeline(V1 as never, {}, { clearTurns: false, origin: ORIGIN });
    expect(t.captions).toEqual(TRACE.captions);
    expect(scoreTimeline(t).correct).toBe(scoreTimeline(traceToTimeline(TRACE, {}, { clearTurns: false })).correct);
  });

  it('a format-1 trace without origin is refused, saying what to pass', () => {
    expect(() => traceToTimeline(V1 as never, {}, { clearTurns: false })).toThrow(/--origin/);
  });

  it('a format-2 trace with its start converts as is, and refuses a second origin', () => {
    expect(traceToTimeline(TRACE, {}, { clearTurns: false }).captions).toEqual(TRACE.captions);
    expect(() => traceToTimeline(TRACE, {}, { clearTurns: false, origin: ORIGIN })).toThrow(/already/);
  });

  it('a format-2 trace without a start needs origin, like format 1', () => {
    const noStart = { ...V1, format: TRACE_FORMAT, meetingStartedAtMs: null };
    expect(() => traceToTimeline(noStart as never, {}, { clearTurns: false })).toThrow(/--origin/);
    expect(traceToTimeline(noStart as never, {}, { clearTurns: false, origin: ORIGIN }).captions).toEqual(
      TRACE.captions,
    );
  });
});

describe('parseCorrections', () => {
  it('reads an object of string labels and rejects anything else', () => {
    expect(parseCorrections({ '00:09': 'Others' })).toEqual({ '00:09': 'Others' });
    expect(() => parseCorrections(['00:09'])).toThrow(/corrections/i);
    expect(() => parseCorrections({ '00:09': 3 })).toThrow(/"00:09"/);
  });
});

describe('timelineFileName', () => {
  it('writes real-<name>.json and refuses unsafe names', () => {
    expect(timelineFileName('call-2026-10')).toBe('real-call-2026-10.json');
    expect(() => timelineFileName('../x')).toThrow(/name/);
    expect(() => timelineFileName('')).toThrow(/name/);
  });
});

describe('scoreTimeline', () => {
  it('reports SC-001 (correct share) and SC-002 (wrong confirmed names) with the R6 rules', () => {
    const t = traceToTimeline(TRACE, { 'seg-2': 'Participant B' }, { clearTurns: true });
    const score = scoreTimeline(t);
    expect(score.total).toBe(5);
    // seg-2 has no caption turn, so the rules say Others while the user expects Participant B: wrong, not confirmed.
    expect(score.correct).toBe(4);
    expect(score.wrongConfirmed).toBe(0);
    expect(score.wrong).toEqual([{ id: 'seg-2', at: '00:09', expected: 'Participant B', got: 'Others' }]);
  });
});
