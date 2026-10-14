// Ask on the main view (003 FR-001, design decision 38): the conversation strip, then the question box, under the
// transcript of the meeting shown. The question text lives here so a turned-away question or a retry can come back.
import { useCallback, useState } from 'react';
import { WAITING_FOR_ANSWER } from '../../../core/chat/messages';
import { awaitsFirstText } from '../../../core/chat/turn';
import type { ChatKeyHintsReply } from '../../../core/messaging/protocol';
import type { ChatSettings } from '../../../core/settings/schema';
import type { TranscriptSegment } from '../../../core/transcript/model';
import type { ChatApi } from '../chat-api';
import { useChat } from '../hooks/useChat';
import type { NotesApi } from '../notes-api';
import { AskDock } from './AskDock';
import { ChatThread } from './ChatThread';
import { NotesControl } from './NotesControl';
import './ask.css';

export function AskArea({
  api,
  meetingId,
  segments,
  chat,
  keyHints,
  onCite,
  notesApi,
}: {
  api: ChatApi;
  meetingId: string | null;
  segments: readonly TranscriptSegment[];
  chat: ChatSettings;
  /** From the loaded settings, so a key added or removed in Settings shows here at once. */
  keyHints: ChatKeyHintsReply;
  onCite: (segmentId: string) => void;
  /** 008: the notes of the meeting shown; absent, the Ask area is as in 003. */
  notesApi?: NotesApi | undefined;
}) {
  const [draft, setDraft] = useState('');
  const [hasNotes, setHasNotes] = useState(false);
  // A returned question never replaces something the person has typed since (FR-018a: 45 s is long enough to type).
  const giveBack = useCallback((question: string) => setDraft((d) => (d.trim() === '' ? question : d)), []);
  const state = useChat(api, meetingId, { onReturn: giveBack });
  const awaiting = state.streaming !== null && awaitsFirstText(state.streaming);
  return (
    <div className="ask-area">
      {/* FR-003a: heard once per question. Outside the strip: the answer is aria-busy, which would hold it back, and a
          hidden label inside a scroller would add to its scroll area (006 FR-023). */}
      <p className="sr-only" role="status">
        {awaiting ? WAITING_FOR_ANSWER : ''}
      </p>
      <ChatThread
        turns={state.turns}
        waiting={state.waiting}
        segments={segments}
        onCite={onCite}
        onRetry={setDraft}
        hasNotes={notesApi !== undefined && meetingId !== null && hasNotes}
      />
      <AskDock
        value={draft}
        onChange={setDraft}
        onSend={(question) => {
          setDraft('');
          state.ask(question);
        }}
        onStop={() => state.stop()}
        streaming={state.streaming !== null}
        hasMeeting={meetingId !== null}
        keyHints={keyHints}
        chat={chat}
        notice={state.notice}
        notes={
          notesApi && meetingId !== null ? (
            <NotesControl api={notesApi} target={{ kind: 'meeting', meetingId }} onPresence={setHasNotes} />
          ) : undefined
        }
      />
    </div>
  );
}
