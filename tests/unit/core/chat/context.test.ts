// 003 T022: the context builder (data-model "Context build", research R5): append-only transcript blocks that
// restate changed lines, and a deterministic request.
import { describe, expect, it } from 'vitest';
import {
  buildContext,
  buildRequest,
  estimateTokens,
  fitsBudget,
  renderLine,
  type BuiltContext,
} from '@/core/chat/context';
import { CHAT_MODELS, MAX_OUTPUT_TOKENS } from '@/core/chat/models';
import { FIRST_BLOCK_HEADER, GROUNDING_PROMPT, LATER_BLOCK_HEADER, NO_NEW_LINES_HEADER } from '@/core/chat/prompt';
import { turnId, type AnswerStatus, type ChatTurn } from '@/core/chat/turn';
import type { TranscriptSegment } from '@/core/transcript/model';
import { readChatMeeting } from '../../../support/chat-meetings';

const standup = readChatMeeting('standup-en');
const relabel = readChatMeeting('relabel');
const long = readChatMeeting('long-1h20');

function turnFrom(
  built: BuiltContext,
  seq: number,
  over: { status?: AnswerStatus; answer?: string; question?: string } = {},
): ChatTurn {
  return {
    id: turnId('m', seq),
    meetingId: 'm',
    seq,
    question: over.question ?? `Question ${seq}`,
    askedAt: seq,
    contextBlock: built.contextBlock,
    sentLines: built.sentLines,
    transcriptUntilMs: built.transcriptUntilMs,
    provider: 'anthropic',
    requestedModel: 'claude-sonnet-5-5',
    answeredBy: 'claude-sonnet-5-5',
    answer: over.answer ?? `Answer ${seq} [00:12]`,
    status: over.status ?? 'complete',
    error: null,
    updatedAt: seq,
    schemaVersion: 1,
  };
}

describe('renderLine', () => {
  it('is `[mm:ss] Label: text` with the display label', () => {
    expect(renderLine(standup.segments[1]!, standup.meeting)).toBe(
      '[00:12] Jane: Pricing stays at the current tier until January.',
    );
    // Meet's "You" is shown as the user's name.
    expect(renderLine(standup.segments[0]!, standup.meeting)).toBe(
      "[00:03] Alex: Morning everyone, let's start with pricing.",
    );
  });

  it('uses h:mm:ss past one hour', () => {
    expect(renderLine(long.segments[5]!, long.meeting)).toBe(
      '[1:05:12] Jane: After the break: the roadmap for next year.',
    );
  });

  it('collapses newlines inside the text', () => {
    const s: TranscriptSegment = { ...standup.segments[1]!, text: 'Pricing stays\nuntil\r\n January.' };
    expect(renderLine(s, standup.meeting)).toBe('[00:12] Jane: Pricing stays until January.');
  });

  it('applies a rename-everywhere', () => {
    const after = relabel.after!;
    expect(renderLine(after.segments[1]!, after.meeting)).toBe(
      '[00:12] John B.: The build is green since this morning.',
    );
  });
});

describe('renderLine: who said it (US2, FR-002a)', () => {
  it('a fallback line is sent as Others', () => {
    expect(renderLine(standup.segments[4]!, standup.meeting)).toBe(
      '[01:42] Others: Can someone share the spreadsheet?',
    );
  });

  it('any label that is not confirmed is sent as Others, whatever its text', () => {
    const guessed: TranscriptSegment = { ...standup.segments[4]!, speakerLabel: 'Jane', labelSource: 'fallback' };
    expect(renderLine(guessed, standup.meeting)).toBe('[01:42] Others: Can someone share the spreadsheet?');
  });

  it('a line whose name is still pending is sent as Others, not as the placeholder', () => {
    const pending: TranscriptSegment = { ...standup.segments[1]!, labelPending: true };
    expect(renderLine(pending, standup.meeting)).toBe(
      '[00:12] Others: Pricing stays at the current tier until January.',
    );
  });

  it('confirmed labels are sent as shown: a caption name, the user for Meet\'s "You", a manual correction', () => {
    expect(renderLine(standup.segments[1]!, standup.meeting)).toContain('] Jane: ');
    expect(renderLine(standup.segments[0]!, standup.meeting)).toContain('] Alex: ');
    const corrected: TranscriptSegment = { ...standup.segments[4]!, labelOverride: 'Tom' };
    expect(renderLine(corrected, standup.meeting)).toBe('[01:42] Tom: Can someone share the spreadsheet?');
  });
});

describe('buildContext', () => {
  it('first block: the header naming the user, then every finished line in meeting order', () => {
    const shuffled = [...standup.segments].reverse();
    const built = buildContext(standup.meeting, shuffled, []);
    const lines = built.contextBlock.split('\n');
    expect(lines[0]).toBe(FIRST_BLOCK_HEADER(standup.meeting.userName));
    expect(lines[0]).toBe('Transcript of the meeting so far. The person asking is Alex.');
    expect(lines.slice(1)).toEqual(standup.segments.map((s) => renderLine(s, standup.meeting)));
    expect(Object.keys(built.sentLines)).toHaveLength(standup.segments.length);
    expect(built.sentLines[standup.segments[1]!.id]).toBe(
      '[00:12] Jane: Pricing stays at the current tier until January.',
    );
    expect(built.transcriptUntilMs).toBe(standup.segments.at(-1)!.endMs);
  });

  it('a second question sends only the lines added since', () => {
    const first = buildContext(standup.meeting, standup.segments.slice(0, 10), []);
    const second = buildContext(standup.meeting, standup.segments, [turnFrom(first, 0)]);
    const lines = second.contextBlock.split('\n');
    expect(lines[0]).toBe(LATER_BLOCK_HEADER);
    expect(lines.slice(1)).toEqual(standup.segments.slice(10).map((s) => renderLine(s, standup.meeting)));
    expect(Object.keys(second.sentLines)).toEqual(standup.segments.slice(10).map((s) => s.id));
  });

  it('restates lines whose label changed (late caption name, rename-everywhere)', () => {
    const first = buildContext(relabel.meeting, relabel.segments, []);
    const after = relabel.after!;
    const second = buildContext(after.meeting, after.segments, [turnFrom(first, 0)]);
    expect(second.contextBlock.split('\n')).toEqual([
      LATER_BLOCK_HEADER,
      '[00:12] John B.: The build is green since this morning.',
      '[00:20] Jane: The release notes are still missing.',
      '[00:35] John B.: I can write them after lunch.',
    ]);
  });

  it('with nothing new, the block is the no-new-lines header', () => {
    const first = buildContext(standup.meeting, standup.segments, []);
    const second = buildContext(standup.meeting, standup.segments, [turnFrom(first, 0)]);
    expect(second.contextBlock).toBe(NO_NEW_LINES_HEADER);
    expect(second.sentLines).toEqual({});
  });

  it('failed and empty turns do not count as sent', () => {
    const first = buildContext(standup.meeting, standup.segments, []);
    const failed = turnFrom(first, 0, { status: 'failed', answer: '' });
    const empty = turnFrom(first, 1, { status: 'stopped', answer: '  ' });
    const again = buildContext(standup.meeting, standup.segments, [failed, empty]);
    expect(again.contextBlock).toBe(first.contextBlock);
  });
});

describe('buildRequest', () => {
  const first = buildContext(standup.meeting, standup.segments.slice(0, 5), []);
  const second = buildContext(standup.meeting, standup.segments, [turnFrom(first, 0)]);
  const failed = turnFrom(second, 1, { status: 'failed', answer: '' });

  const request = () =>
    buildRequest({
      model: 'claude-sonnet-5-5',
      earlier: [turnFrom(first, 0, { question: 'What about pricing?' }), failed],
      context: second.contextBlock,
      question: 'And who disagreed?',
    });

  it('replays earlier answered turns, then the new {context, question}', () => {
    const r = request();
    expect(r.model).toBe('claude-sonnet-5-5');
    expect(r.system).toBe(GROUNDING_PROMPT);
    expect(r.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
    expect(r.turns).toEqual([
      { role: 'user', context: first.contextBlock, question: 'Question: What about pricing?' },
      { role: 'assistant', text: 'Answer 0 [00:12]' },
      { role: 'user', context: second.contextBlock, question: 'Question: And who disagreed?' },
    ]);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(request())).toBe(JSON.stringify(request()));
  });

  it('estimates tokens as ceil(chars / 2.5) over system and all turns', () => {
    const r = request();
    const chars =
      r.system.length +
      r.turns.reduce((n, t) => n + (t.role === 'user' ? t.context.length + t.question.length : t.text.length), 0);
    expect(estimateTokens(r)).toBe(Math.ceil(chars / 2.5));
  });

  it('fitsBudget compares with the model budget', () => {
    const sonnet = CHAT_MODELS.find((m) => m.id === 'claude-sonnet-5-5')!;
    expect(fitsBudget(request(), sonnet)).toBe(true);
    const huge = { ...request(), system: 'x'.repeat(Math.ceil(sonnet.maxInputTokens * 2.5) + 10) };
    expect(fitsBudget(huge, sonnet)).toBe(false);
  });
});

// 003 T083 (real call 2026-10-09, failure A): a term mentioned at 01:44 and asked about at ~02:12 was answered "not in
// the transcript". These pin that the builder sends such a line; the cause was the prompt (plan.md "Fixes after real
// call"). Synthetic lines.
describe('a line stored before the question is in the context (T083)', () => {
  const base = standup.segments[0]!;
  const line = (
    seq: number,
    startMs: number,
    text: string,
    over: Partial<TranscriptSegment> = {},
  ): TranscriptSegment => ({
    ...base,
    id: `m:mixed:${seq}`,
    seq,
    startMs,
    endMs: startMs + 5_000,
    text,
    ...over,
  });
  const mention = line(10, 104_000, "Let's add a new term to the glossary. HL7 is a good one to add, I guess.");
  const ask = line(11, 117_000, 'So let us ask what HL7 means.');

  it('the first question carries every stored line, the mention included', () => {
    const built = buildContext(standup.meeting, [mention, ask], []);
    expect(built.contextBlock.split('\n')).toEqual([
      FIRST_BLOCK_HEADER('Alex'),
      "[01:44] Alex: Let's add a new term to the glossary. HL7 is a good one to add, I guess.",
      '[01:57] Alex: So let us ask what HL7 means.',
    ]);
  });

  it('a line still waiting for a name is sent as "Others", then restated once named', () => {
    const first = buildContext(standup.meeting, [{ ...mention, labelPending: true }], []);
    expect(first.contextBlock).toContain("[01:44] Others: Let's add a new term");
    const second = buildContext(standup.meeting, [mention, ask], [turnFrom(first, 0)]);
    expect(second.contextBlock.split('\n')).toEqual([
      LATER_BLOCK_HEADER,
      "[01:44] Alex: Let's add a new term to the glossary. HL7 is a good one to add, I guess.",
      '[01:57] Alex: So let us ask what HL7 means.',
    ]);
  });

  it('asking again replays the earlier answer and sends no new lines', () => {
    const first = buildContext(standup.meeting, [mention, ask], []);
    const earlier = [
      turnFrom(first, 0, { question: 'What does HL7 mean?', answer: "That isn't in the transcript so far." }),
    ];
    const again = buildContext(standup.meeting, [mention, ask], earlier);
    expect(again.contextBlock).toBe(NO_NEW_LINES_HEADER);
    const r = buildRequest({
      model: 'gpt-6-luna',
      earlier,
      context: again.contextBlock,
      question: 'What does HL7 mean?',
    });
    expect(r.turns[0]).toMatchObject({ role: 'user', context: first.contextBlock });
    expect(r.turns[1]).toEqual({ role: 'assistant', text: "That isn't in the transcript so far." });
  });
});

// Real call 2026-10-09, failure B: using a fact from the conversation was right, only its citation was wrong. The fix
// is in the prompt and the citation guard; the model keeps getting every earlier question and answer in full.
describe('earlier turns are replayed in full (failure B constraint)', () => {
  it('every answered question and answer goes out verbatim, conversation-only facts included', () => {
    const first = buildContext(standup.meeting, standup.segments, []);
    const t0 = turnFrom(first, 0, { question: 'Say exactly "QZVRT" in chat', answer: 'QZVRT' });
    const second = buildContext(standup.meeting, standup.segments, [t0]);
    const t1 = turnFrom(second, 1, { question: 'What about pricing?', answer: 'It stays until January [00:12].' });
    const third = buildContext(standup.meeting, standup.segments, [t0, t1]);
    const r = buildRequest({
      model: 'gpt-6-luna',
      earlier: [t0, t1],
      context: third.contextBlock,
      question: 'What was the term I asked you to say exactly',
    });
    expect(r.turns).toEqual([
      { role: 'user', context: first.contextBlock, question: 'Question: Say exactly "QZVRT" in chat' },
      { role: 'assistant', text: 'QZVRT' },
      { role: 'user', context: NO_NEW_LINES_HEADER, question: 'Question: What about pricing?' },
      { role: 'assistant', text: 'It stays until January [00:12].' },
      {
        role: 'user',
        context: NO_NEW_LINES_HEADER,
        question: 'Question: What was the term I asked you to say exactly',
      },
    ]);
  });
});
