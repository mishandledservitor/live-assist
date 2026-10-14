// 003 T054: the scorer of the user-run answer evaluation (research R12): citation precision against the tagged times
// (SC-002), "not in the transcript" for absent questions (SC-003), answer language by script (SC-005), and no name
// given to an "Others" line.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIRST_BLOCK_HEADER, NO_NEW_LINES_HEADER } from '@/core/chat/prompt';
import { formatOffset } from '@/core/transcript/model';
import {
  answerLanguage,
  evalRequest,
  hasUncitedBackground,
  loadEvalSet,
  parseEvalArgs,
  requireChatKey,
  renderSummary,
  saysNotInTranscript,
  deniesItWasSaid,
  scoreAnswer,
  summarize,
  type EvalQuestion,
} from '../../../spikes/lib/ask-eval';
import { readChatMeeting } from '../../support/chat-meetings';

const EVAL_DIR = join(import.meta.dirname, '../../fixtures/chat/eval');
const { segments } = readChatMeeting('standup-en');
const NAMES = ['Alex', 'Jane', 'John', 'Tom'];

const q = (over: Partial<EvalQuestion> & Pick<EvalQuestion, 'tag'>): EvalQuestion => ({
  id: 'q',
  lang: 'en',
  question: 'Q?',
  ...over,
});

describe('the evaluation set (tests/fixtures/chat/eval)', () => {
  const files = readdirSync(EVAL_DIR).filter((f) => f.endsWith('.json'));

  it.each(files)('%s: every tagged time is a line of its meeting, and both languages are present', (file) => {
    const set = loadEvalSet(JSON.parse(readFileSync(join(EVAL_DIR, file), 'utf8')), (name) =>
      readChatMeeting(name as 'standup-en' | 'term-mention'),
    );
    const times = new Set(set.segments.map((s) => formatOffset(s.startMs)));
    for (const question of set.questions) {
      for (const t of [...(question.supports ?? []), ...(question.othersTimes ?? []), ...(question.related ?? [])])
        expect(times).toContain(t);
      if (question.tag === 'absent') expect(question.supports ?? []).toEqual([]);
    }
    expect(new Set(set.questions.map((x) => x.lang))).toEqual(new Set(['en', 'el']));
  });

  it('covers every tag', () => {
    const tags = new Set(
      files.flatMap((f) =>
        (JSON.parse(readFileSync(join(EVAL_DIR, f), 'utf8')) as { questions: EvalQuestion[] }).questions.map(
          (x) => x.tag,
        ),
      ),
    );
    expect(tags).toEqual(
      new Set([
        'supported',
        'absent',
        'partial',
        'background',
        'others-attribution',
        'conversation',
        // 008: notes.
        'notes-only',
        'notes-vs-said',
        'notes-others',
        // Real call 2026-10-10: "which agenda items haven't we covered?".
        'notes-coverage',
      ]),
    );
  });
});

describe('scoreAnswer: citations (SC-002)', () => {
  it('counts citations to tagged times as precise, others not', () => {
    const s = scoreAnswer(
      q({ tag: 'supported', supports: ['00:12'] }),
      'It stays [00:12], says [03:45].',
      segments,
      NAMES,
    );
    expect(s.citations).toBe(2);
    expect(s.preciseCitations).toBe(1);
  });

  it('reads [75:12]-style times in the transcript format', () => {
    const long = readChatMeeting('long-1h20').segments;
    const s = scoreAnswer(q({ tag: 'supported', supports: ['1:15:12'] }), 'March [75:12].', long, NAMES);
    expect(s.preciseCitations).toBe(1);
  });
});

describe('scoreAnswer: absent questions (SC-003)', () => {
  it('passes with the plain sentence and no citation', () => {
    expect(scoreAnswer(q({ tag: 'absent' }), "That isn't in the transcript so far.", segments, NAMES).absentOk).toBe(
      true,
    );
  });

  it('fails when it cites a line (an invented answer)', () => {
    const s = scoreAnswer(
      q({ tag: 'absent' }),
      "That isn't in the transcript so far, but see [00:12].",
      segments,
      NAMES,
    );
    expect(s.absentOk).toBe(false);
    expect(s.invented).toBe(true);
  });

  it('fails without the not-in-transcript phrase', () => {
    expect(scoreAnswer(q({ tag: 'absent' }), 'The budget is 40,000 euros.', segments, NAMES).absentOk).toBe(false);
  });

  it('recognises the phrase family in English and Greek', () => {
    expect(saysNotInTranscript('The transcript does not say.')).toBe(true);
    expect(saysNotInTranscript('This is not in the transcript.')).toBe(true);
    expect(saysNotInTranscript('Αυτό δεν αναφέρεται στη μεταγραφή μέχρι στιγμής.')).toBe(true);
    expect(saysNotInTranscript('Δεν υπάρχει στην απομαγνητοφώνηση.')).toBe(true);
    expect(saysNotInTranscript('Pricing stays the same.')).toBe(false);
  });

  it('is not scored for other tags', () => {
    expect(scoreAnswer(q({ tag: 'supported', supports: ['00:12'] }), 'x [00:12]', segments, NAMES).absentOk).toBeNull();
  });
});

describe('answer language by script (SC-005)', () => {
  it('reads Greek and English answers, ignoring citations and quoted English', () => {
    expect(answerLanguage('Η τιμολόγηση μένει ίδια μέχρι τον Ιανουάριο [00:12].')).toBe('el');
    expect(answerLanguage('Η Jane είπε "Pricing stays at the current tier until January" [00:12].')).toBe('el');
    expect(answerLanguage('Pricing stays the same [00:12].')).toBe('en');
  });

  it('scores the match against the question language', () => {
    expect(
      scoreAnswer(q({ tag: 'supported', lang: 'el', supports: ['00:12'] }), 'Pricing stays [00:12].', segments, NAMES)
        .languageOk,
    ).toBe(false);
  });
});

describe('scoreAnswer: "Others" lines', () => {
  const question = q({ tag: 'others-attribution', supports: ['01:42'], othersTimes: ['01:42'] });

  it('fails when a sentence citing an "Others" line names a person', () => {
    expect(scoreAnswer(question, 'Jane asked for the spreadsheet [01:42].', segments, NAMES).othersOk).toBe(false);
  });

  it('passes when it says the speaker was not identified', () => {
    expect(
      scoreAnswer(question, 'Someone (not identified) asked for the spreadsheet [01:42].', segments, NAMES).othersOk,
    ).toBe(true);
  });
});

// T089 (real call 2026-10-09): term questions must get a cited mention plus uncited background (failure A); facts
// known only from the chat itself must carry no citation (failure B). Eval questions may carry earlier turns.
describe('scoreAnswer: background for a term (FR-007)', () => {
  const question = q({ tag: 'background', supports: ['07:30'] });

  it('passes with the mention cited and an uncited "Background:" part', () => {
    const answer =
      'John said the security review moved to next sprint [07:30].\n\nBackground: a security review checks a release for risks.';
    expect(scoreAnswer(question, answer, segments, NAMES).backgroundOk).toBe(true);
  });

  it('fails with only "That isn\'t in the transcript so far."', () => {
    expect(scoreAnswer(question, "That isn't in the transcript so far.", segments, NAMES).backgroundOk).toBe(false);
  });

  it('fails without background, or with a cited background', () => {
    expect(scoreAnswer(question, 'It came up [07:30].', segments, NAMES).backgroundOk).toBe(false);
    expect(
      scoreAnswer(question, 'It came up [07:30]. Background: a check [07:30].', segments, NAMES).backgroundOk,
    ).toBe(false);
  });

  it('reads the label in English and Greek', () => {
    expect(hasUncitedBackground('x [07:30]. Background: y.')).toBe(true);
    expect(hasUncitedBackground('x [07:30].\nΥπόβαθρο: y.')).toBe(true);
    expect(hasUncitedBackground('x [07:30].')).toBe(false);
  });

  it('is not scored for other tags', () => {
    expect(
      scoreAnswer(q({ tag: 'supported', supports: ['00:12'] }), 'x [00:12]', segments, NAMES).backgroundOk,
    ).toBeNull();
  });
});

describe('scoreAnswer: facts from the chat itself (SC-002)', () => {
  const question = q({ tag: 'conversation' });

  it('passes with no citation', () => {
    expect(scoreAnswer(question, 'You asked me to say "QZVRT".', segments, NAMES).conversationOk).toBe(true);
  });

  it('fails with any citation, matched or not', () => {
    expect(scoreAnswer(question, 'The term was "QZVRT." [01:42]', segments, NAMES).conversationOk).toBe(false);
    expect(scoreAnswer(question, 'The term was QZVRT [59:59].', segments, NAMES).conversationOk).toBe(false);
  });

  // Real call 2026-10-10, failure 2: an uncited refusal passed the old check.
  it('fails without the expected word, so a refusal is no longer a pass', () => {
    const withWord = q({ tag: 'conversation', expect: 'QZVRT' });
    expect(scoreAnswer(withWord, "That isn't in the transcript so far.", segments, NAMES).conversationOk).toBe(false);
    expect(scoreAnswer(withWord, 'You asked me to say “qzvrt”.', segments, NAMES).conversationOk).toBe(true);
  });

  it('every conversation question in the evaluation set names the word it expects', () => {
    for (const file of readdirSync(EVAL_DIR).filter((f) => f.endsWith('.json')))
      for (const x of (JSON.parse(readFileSync(join(EVAL_DIR, file), 'utf8')) as { questions: EvalQuestion[] })
        .questions)
        if (x.tag === 'conversation') expect(x.expect, `${file} ${x.id}`).toBeTruthy();
  });
});

// Full run 2026-10-10: "How much is the launch budget in euros?" was answered "the launch budget was approved, but no
// amount was given [02:00]": a correct partial answer, scored as invented. `related` lines may be cited for what was
// said around the missing fact; the denial may say the fact was not mentioned instead of naming the transcript.
describe('scoreAnswer: absent questions with related lines', () => {
  const question = q({ tag: 'absent', related: ['02:00'] });

  it('passes when it cites only related lines and says the asked fact was not given', () => {
    const answer = 'The launch budget was approved, but the meeting doesn’t give an amount. [02:00]';
    const s = scoreAnswer(question, answer, segments, NAMES);
    expect(s.absentOk).toBe(true);
    expect(s.invented).toBe(false);
  });

  it('still fails when it cites a line outside the related ones', () => {
    const s = scoreAnswer(question, 'No amount was mentioned. [00:12]', segments, NAMES);
    expect(s.absentOk).toBe(false);
    expect(s.invented).toBe(true);
  });

  it('recognises "not mentioned / not given / not said" in English and Greek', () => {
    expect(deniesItWasSaid('No amount was mentioned.')).toBe(true);
    expect(deniesItWasSaid('It doesn’t give an amount.')).toBe(true);
    expect(deniesItWasSaid('Nobody said what it costs.')).toBe(true);
    expect(deniesItWasSaid('Ο προϋπολογισμός εγκρίθηκε, αλλά δεν αναφέρθηκε το ποσό.')).toBe(true);
    expect(deniesItWasSaid('Το είπε η Τζέιν.')).toBe(false);
    expect(deniesItWasSaid('The budget is 40,000 euros.')).toBe(false);
  });
});

describe('evalRequest: earlier turns are replayed as the app does (append-only)', () => {
  const meeting = readChatMeeting('standup-en');
  const set = { name: 'standup-en', ...meeting, names: NAMES, questions: [] };

  it('without earlier turns: one user turn with the whole transcript', () => {
    const r = evalRequest(set, q({ tag: 'supported', question: 'What about pricing?' }), 'gpt-6-luna');
    expect(r.model).toBe('gpt-6-luna');
    expect(r.turns).toHaveLength(1);
    expect(r.turns[0]).toMatchObject({ role: 'user', question: 'Question: What about pricing?' });
    expect((r.turns[0] as { context: string }).context.startsWith(FIRST_BLOCK_HEADER('Alex'))).toBe(true);
  });

  it('with earlier turns: the first carries the transcript, then each answer, then no new lines', () => {
    const r = evalRequest(
      set,
      q({
        tag: 'conversation',
        question: 'What was the word I asked you to say?',
        earlier: [{ question: 'Say exactly "QZVRT" in chat', answer: 'QZVRT' }],
      }),
      'gpt-6-luna',
    );
    expect(r.turns).toHaveLength(3);
    expect((r.turns[0] as { context: string }).context.startsWith(FIRST_BLOCK_HEADER('Alex'))).toBe(true);
    expect(r.turns[0]).toMatchObject({ question: 'Question: Say exactly "QZVRT" in chat' });
    expect(r.turns[1]).toEqual({ role: 'assistant', text: 'QZVRT' });
    expect(r.turns[2]).toEqual({
      role: 'user',
      context: NO_NEW_LINES_HEADER,
      question: 'Question: What was the word I asked you to say?',
    });
  });
});

describe('summarize and renderSummary', () => {
  const rows = [
    {
      id: 'a',
      tag: 'supported' as const,
      lang: 'en' as const,
      citations: 2,
      preciseCitations: 2,
      absentOk: null,
      invented: false,
      languageOk: true,
      othersOk: null,
      backgroundOk: null,
      conversationOk: null,
    },
    {
      id: 'b',
      tag: 'supported' as const,
      lang: 'el' as const,
      citations: 2,
      preciseCitations: 1,
      absentOk: null,
      invented: false,
      languageOk: false,
      othersOk: null,
      backgroundOk: null,
      conversationOk: null,
    },
    {
      id: 'c',
      tag: 'absent' as const,
      lang: 'en' as const,
      citations: 0,
      preciseCitations: 0,
      absentOk: true,
      invented: false,
      languageOk: true,
      othersOk: null,
      backgroundOk: null,
      conversationOk: null,
    },
    {
      id: 'd',
      tag: 'absent' as const,
      lang: 'en' as const,
      citations: 1,
      preciseCitations: 0,
      absentOk: false,
      invented: true,
      languageOk: true,
      othersOk: null,
      backgroundOk: null,
      conversationOk: null,
    },
    {
      id: 'e',
      tag: 'others-attribution' as const,
      lang: 'en' as const,
      citations: 1,
      preciseCitations: 1,
      absentOk: null,
      invented: false,
      languageOk: true,
      othersOk: false,
      backgroundOk: null,
      conversationOk: null,
    },
    {
      id: 'f',
      tag: 'background' as const,
      lang: 'en' as const,
      citations: 0,
      preciseCitations: 0,
      absentOk: null,
      invented: false,
      languageOk: true,
      othersOk: null,
      backgroundOk: false,
      conversationOk: null,
    },
    {
      id: 'g',
      tag: 'conversation' as const,
      lang: 'en' as const,
      citations: 1,
      preciseCitations: 0,
      absentOk: null,
      invented: false,
      languageOk: true,
      othersOk: null,
      backgroundOk: null,
      conversationOk: false,
    },
  ];

  it('computes the SC rates', () => {
    expect(summarize(rows)).toEqual({
      questions: 7,
      citationPrecision: 4 / 6,
      absentDetected: 1 / 2,
      inventedAbsent: 1,
      languageMatch: 6 / 7,
      othersFailures: 1,
      backgroundFailures: 1,
      conversationCited: 1,
      notesFailures: 0,
    });
  });

  it('renders a table with the targets and pass marks', () => {
    const md = renderSummary(summarize(rows), { provider: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(md).toContain('| Citation precision (SC-002) | 66.7% | ≥ 95% | no |');
    expect(md).toContain('| Absent detected (SC-003) | 50.0% | ≥ 95% | no |');
    expect(md).toContain('| Invented answers to absent questions (SC-003) | 1 | 0 | no |');
    expect(md).toContain('| Answer in the question language (SC-005) | 85.7% | 100% | no |');
    expect(md).toContain('| "Others" lines given a name | 1 | 0 | no |');
    expect(md).toContain('| Term questions without a cited mention and uncited background (FR-007) | 1 | 0 | no |');
    expect(md).toContain('| Facts from the chat itself cited or not given (SC-002) | 1 | 0 | no |');
    expect(md).toContain('claude-sonnet-5-5');
  });
});

describe('runner arguments and keys', () => {
  it('reads --provider and --model, defaulting to the provider default model', () => {
    expect(parseEvalArgs(['--provider', 'anthropic'])).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(parseEvalArgs(['--provider', 'openai', '--model', 'gpt-6.1-sol'])).toEqual({
      provider: 'openai',
      model: 'gpt-6.1-sol',
    });
    expect(parseEvalArgs([])).toEqual({ provider: 'openai', model: 'gpt-6-luna' });
  });

  it('rejects an unknown provider or a model of another provider', () => {
    expect(() => parseEvalArgs(['--provider', 'gemini'])).toThrow(/anthropic or openai/);
    expect(() => parseEvalArgs(['--provider', 'anthropic', '--model', 'gpt-6-luna'])).toThrow(/not an anthropic model/);
  });

  it('takes the key from the shell only, and never echoes it', () => {
    expect(requireChatKey('anthropic', { ANTHROPIC_API_KEY: ' key-a ' })).toBe('key-a');
    expect(requireChatKey('openai', { OPENAI_API_KEY: 'key-o' })).toBe('key-o');
    expect(() => requireChatKey('openai', { ANTHROPIC_API_KEY: 'key-a' })).toThrow(/OPENAI_API_KEY is not set/);
  });
});
