// T116 (real call 2026-10-09, FR-027): cutting a stored line into ordinary lines at its speaker runs.
import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '@/core/transcript/model';
import { pieceId, splitSegment } from '@/core/transcript/split';

const line = (over: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  id: 'm1:mixed:7',
  meetingId: 'm1',
  stream: 'mixed',
  seq: 7,
  startMs: 1000,
  endMs: 4000,
  text: ' You will check that?  Yes, yes. Okay.',
  language: 'en',
  speakerLabel: 'Others',
  labelSource: 'fallback',
  captionName: null,
  captionSelf: false,
  labelOverride: null,
  words: [
    { text: 'You', startMs: 1000, endMs: 1200 },
    { text: 'will', startMs: 1200, endMs: 1400 },
    { text: 'check', startMs: 1400, endMs: 1700 },
    { text: 'that?', startMs: 1700, endMs: 2000 },
    { text: 'Yes,', startMs: 2400, endMs: 2700 },
    { text: 'yes.', startMs: 2700, endMs: 3000 },
    { text: 'Okay.', startMs: 3500, endMs: 4000 },
  ],
  timing: 'words',
  sessionId: 's1',
  createdAt: 123,
  schemaVersion: 2,
  labelPending: true,
  ...over,
});

const hannah = {
  speakerLabel: 'Hannah',
  labelSource: 'caption' as const,
  captionName: 'Hannah',
  captionSelf: false,
};
const others = { speakerLabel: 'Others', labelSource: 'fallback' as const, captionName: null, captionSelf: false };

describe('splitSegment', () => {
  it('cuts words, times and text at each piece, keeping the first id and deriving the others', () => {
    const pieces = splitSegment(line(), [
      { from: 0, to: 4, fields: hannah },
      { from: 4, to: 7, fields: others },
    ]);
    expect(pieces.map((p) => [p.id, p.startMs, p.endMs, p.text, p.words.length])).toEqual([
      ['m1:mixed:7', 1000, 2000, 'You will check that?', 4],
      ['m1:mixed:7.w4', 2400, 4000, 'Yes, yes. Okay.', 3],
    ]);
  });

  it('copies the line fields, applies each piece label, and clears the placeholder and any override', () => {
    const [a, b] = splitSegment(line({ labelOverride: 'Ignored' }), [
      { from: 0, to: 4, fields: hannah },
      { from: 4, to: 7, fields: others },
    ]);
    for (const p of [a!, b!]) {
      expect(p).toMatchObject({
        meetingId: 'm1',
        stream: 'mixed',
        seq: 7,
        language: 'en',
        timing: 'words',
        sessionId: 's1',
        createdAt: 123,
        schemaVersion: 2,
        labelOverride: null,
        labelPending: false,
      });
    }
    expect(a).toMatchObject(hannah);
    expect(b).toMatchObject(others);
  });

  it('a piece of a piece keeps the original word index in its id', () => {
    expect(pieceId('m1:mixed:7', 0)).toBe('m1:mixed:7');
    expect(pieceId('m1:mixed:7', 4)).toBe('m1:mixed:7.w4');
    const [, b] = splitSegment(line(), [
      { from: 0, to: 4, fields: hannah },
      { from: 4, to: 7, fields: others },
    ]);
    const again = splitSegment(b!, [
      { from: 0, to: 2, fields: others },
      { from: 2, to: 3, fields: hannah },
    ]);
    expect(again.map((p) => p.id)).toEqual(['m1:mixed:7.w4', 'm1:mixed:7.w6']);
    expect(again[1]!.text).toBe('Okay.');
  });

  it('falls back to joining the words when a word is not found in the text', () => {
    const pieces = splitSegment(line({ text: 'garbled' }), [
      { from: 0, to: 4, fields: hannah },
      { from: 4, to: 7, fields: others },
    ]);
    expect(pieces.map((p) => p.text)).toEqual(['You will check that?', 'Yes, yes. Okay.']);
  });

  it('one piece is the line itself with the label applied', () => {
    const [only, ...rest] = splitSegment(line(), [{ from: 0, to: 7, fields: hannah }]);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ id: 'm1:mixed:7', text: line().text, startMs: 1000, endMs: 4000, ...hannah });
  });
});
