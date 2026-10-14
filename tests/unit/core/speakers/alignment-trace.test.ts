// T078: the dev-only alignment trace (research R11): caption turns and segment timing from a real call, with names as
// placeholders and no text of any kind, so it can be turned into a timeline fixture (T071) and committed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AlignmentTraceRecorder, TRACE_FORMAT, TRACE_USER } from '@/core/speakers/alignment-trace';
import type { TranscriptSegment } from '@/core/transcript/model';

const T0 = 1_760_000_000_000;
const MEETING = 'f3a1c2d4-0000-4000-8000-123456789abc';
/** The real trace's meeting start, fitted against its live labels (research R6, real trace 2026-10-08). */
const REAL_ORIGIN = 1791473933400;

function segment(seq: number, startMs: number, fields: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    id: `${MEETING}:mixed:${seq}`,
    meetingId: MEETING,
    stream: 'mixed',
    seq,
    startMs,
    endMs: startMs + 1000,
    text: 'Kickoff is at ten tomorrow',
    language: 'en',
    speakerLabel: 'Others',
    labelSource: 'fallback',
    captionName: null,
    captionSelf: false,
    labelOverride: null,
    words: [
      { text: 'Kickoff', startMs, endMs: startMs + 500 },
      { text: 'tomorrow', startMs: startMs + 500, endMs: startMs + 1000 },
    ],
    timing: 'words',
    sessionId: 'sess',
    createdAt: T0,
    schemaVersion: 2,
    ...fields,
  };
}

function recorded() {
  const r = new AlignmentTraceRecorder();
  r.begin({ startedAt: T0, userName: 'Mary Smith' });
  r.caption({ turnKey: 'p1:1', speakerName: 'Emma Jones', self: null, observedAt: T0 + 1800 });
  r.caption({ turnKey: 'p1:1', speakerName: 'Emma Jones', self: null, observedAt: T0 + 2300 });
  r.caption({ turnKey: 'p1:2', speakerName: 'You', self: true, observedAt: T0 + 5200 });
  r.caption({ turnKey: 'p1:3', speakerName: 'Tom Brown', self: null, observedAt: T0 + 9100 });
  r.segment(segment(0, 1000));
  r.segment(segment(1, 4500));
  r.segment(segment(2, 8500));
  // Attribution settles later: the same segments come back updated.
  r.segment(segment(0, 1000, { speakerLabel: 'Emma Jones', labelSource: 'caption', captionName: 'Emma Jones' }));
  r.segment(
    segment(1, 4500, { speakerLabel: 'Mary Smith', labelSource: 'caption', captionName: 'You', captionSelf: true }),
  );
  r.segment(segment(2, 8500, { labelOverride: 'Bob Smith' }));
  return r;
}

describe('AlignmentTraceRecorder', () => {
  it('keeps caption turns in meeting time, self word as shown, other names as placeholders', () => {
    const { trace, key } = recorded().export();
    expect(trace.format).toBe(TRACE_FORMAT);
    expect(trace.userName).toBe(TRACE_USER);
    expect(trace.captions).toEqual([
      { turnKey: 'p1:1', speakerName: 'Participant A', self: null, observedAtMs: [1800, 2300] },
      { turnKey: 'p1:2', speakerName: 'You', self: true, observedAtMs: [5200] },
      { turnKey: 'p1:3', speakerName: 'Participant B', self: null, observedAtMs: [9100] },
    ]);
    expect(key).toEqual({ 'Participant A': 'Emma Jones', 'Participant B': 'Tom Brown' });
  });

  it('keeps segment timing and the attributed label, latest version wins', () => {
    const { trace } = recorded().export();
    expect(trace.segments).toEqual([
      {
        id: 'seg-0',
        startMs: 1000,
        endMs: 2000,
        timing: 'words',
        words: [
          { text: 'w0', startMs: 1000, endMs: 1500 },
          { text: 'w1', startMs: 1500, endMs: 2000 },
        ],
        label: 'Participant A',
        labelSource: 'caption',
        why: expect.objectContaining({ reason: expect.any(String) as string }) as unknown,
      },
      expect.objectContaining({ id: 'seg-1', label: '$user', labelSource: 'caption' }),
      expect.objectContaining({ id: 'seg-2', label: 'Others', labelSource: 'fallback' }),
    ]);
  });

  it('a caption name seen only on a segment still gets a placeholder', () => {
    const r = new AlignmentTraceRecorder();
    r.begin({ startedAt: T0, userName: 'Mary Smith' });
    r.segment(segment(0, 0, { speakerLabel: 'John Doe', labelSource: 'caption', captionName: 'John Doe' }));
    const { trace, key } = r.export();
    expect(trace.segments[0]?.label).toBe('Participant A');
    expect(key).toEqual({ 'Participant A': 'John Doe' });
  });

  it('the serialised trace has no text, user name, typed names, meeting id or real participant name', () => {
    const json = JSON.stringify(recorded().export().trace);
    for (const s of ['Kickoff', 'tomorrow', 'Mary', 'Smith', 'Bob', 'Emma', 'Tom', MEETING, 'sess'])
      expect(json).not.toContain(s);
  });

  it('begin starts a new trace', () => {
    const r = recorded();
    r.begin({ startedAt: T0 + 60_000, userName: 'Mary Smith' });
    expect(r.export().trace).toMatchObject({ captions: [], segments: [] });
  });
});

// T100 (retest 2026-10-08): the trace says why each line got its label, by the R6 rules over everything recorded.
describe('AlignmentTraceRecorder: why each line got its label', () => {
  function scenario() {
    const r = new AlignmentTraceRecorder();
    r.begin({ startedAt: T0, userName: 'Mary Smith' });
    const at = (turnKey: string, speakerName: string, self: boolean | null, from: number, to: number) => {
      for (let t = from; t <= to; t += 500) r.caption({ turnKey, speakerName, self, observedAt: T0 + t });
    };
    at('a', 'Emma Jones', null, 2000, 5000);
    at('b', 'Tom Brown', null, 9000, 12_000);
    at('c', 'You', true, 9000, 12_000);
    r.segment(segment(0, 1000, { speakerLabel: 'Emma Jones', labelSource: 'caption', captionName: 'Emma Jones' }));
    r.segment(segment(1, 4000));
    r.segment(segment(2, 9500));
    r.segment(segment(3, 20_000));
    return r.export().trace;
  }

  it('gives the reason, the coverage and each speaker share, by placeholder', () => {
    expect(scenario().segments.map((s) => [s.id, s.why])).toEqual([
      ['seg-0', { reason: 'named', rulesLabel: 'Participant A', coverage: 1, shares: { 'Participant A': 1 } }],
      ['seg-1', { reason: 'low-coverage', rulesLabel: 'Others', coverage: 0.5, shares: { 'Participant A': 1 } }],
      [
        'seg-2',
        {
          reason: 'no-clear-speaker',
          rulesLabel: 'Others',
          coverage: 1,
          shares: { 'Participant B': 0.5, $user: 0.5 },
        },
      ],
      ['seg-3', { reason: 'no-captions', rulesLabel: 'Others', coverage: 0, shares: {} }],
    ]);
  });

  it('the reasons carry no real name and no text', () => {
    const json = JSON.stringify(scenario());
    for (const s of ['Emma', 'Tom', 'Mary', 'Smith', 'Kickoff', 'tomorrow']) expect(json).not.toContain(s);
  });
});

// T106 (real trace 2026-10-08): the trace keeps one clock. The recorder used to learn the meeting start only if
// `begin()` ran first; on the real call it never did, so captions stayed epoch ms and every reason read no-captions.
describe('AlignmentTraceRecorder: one clock (real trace 2026-10-08)', () => {
  it('keeps captions seen before begin() and exports them in meeting time, with the start', () => {
    const r = new AlignmentTraceRecorder();
    r.caption({ turnKey: 'p1:1', speakerName: 'Emma Jones', self: null, observedAt: T0 + 1800 });
    r.caption({ turnKey: 'p1:1', speakerName: 'Emma Jones', self: null, observedAt: T0 + 2300 });
    r.begin({ id: MEETING, startedAt: T0, userName: 'Mary Smith' });
    r.segment(segment(0, 1000, { speakerLabel: 'Emma Jones', labelSource: 'caption', captionName: 'Emma Jones' }));
    const { trace } = r.export();
    expect(trace.format).toBe('live-assist-alignment-trace/2');
    expect(trace.meetingStartedAtMs).toBe(T0);
    expect(trace.captions).toEqual([
      { turnKey: 'p1:1', speakerName: 'Participant A', self: null, observedAtMs: [1800, 2300] },
    ]);
    expect(trace.segments[0]?.why).toMatchObject({ reason: 'named', rulesLabel: 'Participant A' });
  });

  it('drops captions from before the meeting started and lines of another meeting', () => {
    const r = new AlignmentTraceRecorder();
    r.caption({ turnKey: 'old:1', speakerName: 'Tom Brown', self: null, observedAt: T0 - 5000 });
    r.segment(segment(0, 1000, { meetingId: 'other', id: 'other:mixed:0' }));
    r.caption({ turnKey: 'p1:1', speakerName: 'Emma Jones', self: null, observedAt: T0 + 100 });
    r.begin({ id: MEETING, startedAt: T0, userName: 'Mary Smith' });
    const { trace, key } = r.export();
    expect(trace.captions.map((c) => c.turnKey)).toEqual(['p1:1']);
    expect(trace.segments).toEqual([]);
    expect(key).toEqual({ 'Participant A': 'Emma Jones' });
  });

  it('without a known start it keeps epoch times and gives no reasons rather than mixing clocks', () => {
    const r = new AlignmentTraceRecorder();
    r.caption({ turnKey: 'p1:1', speakerName: 'Emma Jones', self: null, observedAt: T0 + 1800 });
    r.segment(segment(0, 1000));
    const { trace } = r.export();
    expect(trace.meetingStartedAtMs).toBeNull();
    expect(trace.captions[0]?.observedAtMs).toEqual([T0 + 1800]);
    expect(trace.segments[0]?.why).toBeUndefined();
  });

  it('the real trace replayed with a late begin(): every line named live shows coverage and reason named', () => {
    const real = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../../fixtures/meet/traces/real-2026-10-08-trace.json'), 'utf8'),
    ) as {
      captions: { turnKey: string; speakerName: string; self: boolean | null; observedAtMs: number[] }[];
      segments: {
        id: string;
        startMs: number;
        endMs: number;
        words: { startMs: number; endMs: number }[];
        label: string;
      }[];
    };
    const r = new AlignmentTraceRecorder();
    for (const c of real.captions)
      for (const at of c.observedAtMs)
        r.caption({ turnKey: c.turnKey, speakerName: c.speakerName, self: c.self, observedAt: at });
    r.begin({ id: MEETING, startedAt: REAL_ORIGIN, userName: 'Mary Smith' });
    real.segments.forEach((s, seq) => {
      const named = s.label !== 'Others';
      r.segment(
        segment(seq, s.startMs, {
          endMs: s.endMs,
          words: s.words.map((w, i) => ({ text: `w${i}`, startMs: w.startMs, endMs: w.endMs })),
          speakerLabel: named ? s.label : 'Others',
          labelSource: named ? 'caption' : 'fallback',
          captionName: s.label === '$user' ? 'You' : named ? s.label : null,
          captionSelf: s.label === '$user',
        }),
      );
    });
    const { trace } = r.export();
    const named = trace.segments.filter((s) => s.label !== 'Others');
    expect(named).toHaveLength(18);
    for (const s of named) {
      expect(s.why?.coverage, s.id).toBeGreaterThan(0);
      expect(s.why?.reason, s.id).toBe('named');
      expect(s.why?.rulesLabel, s.id).toBe(s.label);
    }
  });
});

// T119 (real call 2026-10-09, FR-027): a split line keeps its original words in the trace and records its pieces.
describe('AlignmentTraceRecorder: split lines', () => {
  it('keeps the whole line and lists each piece with its first word and label', () => {
    const r = new AlignmentTraceRecorder();
    r.begin({ startedAt: T0, userName: 'Mary Smith' });
    r.caption({ turnKey: 'p1:1', speakerName: 'Emma Jones', self: null, observedAt: T0 + 1800 });
    const whole = segment(0, 1000);
    r.segment(whole);
    r.segment({
      ...whole,
      words: whole.words.slice(0, 1),
      endMs: 1500,
      speakerLabel: 'Emma Jones',
      labelSource: 'caption',
      captionName: 'Emma Jones',
    });
    r.segment({ ...whole, id: `${whole.id}.w1`, words: whole.words.slice(1), startMs: 1500 });
    const s = r.export().trace.segments;
    expect(s).toHaveLength(1);
    expect(s[0]!.words).toHaveLength(2);
    expect(s[0]!.label).toBe('Participant A');
    expect(s[0]!.pieces).toEqual([
      { firstWord: 0, label: 'Participant A', labelSource: 'caption' },
      { firstWord: 1, label: 'Others', labelSource: 'fallback' },
    ]);
  });
});
