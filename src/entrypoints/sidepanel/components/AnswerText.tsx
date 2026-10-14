// An answer's text (003 contracts/ask-ui.md "Turn rendering"). Plain text with its line breaks; a bracketed time that
// matches a transcript line is a button that goes to it, anything else stays text. Nothing is rendered as markup.
import { useMemo } from 'react';
import { parseAnswer } from '../../../core/chat/citations';
import type { TranscriptSegment } from '../../../core/transcript/model';

export function AnswerText({
  text,
  segments,
  onCite,
}: {
  text: string;
  segments: readonly TranscriptSegment[];
  onCite: (segmentId: string) => void;
}) {
  const parts = useMemo(() => parseAnswer(text, segments), [text, segments]);
  return (
    <div className="answer-text">
      {parts.map((part, i) =>
        part.kind === 'citation' ? (
          <button
            // Position is the identity here: the same time may be cited twice.
            key={i}
            type="button"
            className="citation"
            aria-label={`Go to ${part.label} in the transcript`}
            onClick={() => onCite(part.segmentId)}
          >
            [{part.label}]
          </button>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </div>
  );
}
