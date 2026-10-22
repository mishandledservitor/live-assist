// 016 T013 (spec FR-012–FR-014, User Story 2, SC-006; research R3): passages the realtime transcript wrote twice are
// written once in the merged file, at their first place; a genuine repetition stays. Every name and sentence is
// invented.
import { describe, expect, it } from 'vitest';
import type { StoredCaptionTurn } from '@/core/captions/model';
import { mergedTranscript, mergedTranscriptFile } from '@/core/export/merged-transcript';
import { transcriptFileLines } from '@/core/export/transcript-file';
import type { TranscriptSegment } from '@/core/transcript/model';
import { syntheticMeeting } from '../../../support/synthetic-meeting';
import { spokenBy, storedCaptionTurn, storedMeeting, storedSegment } from '../../../support/stored-meetings';

const line = (seq: number, text: string, overrides: Partial<TranscriptSegment> = {}) =>
  storedSegment('m1', seq, { startMs: seq * 10_000, text, ...overrides });
const cap = (seq: number, speakerName: string, text: string): StoredCaptionTurn =>
  storedCaptionTurn('m1', seq, { startMs: seq * 10_000, speakerName, text });
const plain = (text: string) => text.toLowerCase().replace(/[.,?!]/g, '');

function merged(segments: readonly TranscriptSegment[], turns: readonly StoredCaptionTurn[]): string[] {
  const { body } = mergedTranscriptFile(storedMeeting(), segments, turns);
  return body === '' ? [] : body.slice(0, -1).split('\n\n');
}

/** Twenty words Sarah says once; the realtime transcript writes them again twenty seconds later under Mike. */
const PASSAGE =
  'The northern region grew faster than planned because the new partners joined early and the pricing change landed really well.';
const HELLO = 'Good morning everyone, thanks for coming.';
const GREAT = 'That is great news for the whole team.';
const HIRING = 'Let us move on to hiring now.';

const transcript = (replay: Partial<TranscriptSegment> = {}, replayText = PASSAGE) => [
  line(0, HELLO, spokenBy('Mike Chen')),
  line(1, PASSAGE, spokenBy('Sarah Brown')),
  line(2, GREAT, spokenBy('Mike Chen')),
  line(3, replayText, { ...spokenBy('Mike Chen'), ...replay }),
  line(4, HIRING, spokenBy('Sarah Brown')),
];

describe('a passage written twice', () => {
  it('is written once, at its first place and time, under the captions’ speaker, when the captions carry it once', () => {
    const turns = [
      cap(1, 'Mike Chen', plain(HELLO)),
      cap(2, 'Sarah Brown', plain(PASSAGE)),
      cap(3, 'Mike Chen', plain(GREAT)),
      cap(4, 'Sarah Brown', plain(HIRING)),
    ];
    expect(merged(transcript(), turns)).toEqual([
      `[00:00] Mike Chen: ${HELLO}`,
      `[00:10] Sarah Brown: ${PASSAGE}`,
      `[00:20] Mike Chen: ${GREAT}`,
      `[00:40] Sarah Brown: ${HIRING}`,
    ]);
    expect(mergedTranscript(storedMeeting(), transcript(), turns).removedSegmentIds).toEqual(['m1:mixed:3']);
  });

  it('is still written at its first place when the captions matched the later copy, and keeps its speaker', () => {
    // The captions hold the passage after Mike's reply, so the first alignment matches the later copy.
    const turns = [
      cap(1, 'Mike Chen', plain(HELLO)),
      cap(2, 'Mike Chen', plain(GREAT)),
      cap(3, 'Sarah Brown', plain(PASSAGE)),
      cap(4, 'Sarah Brown', plain(HIRING)),
    ];
    expect(merged(transcript(), turns)).toEqual([
      `[00:00] Mike Chen: ${HELLO}`,
      `[00:10] Sarah Brown: ${PASSAGE}`,
      `[00:20] Mike Chen: ${GREAT}`,
      `[00:40] Sarah Brown: ${HIRING}`,
    ]);
  });

  it('the example of contracts/merged-file.md, byte for byte', () => {
    const lines = [
      storedSegment('m1', 0, {
        startMs: 4_000,
        text: "Good morning, can everyone see the roadmap slide? Yes, it's up.",
      }),
      storedSegment('m1', 1, { startMs: 11_000, text: 'Great, so the first item is the launch date.' }),
      storedSegment('m1', 2, {
        startMs: 31_000,
        text: 'Great, so the first item is the launch date.',
        ...spokenBy('Jane'),
      }),
    ];
    const turns = [
      storedCaptionTurn('m1', 1, {
        startMs: 5_000,
        speakerName: 'Sarah Brown',
        text: 'Good morning can everyone see the roadmap slide',
      }),
      storedCaptionTurn('m1', 2, { startMs: 9_000, speakerName: 'You', self: true, text: "Yes it's up" }),
      storedCaptionTurn('m1', 3, {
        startMs: 12_000,
        speakerName: 'Sarah Brown',
        text: 'Great so the first item is the launch date',
      }),
    ];
    expect(mergedTranscriptFile(storedMeeting({ userName: 'Alex' }), lines, turns)).toEqual({
      name: 'Meeting — 07-10-2026 at 14h30 — Transcript.txt',
      body:
        '[00:04] Sarah Brown: Good morning, can everyone see the roadmap slide?\n\n' +
        "[00:04] Alex: Yes, it's up.\n\n" +
        '[00:11] Sarah Brown: Great, so the first item is the launch date.\n',
    });
  });

  it('written three times, with the captions carrying it once, is written once', () => {
    const lines = [
      line(0, HELLO, spokenBy('Mike Chen')),
      line(1, PASSAGE, spokenBy('Sarah Brown')),
      line(2, GREAT, spokenBy('Mike Chen')),
      line(3, PASSAGE, spokenBy('Mike Chen')),
      line(4, HIRING, spokenBy('Sarah Brown')),
      line(5, PASSAGE),
    ];
    const turns = [
      cap(1, 'Mike Chen', plain(HELLO)),
      cap(2, 'Sarah Brown', plain(PASSAGE)),
      cap(3, 'Mike Chen', plain(GREAT)),
      cap(4, 'Sarah Brown', plain(HIRING)),
    ];
    expect(mergedTranscript(storedMeeting(), lines, turns).removedSegmentIds).toEqual(['m1:mixed:3', 'm1:mixed:5']);
  });

  it('spread over two lines, one of them short, is removed as one run', () => {
    const first = 'Right, so listen.';
    const lines = [
      line(0, HELLO, spokenBy('Mike Chen')),
      line(1, first, spokenBy('Sarah Brown')),
      line(2, PASSAGE, spokenBy('Sarah Brown')),
      line(3, GREAT, spokenBy('Mike Chen')),
      line(4, first, spokenBy('Mike Chen')),
      line(5, PASSAGE, spokenBy('Mike Chen')),
      line(6, HIRING, spokenBy('Sarah Brown')),
    ];
    const turns = [
      cap(1, 'Mike Chen', plain(HELLO)),
      cap(2, 'Sarah Brown', plain(`${first} ${PASSAGE}`)),
      cap(3, 'Mike Chen', plain(GREAT)),
      cap(4, 'Sarah Brown', plain(HIRING)),
    ];
    expect(mergedTranscript(storedMeeting(), lines, turns).removedSegmentIds).toEqual(['m1:mixed:4', 'm1:mixed:5']);
  });

  it('interrupted by a line that is not a repeat: each part is judged on its own', () => {
    const one = 'The northern region grew faster than planned because the partners joined early.';
    const two = 'The pricing change landed really well with every one of our larger customers.';
    const lines = [
      line(0, HELLO, spokenBy('Mike Chen')),
      line(1, one, spokenBy('Sarah Brown')),
      line(2, two, spokenBy('Sarah Brown')),
      line(3, GREAT, spokenBy('Mike Chen')),
      line(4, one, spokenBy('Mike Chen')),
      line(5, 'Quietly, somebody coughs.', spokenBy('Mike Chen')),
      line(6, two, spokenBy('Mike Chen')),
      line(7, HIRING, spokenBy('Sarah Brown')),
    ];
    const turns = [
      cap(1, 'Mike Chen', plain(HELLO)),
      cap(2, 'Sarah Brown', plain(`${one} ${two}`)),
      cap(3, 'Mike Chen', plain(GREAT)),
      cap(4, 'Mike Chen', 'quietly somebody coughs'),
      cap(5, 'Sarah Brown', plain(HIRING)),
    ];
    expect(mergedTranscript(storedMeeting(), lines, turns).removedSegmentIds).toEqual(['m1:mixed:4', 'm1:mixed:6']);
  });
});

describe('a repetition that stays', () => {
  it('a person said it twice: the captions carry it twice', () => {
    const turns = [
      cap(1, 'Mike Chen', plain(HELLO)),
      cap(2, 'Sarah Brown', plain(PASSAGE)),
      cap(3, 'Mike Chen', plain(GREAT)),
      cap(4, 'Sarah Brown', plain(PASSAGE)),
      cap(5, 'Sarah Brown', plain(HIRING)),
    ];
    expect(merged(transcript(), turns)).toEqual([
      `[00:00] Mike Chen: ${HELLO}`,
      `[00:10] Sarah Brown: ${PASSAGE}`,
      `[00:20] Mike Chen: ${GREAT}`,
      `[00:30] Sarah Brown: ${PASSAGE}`,
      `[00:40] Sarah Brown: ${HIRING}`,
    ]);
  });

  it('the captions carry neither copy (captions were off): nothing shows it was said once', () => {
    const turns = [
      cap(1, 'Mike Chen', plain(HELLO)),
      cap(3, 'Mike Chen', plain(GREAT)),
      cap(4, 'Sarah Brown', plain(HIRING)),
    ];
    const result = mergedTranscript(storedMeeting(), transcript(), turns);
    expect(result.removedSegmentIds).toEqual([]);
    expect(result.lines.filter((l) => l.text === PASSAGE)).toHaveLength(2);
  });

  it('a repeat of fewer than eight words', () => {
    // The 8-word run "honestly … overall" repeats, but it starts in a line that is not a repeat as a whole; the line it
    // ends in is wholly repeated and has only five words, so it stays.
    const lines = [
      line(0, HELLO, spokenBy('Mike Chen')),
      line(1, 'Honestly the pricing change landed really well overall.', spokenBy('Sarah Brown')),
      line(2, GREAT, spokenBy('Mike Chen')),
      line(3, 'And yes, honestly the pricing', spokenBy('Mike Chen')),
      line(4, 'change landed really well overall.', spokenBy('Mike Chen')),
      line(5, HIRING, spokenBy('Sarah Brown')),
    ];
    const turns = [
      cap(1, 'Mike Chen', plain(HELLO)),
      cap(2, 'Sarah Brown', 'honestly the pricing change landed really well overall'),
      cap(3, 'Mike Chen', plain(GREAT)),
      cap(4, 'Mike Chen', 'and yes'),
      cap(5, 'Sarah Brown', plain(HIRING)),
    ];
    expect(mergedTranscript(storedMeeting(), lines, turns).removedSegmentIds).toEqual([]);
  });

  it('a line that only partly repeats earlier text', () => {
    const turns = [
      cap(1, 'Mike Chen', plain(HELLO)),
      cap(2, 'Sarah Brown', plain(PASSAGE)),
      cap(3, 'Mike Chen', plain(GREAT)),
      cap(4, 'Sarah Brown', plain(HIRING)),
    ];
    const result = mergedTranscript(
      storedMeeting(),
      transcript({}, `${PASSAGE} And then the budget doubled overnight.`),
      turns,
    );
    expect(result.removedSegmentIds).toEqual([]);
  });

  it('a line corrected by hand', () => {
    const turns = [
      cap(1, 'Mike Chen', plain(HELLO)),
      cap(2, 'Sarah Brown', plain(PASSAGE)),
      cap(3, 'Mike Chen', plain(GREAT)),
      cap(4, 'Sarah Brown', plain(HIRING)),
    ];
    expect(merged(transcript({ labelOverride: 'Dana Ortiz' }), turns)).toContain(`[00:30] Dana Ortiz: ${PASSAGE}`);
  });

  it('the same text again more than 400 words later', () => {
    const filler = Array.from({ length: 41 }, (_, i) =>
      line(10 + i, `${Array.from({ length: 10 }, (__, k) => `filler${i * 10 + k}`).join(' ')}.`, spokenBy('Mike Chen')),
    );
    const lines = [line(0, PASSAGE, spokenBy('Sarah Brown')), ...filler, line(60, PASSAGE, spokenBy('Mike Chen'))];
    const turns = [
      cap(1, 'Sarah Brown', plain(PASSAGE)),
      cap(2, 'Mike Chen', filler.map((f) => plain(f.text)).join(' ')),
    ];
    expect(mergedTranscript(storedMeeting(), lines, turns).removedSegmentIds).toEqual([]);
  });

  it('a word said over and over inside one line', () => {
    const lines = [
      line(0, HELLO, spokenBy('Mike Chen')),
      line(1, Array(20).fill('go').join(' ') + '!', spokenBy('Sarah Brown')),
    ];
    const turns = [cap(1, 'Mike Chen', plain(HELLO)), cap(2, 'Sarah Brown', Array(20).fill('go').join(' '))];
    expect(mergedTranscript(storedMeeting(), lines, turns).removedSegmentIds).toEqual([]);
  });
});

describe('repeats in generated meetings', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => 2_000 + i);

  it.each(seeds)('seed %i: only replayed lines are removed, and every replay of eight words or more is', (seed) => {
    const m = syntheticMeeting({ seed, words: 800, replays: 3 });
    const result = mergedTranscript(m.meeting, m.segments, m.captionTurns);
    const replays = new Set(m.replayIds);
    expect(result.removedSegmentIds.filter((id) => !replays.has(id))).toEqual([]);
    const long = m.segments.filter((s) => replays.has(s.id) && s.text.split(' ').length >= 8).map((s) => s.id);
    expect(long.filter((id) => !result.removedSegmentIds.includes(id))).toEqual([]);
    // The words are the transcript's, minus the removed lines.
    const kept = m.segments.filter((s) => !result.removedSegmentIds.includes(s.id));
    expect(result.lines.flatMap((l) => l.text.split(' '))).toEqual(
      transcriptFileLines(m.meeting, kept).flatMap((l) => l.replace(/^\[\d+:\d\d\] [^:]+: /, '').split(' ')),
    );
  });
});
