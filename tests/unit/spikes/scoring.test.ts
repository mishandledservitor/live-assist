import { describe, expect, it } from 'vitest';
import { cer, findEchoDuplicates, normalizeText, tokenOverlap, wer, type TimedText } from '../../../spikes/lib/scoring';

describe('normalizeText', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeText('  Hello,   World!  How are you? ')).toBe('hello world how are you');
  });

  it('folds Greek tonos and dialytika and final sigma', () => {
    expect(normalizeText('Καλημέρα σε ΌΛΟΥΣ; Προϊόν.')).toBe('καλημερα σε ολουσ προιον');
    expect(normalizeText('λόγος')).toBe('λογοσ');
  });

  it('keeps mixed-script text and digits', () => {
    expect(normalizeText('Το deadline είναι 15 Μαΐου, OK?')).toBe('το deadline ειναι 15 μαιου ok');
  });

  it('treats apostrophes and dashes as separators consistently', () => {
    expect(normalizeText("don't — re-use")).toBe('don t re use');
  });
});

describe('wer', () => {
  it('is 0 for identical text after normalisation', () => {
    expect(wer('Hello, world.', 'hello world')).toBe(0);
  });

  it('counts substitutions, insertions and deletions over reference words', () => {
    // ref 4 words; hyp: 1 substitution (sat→sit), 1 deletion (the), 1 insertion (down)
    expect(wer('the cat sat there', 'cat sit there down')).toBeCloseTo(3 / 4);
  });

  it('works on mixed Greek/English', () => {
    expect(wer('Το meeting είναι αύριο', 'το μίτινγκ είναι αύριο')).toBeCloseTo(1 / 4);
  });

  it('handles empty references', () => {
    expect(wer('', '')).toBe(0);
    expect(wer('', 'something here')).toBe(2);
  });
});

describe('cer', () => {
  it('measures character edits over reference characters (spaces included)', () => {
    // "kitten" → "sitting": 3 edits over 6 characters
    expect(cer('kitten', 'sitting')).toBeCloseTo(3 / 6);
  });

  it('ignores tonos differences in Greek', () => {
    expect(cer('καλημέρα', 'καλημερα')).toBe(0);
  });

  it('counts one Greek letter wrong', () => {
    expect(cer('ολους', 'ολοις')).toBeCloseTo(1 / 5);
  });
});

describe('tokenOverlap', () => {
  it('is the share of the first text’s tokens (multiset) found in the second', () => {
    expect(tokenOverlap('we ship on monday', 'so we ship on monday right')).toBe(1);
    expect(tokenOverlap('so we ship on monday right', 'we ship on monday')).toBeCloseTo(4 / 6);
    expect(tokenOverlap('a a b', 'a b b')).toBeCloseTo(2 / 3);
    expect(tokenOverlap('hello there', 'goodbye now')).toBe(0);
  });

  it('is 0 when either side is empty', () => {
    expect(tokenOverlap('', 'x')).toBe(0);
  });
});

describe('findEchoDuplicates (research R7: ±1.5 s and token overlap ≥ 0.6)', () => {
  const tab: TimedText[] = [
    { startMs: 1000, endMs: 4000, text: 'We need to ship the release on Monday.' },
    { startMs: 6000, endMs: 8000, text: 'Does anyone have questions?' },
    { startMs: 12000, endMs: 14000, text: 'Great, thanks everyone.' },
  ];

  it('flags a mic line that repeats a tab line at the same time', () => {
    const mic: TimedText[] = [{ startMs: 1300, endMs: 4200, text: 'we need to ship the release on monday' }];
    const r = findEchoDuplicates(mic, tab);
    expect(r.duplicatedMicLines).toBe(1);
    expect(r.duplicatedRemoteLines).toBe(1);
    expect(r.remoteLines).toBe(3);
    expect(r.rate).toBeCloseTo(1 / 3);
    expect(r.pairs).toEqual([{ mic: 0, tab: 0, overlap: 1 }]);
  });

  it('allows up to 1.5 s gap between the lines, not more', () => {
    const near: TimedText[] = [{ startMs: 9400, endMs: 10000, text: 'does anyone have questions' }];
    const far: TimedText[] = [{ startMs: 9600, endMs: 10500, text: 'does anyone have questions' }];
    expect(findEchoDuplicates(near, tab).duplicatedMicLines).toBe(1);
    expect(findEchoDuplicates(far, tab).duplicatedMicLines).toBe(0);
  });

  it('does not flag own speech at the same time with different words', () => {
    const mic: TimedText[] = [{ startMs: 6000, endMs: 8000, text: 'yes I have one about the budget' }];
    expect(findEchoDuplicates(mic, tab).duplicatedMicLines).toBe(0);
  });

  it('needs token overlap of at least 0.6', () => {
    // 3 of 5 mic tokens shared = 0.6 → duplicate; 2 of 5 → not
    const atThreshold: TimedText[] = [{ startMs: 12000, endMs: 14000, text: 'great thanks everyone see you' }];
    const below: TimedText[] = [{ startMs: 12000, endMs: 14000, text: 'great thanks all see you' }];
    expect(findEchoDuplicates(atThreshold, tab).duplicatedMicLines).toBe(1);
    expect(findEchoDuplicates(below, tab).duplicatedMicLines).toBe(0);
  });

  it('counts each remote line once even if echoed by several mic fragments', () => {
    const mic: TimedText[] = [
      { startMs: 1000, endMs: 2500, text: 'we need to ship' },
      { startMs: 2500, endMs: 4000, text: 'the release on monday' },
    ];
    const r = findEchoDuplicates(mic, tab);
    expect(r.duplicatedMicLines).toBe(2);
    expect(r.duplicatedRemoteLines).toBe(1);
  });

  it('reports rate 0 when there are no remote lines', () => {
    expect(findEchoDuplicates([{ startMs: 0, endMs: 1, text: 'hi' }], []).rate).toBe(0);
  });
});
