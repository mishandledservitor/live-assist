// 016 T021 (spec SC-005; research R5): the merged transcript is quick enough to build in the press handler. Timed in
// Node on generated meetings with a speech-like spread of words, and on the 013 timing test's 3-hour meeting, where
// every line repeats one sentence and every caption turn another: the worst case for the alignment, which then falls
// back to difflib's autojunk instead of taking minutes. Bounds as the spec sets them for the development machine.
import { describe, expect, it } from 'vitest';
import { mergedTranscript } from '@/core/export/merged-transcript';
import { syntheticMeeting } from '../../../support/synthetic-meeting';
import { longTranscript, storedCaptionTurn, storedMeeting } from '../../../support/stored-meetings';

function timed<T>(run: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
}

const wordsOf = (texts: readonly string[]) => texts.reduce((n, t) => n + t.split(' ').length, 0);

/** The spec's bounds are for the development machine; shared CI runners are allowed three times as long. */
const SLOWER = process.env['CI'] ? 3 : 1;

describe('merged transcript speed (SC-005)', () => {
  it('a 15,000-word meeting merges in under a second', () => {
    const m = syntheticMeeting({ seed: 15_000, words: 15_000, replays: 10 });
    const { value, ms } = timed(() => mergedTranscript(m.meeting, m.segments, m.captionTurns));
    expect(value.lines.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1_000 * SLOWER);
  }, 20_000);

  it('a 45,000-word meeting merges in under two seconds', () => {
    const m = syntheticMeeting({ seed: 45_000, words: 45_000, replays: 30 });
    const { value, ms } = timed(() => mergedTranscript(m.meeting, m.segments, m.captionTurns));
    expect(value.lines.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(2_000 * SLOWER);
  }, 20_000);

  it('5,000 lines of one repeated sentence against 1,200 turns of another merge in under two seconds, every word kept', () => {
    const segments = longTranscript('m1', 5_000);
    const turns = Array.from({ length: 1_200 }, (_, i) =>
      storedCaptionTurn('m1', i + 1, {
        startMs: i * 9_000,
        speakerName: ['Jane', 'Mike', 'Tom', 'You'][i % 4]!,
        self: i % 4 === 3,
        text: `Caption turn ${i + 1} with about a hundred and thirty characters of ordinary invented meeting speech in it, give or take a few words.`,
      }),
    );
    const { value, ms } = timed(() => mergedTranscript(storedMeeting(), segments, turns));
    expect(ms).toBeLessThan(2_000 * SLOWER);
    expect(wordsOf(value.lines.map((l) => l.text))).toBe(wordsOf(segments.map((s) => s.text)));
  }, 20_000);
});
