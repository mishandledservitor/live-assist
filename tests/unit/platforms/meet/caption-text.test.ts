// 013 T016 (FR-002, spec P3, research R1; contracts/captions-capture.md "mergeCaptionText" rules 1–5): what a kept
// turn's text becomes when the page shows something new. Meet drops the beginning of a long turn from the page; the
// merge keeps it. Every sentence is invented.
import { describe, expect, it } from 'vitest';
import {
  fullText,
  mergeCaptionText,
  OVERLAP_PROBE_CHARS,
  START_OVER_SHRINK_CHARS,
  type TurnText,
} from '@/platforms/meet/caption-text';

const EMPTY: TurnText = { kept: '', shown: '' };
const showing = (shown: string, kept = ''): TurnText => ({ kept, shown });
/** Feeds each text the page shows, in order. */
const after = (...texts: string[]) => texts.reduce(mergeCaptionText, EMPTY);

describe('mergeCaptionText', () => {
  it('has the contract constants', () => {
    expect([OVERLAP_PROBE_CHARS, START_OVER_SHRINK_CHARS]).toEqual([24, 250]);
  });

  it('rule 2: the first text of a turn is shown as it is', () => {
    expect(mergeCaptionText(EMPTY, 'Good morning')).toEqual({ kept: '', shown: 'Good morning' });
    expect(mergeCaptionText(showing('', 'Kept before. '), 'Next')).toEqual({ kept: 'Kept before. ', shown: 'Next' });
  });

  it('rule 5: growth replaces what was shown', () => {
    const t = after('Good', 'Good morning', 'Good morning, can everyone see the roadmap slide?');
    expect(t).toEqual({ kept: '', shown: 'Good morning, can everyone see the roadmap slide?' });
    expect(fullText(t)).toBe('Good morning, can everyone see the roadmap slide?');
  });

  it('rule 5: a rewrite of the last words replaces what was shown', () => {
    const t = after('We ship the harbour survey on Thursday', 'We ship the harbour survey on Tuesday, not Thursday.');
    expect(fullText(t)).toBe('We ship the harbour survey on Tuesday, not Thursday.');
  });

  it('rule 5: a correction from the first word replaces what was shown', () => {
    expect(fullText(after('Their going to the harbour', 'They are going to the harbour.'))).toBe(
      'They are going to the harbour.',
    );
  });

  it('rule 1: an empty read keeps the text', () => {
    const before = showing('The page went blank for a moment.', 'Earlier words. ');
    expect(mergeCaptionText(before, '')).toBe(before);
    expect(mergeCaptionText(EMPTY, '')).toBe(EMPTY);
    expect(fullText(after('Still here.', '', 'Still here. And more.'))).toBe('Still here. And more.');
  });

  it('rule 3: a dropped beginning is kept', () => {
    const first = 'First we look at the numbers for the quarter. ';
    const second = 'Then we turn to the harbour survey and its findings. ';
    const third = 'Finally the lighthouse budget.';
    const t = after(first + second, second + third);
    expect(t).toEqual({ kept: first, shown: second + third });
    expect(fullText(t)).toBe(first + second + third);
  });

  it('rule 3: a dropped beginning together with a rewritten end keeps the beginning and takes the new end', () => {
    const t = after(
      'First we look at the numbers. Then we turn to the harbour survey and its findings on Thursday',
      'Then we turn to the harbour survey and its findings on Tuesday, in fact.',
    );
    expect(fullText(t)).toBe(
      'First we look at the numbers. Then we turn to the harbour survey and its findings on Tuesday, in fact.',
    );
  });

  it('rule 3 holds over a 20-step monologue: every sentence once and in order', () => {
    const sentences = Array.from(
      { length: 20 },
      (_, i) => `Sentence number ${i + 1} of the long invented monologue about lighthouse ${i * 7 + 3}.`,
    );
    let turn = EMPTY;
    for (let i = 0; i < sentences.length; i += 1) {
      // The page shows at most the last three sentences; the newest arrives in two pieces, as Meet writes it.
      const earlier = sentences.slice(Math.max(0, i - 2), i);
      const current = sentences[i] ?? '';
      turn = mergeCaptionText(turn, [...earlier, current.slice(0, 30)].join(' '));
      turn = mergeCaptionText(turn, [...earlier, current].join(' '));
    }
    expect(fullText(turn)).toBe(sentences.join(' '));
    for (const sentence of sentences) expect(fullText(turn).split(sentence)).toHaveLength(2);
    expect(turn.shown).toBe(sentences.slice(-3).join(' '));
  });

  it('rule 3 uses all of a new text shorter than the probe', () => {
    expect(mergeCaptionText(showing('One two three four'), 'three four')).toEqual({
      kept: 'One two ',
      shown: 'three four',
    });
  });

  it('rule 4: a restart (much shorter, no overlap) appends after a space', () => {
    const long = 'An invented stretch of talk about the harbour. '.repeat(8).trim();
    expect(long.length).toBeGreaterThan(START_OVER_SHRINK_CHARS + 20);
    const t = after(long, 'So, as I was saying');
    expect(t).toEqual({ kept: `${long} `, shown: 'So, as I was saying' });
    const grown = mergeCaptionText(t, 'So, as I was saying, the survey.');
    expect(fullText(grown)).toBe(`${long} So, as I was saying, the survey.`);
  });

  it('rule 4 needs a shrink of more than the threshold', () => {
    const next = 'Entirely different words';
    const exactly = 'x'.repeat(next.length + START_OVER_SHRINK_CHARS);
    expect(mergeCaptionText(showing(exactly), next)).toEqual({ kept: '', shown: next });
    expect(mergeCaptionText(showing(`${exactly}x`), next)).toEqual({ kept: `${exactly}x `, shown: next });
  });

  it('rule 5: a shrink of 250 or fewer without overlap replaces', () => {
    const before = 'A sentence Meet first heard quite wrongly and at some length, before it thought again.';
    expect(fullText(after(before, 'A short correction.'))).toBe('A short correction.');
  });

  it('a text that still starts where the shown one starts is growth or a rewrite, not a dropped beginning', () => {
    const t = after('The harbour survey moves to Thursday, I think', 'The harbour survey moves to Tuesday.');
    expect(t.kept).toBe('');
  });

  it('keeps Greek text and surrogate pairs whole', () => {
    const first = 'Καλημέρα σε όλους, ξεκινάμε με τον οδικό χάρτη 🚀. ';
    const second = 'Μετά βλέπουμε την έρευνα για το λιμάνι 🌊 και τα ευρήματα. ';
    const third = 'Τέλος ο προϋπολογισμός 💡.';
    const t = after(first, first + second, second + third);
    expect(fullText(t)).toBe(first + second + third);
    // No lone surrogate anywhere: encoding and decoding gives the same text back.
    expect(new TextDecoder().decode(new TextEncoder().encode(fullText(t)))).toBe(fullText(t));
  });

  it('does not change the turn it was given', () => {
    const before = Object.freeze(showing('One two three four five six seven eight nine ten.', 'Kept. '));
    mergeCaptionText(before, 'five six seven eight nine ten. Eleven.');
    expect(before).toEqual({ kept: 'Kept. ', shown: 'One two three four five six seven eight nine ten.' });
  });
});
