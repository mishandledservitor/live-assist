import { describe, expect, it } from 'vitest';
import { DETAIL_TIMEOUT_MS, SegmentBuilder, type SegmentBuilderOptions } from '@/core/transcript/segment-builder';

const NOW = 1_700_000_000_000;

function builder(over: Partial<SegmentBuilderOptions> = {}) {
  const b = new SegmentBuilder({
    meetingId: 'm1',
    language: { kind: 'auto' },
    now: () => NOW,
    ...over,
  });
  b.startSession('sess-1', 10_000);
  return b;
}

const words = [
  { text: 'Hello', startSec: 2.1, endSec: 2.4 },
  { text: 'everyone.', startSec: 2.45, endSec: 2.9 },
];

describe('SegmentBuilder (data-model.md TranscriptSegment, research R3)', () => {
  it('builds a segment from committed-detail with meeting-relative times from the session audio origin', () => {
    const b = builder();
    b.committed('Hello everyone.', 13_000);
    const s = b.detail('Hello everyone.', 'en', words);
    expect(s).toEqual({
      id: 'm1:mixed:0',
      meetingId: 'm1',
      stream: 'mixed',
      seq: 0,
      startMs: 12_100,
      endMs: 12_900,
      text: 'Hello everyone.',
      language: 'en',
      speakerLabel: 'Others',
      labelSource: 'fallback',
      // 002: written as v2; attribution fills the caption fields later (data-model.md).
      captionName: null,
      captionSelf: false,
      labelOverride: null,
      schemaVersion: 2,
      words: [
        { text: 'Hello', startMs: 12_100, endMs: 12_400 },
        { text: 'everyone.', startMs: 12_450, endMs: 12_900 },
      ],
      timing: 'words',
      sessionId: 'sess-1',
      createdAt: NOW,
    });
  });

  // Constitution v1.1.0 IV / FR-010: one mixed stream cannot tell the user apart, so every line is the fallback.
  it('labels every line "Others" as a fallback label, the user\'s own speech included', () => {
    const b = builder();
    const lines = [b.detail('Hi', 'en', [{ text: 'Hi', startSec: 0, endSec: 0.3 }]), b.detail('Me', 'en', [])];
    expect(lines.map((s) => [s?.id, s?.speakerLabel, s?.labelSource])).toEqual([
      ['m1:mixed:0', 'Others', 'fallback'],
      ['m1:mixed:1', 'Others', 'fallback'],
    ]);
  });

  it('drops whitespace-only word entries', () => {
    const s = builder().detail('Hello everyone.', 'en', [
      words[0]!,
      { text: ' ', startSec: 2.4, endSec: 2.45 },
      words[1]!,
    ]);
    expect(s?.words.map((w) => w.text)).toEqual(['Hello', 'everyone.']);
  });

  it('takes the language from the detail, else the fixed language, else null', () => {
    expect(builder().detail('a', 'el', words)?.language).toBe('el');
    expect(builder({ language: { kind: 'fixed', code: 'el' } }).detail('a', null, words)?.language).toBe('el');
    expect(builder().detail('a', null, words)?.language).toBeNull();
  });

  it('drops empty or whitespace-only text', () => {
    const b = builder();
    b.committed('   ', 1000);
    expect(b.detail('  ', 'en', [])).toBeNull();
    expect(b.expire(1000 + DETAIL_TIMEOUT_MS + 1)).toEqual([]);
    expect(b.detail('next', 'en', words)?.seq).toBe(0);
  });

  it('stores a commit without detail after 2 s with estimated timing at the commit time', () => {
    const b = builder();
    b.committed('No detail here.', 15_000);
    expect(b.expire(15_000 + DETAIL_TIMEOUT_MS - 1)).toEqual([]);
    const [s] = b.expire(15_000 + DETAIL_TIMEOUT_MS);
    expect(s).toMatchObject({
      seq: 0,
      text: 'No detail here.',
      startMs: 15_000,
      endMs: 15_000,
      words: [],
      timing: 'estimated',
      language: null,
    });
  });

  it('ignores a late detail for a commit that was already stored as estimated (no duplicate)', () => {
    const b = builder();
    b.committed('Late.', 15_000);
    expect(b.expire(20_000)).toHaveLength(1);
    expect(b.detail('Late.', 'en', words)).toBeNull();
  });

  it('a detail that arrives in time consumes its commit so it never expires', () => {
    const b = builder();
    b.committed('Hello everyone.', 13_000);
    b.detail('Hello everyone.', 'en', words);
    expect(b.expire(60_000)).toEqual([]);
  });

  it('flushes all pending commits as estimated (used at Stop)', () => {
    const b = builder();
    b.committed('one', 1000);
    b.committed('two', 1500);
    expect(b.flush().map((s) => [s.text, s.seq, s.timing])).toEqual([
      ['one', 0, 'estimated'],
      ['two', 1, 'estimated'],
    ]);
  });

  it('increments seq per meeting across sessions and records each session id', () => {
    const b = builder();
    expect(b.detail('a', 'en', words)?.seq).toBe(0);
    b.startSession('sess-2', 50_000);
    const s = b.detail('b', 'en', words);
    expect(s).toMatchObject({ seq: 1, id: 'm1:mixed:1', sessionId: 'sess-2', startMs: 52_100 });
  });

  it('falls back to estimated timing when the detail carries no usable words', () => {
    const b = builder();
    b.committed('Quiet words.', 7_000);
    expect(b.detail('Quiet words.', 'en', [])).toMatchObject({ timing: 'estimated', startMs: 7_000, endMs: 7_000 });
  });
});
