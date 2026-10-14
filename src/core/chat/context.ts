// What a question sends (003 research R5, data-model "Context build"). Pure. The conversation is append-only: each
// question carries the transcript lines not yet sent in this meeting's chat plus lines whose rendering changed since
// (a late caption name, a rename), so earlier turns are replayed byte-for-byte and the prompt cache keeps hitting.
import { displayLabel } from '../transcript/labels';
import { formatOffset, type Meeting, type TranscriptSegment } from '../transcript/model';
import { sortSegments } from '../transcript/ordering';
import { MAX_OUTPUT_TOKENS, type ChatModel } from './models';
import { replayNotes, type MeetingContextRecord } from './notes';
import { FIRST_BLOCK_HEADER, GROUNDING_PROMPT, LATER_BLOCK_HEADER, NO_NEW_LINES_HEADER } from './prompt';
import type { ChatRequest } from './provider';
import { replayable, type ChatTurn } from './turn';

export interface BuiltContext {
  /** Header + new or changed lines, exactly as sent and later replayed. */
  contextBlock: string;
  /** Segment id → rendered line, for the lines this block holds. */
  sentLines: Record<string, string>;
  /** The last finished line's endMs. */
  transcriptUntilMs: number;
}

/** How every line without a confirmed speaker is sent: a guess or a pending name is never presented as one (FR-002a). */
export const UNIDENTIFIED = 'Others';

/** `[time] Label: text`, text on one line; only a confirmed label is sent as a name. */
export function renderLine(segment: TranscriptSegment, meeting: Pick<Meeting, 'speakerRenames'>): string {
  const shown = displayLabel(segment, meeting);
  const label = shown.confirmed ? shown.text : UNIDENTIFIED;
  const text = segment.text.replace(/\s*[\r\n]+\s*/g, ' ');
  return `[${formatOffset(segment.startMs)}] ${label}: ${text}`;
}

export function buildContext(
  meeting: Pick<Meeting, 'userName' | 'speakerRenames'>,
  segments: readonly TranscriptSegment[],
  earlier: readonly ChatTurn[],
): BuiltContext {
  const answered = earlier.filter(replayable);
  const known: Record<string, string> = {};
  for (const turn of answered) Object.assign(known, turn.sentLines);

  const ordered = sortSegments(segments);
  const sentLines: Record<string, string> = {};
  const lines: string[] = [];
  for (const segment of ordered) {
    const line = renderLine(segment, meeting);
    if (known[segment.id] === line) continue;
    sentLines[segment.id] = line;
    lines.push(line);
  }

  const header =
    answered.length === 0
      ? FIRST_BLOCK_HEADER(meeting.userName)
      : lines.length === 0
        ? NO_NEW_LINES_HEADER
        : LATER_BLOCK_HEADER;
  return {
    contextBlock: [header, ...lines].join('\n'),
    sentLines,
    transcriptUntilMs: ordered.reduce((max, s) => Math.max(max, s.endMs), 0),
  };
}

export function buildRequest(input: {
  model: string;
  /** This meeting's earlier turns; only answered ones are replayed. */
  earlier: readonly ChatTurn[];
  context: string;
  question: string;
  /** 008: the meeting's current notes record, so earlier turns replay their notes block while it still applies. */
  notes?: MeetingContextRecord | undefined;
  /** 008: the notes block the new question carries (buildNotes), if any. */
  newNotes?: string | undefined;
}): ChatRequest {
  const turns: ChatRequest['turns'] = [];
  const user = (notes: string | undefined, context: string, question: string): ChatRequest['turns'][number] =>
    notes === undefined
      ? { role: 'user', context, question: `Question: ${question}` }
      : { role: 'user', notes, context, question: `Question: ${question}` };
  for (const turn of input.earlier.filter(replayable)) {
    turns.push(user(replayNotes(turn, input.notes), turn.contextBlock, turn.question));
    turns.push({ role: 'assistant', text: turn.answer });
  }
  turns.push(user(input.newNotes, input.context, input.question));
  return { model: input.model, system: GROUNDING_PROMPT, turns, maxOutputTokens: MAX_OUTPUT_TOKENS };
}

/** A deliberate over-estimate (research R8): Greek and mixed text tokenise denser than English. */
export function estimateTokens(request: ChatRequest): number {
  let chars = request.system.length;
  for (const t of request.turns)
    chars += t.role === 'user' ? (t.notes?.length ?? 0) + t.context.length + t.question.length : t.text.length;
  return Math.ceil(chars / 2.5);
}

export function fitsBudget(request: ChatRequest, model: Pick<ChatModel, 'maxInputTokens'>): boolean {
  return estimateTokens(request) <= model.maxInputTokens;
}
