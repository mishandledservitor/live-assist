// 008 T038: the evaluation scorer with notes (research N8): notes passages labelled and uncited (SC-002), "was it
// said?" answered from the transcript only (SC-003), and no "Others" line named from the notes (SC-004).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evalRequest,
  hasUncitedNotesPassage,
  loadEvalSet,
  namesNotesAsSource,
  parseEvalArgs,
  renderSummary,
  scoreAnswer,
  summarize,
  type EvalQuestion,
} from '../../../spikes/lib/ask-eval';
import { readChatMeeting } from '../../support/chat-meetings';

const SET = loadEvalSet(
  JSON.parse(readFileSync(join(import.meta.dirname, '../../fixtures/chat/eval/notes-agenda.json'), 'utf8')),
  (name) => readChatMeeting(name as 'standup-en'),
);
const { segments } = SET;
const NAMES = SET.names;
const q = (over: Partial<EvalQuestion> & Pick<EvalQuestion, 'tag'>): EvalQuestion => ({
  id: 'q',
  lang: 'en',
  question: 'Q?',
  ...over,
});

describe('hasUncitedNotesPassage', () => {
  it('finds an uncited "From your notes:" passage, in English or Greek', () => {
    expect(hasUncitedNotesPassage('From your notes: the budget is 40k.')).toBe(true);
    expect(hasUncitedNotesPassage('Από τις σημειώσεις σας: ο προϋπολογισμός είναι 40 χιλιάδες.')).toBe(true);
    expect(hasUncitedNotesPassage('From your notes: the budget is 40k [02:00].')).toBe(false);
    expect(hasUncitedNotesPassage('The budget is 40k.')).toBe(false);
  });
});

describe('scoreAnswer with notes tags', () => {
  it('notes-only passes with a labelled, uncited passage and fails when the fact is cited or unlabelled', () => {
    const question = q({ tag: 'notes-only', notesFact: '40k' });
    expect(scoreAnswer(question, 'From your notes: the launch budget is 40k.', segments, NAMES).notesOk).toBe(true);
    expect(scoreAnswer(question, 'The launch budget is 40k [02:00].', segments, NAMES).notesOk).toBe(false);
    expect(scoreAnswer(question, 'The launch budget is 40k.', segments, NAMES).notesOk).toBe(false);
  });

  it('notes-vs-said passes with the not-in-transcript sentence and fails when the notes fact is cited as said', () => {
    const question = q({ tag: 'notes-vs-said', notesFact: '40k' });
    const good = "That isn't in the transcript so far. From your notes: the launch budget is 40k.";
    expect(scoreAnswer(question, good, segments, NAMES).notesOk).toBe(true);
    const said = 'Jane said the budget is 40k [02:00].';
    expect(scoreAnswer(question, said, segments, NAMES).notesOk).toBe(false);
  });

  it('notes-others fails when a name from the notes is put on the "Others" line', () => {
    const question = q({ tag: 'notes-others', othersTimes: ['15:05'] });
    expect(
      scoreAnswer(question, 'Someone not identified said they joined late [15:05].', segments, NAMES).othersOk,
    ).toBe(true);
    expect(scoreAnswer(question, 'Emma said she joined late [15:05].', segments, NAMES).othersOk).toBe(false);
  });

  it('other tags have no notes score', () => {
    expect(scoreAnswer(q({ tag: 'supported' }), 'x', segments, NAMES).notesOk).toBeNull();
  });
});

// Real call and eval runs of 2026-10-10.
describe('scoreAnswer with notes: fixes of 2026-10-10', () => {
  // Real call failure 3: the notes-derived "not covered" sentence was unlabelled and cited.
  it('notes-coverage passes with cited covered items and a labelled, uncited rest', () => {
    const question = q({ tag: 'notes-coverage', supports: ['00:12'], notesFacts: ['support engineer'] });
    const good = 'Pricing was discussed [00:12].\n\nFrom your notes: hiring a second support engineer has not come up.';
    const s = scoreAnswer(question, good, segments, NAMES);
    expect(s.notesOk).toBe(true);
    expect(s.preciseCitations).toBe(1);
  });

  it('notes-coverage fails when the notes-derived sentence is cited, or unlabelled', () => {
    const question = q({ tag: 'notes-coverage', supports: ['00:12'], notesFacts: ['support engineer'] });
    const cited = 'Pricing was discussed [00:12]. It also has not covered hiring a support engineer. [00:12] [02:00]';
    expect(scoreAnswer(question, cited, segments, NAMES).notesOk).toBe(false);
    const unlabelled = 'Pricing was discussed [00:12]. Hiring a support engineer has not come up.';
    expect(scoreAnswer(question, unlabelled, segments, NAMES).notesOk).toBe(false);
  });

  it('a sentence holding a notes fact may name the notes instead of carrying the label, but never a citation', () => {
    const question = q({ tag: 'notes-vs-said', notesFacts: ['40k'] });
    const named = 'No. The 40k budget appears in your notes, but no one mentions it in the transcript.';
    expect(scoreAnswer(question, named, segments, NAMES).notesOk).toBe(true);
    const presented = "That isn't in the transcript so far. The 40k budget still has to be approved.";
    expect(scoreAnswer(question, presented, segments, NAMES).notesOk).toBe(false);
  });

  // Full run: "the launch budget was approved, but no amount was mentioned [02:00]" is a correct answer.
  it('notes-vs-said accepts a cited related line and a "not mentioned" denial', () => {
    const question = q({ tag: 'notes-vs-said', notesFact: '40k', related: ['02:00'] });
    const answer = 'The launch budget was approved, but no amount was mentioned. [02:00]\n\nFrom your notes: 40k.';
    expect(scoreAnswer(question, answer, segments, NAMES).notesOk).toBe(true);
    expect(scoreAnswer(question, 'No amount was mentioned. [00:12]', segments, NAMES).notesOk).toBe(false);
  });

  // notes-agenda run: "From τις σημειώσεις σου: 40k" mixed the label's languages.
  it('a label with mixed languages is not a notes passage', () => {
    expect(hasUncitedNotesPassage('From τις σημειώσεις σου: 40k για το λανσάρισμα.')).toBe(false);
  });
});

// Design decision 77 (user, 2026-10-12): a sentence that names the user's notes as its source is marked; it does not
// also need the label. The answers quoted as "run of 2026-10-12" are the model's, on the synthetic standup fixture.
describe('namesNotesAsSource (decision 77)', () => {
  it('accepts "your notes" as the subject of a verb of stating, or after a source preposition', () => {
    for (const sentence of [
      'Your notes give a launch budget of 40k.',
      'Your notes also list hiring a second support engineer, which has not come up.',
      'The 40k budget appears in your notes, but no one mentions it in the transcript.',
      'According to your notes, Emma is joining late.',
      'Hiring a second support engineer is on the agenda in your notes and has not come up.',
      'Οι σημειώσεις σου γράφουν προϋπολογισμό 40k για το λανσάρισμα.',
      'Οι σημειώσεις σας αναφέρουν προϋπολογισμό 40k για το λανσάρισμα.',
      'Στις σημειώσεις σου υπάρχει και η πρόσληψη δεύτερου μηχανικού υποστήριξης.',
      'Σύμφωνα με τις σημειώσεις σου, ο προϋπολογισμός είναι 40 χιλιάδες.',
    ])
      expect(namesNotesAsSource(sentence), sentence).toBe(true);
  });

  it('rejects sentences that do not name the user’s notes as the source of what they state', () => {
    for (const sentence of [
      'The launch budget is 40k.',
      'The agenda also mentions Emma joining late and Mike asking for the spreadsheet.',
      'Hiring a second support engineer hasn’t come up in the transcript so far.',
      'Jane notes that the budget is 40k.',
      'Jane noted a budget of 40k.',
      'The budget is 40k, which matches your notes.',
      'Check your notes: the budget is 40k.',
      'Your notes do not mention a budget.',
      'The notes from the last meeting give 40k.',
      'Δεν έχουμε καλύψει ακόμα την πρόσληψη δεύτερου μηχανικού υποστήριξης.',
      'Η ατζέντα περιλαμβάνει πρόσληψη δεύτερου μηχανικού υποστήριξης.',
      'Ο προϋπολογισμός είναι 40 χιλιάδες, όπως και οι σημειώσεις σου.',
    ])
      expect(namesNotesAsSource(sentence), sentence).toBe(false);
  });
});

describe('scoreAnswer with notes: decision 77', () => {
  const figure = q({ tag: 'notes-only', notesFact: '40k' });
  const figureEl = q({ tag: 'notes-only', lang: 'el', notesFact: '40' });
  const coverage = q({
    tag: 'notes-coverage',
    supports: ['00:12', '00:31', '01:10', '02:00', '02:37', '07:30'],
    notesFacts: ['support engineer'],
    notesAlso: ['Emma', 'Mike'],
  });
  const coverageEl = q({
    tag: 'notes-coverage',
    lang: 'el',
    supports: ['00:12', '01:10', '02:00', '02:37'],
    notesFacts: ['υποστήριξ', 'support engineer'],
  });
  const ok = (question: EvalQuestion, answer: string) => scoreAnswer(question, answer, segments, NAMES).notesOk;

  // Runs of 2026-10-12, budget-figure and budget-figure-el: scored as failures then, "that counts" now.
  it('notes-only passes when the sentence itself attributes the fact to the notes, without the label', () => {
    expect(ok(figure, 'Your notes give a launch budget of 40k.')).toBe(true);
    expect(ok(figureEl, 'Οι σημειώσεις σου γράφουν προϋπολογισμό 40k για το λανσάρισμα.')).toBe(true);
    expect(ok(figureEl, 'Οι σημειώσεις σου αναφέρουν προϋπολογισμό 40k για το λανσάρισμα.')).toBe(true);
  });

  it('notes-only still fails with neither form, with a citation, or as something said', () => {
    expect(ok(figure, 'The launch budget is 40k.')).toBe(false);
    expect(ok(figure, 'The launch budget is 40k, which matches your notes.')).toBe(false);
    expect(ok(figure, 'Your notes give a launch budget of 40k [02:00].')).toBe(false);
    expect(ok(figure, 'Your notes give a launch budget of 40k. [02:00]')).toBe(false);
    expect(ok(figure, 'Jane said the launch budget is 40k [02:00].')).toBe(false);
    expect(ok(figureEl, 'Ο προϋπολογισμός για το λανσάρισμα είναι 40k.')).toBe(false);
  });

  it('notes-only fails when the asked-for fact is not given at all, and a cited time is not read as the fact', () => {
    expect(ok(figure, 'Your notes list a budget for the launch.')).toBe(false);
    expect(ok(figureEl, 'Η Τζέιν είπε ότι ο προϋπολογισμός εγκρίθηκε [02:00]. [00:40]')).toBe(false);
  });

  it('a labelled passage still passes, and a citation inside it still fails', () => {
    expect(ok(figure, 'From your notes: the launch budget is 40k.')).toBe(true);
    expect(ok(figure, 'From your notes: the launch budget is 40k. [02:00]')).toBe(false);
  });

  it('notes-coverage passes with cited covered items and the rest attributed in its sentence', () => {
    const answer =
      'Pricing, the launch date, the budget and the security review were discussed. [00:12] [02:37] [02:00] [07:30]\n\nYour notes also list hiring a second support engineer, which has not come up.';
    const s = scoreAnswer(coverage, answer, segments, NAMES);
    expect(s.notesOk).toBe(true);
    expect(s.preciseCitations).toBe(4);
  });

  // Run of 2026-10-12 (--set notes-agenda), coverage: plain bullets, one of them about people only the notes name.
  it('notes-coverage fails on the real English shape: the notes item and the notes people in plain bullets', () => {
    const real = [
      '- We discussed pricing, the launch date, the launch budget, and the security review. [00:03] [00:12] [00:31] [01:10] [02:00] [02:37] [07:30]',
      '- Hiring a second support engineer hasn’t come up in the transcript so far.',
      '- The agenda also mentions Emma joining late and Mike asking for the spreadsheet, but those are not agenda items. The transcript has an unidentified person asking to share the spreadsheet and someone joining late; it doesn’t identify them as Mike or Emma. [01:42] [15:05]',
    ];
    expect(ok(coverage, real.join('\n'))).toBe(false);
    // Each of the two bullets is enough to fail it.
    expect(ok(coverage, [real[0], real[1]].join('\n'))).toBe(false);
    const attributed = '- Your notes also list hiring a second support engineer, which has not come up.';
    expect(ok(coverage, [real[0], attributed].join('\n'))).toBe(true);
    expect(ok(coverage, [real[0], attributed, real[2]].join('\n'))).toBe(false);
  });

  // Both runs of 2026-10-12, coverage-el: the notes item stated plainly before the labelled paragraph.
  it('notes-coverage fails on the real Greek shape: a notes item in a plain sentence before the labelled paragraph', () => {
    const real =
      'Έχουμε συζητήσει την τιμολόγηση, τον προϋπολογισμό, την ημερομηνία κυκλοφορίας και τον έλεγχο ασφάλειας. [00:12] [01:10] [02:00] [02:37]\n\nΔεν έχουμε καλύψει ακόμα την πρόσληψη δεύτερου μηχανικού υποστήριξης.\n\nΑπό τις σημειώσεις σου: Η ατζέντα περιλαμβάνει πρόσληψη δεύτερου μηχανικού υποστήριξης.';
    expect(ok(coverageEl, real)).toBe(false);
    const fixed = real.replace('Δεν έχουμε καλύψει ακόμα την πρόσληψη δεύτερου μηχανικού υποστήριξης.\n\n', '');
    expect(ok(coverageEl, fixed)).toBe(true);
    const inSentence = real.replace(
      'Δεν έχουμε καλύψει ακόμα την πρόσληψη',
      'Οι σημειώσεις σου αναφέρουν και την πρόσληψη',
    );
    expect(ok(coverageEl, inSentence)).toBe(true);
  });

  it('a half-translated label is no label in the model’s raw answer', () => {
    const mixed =
      'Έχουμε συζητήσει την τιμολόγηση [00:12].\n\nFrom τις σημειώσεις σου: Παραμένει η πρόσληψη δεύτερου μηχανικού υποστήριξης.';
    expect(ok(coverageEl, mixed)).toBe(false);
  });

  it('notes-coverage fails when no uncovered item is given', () => {
    expect(ok(coverage, 'Everything on the agenda was discussed. [00:12]')).toBe(false);
  });

  it('the set scores people only the notes name on the coverage questions, and asks about them directly', () => {
    for (const x of SET.questions.filter((y) => y.tag === 'notes-coverage'))
      expect(x.notesAlso).toEqual(expect.arrayContaining(['Emma', 'Mike']));
    expect(SET.questions.filter((x) => x.tag === 'notes-coverage').length).toBeGreaterThanOrEqual(3);
    const attendees = SET.questions.filter((x) => x.id.startsWith('attendees'));
    expect(new Set(attendees.map((x) => x.lang))).toEqual(new Set(['en', 'el']));
    expect(attendees.every((x) => x.tag === 'notes-only' && (x.notesFact ?? x.notesFacts) !== undefined)).toBe(true);
  });
});

// Decision 78 (user, 2026-10-12): the line that opens a topic supports "was it covered", alongside the substance.
describe('the notes evaluation set: decision 78', () => {
  const coverage = SET.questions.filter((x) => x.tag === 'notes-coverage');

  it('scores a coverage answer citing the line that opens pricing, plus substance lines, as all precise', () => {
    const answer =
      'Pricing was opened and settled. [00:03] [00:12] [00:31]\nThe enterprise plan, the budget, the launch date and the security review were discussed. [01:10] [02:00] [02:37] [07:30]\n\nYour notes also list hiring a second support engineer, which has not come up.';
    expect(coverage.map((x) => x.id).sort()).toEqual(['agenda-left', 'coverage', 'coverage-el']);
    for (const question of coverage) {
      const s = scoreAnswer(question, answer, segments, NAMES);
      expect(s.citations).toBe(7);
      expect(s.preciseCitations).toBe(7);
    }
  });

  it('still scores a line that only mentions something in passing, or an "Others" line, as imprecise', () => {
    for (const question of coverage) {
      const s = scoreAnswer(question, 'Pricing was discussed. [00:03] [01:42] [15:05]', segments, NAMES);
      expect(s.citations).toBe(3);
      expect(s.preciseCitations).toBe(1);
    }
  });

  it('leaves the pricing question as it was: the opening line is not where the decision is', () => {
    const pricing = SET.questions.find((x) => x.id === 'pricing');
    expect(pricing?.supports).toEqual(['00:12', '00:31']);
  });
});

describe('the notes evaluation set after 2026-10-10', () => {
  it('reproduces the real call: coverage against the agenda and the asked-for word, in English and Greek', () => {
    const coverage = SET.questions.filter((x) => x.tag === 'notes-coverage');
    expect(new Set(coverage.map((x) => x.lang))).toEqual(new Set(['en', 'el']));
    const word = SET.questions.filter((x) => x.tag === 'conversation');
    expect(new Set(word.map((x) => x.lang))).toEqual(new Set(['en', 'el']));
    expect(word.map((x) => x.question)).toContain('What was the word I asked you to say?');
    expect(word.every((x) => x.expect === 'QZVRT')).toBe(true);
  });

  it('notes-others questions carry their "Others" line as a supported citation', () => {
    for (const x of SET.questions.filter((y) => y.tag === 'notes-others')) expect(x.supports).toEqual(x.othersTimes);
  });

  it('with earlier turns, the notes go with the first question, as the app sends notes added before Start', () => {
    const question = SET.questions.find((x) => x.tag === 'conversation' && (x.earlier?.length ?? 0) > 0)!;
    const turns = evalRequest(SET, question, 'gpt-6-luna').turns.filter((t) => t.role === 'user');
    expect(turns[0]!.role === 'user' && turns[0]!.notes).toContain('Notes from the person asking (agenda.md).');
    expect(turns.slice(1).every((t) => t.role === 'user' && t.notes === undefined)).toBe(true);
  });
});

describe('summary and runner', () => {
  it('counts notes failures and prints them', () => {
    const rows = [
      scoreAnswer(q({ tag: 'notes-only', notesFact: '40k' }), 'The budget is 40k.', segments, NAMES),
      scoreAnswer(
        q({ tag: 'notes-vs-said', notesFact: '40k' }),
        "That isn't in the transcript so far.",
        segments,
        NAMES,
      ),
    ];
    const s = summarize(rows);
    expect(s.notesFailures).toBe(1);
    expect(renderSummary(s, { provider: 'openai', model: 'gpt-6-luna' })).toContain(
      '| Notes statements unmarked, cited or presented as said (SC-002, SC-003) | 1 | 0 | no |',
    );
  });

  it('builds requests with the set’s notes as an "added" block before the transcript block', () => {
    const request = evalRequest(SET, SET.questions[0]!, 'gpt-6-luna');
    const user = request.turns.at(-1)!;
    expect(user.role === 'user' && user.notes).toContain('Notes from the person asking (agenda.md).');
    expect(user.role === 'user' && user.notes).toContain('Budget: 40k');
  });

  it('--set picks one evaluation set by name', () => {
    expect(parseEvalArgs(['--set', 'notes-agenda']).set).toBe('notes-agenda');
    expect(parseEvalArgs([]).set).toBeUndefined();
  });
});
