// In-memory ChatApi for side panel tests: records asks and stops, lets a test play the service worker's messages.
import { vi } from 'vitest';
import type { ChatTurnView } from '@/core/chat/turn';
import type { ChatPortOut } from '@/core/messaging/protocol';
import type { ChatApi } from '@/entrypoints/sidepanel/chat-api';

export function chatTurnView(over: Partial<ChatTurnView> & { seq: number; meetingId?: string }): ChatTurnView {
  const meetingId = over.meetingId ?? 'm1';
  return {
    id: `${meetingId}:chat:${over.seq}`,
    meetingId,
    question: `Question ${over.seq}?`,
    askedAt: 1,
    transcriptUntilMs: 1,
    provider: 'anthropic',
    requestedModel: 'claude-sonnet-5-5',
    answeredBy: 'claude-sonnet-5-5',
    answer: `Answer ${over.seq}.`,
    status: 'complete',
    error: null,
    updatedAt: 1,
    schemaVersion: 1,
    ...over,
  };
}

export function fakeChatApi(stored: Record<string, ChatTurnView[]> = {}) {
  const listeners = new Set<{ onMessage: (m: ChatPortOut) => void; onDisconnect?: (() => void) | undefined }>();
  const api = {
    ask: vi.fn((_meetingId: string, _question: string) => undefined),
    stop: vi.fn((_turnId: string) => undefined),
    listTurns: vi.fn((meetingId: string) => Promise.resolve(stored[meetingId] ?? [])),
    subscribe: vi.fn((onMessage: (m: ChatPortOut) => void, onDisconnect?: () => void) => {
      const entry = { onMessage, onDisconnect };
      listeners.add(entry);
      return () => void listeners.delete(entry);
    }),
  } satisfies ChatApi;
  return {
    api,
    emit(message: ChatPortOut) {
      for (const l of listeners) l.onMessage(message);
    },
    drop() {
      for (const l of listeners) l.onDisconnect?.();
    },
    /** Plays a whole answer: turn, model, deltas, end. */
    answer(turn: ChatTurnView, deltas: string[], status: 'complete' | 'stopped' | 'cut-off' = 'complete') {
      this.emit({ type: 'chat/turn', turn: { ...turn, answer: '', status: 'streaming', answeredBy: null } });
      this.emit({ type: 'chat/model', turnId: turn.id, model: turn.requestedModel });
      for (const text of deltas) this.emit({ type: 'chat/delta', turnId: turn.id, text });
      this.emit({ type: 'chat/end', turnId: turn.id, status, error: null });
    },
  };
}
