// What the side panel needs to ask questions (003 contracts/chat-messages.md), behind one interface so components are
// tested with fakes. Questions go to the service worker over the `chat` port; the answer comes back as deltas. The
// panel never holds a chat key; which keys exist comes with the loaded settings (settings-api.ts).
import { MAX_QUESTION_LENGTH, toTurnView, type ChatTurn, type ChatTurnView } from '../../core/chat/turn';
import {
  CHAT_PORT_NAME,
  parseChatPortIn,
  parseChatPortOut,
  type ChatPortIn,
  type ChatPortOut,
} from '../../core/messaging/protocol';
import type { LivePort } from './meeting-api';

export interface ChatApi {
  /** Sends a question about a meeting; an empty or over-long question is not sent. */
  ask(meetingId: string, question: string): void;
  stop(turnId: string): void;
  /** The meeting's stored questions and answers, in asking order. */
  listTurns(meetingId: string): Promise<ChatTurnView[]>;
  /** Service-worker messages, validated; `onDisconnect` when the port drops (the service worker went away). */
  subscribe(onMessage: (message: ChatPortOut) => void, onDisconnect?: () => void): () => void;
}

export interface ChatApiDeps {
  connect(name: string): LivePort;
  repo(): Promise<{ listTurns(meetingId: string): Promise<ChatTurn[]> }>;
}

export function createChatApi(deps: ChatApiDeps): ChatApi {
  let port: LivePort | null = null;
  const listeners = new Set<{ onMessage: (m: ChatPortOut) => void; onDisconnect: (() => void) | undefined }>();

  const open = (): LivePort => {
    if (port) return port;
    const opened = deps.connect(CHAT_PORT_NAME);
    opened.onMessage.addListener((raw) => {
      const message = parseChatPortOut(raw);
      if (!message) return;
      for (const l of listeners) l.onMessage(message);
      // One port per question: the offscreen document receives it too and would keep it open after a restarted
      // service worker let go, so it never outlives its answer.
      if ((message.type === 'chat/end' || message.type === 'chat/rejected') && port === opened) {
        port = null;
        opened.disconnect();
      }
    });
    opened.onDisconnect.addListener(() => {
      if (port === opened) port = null;
      for (const l of listeners) l.onDisconnect?.();
    });
    port = opened;
    return opened;
  };

  const send = (message: ChatPortIn) => {
    const valid = parseChatPortIn(message);
    if (valid) open().postMessage(valid);
  };

  return {
    ask(meetingId, question) {
      if (question.trim().length > MAX_QUESTION_LENGTH) return;
      send({ type: 'chat/ask', meetingId, question });
    },
    stop(turnId) {
      send({ type: 'chat/stop', turnId });
    },
    async listTurns(meetingId) {
      return (await (await deps.repo()).listTurns(meetingId)).map(toTurnView);
    },
    subscribe(onMessage, onDisconnect) {
      const entry = { onMessage, onDisconnect };
      listeners.add(entry);
      return () => void listeners.delete(entry);
    },
  };
}
