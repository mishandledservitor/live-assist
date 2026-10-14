import { describe, expect, it } from 'vitest';
import { formatOffset, isConfirmedLabel, segmentId, type TranscriptSegment } from '@/core/transcript/model';
import { compareSegments, sortSegments } from '@/core/transcript/ordering';

describe('formatOffset', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [1_000, '00:01'],
    [65_000, '01:05'],
    [59 * 60_000 + 59_999, '59:59'],
    [3_600_000, '1:00:00'],
    [3_723_000, '1:02:03'],
    [10 * 3_600_000 + 5_000, '10:00:05'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatOffset(ms)).toBe(expected);
  });

  it('clamps negative offsets to zero', () => {
    expect(formatOffset(-500)).toBe('00:00');
  });
});

describe('segmentId', () => {
  it('is deterministic from meeting, stream and seq', () => {
    expect(segmentId('m-1', 'mixed', 0)).toBe('m-1:mixed:0');
    expect(segmentId('m-1', 'mixed', 12)).toBe('m-1:mixed:12');
  });
});

describe('isConfirmedLabel', () => {
  it('treats caption and manual as confirmed and fallback as not', () => {
    expect(isConfirmedLabel('caption')).toBe(true);
    expect(isConfirmedLabel('manual')).toBe(true);
    expect(isConfirmedLabel('fallback')).toBe(false);
  });
});

function seg(seq: number, startMs: number): TranscriptSegment {
  return {
    id: segmentId('m', 'mixed', seq),
    meetingId: 'm',
    stream: 'mixed',
    seq,
    startMs,
    endMs: startMs + 500,
    text: `line-${seq}`,
    language: null,
    speakerLabel: 'Others',
    labelSource: 'fallback',
    captionName: null,
    captionSelf: false,
    labelOverride: null,
    schemaVersion: 2,
    words: [],
    timing: 'words',
    sessionId: 's',
    createdAt: 0,
  };
}

describe('segment ordering (FR-013)', () => {
  it('orders by startMs first', () => {
    const sorted = sortSegments([seg(1, 2_000), seg(0, 1_000)]);
    expect(sorted.map((s) => s.id)).toEqual(['m:mixed:0', 'm:mixed:1']);
  });

  it('falls back to seq on equal startMs', () => {
    expect(compareSegments(seg(3, 1_000), seg(2, 1_000))).toBeGreaterThan(0);
    const sorted = sortSegments([seg(3, 1_000), seg(2, 1_000)]);
    expect(sorted.map((s) => s.seq)).toEqual([2, 3]);
  });

  it('does not mutate its input', () => {
    const input = [seg(1, 2_000), seg(0, 1_000)];
    sortSegments(input);
    expect(input[0]?.seq).toBe(1);
  });
});
