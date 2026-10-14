// 007 T002/T004 (FR-004–FR-008, FR-010; 004 FR-017–FR-019): the transcript file's name and body, shared with 004's
// inbox export. Start times are built from local components so the tests pass in any time zone (research R4).
import { describe, expect, it } from 'vitest';
import {
  exportTimestamp,
  hasTranscriptFileLines,
  transcriptFile,
  transcriptFileLines,
  transcriptFileName,
} from '@/core/export/transcript-file';
import { segmentId, type Meeting, type TranscriptSegment } from '@/core/transcript/model';

describe('exportTimestamp', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [65_400, '01:05'],
    [59 * 60_000 + 59_999, '59:59'],
    [60 * 60_000, '60:00'],
    [4_512_000, '75:12'],
    [123 * 60_000 + 4_000, '123:04'],
    [-5, '00:00'],
  ])('%i ms → %s', (ms, expected) => {
    expect(exportTimestamp(ms)).toBe(expected);
  });
});

describe('transcriptFileName', () => {
  it('uses the local date and time the meeting started', () => {
    expect(transcriptFileName(new Date(2026, 9, 7, 14, 30, 59).getTime())).toBe('Meeting — 07-10-2026 at 14h30.txt');
  });

  it('pads day, month, hour and minute to two digits', () => {
    expect(transcriptFileName(new Date(2027, 0, 3, 0, 5).getTime())).toBe('Meeting — 03-01-2027 at 00h05.txt');
  });

  it('uses the 24-hour clock', () => {
    expect(transcriptFileName(new Date(2026, 11, 31, 23, 59).getTime())).toBe('Meeting — 31-12-2026 at 23h59.txt');
  });
});

const START = new Date(2026, 9, 7, 14, 30).getTime();

const meeting = (speakerRenames: Meeting['speakerRenames'] = {}): Pick<Meeting, 'startedAt' | 'speakerRenames'> => ({
  startedAt: START,
  speakerRenames,
});

function seg(seq: number, startMs: number, text: string, label: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    id: segmentId('m1', 'mixed', seq),
    meetingId: 'm1',
    stream: 'mixed',
    seq,
    startMs,
    endMs: startMs + 900,
    text,
    language: null,
    speakerLabel: 'Others',
    labelSource: 'fallback',
    captionName: null,
    captionSelf: false,
    labelOverride: null,
    words: [],
    timing: 'words',
    sessionId: 's1',
    createdAt: 0,
    schemaVersion: 2,
    ...label,
  };
}

const tom = { speakerLabel: 'Tom', labelSource: 'caption', captionName: 'Tom' } as const;
const self = { speakerLabel: 'Alex', labelSource: 'caption', captionName: 'You', captionSelf: true } as const;

describe('transcriptFile', () => {
  it('writes [mm:ss] Speaker: text lines in time order, one blank line apart, ending with one newline', () => {
    const file = transcriptFile(meeting(), [
      seg(2, 5_000, 'Second.', self),
      seg(1, 2_000, 'Hello everyone.', tom),
      seg(3, 9_000, 'Third.'),
    ]);
    expect(file).toEqual({
      name: 'Meeting — 07-10-2026 at 14h30.txt',
      body: '[00:02] Tom: Hello everyone.\n\n[00:05] Alex: Second.\n\n[00:09] Others: Third.\n',
    });
  });

  it('orders lines with the same start by seq', () => {
    expect(transcriptFileLines(meeting(), [seg(5, 1_000, 'b'), seg(4, 1_000, 'a')])).toEqual([
      '[00:01] Others: a',
      '[00:01] Others: b',
    ]);
  });

  it('uses the current labels: renames and single-line corrections', () => {
    const lines = transcriptFileLines(meeting({ 'caption:tom': { name: 'Tom Doe', origin: 'manual' } }), [
      seg(1, 0, 'One.', tom),
      seg(2, 1_000, 'Two.', { labelOverride: 'Mike' }),
      seg(3, 2_000, 'Three.', tom),
    ]);
    expect(lines).toEqual(['[00:00] Tom Doe: One.', '[00:01] Mike: Two.', '[00:02] Tom Doe: Three.']);
  });

  it('keeps minutes counting past an hour', () => {
    expect(transcriptFileLines(meeting(), [seg(1, 4_512_000, 'Late.')])).toEqual(['[75:12] Others: Late.']);
  });

  it('writes each line on one line, collapsing whitespace and line breaks', () => {
    expect(transcriptFileLines(meeting(), [seg(1, 0, '  First\nsecond \r\n\tthird  ')])).toEqual([
      '[00:00] Others: First second third',
    ]);
  });

  it('leaves out lines with no text', () => {
    expect(transcriptFileLines(meeting(), [seg(1, 0, ' \n '), seg(2, 1_000, 'Kept.')])).toEqual([
      '[00:01] Others: Kept.',
    ]);
  });

  it('leaves out lines whose name is still pending (FR-006)', () => {
    const segments = [seg(1, 0, 'Settled.', tom), seg(2, 1_000, 'Not yet.', { labelPending: true })];
    expect(transcriptFileLines(meeting(), segments)).toEqual(['[00:00] Tom: Settled.']);
  });

  it('keeps Greek and mixed-language text unchanged', () => {
    expect(transcriptFile(meeting(), [seg(1, 0, 'Καλημέρα σε όλους, let us start.')]).body).toBe(
      '[00:00] Others: Καλημέρα σε όλους, let us start.\n',
    );
  });

  it('is empty when nothing can be written', () => {
    expect(transcriptFile(meeting(), []).body).toBe('');
    expect(transcriptFile(meeting(), [seg(1, 0, 'x', { labelPending: true })]).body).toBe('');
  });

  it('does not change the segments it is given', () => {
    const segments = [seg(2, 5_000, 'b'), seg(1, 0, 'a')];
    const before = structuredClone(segments);
    transcriptFile(meeting(), segments);
    expect(segments).toEqual(before);
  });

  it('builds a 3-hour, 5,000-line file in well under 200 ms (SC-003)', () => {
    const text = 'with about a hundred characters of ordinary meeting speech in it, give or take a few.';
    const segments = Array.from({ length: 5_000 }, (_, i) => seg(i, i * 2_160, `Line ${i} ${text}`, tom));
    const t0 = performance.now();
    const file = transcriptFile(meeting(), segments);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(file.body.split('\n\n')).toHaveLength(5_000);
  });
});

describe('hasTranscriptFileLines', () => {
  it('is true once a settled line with text exists', () => {
    expect(hasTranscriptFileLines([seg(1, 0, 'x', { labelPending: true }), seg(2, 1_000, 'y')])).toBe(true);
  });

  it('is false with no lines, only pending lines or only empty text', () => {
    expect(hasTranscriptFileLines([])).toBe(false);
    expect(hasTranscriptFileLines([seg(1, 0, 'x', { labelPending: true })])).toBe(false);
    expect(hasTranscriptFileLines([seg(1, 0, '  ')])).toBe(false);
  });
});
