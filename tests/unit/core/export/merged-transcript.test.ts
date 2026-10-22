// 016 T005 (spec FR-005–FR-011, User Story 1; research R2, R4; contracts/merged-file.md): the merged transcript. The
// transcript's words with speakers from Meet's captions, aligned word by word as the reference merge does. Every name
// and sentence is invented.
import { describe, expect, it } from 'vitest';
import type { StoredCaptionTurn } from '@/core/captions/model';
import { mergedTranscript, mergedTranscriptFile, normaliseWord } from '@/core/export/merged-transcript';
import { transcriptFileLines } from '@/core/export/transcript-file';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';
import { syntheticMeeting } from '../../../support/synthetic-meeting';
import {
  spokenBy,
  spokenBySelf,
  storedCaptionTurn,
  storedMeeting,
  storedSegment,
} from '../../../support/stored-meetings';

const line = (seq: number, text: string, overrides: Partial<TranscriptSegment> = {}) =>
  storedSegment('m1', seq, { startMs: seq * 10_000, text, ...overrides });
const cap = (seq: number, speakerName: string, text: string, self = false): StoredCaptionTurn =>
  storedCaptionTurn('m1', seq, { startMs: seq * 10_000, speakerName, text, self });

/** The merged file's lines, as written. */
function merged(
  segments: readonly TranscriptSegment[],
  turns: readonly StoredCaptionTurn[],
  meeting: Meeting = storedMeeting(),
): string[] {
  const { body } = mergedTranscriptFile(meeting, segments, turns);
  return body === '' ? [] : body.slice(0, -1).split('\n\n');
}

const tokens = (texts: readonly string[]) => texts.flatMap((t) => t.split(' ').filter((w) => w !== ''));
const bodyOf = (fileLine: string) => fileLine.replace(/^\[\d+:\d\d\] [^:]+: /, '');

describe('normaliseWord: how two words are compared', () => {
  it.each([
    ['Hello,', 'hello'],
    ["it's", 'its'],
    ['Mm-hmm.', 'mmhmm'],
    ['Café', 'cafe'],
    ['42%', '42'],
    ['Καλημέρα,', 'καλημερα'],
    ['—', ''],
    ['…', ''],
  ])('%s → %s', (word, expected) => {
    expect(normaliseWord(word)).toBe(expected);
  });
});

describe('mergedTranscript: speakers from the captions', () => {
  it('names a line the live transcript left "Others" after the caption speaker whose words it matches', () => {
    expect(
      merged(
        [line(0, 'We should ship the beta on Friday.')],
        [cap(1, 'Sarah Brown', 'we should ship the beta on friday')],
      ),
    ).toEqual(['[00:00] Sarah Brown: We should ship the beta on Friday.']);
  });

  it('ignores a single matched word shorter than four letters as chance; a longer one is a match', () => {
    // "yes" is not taken as a match, so it is placed by its position among the caption words between matches.
    expect(
      merged([line(0, 'Lovely. Yes.')], [cap(1, 'Sarah Brown', 'lovely indeed truly'), cap(2, 'Mike Chen', 'yes')]),
    ).toEqual(['[00:00] Sarah Brown: Lovely. Yes.']);
    expect(
      merged([line(0, 'Lovely. Okay.')], [cap(1, 'Sarah Brown', 'lovely indeed truly'), cap(2, 'Mike Chen', 'okay')]),
    ).toEqual(['[00:00] Sarah Brown: Lovely.', '[00:00] Mike Chen: Okay.']);
  });

  it('cuts a line where the speaker changes at a sentence end, both parts keeping the line’s time', () => {
    expect(
      merged(
        [line(3, 'Can everyone see the roadmap slide? Yes it is up now.')],
        [cap(1, 'Sarah Brown', 'can everyone see the roadmap slide'), cap(2, 'You', 'yes it is up now', true)],
      ),
    ).toEqual(['[00:30] Sarah Brown: Can everyone see the roadmap slide?', '[00:30] Alex: Yes it is up now.']);
  });

  it('a stretch the captions do not hold takes the live line’s own name when that name is a caption speaker', () => {
    const lines = [
      line(0, 'Let us begin with the budget.', spokenBy('Sarah Brown')),
      line(1, 'Zorblat quintex fromage.', spokenBy('Mike Chen')),
      line(2, 'Then the timeline review follows.'),
      line(3, 'Thanks everyone for joining today.', spokenBy('Mike Chen')),
    ];
    const turns = [
      cap(1, 'Sarah Brown', 'let us begin with the budget'),
      cap(2, 'Sarah Brown', 'then the timeline review follows'),
      cap(3, 'Mike Chen', 'thanks everyone for joining today'),
    ];
    expect(merged(lines, turns)).toEqual([
      '[00:00] Sarah Brown: Let us begin with the budget.',
      '[00:10] Mike Chen: Zorblat quintex fromage.',
      '[00:20] Sarah Brown: Then the timeline review follows.',
      '[00:30] Mike Chen: Thanks everyone for joining today.',
    ]);
  });

  it('a short stretch between two matches of one speaker takes that speaker, unless it is only short replies', () => {
    const turns = [
      cap(1, 'Sarah Brown', 'let us begin with the budget'),
      cap(2, 'Sarah Brown', 'then the timeline review follows'),
      cap(3, 'Mike Chen', 'thanks everyone for joining today'),
    ];
    const around = (middle: string) => [
      line(0, 'Let us begin with the budget.'),
      line(1, middle),
      line(2, 'Then the timeline review follows.'),
      line(3, 'Thanks everyone for joining today.'),
    ];
    expect(merged(around('Zorblat quintex fromage.'), turns).slice(0, 3)).toEqual([
      '[00:00] Sarah Brown: Let us begin with the budget.',
      // The same speaker on both sides, and the earlier line ends a sentence: its own line, Sarah's.
      '[00:10] Sarah Brown: Zorblat quintex fromage.',
      '[00:20] Sarah Brown: Then the timeline review follows.',
    ]);
    expect(merged(around('Yeah, okay.'), turns)[1]).toBe('[00:10] Others: Yeah, okay.');
  });

  it('words between matches of two different speakers, held by no caption and no live name, are "Others"', () => {
    expect(
      merged(
        [
          line(0, 'Let us begin with the budget.'),
          line(1, 'Zorblat quintex fromage.'),
          line(2, 'Thanks everyone for joining today.'),
        ],
        [
          cap(1, 'Sarah Brown', 'let us begin with the budget'),
          cap(2, 'Mike Chen', 'thanks everyone for joining today'),
        ],
      ),
    ).toEqual([
      '[00:00] Sarah Brown: Let us begin with the budget.',
      '[00:10] Others: Zorblat quintex fromage.',
      '[00:20] Mike Chen: Thanks everyone for joining today.',
    ]);
  });

  it('a meeting stretch with no captions at all is "Others"', () => {
    expect(
      merged(
        [
          line(0, 'Before the captions came on we chatted about the weather.'),
          line(1, 'Let us begin with the budget.'),
        ],
        [cap(1, 'Sarah Brown', 'let us begin with the budget')],
      ),
    ).toEqual([
      '[00:00] Others: Before the captions came on we chatted about the weather.',
      '[00:10] Sarah Brown: Let us begin with the budget.',
    ]);
  });
});

describe('mergedTranscript: sentences and lines', () => {
  it('a sentence goes to the speaker with the most weight; a match outweighs an unplaced word, and on a tie a name beats "Others"', () => {
    // "alphanumeric" matches Sarah (weight 2); the next two words sit between Sarah and Mike, unplaced (1 each).
    expect(
      merged(
        [line(0, 'Alphanumeric bravissimo charleston.'), line(1, 'Deltawing echolocation foxtrotting.')],
        [cap(1, 'Sarah Brown', 'alphanumeric'), cap(2, 'Mike Chen', 'deltawing echolocation foxtrotting')],
      ),
    ).toEqual([
      '[00:00] Sarah Brown: Alphanumeric bravissimo charleston.',
      '[00:10] Mike Chen: Deltawing echolocation foxtrotting.',
    ]);
  });

  it('of two names with the same weight, the first one in the sentence wins', () => {
    expect(
      merged(
        [line(0, 'Alphanumeric deltawing.')],
        [cap(1, 'Sarah Brown', 'alphanumeric'), cap(2, 'Mike Chen', 'deltawing')],
      ),
    ).toEqual(['[00:00] Sarah Brown: Alphanumeric deltawing.']);
  });

  it('a sentence of punctuation only takes the speaker of the sentence before it', () => {
    expect(
      merged(
        [line(0, 'Great idea. … Next point please.')],
        [cap(1, 'Sarah Brown', 'great idea'), cap(2, 'Mike Chen', 'next point please')],
      ),
    ).toEqual(['[00:00] Sarah Brown: Great idea. …', '[00:00] Mike Chen: Next point please.']);
  });

  it('joins the next line of the same speaker only when the transcript cut a sentence in two', () => {
    const turns = [cap(1, 'Sarah Brown', 'the launch moves to march because the vendor is late and that is final')];
    expect(
      merged([line(0, 'The launch moves to March because'), line(1, 'the vendor is late and that is final.')], turns),
    ).toEqual(['[00:00] Sarah Brown: The launch moves to March because the vendor is late and that is final.']);
    expect(
      merged([line(0, 'The launch moves to March.'), line(1, 'Because the vendor is late and that is final.')], turns),
    ).toEqual([
      '[00:00] Sarah Brown: The launch moves to March.',
      '[00:10] Sarah Brown: Because the vendor is late and that is final.',
    ]);
  });
});

describe('mergedTranscript: names', () => {
  const turns = [cap(1, 'Sarah Brown', 'can everyone see the roadmap slide'), cap(2, 'You', 'yes it is up now', true)];
  const lines = [line(0, 'Can everyone see the roadmap slide? Yes it is up now.')];

  it('Meet’s label for the user is the user’s name, never "You"', () => {
    expect(merged(lines, turns, storedMeeting({ userName: 'Alex' }))).toEqual([
      '[00:00] Sarah Brown: Can everyone see the roadmap slide?',
      '[00:00] Alex: Yes it is up now.',
    ]);
  });

  it('renames apply: the user’s, and a caption name’s rename everywhere', () => {
    const meeting = storedMeeting({
      speakerRenames: {
        self: { name: 'Alex Kim', origin: 'manual' },
        'caption:sarah brown': { name: 'Sarah B.', origin: 'remembered' },
      },
    });
    expect(merged(lines, turns, meeting)).toEqual([
      '[00:00] Sarah B.: Can everyone see the roadmap slide?',
      '[00:00] Alex Kim: Yes it is up now.',
    ]);
  });

  it('a line corrected by hand keeps its correction for all its words and is not cut', () => {
    expect(merged([{ ...lines[0]!, labelOverride: 'Dana Ortiz' }], turns)).toEqual([
      '[00:00] Dana Ortiz: Can everyone see the roadmap slide? Yes it is up now.',
    ]);
  });

  it('the live line’s name counts as a hint only when the captions use it', () => {
    // Live named the middle line "Jane", whom the captions never name: no hint, so between Sarah and Mike it is "Others".
    expect(
      merged(
        [
          line(0, 'Let us begin with the budget.'),
          line(1, 'Zorblat quintex fromage.', spokenBy('Jane')),
          line(2, 'Thanks everyone for joining today.'),
        ],
        [
          cap(1, 'Sarah Brown', 'let us begin with the budget'),
          cap(2, 'Mike Chen', 'thanks everyone for joining today'),
        ],
      )[1],
    ).toBe('[00:10] Others: Zorblat quintex fromage.');
    // The user's own live label is the user's name, which the captions use for Meet's "You".
    expect(
      merged(
        [
          line(0, 'Let us begin with the budget.'),
          line(1, 'Zorblat quintex fromage.', spokenBySelf('Alex')),
          line(2, 'Thanks everyone for joining today.'),
        ],
        [
          cap(1, 'Sarah Brown', 'let us begin with the budget'),
          cap(2, 'Mike Chen', 'thanks everyone for joining today'),
          cap(3, 'You', 'see you all next week', true),
        ],
      )[1],
    ).toBe('[00:10] Alex: Zorblat quintex fromage.');
  });
});

describe('mergedTranscript: what is written', () => {
  it('leaves out lines whose name is pending and lines without text, as the transcript file does', () => {
    expect(
      merged(
        [
          line(0, 'We should ship the beta on Friday.'),
          line(1, 'Still settling.', { labelPending: true }),
          line(2, '   '),
        ],
        [cap(1, 'Sarah Brown', 'we should ship the beta on friday')],
      ),
    ).toEqual(['[00:00] Sarah Brown: We should ship the beta on Friday.']);
  });

  it('writes nothing when there is no line', () => {
    expect(mergedTranscriptFile(storedMeeting(), [], [cap(1, 'Sarah Brown', 'hello')])).toEqual({
      name: 'Meeting — 07-10-2026 at 14h30 — Transcript.txt',
      body: '',
    });
  });

  it('never writes a word that only the captions hold', () => {
    const { body } = mergedTranscriptFile(
      storedMeeting(),
      [line(0, 'We should ship the beta on Friday.')],
      [cap(1, 'Sarah Brown', 'we should ship the quixotry beta on friday')],
    );
    expect(body).not.toMatch(/quixotry/i);
  });
});

describe('mergedTranscript on generated meetings', () => {
  const seeds = Array.from({ length: 50 }, (_, i) => 1_000 + i);

  it.each(seeds)('seed %i: the transcript’s words in order, times from its lines, the same every time', (seed) => {
    const m = syntheticMeeting({ seed, words: 600 });
    const result = mergedTranscript(m.meeting, m.segments, m.captionTurns);
    const kept = m.segments.filter((s) => !result.removedSegmentIds.includes(s.id));
    expect(tokens(result.lines.map((l) => l.text))).toEqual(tokens(transcriptFileLines(m.meeting, kept).map(bodyOf)));
    const times = new Set(kept.map((s) => s.startMs));
    expect(result.lines.every((l) => times.has(l.startMs))).toBe(true);
    expect(mergedTranscript(m.meeting, m.segments, m.captionTurns)).toEqual(result);
  });

  it('names at least nine words in ten correctly, and leaves few "Others", across the generated meetings', () => {
    let right = 0;
    let others = 0;
    let all = 0;
    for (const seed of seeds) {
      const m = syntheticMeeting({ seed, words: 600 });
      const result = mergedTranscript(m.meeting, m.segments, m.captionTurns);
      const said = result.lines.flatMap((l) => l.text.split(' ').map(() => l.speaker));
      said.forEach((speaker, i) => {
        all += 1;
        if (speaker === m.truth[i]) right += 1;
        if (speaker === 'Others') others += 1;
      });
    }
    expect(right / all).toBeGreaterThan(0.9);
    expect(others / all).toBeLessThan(0.05);
  });
});
