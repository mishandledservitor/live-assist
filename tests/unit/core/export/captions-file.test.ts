// 013 T037 (FR-014, FR-015, decision 66, research R8): the captions file's name and body. One line per kept turn,
// with the names the transcript shows. Every name and sentence is invented.
import { describe, expect, it } from 'vitest';
import { captionSpeaker, captionsFile, captionsFileLines } from '@/core/export/captions-file';
import { captionsFileName } from '@/core/export/download-names';
import { displayLabel } from '@/core/transcript/labels';
import type { Meeting } from '@/core/transcript/model';
import { spokenBy, storedCaptionTurn, storedMeeting, storedSegment } from '../../../support/stored-meetings';

const START = new Date(2026, 9, 7, 14, 30).getTime();
const meeting = (overrides: Partial<Meeting> = {}) => storedMeeting({ startedAt: START, ...overrides });
const turn = storedCaptionTurn;
const you = { speakerName: 'You', self: true } as const;

describe('captionsFile', () => {
  it("writes the spec's example", () => {
    const file = captionsFile(meeting(), [
      turn('m1', 1, { startMs: 4_200, text: 'Good morning, can everyone see the roadmap slide?' }),
      turn('m1', 2, { startMs: 11_900, text: "Yes, it's up.", ...you }),
    ]);
    expect(file.body).toBe(
      "[00:04] Sarah Brown: Good morning, can everyone see the roadmap slide?\n\n[00:11] Alex: Yes, it's up.\n",
    );
    expect(file.name).toBe(captionsFileName(START));
    expect(file.name).toBe('Meeting — 07-10-2026 at 14h30 — Meet captions.txt');
  });

  it('has an empty body when there is no turn', () => {
    expect(captionsFile(meeting(), [])).toEqual({ name: captionsFileName(START), body: '' });
    expect(captionsFileLines(meeting(), [])).toEqual([]);
  });

  it('orders by start, then by seq, whatever order the turns are given in', () => {
    const lines = captionsFileLines(meeting(), [
      turn('m1', 4, { startMs: 9_000, text: 'Fourth.' }),
      turn('m1', 3, { startMs: 2_000, text: 'Second, same moment, later seq.' }),
      turn('m1', 1, { startMs: 5_000, text: 'Third.' }),
      turn('m1', 2, { startMs: 2_000, text: 'First.' }),
    ]);
    expect(lines.map((l) => l.slice(l.indexOf(': ') + 2))).toEqual([
      'First.',
      'Second, same moment, later seq.',
      'Third.',
      'Fourth.',
    ]);
  });

  it('counts minutes past 59', () => {
    const lines = captionsFileLines(meeting(), [
      turn('m1', 1, { startMs: 59 * 60_000 + 59_999, text: 'a' }),
      turn('m1', 2, { startMs: 75 * 60_000 + 12_000, text: 'b' }),
      turn('m1', 3, { startMs: 183 * 60_000 + 4_000, text: 'c' }),
    ]);
    expect(lines.map((l) => l.slice(0, 8))).toEqual(['[59:59] ', '[75:12] ', '[183:04]']);
  });

  it('collapses line breaks and runs of spaces to one space, in name and text', () => {
    const lines = captionsFileLines(meeting(), [
      turn('m1', 1, { speakerName: '  Sarah \n Brown ', text: ' Good\n\nmorning,\t can   everyone\r\nsee it? ' }),
    ]);
    expect(lines).toEqual(['[00:04] Sarah Brown: Good morning, can everyone see it?']);
  });

  it('skips a turn whose text is empty or only whitespace', () => {
    const file = captionsFile(meeting(), [
      turn('m1', 1, { text: '' }),
      turn('m1', 2, { text: ' \n\t ' }),
      turn('m1', 3, { text: 'Said.' }),
    ]);
    expect(file.body).toBe('[00:12] Sarah Brown: Said.\n');
  });

  it('writes a 9,000-character turn as one line', () => {
    const long = Array.from({ length: 1_600 }, (_, i) => `word${i % 10}`).join(' ');
    expect(long.length).toBeGreaterThan(9_000);
    const file = captionsFile(meeting(), [turn('m1', 1, { text: long }), turn('m1', 2, { text: 'After.' })]);
    expect(file.body.split('\n\n')).toHaveLength(2);
    expect(file.body.split('\n\n')[0]).toBe(`[00:04] Sarah Brown: ${long}`);
  });

  it('leaves Greek text and characters outside the basic plane as they are', () => {
    const text = 'Καλημέρα σε όλους, βλέπετε τη διαφάνεια; 🚀';
    const file = captionsFile(meeting(), [turn('m1', 1, { speakerName: 'Σάρα Μπράουν', text })]);
    expect(file.body).toBe(`[00:04] Σάρα Μπράουν: ${text}\n`);
  });

  it('does not mutate its inputs', () => {
    const m = Object.freeze(
      meeting({ speakerRenames: Object.freeze({ self: { name: 'Si', origin: 'manual' as const } }) }),
    );
    const turns = Object.freeze([
      Object.freeze(turn('m1', 2, { startMs: 9_000 })),
      Object.freeze(turn('m1', 1, { startMs: 1_000, ...you })),
    ]);
    const before = JSON.stringify(turns);
    expect(() => captionsFile(m, turns)).not.toThrow();
    expect(JSON.stringify(turns)).toBe(before);
    expect(turns.map((t) => t.seq)).toEqual([2, 1]);
  });
});

describe('captionSpeaker (the names the transcript shows)', () => {
  it("a self turn reads the meeting's user name", () => {
    expect(captionSpeaker(turn('m1', 1, you), meeting({ userName: 'Alex' }))).toBe('Alex');
  });

  it('a self turn reads the self rename when there is one', () => {
    const m = meeting({ speakerRenames: { self: { name: 'Alex S.', origin: 'manual' } } });
    expect(captionSpeaker(turn('m1', 1, you), m)).toBe('Alex S.');
  });

  it("a self turn keeps Meet's word when the meeting has no user name", () => {
    expect(captionSpeaker(turn('m1', 1, you), meeting({ userName: '  ' }))).toBe('You');
  });

  it('a caption name with a manual or remembered rename reads the rename, compared by normalised name', () => {
    const m = meeting({
      speakerRenames: {
        'caption:sarah brown': { name: 'Sarah (Design)', origin: 'manual' },
        'caption:bob doe': { name: 'Bob', origin: 'remembered' },
      },
    });
    expect(captionSpeaker(turn('m1', 1, { speakerName: 'Sarah Brown' }), m)).toBe('Sarah (Design)');
    expect(captionSpeaker(turn('m1', 2, { speakerName: '  SARAH   brown ' }), m)).toBe('Sarah (Design)');
    expect(captionSpeaker(turn('m1', 3, { speakerName: 'Bob Doe' }), m)).toBe('Bob');
    expect(captionSpeaker(turn('m1', 4, { speakerName: 'Mike Smith' }), m)).toBe('Mike Smith');
  });

  it('matches what the transcript shows for a line of the same caption name', () => {
    const m = meeting({ speakerRenames: { 'caption:sarah brown': { name: 'Sarah (Design)', origin: 'manual' } } });
    const line = storedSegment('m1', 0, spokenBy('Sarah Brown'));
    expect(captionSpeaker(turn('m1', 1, { speakerName: 'Sarah Brown' }), m)).toBe(displayLabel(line, m).text);
  });

  it('a single-line override on a transcript line changes nothing', () => {
    // An override lives on the line, not on the meeting: the captions file cannot see it.
    const m = meeting();
    storedSegment('m1', 0, { ...spokenBy('Sarah Brown'), labelOverride: 'Somebody Else' });
    expect(captionSpeaker(turn('m1', 1, { speakerName: 'Sarah Brown' }), m)).toBe('Sarah Brown');
  });

  it("a word for the user that Meet's label was not recognised as stays Meet's word", () => {
    const m = meeting({ userName: 'Alex', speakerRenames: { self: { name: 'Si', origin: 'manual' } } });
    expect(captionSpeaker(turn('m1', 1, { speakerName: 'Εσείς', self: false }), m)).toBe('Εσείς');
    expect(captionSpeaker(turn('m1', 2, { speakerName: 'You', self: false }), m)).toBe('You');
  });

  it('a rename of that word applies once the user makes it', () => {
    const m = meeting({ speakerRenames: { 'caption:εσείς': { name: 'Alex', origin: 'manual' } } });
    expect(captionSpeaker(turn('m1', 1, { speakerName: 'Εσείς', self: false }), m)).toBe('Alex');
  });

  it('never writes "Others", and ignores a rename of the others key', () => {
    const m = meeting({ speakerRenames: { others: { name: 'The room', origin: 'manual' } } });
    const lines = captionsFileLines(m, [
      turn('m1', 1, { speakerName: 'Sarah Brown' }),
      turn('m1', 2, you),
      turn('m1', 3, { speakerName: 'Unknown Caller', self: false }),
    ]);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).not.toMatch(/\] Others:/);
      expect(line).not.toContain('The room');
    }
  });
});
