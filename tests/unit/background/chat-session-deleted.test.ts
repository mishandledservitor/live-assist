// 012 T027 (FR-018, US2 scenario 9, spec Clarifications D5): a question whose meeting is deleted while it is being
// answered. ChatRepo.putTurn resolves false once the meeting is gone (late-writers.test.ts); the session then stops the
// answer and posts nothing more for the turn.
import { describe, expect, it, vi } from 'vitest';
import type { ChatCredentialSource, ChatProvider } from '@/core/chat/provider';
import type { ChatTurn } from '@/core/chat/turn';
import { createLogger } from '@/core/log';
import type { ChatPortOut } from '@/core/messaging/protocol';
import { DEFAULT_CHAT_SETTINGS } from '@/core/settings/schema';
import { createChatSession, type ChatSessionDeps } from '@/entrypoints/background/chat-session';
import { spokenBy, storedMeeting, storedSegment } from '../../support/stored-meetings';

const meeting = storedMeeting({ id: 'm1' });
const segments = [storedSegment('m1', 0, { ...spokenBy('Jane'), text: 'Pricing stays.' })];
const ASK = { type: 'chat/ask', meetingId: 'm1', question: 'What was decided about pricing?' } as const;

/** A provider that yields one piece of text each time the test calls `next()`, and ends early when aborted. */
function gatedProvider() {
  const waiting: (() => void)[] = [];
  let signalSeen: AbortSignal | null = null;
  const stream = vi.fn(async function* (request: { model: string }, signal: AbortSignal) {
    signalSeen = signal;
    yield { type: 'model' as const, model: request.model };
    for (const text of ['Pricing ', 'stays ', '[00:00].']) {
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
        signal.addEventListener('abort', () => resolve());
      });
      if (signal.aborted) return;
      yield { type: 'text' as const, text };
    }
    yield {
      type: 'done' as const,
      finish: 'complete' as const,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  });
  const provider: ChatProvider = { id: 'anthropic', stream, checkKey: () => Promise.resolve({ ok: true }) };
  return { provider, stream, next: () => waiting.shift()?.(), signal: () => signalSeen };
}

function harness(putResults: boolean[]) {
  const posts: ChatPortOut[] = [];
  const pending: (() => void)[] = [];
  const gated = gatedProvider();
  let call = 0;
  const putTurn = vi.fn((_turn: ChatTurn) => Promise.resolve(putResults[call++] ?? true));
  const credentials: ChatCredentialSource = {
    id: 'local-key',
    status: () => Promise.resolve({ configured: true, hint: '1234' }),
    providerFor: () => Promise.resolve(gated.provider),
  };
  const quiet = { error: () => undefined, warn: () => undefined, info: () => undefined };
  const deps: ChatSessionDeps = {
    meetings: { getMeeting: () => Promise.resolve(meeting), listSegments: () => Promise.resolve(segments) },
    chats: {
      listTurns: () => Promise.resolve([]),
      nextSeq: () => Promise.resolve(0),
      markStaleStreaming: () => Promise.resolve([]),
      putTurn,
    },
    chatSettings: () => Promise.resolve({ ...DEFAULT_CHAT_SETTINGS, provider: 'anthropic', setupComplete: true }),
    credentials,
    now: () => 1_000_000,
    logger: createLogger('chat', quiet),
    post: (m) => posts.push(m),
    timers: {
      set: (f) => {
        pending.push(f);
        return pending.length;
      },
      clear: () => undefined,
    },
  };
  const fireTimers = () => {
    for (const f of pending.splice(0)) f();
  };
  return { posts, putTurn, gated, deps, fireTimers };
}

const types = (posts: ChatPortOut[]) => posts.map((p) => p.type);
const deltas = (posts: ChatPortOut[]) => posts.filter((p) => p.type === 'chat/delta');

describe('a question whose meeting was deleted', () => {
  it('is rejected as unknown-meeting when its first write finds no meeting, and nothing is sent to a provider', async () => {
    const h = harness([false]);
    await createChatSession(h.deps).handle(ASK);
    expect(h.posts).toEqual([{ type: 'chat/rejected', kind: 'unknown-meeting' }]);
    expect(h.gated.stream).not.toHaveBeenCalled();
    expect(h.putTurn).toHaveBeenCalledTimes(1);
  });

  it('stops the answer when a later write finds no meeting, and posts and writes nothing more for the turn', async () => {
    const h = harness([true, false]);
    const done = createChatSession(h.deps).handle(ASK);

    await vi.waitFor(() => expect(types(h.posts)).toContain('chat/model'));
    h.gated.next();
    await vi.waitFor(() => expect(deltas(h.posts)).toHaveLength(1));
    expect(h.gated.signal()?.aborted).toBe(false);

    h.fireTimers(); // the periodic write of the streaming answer: the meeting is gone
    await done;

    expect(h.gated.signal()?.aborted).toBe(true);
    expect(h.putTurn).toHaveBeenCalledTimes(2);
    expect(types(h.posts)).toEqual(['chat/turn', 'chat/model', 'chat/delta']);
    expect(types(h.posts)).not.toContain('chat/end');
  });

  it('posts no end when only the final write finds no meeting', async () => {
    const h = harness([true, false]);
    const done = createChatSession(h.deps).handle(ASK);
    await vi.waitFor(() => expect(types(h.posts)).toContain('chat/model'));
    for (let i = 1; i <= 3; i += 1) {
      h.gated.next();
      await vi.waitFor(() => expect(deltas(h.posts)).toHaveLength(i));
    }
    await done;
    expect(h.putTurn).toHaveBeenCalledTimes(2);
    expect(types(h.posts)).not.toContain('chat/end');
  });

  it('can be followed by another question in the same session', async () => {
    const h = harness([false, true, true]);
    const session = createChatSession(h.deps);
    await session.handle(ASK);
    const done = session.handle(ASK);
    await vi.waitFor(() => expect(types(h.posts)).toContain('chat/model'));
    for (let i = 1; i <= 3; i += 1) {
      h.gated.next();
      await vi.waitFor(() => expect(deltas(h.posts)).toHaveLength(i));
    }
    await done;
    expect(types(h.posts)).toEqual([
      'chat/rejected',
      'chat/turn',
      'chat/model',
      'chat/delta',
      'chat/delta',
      'chat/delta',
      'chat/end',
    ]);
  });
});

describe('a question whose meeting stays', () => {
  it('is answered as before: turn, model, deltas, end, with the finished answer stored last', async () => {
    const h = harness([]);
    const done = createChatSession(h.deps).handle(ASK);
    await vi.waitFor(() => expect(types(h.posts)).toContain('chat/model'));
    h.gated.next();
    await vi.waitFor(() => expect(deltas(h.posts)).toHaveLength(1));
    h.fireTimers();
    await vi.waitFor(() => expect(h.putTurn).toHaveBeenCalledTimes(2));
    for (let i = 2; i <= 3; i += 1) {
      h.gated.next();
      await vi.waitFor(() => expect(deltas(h.posts)).toHaveLength(i));
    }
    await done;

    expect(h.gated.signal()?.aborted).toBe(false);
    expect(types(h.posts)).toEqual(['chat/turn', 'chat/model', 'chat/delta', 'chat/delta', 'chat/delta', 'chat/end']);
    expect(h.posts.at(-1)).toEqual({ type: 'chat/end', turnId: 'm1:chat:0', status: 'complete', error: null });
    expect(h.putTurn).toHaveBeenCalledTimes(3);
    expect(h.putTurn.mock.calls[1]?.[0]).toMatchObject({ answer: 'Pricing ', status: 'streaming' });
    expect(h.putTurn.mock.calls[2]?.[0]).toMatchObject({ answer: 'Pricing stays [00:00].', status: 'complete' });
  });
});
