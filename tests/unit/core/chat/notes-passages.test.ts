// 008 fixes after the real call of 2026-10-10: a "From your notes:" passage is its own paragraph (the user asked for it
// to start on a new line, like "Background:"), and a citation inside it is never a link: notes are never cited.
import { describe, expect, it } from 'vitest';
import { parseAnswer } from '@/core/chat/citations';
import { normaliseNotesLabels, notesPassages, separateNotesPassages } from '@/core/chat/notes-passages';
import { readChatMeeting } from '../../../support/chat-meetings';

const standup = readChatMeeting('standup-en').segments;
const id = (startMs: number) => standup.find((s) => s.startMs === startMs)!.id;

describe('separateNotesPassages', () => {
  it('starts a mid-paragraph "From your notes:" on its own paragraph', () => {
    expect(
      separateNotesPassages(
        'No. The budget appears in your notes, but no one mentions it. From your notes: The budget is €40,000.',
      ),
    ).toBe('No. The budget appears in your notes, but no one mentions it.\n\nFrom your notes: The budget is €40,000.');
  });

  it('also after a citation group, and after a single line break', () => {
    expect(separateNotesPassages('Pricing came up. [00:12] [00:31] From your notes: hiring.')).toBe(
      'Pricing came up. [00:12] [00:31]\n\nFrom your notes: hiring.',
    );
    expect(separateNotesPassages('Pricing came up [00:12].\nFrom your notes: hiring.')).toBe(
      'Pricing came up [00:12].\n\nFrom your notes: hiring.',
    );
  });

  it('reads the Greek label', () => {
    expect(separateNotesPassages('Δεν αναφέρθηκε. Από τις σημειώσεις σας: 40.000 ευρώ.')).toBe(
      'Δεν αναφέρθηκε.\n\nΑπό τις σημειώσεις σας: 40.000 ευρώ.',
    );
  });

  it('leaves a label that already starts a paragraph or the answer, and text without the label, as written', () => {
    for (const answer of [
      'From your notes: hiring.',
      'Pricing came up [00:12].\n\nFrom your notes: hiring.',
      "That isn't in the transcript so far. From your notes, the agenda includes hiring.",
      'She said "from your notes: hiring" was wrong.',
    ])
      expect(separateNotesPassages(answer)).toBe(answer);
  });
});

describe('notesPassages', () => {
  it('runs from the label to the end of its paragraph, list items under it included', () => {
    const answer =
      'Pricing came up [00:12].\n\nFrom your notes:\n- hiring\n- budget\n\nThe deck is due Friday [03:45].';
    const [range] = notesPassages(answer);
    expect(answer.slice(range![0], range![1])).toBe('From your notes:\n- hiring\n- budget');
  });

  it('ends at a line break followed by a line that is not a list item', () => {
    const answer = 'From your notes: hiring.\nThe deck is due Friday [03:45].';
    const [range] = notesPassages(answer);
    expect(answer.slice(range![0], range![1])).toBe('From your notes: hiring.');
  });
});

describe('parseAnswer with notes passages', () => {
  it('drops a citation inside a notes passage, and puts the passage on its own paragraph', () => {
    expect(
      parseAnswer('Pricing came up [00:12]. From your notes: the budget item has not come up [02:00].', standup),
    ).toEqual([
      { kind: 'text', text: 'Pricing came up ' },
      { kind: 'citation', label: '00:12', segmentId: id(12_000) },
      { kind: 'text', text: '.\n\nFrom your notes: the budget item has not come up.' },
    ]);
  });

  it('keeps the links of the transcript paragraph after a notes passage', () => {
    expect(parseAnswer('From your notes: hiring [01:42].\n\nThe deck is due Friday [03:45].', standup)).toEqual([
      { kind: 'text', text: 'From your notes: hiring.\n\nThe deck is due Friday ' },
      { kind: 'citation', label: '03:45', segmentId: id(225_000) },
      { kind: 'text', text: '.' },
    ]);
  });

  it('drops a citation group after a notes sentence in Greek', () => {
    expect(parseAnswer('Από τις σημειώσεις σου: η πρόσληψη δεν συζητήθηκε. [00:12] [00:31]', standup)).toEqual([
      { kind: 'text', text: 'Από τις σημειώσεις σου: η πρόσληψη δεν συζητήθηκε.' },
    ]);
  });
});

// Eval runs of 2026-10-12. Design decision 77: a sentence that names the notes as its source is marked as it stands;
// decision 59 still governs labelled paragraphs, now also when the Greek label's first word came out in English.
describe('normaliseNotesLabels (half-translated Greek label, run of 2026-10-12)', () => {
  it('writes "From τις σημειώσεις σου:" / "σας:" in Greek at the start of a line or after a sentence or citation', () => {
    expect(normaliseNotesLabels('From τις σημειώσεις σου: Παραμένει η πρόσληψη.')).toBe(
      'Από τις σημειώσεις σου: Παραμένει η πρόσληψη.',
    );
    expect(normaliseNotesLabels('Δεν αναφέρθηκε. From τις σημειώσεις σας: 40.000 ευρώ.')).toBe(
      'Δεν αναφέρθηκε. Από τις σημειώσεις σας: 40.000 ευρώ.',
    );
    expect(normaliseNotesLabels('Συζητήθηκε η τιμολόγηση [00:12]\nFrom τις σημειώσεις σου : η πρόσληψη.')).toBe(
      'Συζητήθηκε η τιμολόγηση [00:12]\nΑπό τις σημειώσεις σου : η πρόσληψη.',
    );
  });

  it('leaves the same words as written when they are not a label, and proper labels untouched', () => {
    for (const answer of [
      'Είπε «From τις σημειώσεις σου: τίποτα» και γέλασε.',
      'Το πήρα from τις σημειώσεις σου: 40k.',
      'From τις σημειώσεις σου, η ατζέντα έχει πέντε θέματα.',
      'From your notes: hiring.',
      'Από τις σημειώσεις σου: η πρόσληψη.',
    ])
      expect(normaliseNotesLabels(answer)).toBe(answer);
  });
});

describe('parseAnswer after the runs of 2026-10-12', () => {
  it('shows the half-translated label in Greek, on its own paragraph, without the citations inside it', () => {
    expect(
      parseAnswer(
        'Έχουμε συζητήσει την τιμολόγηση [00:12]. From τις σημειώσεις σου: Παραμένει η πρόσληψη. [02:00] [07:30]',
        standup,
      ),
    ).toEqual([
      { kind: 'text', text: 'Έχουμε συζητήσει την τιμολόγηση ' },
      { kind: 'citation', label: '00:12', segmentId: id(12_000) },
      { kind: 'text', text: '.\n\nΑπό τις σημειώσεις σου: Παραμένει η πρόσληψη.' },
    ]);
  });

  // Guard: nothing in the panel requires the label, so these hold before and after decision 77.
  it('shows a notes statement attributed in its sentence as written: no label added, no citation', () => {
    for (const answer of [
      'Your notes give a launch budget of 40k.',
      'Οι σημειώσεις σου γράφουν προϋπολογισμό 40k για το λανσάρισμα.',
    ])
      expect(parseAnswer(answer, standup)).toEqual([{ kind: 'text', text: answer }]);
  });

  it('keeps the links of a transcript sentence beside a sentence-attributed notes statement', () => {
    expect(
      parseAnswer(
        'Jane said the launch budget was approved [02:00]. Your notes give a launch budget of 40k.\n\nFrom your notes: hiring is also on the agenda [01:42].',
        standup,
      ),
    ).toEqual([
      { kind: 'text', text: 'Jane said the launch budget was approved ' },
      { kind: 'citation', label: '02:00', segmentId: id(120_000) },
      {
        kind: 'text',
        text: '. Your notes give a launch budget of 40k.\n\nFrom your notes: hiring is also on the agenda.',
      },
    ]);
  });
});
