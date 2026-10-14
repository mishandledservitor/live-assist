// 003 T026: citations in an answer (research R7 "Citation parsing", data-model "Citation"). A bracketed time links to
// the first transcript line shown at that time; anything else stays text.
import { describe, expect, it } from 'vitest';
import { parseAnswer } from '@/core/chat/citations';
import { readChatMeeting } from '../../../support/chat-meetings';

const standup = readChatMeeting('standup-en').segments;
const long = readChatMeeting('long-1h20').segments;
const id = (segments: typeof standup, startMs: number) => segments.find((s) => s.startMs === startMs)!.id;

describe('parseAnswer', () => {
  it('links [12:40] to the line at 12:40, keeping the text around it exactly', () => {
    expect(parseAnswer('Customer interviews start Monday [12:40]. Done.', standup)).toEqual([
      { kind: 'text', text: 'Customer interviews start Monday ' },
      { kind: 'citation', label: '12:40', segmentId: id(standup, 760_000) },
      { kind: 'text', text: '. Done.' },
    ]);
  });

  it('links the first line in meeting order when two share a time', () => {
    const twin = { ...standup[1]!, id: 'twin', seq: 99 };
    expect(parseAnswer('[00:12]', [twin, ...standup])).toEqual([
      { kind: 'citation', label: '00:12', segmentId: standup[1]!.id },
    ]);
  });

  it('[1:15:12] and [75:12] both link to the 1:15:12 line, each keeping the label as written', () => {
    const target = id(long, 4_512_000);
    expect(parseAnswer('[1:15:12]', long)).toEqual([{ kind: 'citation', label: '1:15:12', segmentId: target }]);
    expect(parseAnswer('[75:12]', long)).toEqual([{ kind: 'citation', label: '75:12', segmentId: target }]);
  });

  it('two adjacent citations stay two links with the space between them', () => {
    expect(parseAnswer('deck [03:45] [04:02].', standup)).toEqual([
      { kind: 'text', text: 'deck ' },
      { kind: 'citation', label: '03:45', segmentId: id(standup, 225_000) },
      { kind: 'text', text: ' ' },
      { kind: 'citation', label: '04:02', segmentId: id(standup, 242_000) },
      { kind: 'text', text: '.' },
    ]);
  });

  it('a well-formed time that matches no line is unmatched, shown as written', () => {
    expect(parseAnswer('see [59:59]', standup)).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'unmatched', text: '[59:59]' },
    ]);
  });

  it('malformed times stay plain text', () => {
    for (const text of ['[99:99]', '[12:4]', '[ 12:40 ]', '[12:40:99]', '12:40'])
      expect(parseAnswer(`a ${text} b`, standup)).toEqual([{ kind: 'text', text: `a ${text} b` }]);
  });

  it('an empty answer has no parts', () => {
    expect(parseAnswer('', standup)).toEqual([]);
  });
});

// T087 (real call 2026-10-09, failure B): a word the person asked the assistant to say was quoted and cited to an
// unrelated line. A citation whose sentence quotes something none of the cited lines says is shown as plain text.
describe('parseAnswer: quotation guard (T087)', () => {
  const kinds = (answer: string) => parseAnswer(answer, standup).filter((p) => p.kind !== 'text');

  it('a quoted word that the cited line does not contain: the citation stays plain text', () => {
    expect(parseAnswer('The term was "QZVRT." [01:42]', standup)).toEqual([
      { kind: 'text', text: 'The term was "QZVRT." ' },
      { kind: 'unmatched', text: '[01:42]' },
    ]);
  });

  it('curly and Greek quotation marks are checked too', () => {
    expect(kinds('You asked for “QZVRT” [01:42].')).toEqual([{ kind: 'unmatched', text: '[01:42]' }]);
    expect(kinds('Ζήτησες «QZVRT» [01:42].')).toEqual([{ kind: 'unmatched', text: '[01:42]' }]);
  });

  it('a quotation the cited line contains keeps the link, ignoring case and punctuation', () => {
    expect(kinds('Jane said "pricing stays at the current tier" [00:12].')).toEqual([
      { kind: 'citation', label: '00:12', segmentId: id(standup, 12_000) },
    ]);
    expect(kinds('Someone asked: "Can someone share the spreadsheet?" [01:42]')).toEqual([
      { kind: 'citation', label: '01:42', segmentId: id(standup, 102_000) },
    ]);
  });

  it('an ellipsis in a quotation is a gap', () => {
    expect(kinds('Jane: "Pricing stays … until January" [00:12].')).toEqual([
      { kind: 'citation', label: '00:12', segmentId: id(standup, 12_000) },
    ]);
  });

  it('in a group, one cited line containing the quotation is enough', () => {
    expect(kinds('"Send it to the whole channel" [03:45] [04:02].').map((p) => p.kind)).toEqual([
      'citation',
      'citation',
    ]);
    expect(kinds('"QZVRT" [03:45] [04:02].').map((p) => p.kind)).toEqual(['unmatched', 'unmatched']);
  });

  it('only the sentence the citation closes is checked', () => {
    expect(kinds('You asked me to say "QZVRT". Jane will send the deck by Friday [03:45].').map((p) => p.kind)).toEqual(
      ['citation'],
    );
    expect(kinds('Jane will send the deck [03:45]. You asked for "QZVRT" [01:42].').map((p) => p.kind)).toEqual([
      'citation',
      'unmatched',
    ]);
  });

  it('a sentence without a quotation, or with an unbalanced quote, keeps its links', () => {
    expect(kinds('Jane will send the new deck by Friday [03:45].').map((p) => p.kind)).toEqual(['citation']);
    expect(kinds('She said "pricing stays [00:12].').map((p) => p.kind)).toEqual(['citation']);
  });

  it('a citation with any supported quotation keeps the link', () => {
    expect(
      kinds('"QZVRT" aside, Jane said "the budget for the launch was approved" [02:00].').map((p) => p.kind),
    ).toEqual(['citation']);
  });
});
