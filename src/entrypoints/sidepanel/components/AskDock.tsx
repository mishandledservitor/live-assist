// The question box pinned under the transcript (003 FR-001, design decision 38, contracts/ask-ui.md). The model
// label after the box is the AI disclosure; a notice appears only when a question cannot be asked.
import type { KeyboardEvent, ReactNode } from 'react';
import { missingKeyText, NOTHING_TRANSCRIBED } from '../../../core/chat/messages';
import { modelLabel } from '../../../core/chat/models';
import type { ChatKeyHintsReply, ChatRejectKind } from '../../../core/messaging/protocol';
import type { ChatSettings } from '../../../core/settings/schema';

export function AskDock({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  hasMeeting,
  keyHints,
  chat,
  notice,
  notes,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Gets the trimmed question. */
  onSend: (question: string) => void;
  onStop: () => void;
  streaming: boolean;
  hasMeeting: boolean;
  keyHints: ChatKeyHintsReply;
  chat: ChatSettings;
  notice: ChatRejectKind | null;
  /** 008: the meeting's notes control, on the line under the box beside the model label. */
  notes?: ReactNode;
}) {
  const hasKey = keyHints[chat.provider] !== null;
  const question = value.trim();
  const canSend = question !== '' && hasKey && hasMeeting;

  const send = () => {
    if (canSend) onSend(question);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  let message: string | null = null;
  if (!hasKey) message = missingKeyText(chat.provider, keyHints);
  else if (notice === 'empty-transcript') message = NOTHING_TRANSCRIBED;

  return (
    <div className="ask-dock">
      {message !== null && <p className="ask-notice">{message}</p>}
      <div className="ask-row">
        <textarea
          className="ask-input"
          aria-label="Question"
          placeholder="Ask about this meeting"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {streaming ? (
          <button type="button" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="button" className="primary" disabled={!canSend} onClick={send}>
            Ask
          </button>
        )}
      </div>
      <div className="ask-meta">
        {notes}
        <p className="ask-model">{modelLabel(chat.models[chat.provider])}</p>
      </div>
    </div>
  );
}
