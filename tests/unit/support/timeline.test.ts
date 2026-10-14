// T004: the alignment timeline fixture format and loader (tests/fixtures/meet/timelines/).
import { describe, expect, it } from 'vitest';
import { expectedLabel, expectedPieces, loadTimeline, parseTimeline, truthOf } from '../../support/timeline';

const valid = () => ({
  userName: 'Mary Smith',
  clearTurns: true,
  captions: [
    { turnKey: 'p1:1', speakerName: 'Emma Jones', self: null, observedAtMs: [1200, 1600, 2400] },
    { turnKey: 'p1:2', speakerName: 'You', self: true, observedAtMs: [5200] },
  ],
  segments: [
    {
      id: 'm:mixed:0',
      startMs: 1000,
      endMs: 2500,
      timing: 'words',
      words: [{ text: 'Kickoff', startMs: 1000, endMs: 1400 }],
    },
    { id: 'm:mixed:1', startMs: 5000, endMs: 6000, timing: 'estimated', words: [] },
  ],
  expected: { 'm:mixed:0': 'Emma Jones', 'm:mixed:1': '$user' },
});

describe('parseTimeline', () => {
  it('accepts a valid timeline', () => {
    const t = parseTimeline(valid());
    expect(t.captions).toHaveLength(2);
    expect(t.segments[1]?.timing).toBe('estimated');
  });

  it.each([
    ['no userName', (v: ReturnType<typeof valid>) => ({ ...v, userName: '' })],
    ['clearTurns not boolean', (v: ReturnType<typeof valid>) => ({ ...v, clearTurns: 'yes' })],
    [
      'a caption with no observations',
      (v: ReturnType<typeof valid>) => ({ ...v, captions: [{ ...v.captions[0], observedAtMs: [] }] }),
    ],
    [
      'observations out of order',
      (v: ReturnType<typeof valid>) => ({ ...v, captions: [{ ...v.captions[0], observedAtMs: [5, 1] }] }),
    ],
    ['a bad self hint', (v: ReturnType<typeof valid>) => ({ ...v, captions: [{ ...v.captions[0], self: 'no' }] })],
    [
      'a segment ending before it starts',
      (v: ReturnType<typeof valid>) => ({ ...v, segments: [{ ...v.segments[0], endMs: 10 }, v.segments[1]] }),
    ],
    [
      'a bad timing',
      (v: ReturnType<typeof valid>) => ({ ...v, segments: [{ ...v.segments[0], timing: 'guess' }, v.segments[1]] }),
    ],
    ['a segment without an expectation', (v: ReturnType<typeof valid>) => ({ ...v, expected: { 'm:mixed:0': 'X' } })],
    [
      'an expectation for an unknown segment',
      (v: ReturnType<typeof valid>) => ({ ...v, expected: { ...v.expected, 'm:mixed:9': 'X' } }),
    ],
    [
      'a caption text field (names and timing only)',
      (v: ReturnType<typeof valid>) => ({ ...v, captions: [{ ...v.captions[0], text: 'hello' }] }),
    ],
  ])('rejects %s', (_what, mutate) => {
    expect(() => parseTimeline(mutate(valid()))).toThrow();
  });
});

describe('expectedLabel', () => {
  it('resolves $user to the settings name and keeps names and Others', () => {
    const t = parseTimeline({ ...valid(), expected: { 'm:mixed:0': 'Others', 'm:mixed:1': '$user' } });
    expect(expectedLabel(t, 'm:mixed:0')).toBe('Others');
    expect(expectedLabel(t, 'm:mixed:1')).toBe('Mary Smith');
  });
});

describe('loadTimeline', () => {
  it('loads a fixture file by name', () => {
    const t = loadTimeline('format-example');
    expect(t.userName).not.toBe('');
    expect(t.segments.length).toBeGreaterThan(0);
  });

  it('names the file it could not load', () => {
    expect(() => loadTimeline('missing-timeline')).toThrow(/missing-timeline/);
  });
});

// T114 (real call 2026-10-09): a line can be expected to split into pieces, and words can carry who spoke them.
describe('split expectations and per-word truth', () => {
  const twoWords = () => {
    const v = valid();
    v.segments[0] = {
      ...v.segments[0]!,
      endMs: 2000,
      words: [
        { text: 'Yes', startMs: 1000, endMs: 1400 },
        { text: 'okay', startMs: 1500, endMs: 2000 },
      ],
    };
    return v;
  };

  it('accepts pieces and spokenBy, and resolves $user in both', () => {
    const t = parseTimeline({
      ...twoWords(),
      expected: {
        'm:mixed:0': [
          { label: 'Emma Jones', words: 1 },
          { label: '$user', words: 1 },
        ],
        'm:mixed:1': '$user',
      },
      spokenBy: { 'm:mixed:0': ['Emma Jones', '$user'] },
    });
    expect(expectedPieces(t, 'm:mixed:0')).toEqual([
      { label: 'Emma Jones', words: 1 },
      { label: 'Mary Smith', words: 1 },
    ]);
    expect(expectedPieces(t, 'm:mixed:1')).toEqual([{ label: 'Mary Smith', words: 0 }]);
    expect(truthOf(t, 'm:mixed:0')).toEqual(['Emma Jones', 'Mary Smith']);
  });

  it('without spokenBy, a named line is all that name and an "Others" line is unknown', () => {
    const t = parseTimeline({ ...twoWords(), expected: { 'm:mixed:0': 'Emma Jones', 'm:mixed:1': 'Others' } });
    expect(truthOf(t, 'm:mixed:0')).toEqual(['Emma Jones', 'Emma Jones']);
    const u = parseTimeline({ ...twoWords(), expected: { 'm:mixed:0': 'Others', 'm:mixed:1': 'Others' } });
    expect(truthOf(u, 'm:mixed:0')).toEqual(['?', '?']);
  });

  it.each([
    ['pieces that do not cover the words', { 'm:mixed:0': [{ label: 'A', words: 1 }], 'm:mixed:1': 'X' }, undefined],
    [
      'an empty piece',
      {
        'm:mixed:0': [
          { label: 'A', words: 0 },
          { label: 'B', words: 2 },
        ],
        'm:mixed:1': 'X',
      },
      undefined,
    ],
    ['spokenBy of the wrong length', { 'm:mixed:0': 'A', 'm:mixed:1': 'X' }, { 'm:mixed:0': ['A'] }],
    ['spokenBy for an unknown line', { 'm:mixed:0': 'A', 'm:mixed:1': 'X' }, { 'm:mixed:7': [] }],
  ])('rejects %s', (_what, expected, spokenBy) => {
    expect(() => parseTimeline({ ...twoWords(), expected, ...(spokenBy && { spokenBy }) })).toThrow();
  });
});
