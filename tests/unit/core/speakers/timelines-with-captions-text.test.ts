// 013 T024 (SC-006, FR-006): a pinning test, expected green. Keeping caption text must not change naming. Every
// timeline fixture and every real trace is replayed through MeetingRuntime twice: once as before 013 (a store that
// keeps no captions, no text events), once with a store that keeps them and an invented text event for every caption
// activity. Every line's stored label fields are the same in both runs, and so are the meeting's renames, except
// `remembered` renames for caption names no line carries (spec P2). A red result means naming changed: fix the code.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredCaptionTurn } from '@/core/captions/model';
import type { Logger } from '@/core/log';
import { MeetingRuntime, type MeetingStore, type MixedFrameSource } from '@/core/session/meeting-runtime';
import { normaliseName, speakerKey } from '@/core/transcript/labels';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';
import type { SessionEvent, TranscriptionProvider, TranscriptionSession } from '@/core/transcription/provider';
import { FakeMeetAdapter } from '../../../support/fake-meet-adapter';

const TIMELINES = join(import.meta.dirname, '../../../fixtures/meet/timelines');
const TRACES = join(import.meta.dirname, '../../../fixtures/meet/traces');

/** What a timeline fixture and an alignment trace have in common. */
interface Replayable {
  userName: string;
  captions: { turnKey: string; speakerName: string; self: boolean | null; observedAtMs: number[] }[];
  segments: {
    id: string;
    startMs: number;
    endMs: number;
    timing: 'words' | 'estimated';
    words: { text: string; startMs: number; endMs: number }[];
  }[];
}

const load = (dir: string, file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Replayable;

/**
 * The first real trace (format 1, 2026-10-08) holds its caption times as epoch ms beside meeting-relative lines and
 * does not record the meeting start (src/core/speakers/alignment-trace.ts). Its captions are put on the meeting clock
 * with the origin its converted twin, timelines/real-2026-10-08.json, was made with.
 */
function onMeetingClock(trace: Replayable): Replayable {
  const first = trace.captions[0]?.observedAtMs[0] ?? 0;
  if (first < 1_000_000_000_000) return trace;
  const twin = load(TIMELINES, 'real-2026-10-08.json');
  const origin = first - (twin.captions[0]?.observedAtMs[0] ?? 0);
  return {
    ...trace,
    captions: trace.captions.map((c) => ({ ...c, observedAtMs: c.observedAtMs.map((at) => at - origin) })),
  };
}
const FIXTURES = [
  ...readdirSync(TIMELINES)
    .filter((f) => f.endsWith('.json') && f !== 'format-example.json')
    .map((f) => ({ name: `timeline ${f.replace(/\.json$/, '')}`, fixture: load(TIMELINES, f) })),
  ...readdirSync(TRACES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: `trace ${f.replace(/\.json$/, '')}`, fixture: onMeetingClock(load(TRACES, f)) })),
];

const T0 = 1_760_000_000_000;
/** How long after a line's last word the provider delivers it. */
const COMMIT_LAG_MS = 300;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

/** A transcription session the test drives: it emits what the test tells it to. */
function scriptedProvider() {
  const listeners = new Set<(e: SessionEvent) => void>();
  const session: TranscriptionSession = {
    id: 'scripted',
    sendAudio: () => undefined,
    close: () => undefined,
    on: (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
  const provider: TranscriptionProvider = { id: 'fake', openSession: () => Promise.resolve(session) };
  return { provider, emit: (e: SessionEvent) => listeners.forEach((l) => l(e)) };
}

const silent: Logger = { error: () => undefined, warn: () => undefined, info: () => undefined };

interface Outcome {
  /** Every stored version of every line, in the order it was stored. */
  versions: string[];
  /** The lines as last stored. */
  lines: TranscriptSegment[];
  renames: Meeting['speakerRenames'];
  captionTurns: StoredCaptionTurn[];
}

const labelFields = (s: TranscriptSegment) =>
  JSON.stringify([
    s.id,
    s.startMs,
    s.endMs,
    s.text,
    s.speakerLabel,
    s.labelSource,
    s.captionName,
    s.captionSelf,
    s.labelOverride,
    s.labelPending ?? false,
    s.words.length,
  ]);

async function replay(t: Replayable, withText: boolean): Promise<Outcome> {
  vi.setSystemTime(T0);
  const lines = new Map<string, TranscriptSegment>();
  const versions: string[] = [];
  const captionTurns = new Map<number, StoredCaptionTurn>();
  const keep = (s: TranscriptSegment) => {
    lines.set(s.id, s);
    versions.push(labelFields(s));
    return Promise.resolve();
  };
  const store: MeetingStore = {
    createMeeting: () => Promise.resolve(),
    appendSegment: keep,
    updateSegment: keep,
    setSpeakerRename: () => Promise.resolve(),
    endMeeting: () => Promise.resolve(),
    ...(withText
      ? {
          putCaptionTurns: (_id: string, turns: readonly StoredCaptionTurn[]) => {
            for (const turn of turns) captionTurns.set(turn.seq, turn);
            return Promise.resolve(true);
          },
        }
      : {}),
  };
  const meet = new FakeMeetAdapter({ state: 'on' });
  meet.setMuted(false);
  const scripted = scriptedProvider();
  const runtime = new MeetingRuntime({
    provider: scripted.provider,
    store,
    adapter: meet,
    now: () => Date.now(),
    log: silent,
  });
  const frames: { push: ((tab: Int16Array, mic: Int16Array | null) => void) | null } = { push: null };
  const audio: MixedFrameSource = (listener) => {
    frames.push = listener;
    return Promise.resolve({ mic: { ok: true }, stop: () => Promise.resolve() });
  };
  // A remembered name for every person Meet captions, so the remembered path runs in both replays.
  const speakerNameMappings = [...new Set(t.captions.filter((c) => c.self !== true).map((c) => c.speakerName))].map(
    (captionName) => ({ captionName, displayName: `Remembered ${captionName}`, updatedAt: 1 }),
  );
  await runtime.begin({
    meetingId: 'm1',
    source: { url: 'https://meet.google.com/abc-defg-hij', title: 'Replay' },
    language: { kind: 'auto' },
    keyterms: [],
    userName: t.userName,
    audio,
    speakerNameMappings,
  });
  scripted.emit({ type: 'started', sessionId: 'scripted' });
  // The first frame holds the meeting's first 100 ms, so the session's audio begins at meeting time 0 and word
  // times are meeting times.
  await vi.advanceTimersByTimeAsync(100);
  frames.push?.(new Int16Array(1600), new Int16Array(1600));

  type Step = { at: number; order: number; run: () => void };
  const steps: Step[] = [];
  t.captions.forEach((c, turn) => {
    c.observedAtMs.forEach((at, i) => {
      steps.push({ at, order: 0, run: () => meet.caption(c.turnKey, c.speakerName, c.self) });
      if (withText)
        steps.push({
          at,
          order: 1,
          run: () =>
            meet.emitText(c.turnKey, c.speakerName, `Invented words of turn ${turn}${' and more'.repeat(i)}.`, {
              self: c.self,
              firstSeenAt: T0 + (c.observedAtMs[0] ?? at),
            }),
        });
    });
  });
  for (const s of t.segments) {
    const text = `Invented line ${s.id}.`;
    const commitAt = (s.timing === 'words' ? s.endMs : s.startMs) + (s.timing === 'words' ? COMMIT_LAG_MS : 0);
    steps.push({ at: commitAt, order: 2, run: () => scripted.emit({ type: 'committed', text }) });
    if (s.timing === 'words')
      steps.push({
        at: commitAt,
        order: 3,
        run: () =>
          scripted.emit({
            type: 'committed-detail',
            text,
            language: null,
            words: s.words.map((w) => ({ text: w.text, startSec: w.startMs / 1000, endSec: w.endMs / 1000 })),
          }),
      });
  }
  steps.sort((a, b) => a.at - b.at || a.order - b.order);
  for (const step of steps) {
    const wait = T0 + step.at - Date.now();
    if (wait > 0) await vi.advanceTimersByTimeAsync(wait);
    step.run();
  }
  // Long enough for every line to settle, and for the last caption turns to be written.
  await vi.advanceTimersByTimeAsync(30_000);
  const ending = runtime.end('user-stop');
  await vi.advanceTimersByTimeAsync(5_000);
  await ending;
  return {
    versions,
    lines: [...lines.values()],
    renames: runtime.snapshot().meeting?.speakerRenames ?? {},
    captionTurns: [...captionTurns.values()],
  };
}

describe('naming is the same with and without kept caption text (SC-006)', () => {
  /** Lines named from captions over all fixtures: the replays do name people, so there is something to compare. */
  let named = 0;
  afterAll(() => expect(named).toBeGreaterThan(50));

  it('has the fixtures', () => {
    expect(FIXTURES.filter((f) => f.name.startsWith('timeline')).length).toBeGreaterThanOrEqual(19);
    expect(FIXTURES.filter((f) => f.name.startsWith('trace')).length).toBeGreaterThanOrEqual(4);
  });

  it.each(FIXTURES)('$name', { timeout: 60_000 }, async ({ fixture }) => {
    const before = await replay(fixture, false);
    const withText = await replay(fixture, true);

    // Every caption lies inside the meeting, on its clock.
    for (const c of fixture.captions) for (const at of c.observedAtMs) expect(at).toBeLessThan(3_600_000);

    // The replay is faithful: every fixture line was stored, at the fixture's times where it has word times.
    expect(before.lines.length).toBeGreaterThanOrEqual(fixture.segments.length);
    const timed = fixture.segments.filter((s) => s.timing === 'words');
    if (timed[0]) expect(before.lines.map((l) => l.startMs)).toContain(timed[0].startMs);

    named += before.lines.filter((l) => l.labelSource === 'caption').length;

    // The one thing this test is for.
    expect(withText.versions).toEqual(before.versions);
    expect(withText.lines.map(labelFields)).toEqual(before.lines.map(labelFields));

    // Renames: everything the run without text has, the same; anything more is a remembered name nobody's line has.
    const carried = new Set(withText.lines.map((l) => speakerKey(l)));
    for (const [key, rename] of Object.entries(before.renames)) {
      expect(withText.renames[key as keyof Meeting['speakerRenames']], key).toEqual(rename);
    }
    for (const [key, rename] of Object.entries(withText.renames)) {
      if (key in before.renames) continue;
      expect(rename?.origin, key).toBe('remembered');
      expect(carried.has(key as ReturnType<typeof speakerKey>), `a line carries ${key}`).toBe(false);
    }

    // And the text run did keep captions, so the comparison was not between two runs without them.
    expect(before.captionTurns).toEqual([]);
    const speakers = new Set(fixture.captions.map((c) => normaliseName(c.speakerName)));
    expect(new Set(withText.captionTurns.map((c) => normaliseName(c.speakerName)))).toEqual(speakers);
    expect(withText.captionTurns).toHaveLength(new Set(fixture.captions.map((c) => c.turnKey)).size);
  });
});
