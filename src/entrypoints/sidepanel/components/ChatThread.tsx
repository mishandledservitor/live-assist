// The conversation strip between the transcript and the question box (003 FR-001, design decision 38,
// contracts/ask-ui.md): every question and answer of the meeting shown, opening on the latest; it can be collapsed to
// the latest question on one line.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { chatErrorText, CUT_OFF_TEXT, WAITING_FOR_ANSWER } from '../../../core/chat/messages';
import { modelLabel } from '../../../core/chat/models';
import { awaitsFirstText, type ChatTurnView } from '../../../core/chat/turn';
import type { TranscriptSegment } from '../../../core/transcript/model';
import { AnswerText } from './AnswerText';

function Turn({
  turn,
  segments,
  onCite,
  onRetry,
  hasNotes,
}: {
  turn: ChatTurnView;
  segments: readonly TranscriptSegment[];
  onCite: (segmentId: string) => void;
  onRetry: (question: string) => void;
  hasNotes: boolean;
}) {
  const questionId = useId();
  const retry = (
    <button type="button" className="link-button" onClick={() => onRetry(turn.question)}>
      Try again
    </button>
  );
  return (
    <li className="chat-turn">
      <p id={questionId} className="chat-question">
        {turn.question}
      </p>
      <article className="chat-answer" aria-labelledby={questionId} aria-busy={turn.status === 'streaming'}>
        {turn.status === 'failed' ? (
          <div role="alert" className="chat-error">
            <p>{chatErrorText(turn.error ?? 'unknown', turn.provider, turn.requestedModel, { hasNotes })}</p>
            {retry}
          </div>
        ) : awaitsFirstText(turn) ? (
          // FR-003a: a state, not a sentence. One text line high, so the first words take its place and nothing moves.
          <div className="chat-pending" role="img" aria-label={WAITING_FOR_ANSWER}>
            <span />
            <span />
            <span />
          </div>
        ) : (
          <AnswerText text={turn.answer} segments={segments} onCite={onCite} />
        )}
        {turn.status === 'stopped' && <p className="chat-meta">Stopped</p>}
        {turn.status === 'cut-off' && (
          <p className="chat-meta">
            {CUT_OFF_TEXT} {retry}
          </p>
        )}
        {(turn.status === 'complete' || turn.status === 'cut-off') && (
          <p className="chat-meta chat-model">{modelLabel(turn.answeredBy ?? turn.requestedModel)}</p>
        )}
      </article>
    </li>
  );
}

export function ChatThread({
  turns,
  waiting,
  segments,
  onCite,
  onRetry,
  hasNotes = false,
}: {
  turns: readonly ChatTurnView[];
  waiting: string | null;
  segments: readonly TranscriptSegment[];
  onCite: (segmentId: string) => void;
  onRetry: (question: string) => void;
  /** 008: the meeting has notes, so a too-large answer names them. */
  hasNotes?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const list = useRef<HTMLOListElement>(null);
  const count = turns.length + (waiting === null ? 0 : 1);
  const last = turns.at(-1);

  // Opens on the latest exchange, and follows a new one.
  useLayoutEffect(() => {
    if (open) list.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  }, [open, count, last?.id]);

  if (count === 0) return null;
  const latestQuestion = waiting ?? last?.question ?? '';

  return (
    <section className="chat-thread" aria-label="Questions and answers">
      <button type="button" className="chat-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide answers' : 'Show answers'}
      </button>
      {open ? (
        <ol ref={list} className="chat-turns">
          {turns.map((t) => (
            <Turn key={t.id} turn={t} segments={segments} onCite={onCite} onRetry={onRetry} hasNotes={hasNotes} />
          ))}
          {waiting !== null && (
            <li className="chat-turn chat-waiting">
              <p className="chat-question">{waiting}</p>
              <p className="chat-meta">Waiting…</p>
            </li>
          )}
        </ol>
      ) : (
        <p className="chat-collapsed">{latestQuestion}</p>
      )}
    </section>
  );
}
