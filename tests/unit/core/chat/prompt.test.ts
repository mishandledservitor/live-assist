// 003 T024: the fixed grounding prompt (research R7) and the transcript block headers (data-model "Context build").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIRST_BLOCK_HEADER, GROUNDING_PROMPT, LATER_BLOCK_HEADER, NO_NEW_LINES_HEADER } from '@/core/chat/prompt';

describe('GROUNDING_PROMPT (research R7)', () => {
  it('rule 1: answers only from the transcript, given as `[time] Speaker: text` lines, mm:ss or h:mm:ss', () => {
    expect(GROUNDING_PROMPT).toContain('using only its transcript');
    expect(GROUNDING_PROMPT).toContain('[time] Speaker: text');
    expect(GROUNDING_PROMPT).toContain('mm:ss');
    expect(GROUNDING_PROMPT).toContain('h:mm:ss');
  });

  it('rule 2: a line restated later with the same time replaces the earlier version', () => {
    expect(GROUNDING_PROMPT).toMatch(/given again later with the same time.*replaces the earlier version/s);
  });

  it('rule 4: cite every statement with the line time in square brackets, with both examples', () => {
    expect(GROUNDING_PROMPT).toContain('[12:40]');
    expect(GROUNDING_PROMPT).toContain('[1:05:12]');
    expect(GROUNDING_PROMPT).toContain('[12:40] [13:05]');
    expect(GROUNDING_PROMPT).toContain('Never cite a time that is not at the start of a line.');
  });

  it('rule 8 (US4, FR-008): answer in the language of the question, quote lines in their original language', () => {
    expect(GROUNDING_PROMPT).toContain(
      'Write in the language of the question, even if the transcript is in another language.',
    );
    expect(GROUNDING_PROMPT).toContain('Quote transcript lines in their original language.');
  });

  it('rule 9: plain text only, brief', () => {
    expect(GROUNDING_PROMPT).toContain('Plain text only');
    expect(GROUNDING_PROMPT).toContain('No headings, bold, tables or code blocks.');
  });

  it('rule 3 (US2, FR-002a): "Others" is unidentified, may include the person asking, never attributed to a name', () => {
    expect(GROUNDING_PROMPT).toContain('"Others" means a speaker who was not identified');
    expect(GROUNDING_PROMPT).toContain('including the person asking');
    expect(GROUNDING_PROMPT).toContain('Never say an "Others" line was said by a named person');
    expect(GROUNDING_PROMPT).toContain('someone (not identified) said');
    expect(GROUNDING_PROMPT).toContain('The person asking is named in the first transcript block.');
  });

  it('rule 6 (US2, FR-006): say plainly when it is not in the transcript, flag the uncovered part, never guess', () => {
    expect(GROUNDING_PROMPT).toContain("That isn't in the transcript so far.");
    expect(GROUNDING_PROMPT).toContain(
      'If only part is covered, answer that part and say which part is not in the transcript.',
    );
    expect(GROUNDING_PROMPT).toContain('Never guess or fill gaps from general knowledge');
  });

  it('rule 7 (US2, FR-007): background explanations start with "Background:" and carry no citation', () => {
    expect(GROUNDING_PROMPT).toContain('starting with "Background:"');
    expect(GROUNDING_PROMPT).toContain('give it no citation');
  });

  // T084 (real call 2026-10-09, failure A): "What does X mean?" was answered "That isn't in the transcript so far.".
  it('rule 7: asked what a term from the meeting means, cite where it came up and explain it as background', () => {
    expect(GROUNDING_PROMPT).toContain('When asked what a term or concept that came up in the meeting means');
    expect(GROUNDING_PROMPT).toContain('cite the line or lines where it came up');
    expect(GROUNDING_PROMPT).toMatch(/Do not answer such a question with "That isn't in the transcript so far\."/);
    expect(GROUNDING_PROMPT).toContain('even if no one in the meeting explained it');
  });

  it('rule 6 names the exception for terms, so it no longer overrides rule 7', () => {
    const rule6 = GROUNDING_PROMPT.split('\n\n').find((r) => r.startsWith('If the transcript does not contain'))!;
    expect(rule6).toContain('This does not apply to what a term or concept that came up in the meeting means');
  });

  it('an earlier "not in the transcript" answer is checked again, not repeated', () => {
    expect(GROUNDING_PROMPT).toContain(
      'If an earlier answer said something is not in the transcript, check all the transcript lines again before repeating it.',
    );
  });

  // T085 (real call 2026-10-09, failure B): a word from an earlier question was cited to an unrelated line.
  it('rule 4 and 5: the conversation is not the transcript; what is known only from it carries no citation', () => {
    expect(GROUNDING_PROMPT).toContain('The earlier questions and answers of this chat are not the transcript.');
    expect(GROUNDING_PROMPT).toContain(
      'Something known only from them, such as what the person asked you earlier, gets no citation.',
    );
    expect(GROUNDING_PROMPT).toContain('Cite a line only if that line itself says what the statement claims.');
  });

  it('is a constant: no interpolation, nothing per meeting or per request', () => {
    const source = readFileSync(join(import.meta.dirname, '../../../../src/core/chat/prompt.ts'), 'utf8');
    const declaration = source.slice(source.indexOf('export const GROUNDING_PROMPT'));
    const body = declaration.slice(0, declaration.indexOf(';\n'));
    expect(body).not.toContain('${');
    expect(GROUNDING_PROMPT).not.toMatch(/Alex|\d{4}-\d{2}-\d{2}/);
  });
});

describe('block headers', () => {
  it('equal the data-model strings', () => {
    expect(FIRST_BLOCK_HEADER('Jane')).toBe('Transcript of the meeting so far. The person asking is Jane.');
    expect(LATER_BLOCK_HEADER).toBe('Transcript lines added or changed since the previous question:');
    expect(NO_NEW_LINES_HEADER).toBe('No new transcript lines since the previous question.');
  });
});

// Real call 2026-10-10, failure 2 (regression from the 2026-10-09 fix): `Say exactly "QZVRT" in chat`, then "What was
// the word I asked you to say?" was answered "That isn't in the transcript so far." The conversation is replayed in
// full; the prompt must say to answer from it.
describe('GROUNDING_PROMPT: questions about the chat itself (real call 2026-10-10)', () => {
  const rules = GROUNDING_PROMPT.split('\n\n');

  it("rule 1 names this chat's earlier questions and answers as a source", () => {
    expect(rules[0]).toContain("this chat's earlier questions and answers");
  });

  it('a question about the chat itself is answered from the earlier questions and answers, uncited, never refused', () => {
    const rule = rules.find((r) => r.startsWith('The earlier questions and answers of this chat'))!;
    expect(rule).toContain(
      'When a question is about this chat itself, such as what the person asked you to say or what you answered before, answer it from the earlier questions and answers.',
    );
    expect(rule).toContain('Never answer such a question with "That isn\'t in the transcript so far."');
  });

  it('the not-in-transcript rule names the chat exception too', () => {
    const rule6 = rules.find((r) => r.startsWith('If the transcript does not contain'))!;
    expect(rule6).toContain('Nor does it apply to a question about this chat itself');
  });
});
