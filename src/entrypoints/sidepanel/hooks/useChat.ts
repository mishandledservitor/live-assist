// The panel's chat state (003 data-model "Panel chat state"): the stored turns of the meeting shown, patched by the
// service worker's messages, at most one waiting question (FR-009, research R15) and a notice for a question that
// was never sent (no turn created).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatTurnView } from '../../../core/chat/turn';
import type { ChatPortOut, ChatRejectKind } from '../../../core/messaging/protocol';
import type { ChatApi } from '../chat-api';

export interface ChatState {
  turns: ChatTurnView[];
  /** The turn whose answer is streaming, if any. */
  streaming: ChatTurnView | null;
  /** A question asked while an answer streams; sent when it ends. */
  waiting: string | null;
  /** Why the last question was not sent. */
  notice: ChatRejectKind | null;
  ask(question: string): void;
  stop(): void;
}

export interface UseChatOptions {
  /** A question the service worker turned away, or one that got no answer (FR-018a), so it can go back into the box. */
  onReturn?: (question: string) => void;
}

/** Everything is held per meeting, so switching meetings shows a clean slate without resetting state in an effect. */
interface MeetingChat {
  meetingId: string | null;
  turns: ChatTurnView[];
  waiting: string | null;
  notice: ChatRejectKind | null;
}

const blank = (meetingId: string | null): MeetingChat => ({ meetingId, turns: [], waiting: null, notice: null });
const bySeq = (a: ChatTurnView, b: ChatTurnView) => a.seq - b.seq;

function apply(turns: ChatTurnView[], message: ChatPortOut, meetingId: string): ChatTurnView[] {
  const patch = (id: string, change: (t: ChatTurnView) => ChatTurnView) =>
    turns.map((t) => (t.id === id ? change(t) : t));
  switch (message.type) {
    case 'chat/turn':
      if (message.turn.meetingId !== meetingId) return turns;
      return [...turns.filter((t) => t.id !== message.turn.id), message.turn].sort(bySeq);
    case 'chat/model':
      return patch(message.turnId, (t) => ({ ...t, answeredBy: message.model }));
    case 'chat/delta':
      return patch(message.turnId, (t) => ({ ...t, answer: t.answer + message.text }));
    case 'chat/end':
      return patch(message.turnId, (t) => ({ ...t, status: message.status, error: message.error }));
    default:
      return turns;
  }
}

export function useChat(api: ChatApi, meetingId: string | null, options: UseChatOptions = {}): ChatState {
  const [data, setData] = useState<MeetingChat>(() => blank(meetingId));
  const view = data.meetingId === meetingId ? data : blank(meetingId);

  /** Updates the chat of `id`, starting it clean when it is not the one held. */
  const update = useCallback((id: string | null, change: (chat: MeetingChat) => MeetingChat) => {
    setData((prev) => change(prev.meetingId === id ? prev : blank(id)));
  }, []);

  // Port callbacks read the latest values through refs, kept current after each render.
  const latest = useRef({ meetingId, waiting: view.waiting, onReturn: options.onReturn });
  const lastAsked = useRef<string | null>(null);
  /** The turn in progress, so its question can be handed back if no answer comes (FR-018a). */
  const inFlight = useRef<{ id: string; question: string } | null>(null);
  useEffect(() => {
    latest.current = { meetingId, waiting: view.waiting, onReturn: options.onReturn };
  });

  useEffect(() => {
    let live = true;
    if (meetingId !== null)
      void api.listTurns(meetingId).then((loaded) => {
        if (!live) return;
        // Turns that arrived over the port while loading are newer than what was read.
        update(meetingId, (chat) => ({
          ...chat,
          turns: [...loaded.filter((t) => !chat.turns.some((p) => p.id === t.id)), ...chat.turns].sort(bySeq),
        }));
      });
    return () => {
      live = false;
    };
  }, [api, meetingId, update]);

  const send = useCallback(
    (question: string) => {
      const id = latest.current.meetingId;
      if (id === null) return;
      lastAsked.current = question;
      update(id, (chat) => ({ ...chat, notice: null, waiting: null }));
      api.ask(id, question);
    },
    [api, update],
  );

  /** The answer in progress ended: send the waiting question, if any. */
  const sendWaiting = useCallback(() => {
    const next = latest.current.waiting;
    if (next === null) return;
    latest.current.waiting = null;
    send(next);
  }, [send]);

  useEffect(
    () =>
      api.subscribe(
        (message) => {
          const id = latest.current.meetingId;
          if (id === null) return;
          if (message.type === 'chat/rejected') {
            update(id, (chat) => ({ ...chat, notice: message.kind }));
            if (lastAsked.current !== null) latest.current.onReturn?.(lastAsked.current);
            lastAsked.current = null;
            return;
          }
          update(id, (chat) => ({ ...chat, turns: apply(chat.turns, message, id) }));
          if (message.type === 'chat/turn') inFlight.current = { id: message.turn.id, question: message.turn.question };
          if (message.type !== 'chat/end') return;
          const ended = inFlight.current?.id === message.turnId ? inFlight.current : null;
          inFlight.current = null;
          // The same way back as a question turned away: one mechanism (design decision 80).
          if (message.error === 'no-answer' && ended) latest.current.onReturn?.(ended.question);
          sendWaiting();
        },
        () => {
          const id = latest.current.meetingId;
          update(id, (chat) => ({
            ...chat,
            turns: chat.turns.map((t) => (t.status === 'streaming' ? { ...t, status: 'stopped' } : t)),
          }));
          sendWaiting();
        },
      ),
    [api, update, sendWaiting],
  );

  const streaming = view.turns.find((t) => t.status === 'streaming') ?? null;

  // 014 FR-008 (research R3): the meeting shown went away (Close, a delete, another meeting) while its answer was still
  // arriving. Nothing keeps running for a meeting no longer on screen: the answer is stopped as its own Stop would.
  const streamingId = useRef<string | null>(null);
  useEffect(() => {
    streamingId.current = streaming?.id ?? null;
  });
  useEffect(
    () => () => {
      const id = streamingId.current;
      streamingId.current = null;
      if (id !== null) api.stop(id);
    },
    [api, meetingId],
  );

  const ask = (question: string) => {
    if (streaming) {
      latest.current.waiting = question;
      update(meetingId, (chat) => ({ ...chat, waiting: question }));
      return;
    }
    send(question);
  };

  const stop = () => {
    if (streaming) api.stop(streaming.id);
  };

  return { turns: view.turns, streaming, waiting: view.waiting, notice: view.notice, ask, stop };
}
