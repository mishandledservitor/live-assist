// 003 T101 (FR-018a, FR-018b, design decision 80; spec Clarifications 2026-10-13): a question whose answer never
// starts. The session gives up when no answer text has arrived within FIRST_TEXT_LIMIT_MS of handing the request to the
// provider, and the turn ends failed{no-answer}. One outcome per turn: Stop, a closed panel, a deleted meeting or a
// first word each win over the limit, never both. Time is the injected timers and clock; nothing here really waits.
import { describe, expect, it, vi } from 'vitest';
import type { ChatCredentialSource, ChatEvent, ChatProvider, ChatProviderId } from '@/core/chat/provider';
import type { ChatTurn } from '@/core/chat/turn';
import { createLogger } from '@/core/log';
import type { ChatPortOut } from '@/core/messaging/protocol';
import { DEFAULT_CHAT_SETTINGS } from '@/core/settings/schema';
import {
  ANSWER_WRITE_MS,
  FIRST_TEXT_LIMIT_MS,
  createChatSession,
  type ChatSessionDeps,
} from '@/entrypoints/background/chat-session';
import { spokenBy, storedMeeting, storedSegment } from '../../support/stored-meetings';

const meeting = storedMeeting({ id: 'm1' });
const LINE = 'Pricing stays at the current tier.';
const segments = [storedSegment('m1', 0, { ...spokenBy('Jane'), text: LINE })];
const QUESTION = 'What was decided about pricing?';
const ASK = { type: 'chat/ask', meetingId: 'm1', question: QUESTION } as const;
const TURN_ID = 'm1:chat:0';
const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

interface Script {
  /** Yield the model's name first, as both real adapters do once the response starts. */
  model?: boolean;
  /** End the stream when the request is aborted (every real adapter); false: a stream that never notices. */
  honoursAbort?: boolean;
  id?: ChatProviderId;
}

/** A provider that yields one piece of text each time the test calls `next()`, and nothing until then. */
function scripted(script: Script = {}) {
  const { model = true, honoursAbort = true, id = 'openai' } = script;
  const waiting: (() => void)[] = [];
  let signalSeen: AbortSignal | null = null;
  const stream = vi.fn(async function* (request: { model: string }, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    signalSeen = signal;
    if (model) yield { type: 'model', model: request.model };
    for (const text of ['Pricing ', 'stays ', '[00:00].']) {
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
        if (honoursAbort) signal.addEventListener('abort', () => resolve());
      });
      if (honoursAbort && signal.aborted) return;
      yield { type: 'text', text };
    }
    yield { type: 'done', finish: 'complete', usage: USAGE };
  });
  const provider: ChatProvider = { id, stream, checkKey: () => Promise.resolve({ ok: true }) };
  return { provider, stream, next: () => waiting.shift()?.(), signal: () => signalSeen };
}

interface Timer {
  fn: () => void;
  ms: number;
  cleared: boolean;
}

function harness(over: { script?: Script; putResults?: boolean[]; limitMs?: number; provider?: ChatProviderId } = {}) {
  const posts: ChatPortOut[] = [];
  const logs: unknown[][] = [];
  const timers: Timer[] = [];
  const puts: ChatTurn[] = [];
  const clock = { now: 1_000_000 };
  const providers = [scripted({ ...over.script, id: over.provider ?? 'openai' })];
  let asked = 0;
  let call = 0;
  const putTurn = vi.fn((turn: ChatTurn) => {
    const ok = over.putResults?.[call++] ?? true;
    if (ok) puts.push(turn);
    return Promise.resolve(ok);
  });
  const credentials: ChatCredentialSource = {
    id: 'local-key',
    status: () => Promise.resolve({ configured: true, hint: '1234' }),
    providerFor: () => {
      const next = (providers[asked] ??= scripted({ id: over.provider ?? 'openai' }));
      asked += 1;
      return Promise.resolve(next.provider);
    },
  };
  const sink = {
    error: (...a: unknown[]) => logs.push(a),
    warn: (...a: unknown[]) => logs.push(a),
    info: (...a: unknown[]) => logs.push(a),
  };
  const deps: ChatSessionDeps = {
    meetings: { getMeeting: () => Promise.resolve(meeting), listSegments: () => Promise.resolve(segments) },
    chats: {
      listTurns: () => Promise.resolve([]),
      nextSeq: () => Promise.resolve(asked - 1),
      markStaleStreaming: () => Promise.resolve([]),
      putTurn,
    },
    chatSettings: () =>
      Promise.resolve({ ...DEFAULT_CHAT_SETTINGS, provider: over.provider ?? 'openai', setupComplete: true }),
    credentials,
    now: () => clock.now,
    logger: createLogger('chat', sink),
    post: (m) => posts.push(m),
    timers: {
      set: (fn, ms) => {
        const timer = { fn, ms, cleared: false };
        timers.push(timer);
        return timer;
      },
      clear: (handle) => {
        (handle as Timer).cleared = true;
      },
    },
    ...(over.limitMs === undefined ? {} : { firstTextLimitMs: () => Promise.resolve(over.limitMs!) }),
  };
  const limitTimers = () => timers.filter((t) => t.ms !== ANSWER_WRITE_MS);
  return {
    posts,
    logs,
    puts,
    putTurn,
    clock,
    deps,
    first: providers[0]!,
    provider: (i: number) => providers[i]!,
    limitTimers,
    /** The limit elapses. `late`: the callback runs although its timer was cleared (a clear that lost the race). */
    fireLimit(options: { late?: boolean } = {}) {
      for (const t of limitTimers()) if (!t.cleared || options.late) t.fn();
    },
    /** The line logged for the question: the `chat answer` details. */
    logged: () => logs.map((l) => l[1] as Record<string, unknown>),
  };
}

const types = (posts: ChatPortOut[]) => posts.map((p) => p.type);
const ends = (posts: ChatPortOut[]) => posts.filter((p) => p.type === 'chat/end');
const deltas = (posts: ChatPortOut[]) => posts.filter((p) => p.type === 'chat/delta');
const sent = (h: ReturnType<typeof harness>, type: ChatPortOut['type'] = 'chat/model') =>
  vi.waitFor(() => expect(types(h.posts)).toContain(type));
/** Lets everything already resolved run, so "nothing more happened" can be asserted. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe('the limit on the wait for the first answer text', () => {
  it('is 45 seconds, one named constant', () => {
    expect(FIRST_TEXT_LIMIT_MS).toBe(45_000);
  });

  it('starts when the request is handed to the provider, after the turn is stored and shown', async () => {
    const h = harness();
    const done = createChatSession(h.deps).handle(ASK);
    await sent(h);
    expect(h.first.stream).toHaveBeenCalledTimes(1);
    expect(h.limitTimers().map((t) => [t.ms, t.cleared])).toEqual([[FIRST_TEXT_LIMIT_MS, false]]);
    expect(types(h.posts)).toEqual(['chat/turn', 'chat/model']);
    h.fireLimit();
    await done;
  });

  it.each(['openai', 'anthropic'] as const)(
    'no text within the limit (%s): the request is aborted and the turn ends failed{no-answer}',
    async (provider) => {
      const h = harness({ provider });
      const done = createChatSession(h.deps).handle(ASK);
      await sent(h);
      expect(h.first.signal()?.aborted).toBe(false);

      h.fireLimit();
      await done;

      expect(h.first.signal()?.aborted).toBe(true);
      expect(h.posts.at(-1)).toEqual({ type: 'chat/end', turnId: TURN_ID, status: 'failed', error: 'no-answer' });
      expect(ends(h.posts)).toHaveLength(1);
      expect(deltas(h.posts)).toEqual([]);
      expect(h.puts.at(-1)).toMatchObject({ provider, status: 'failed', error: 'no-answer', answer: '' });
    },
  );

  it('the model’s name arriving is not an answer: the clock keeps running', async () => {
    const h = harness();
    const done = createChatSession(h.deps).handle(ASK);
    await sent(h, 'chat/model');
    await settle();
    expect(h.limitTimers()[0]!.cleared).toBe(false);
    h.fireLimit();
    await done;
    expect(h.posts.at(-1)).toMatchObject({ status: 'failed', error: 'no-answer' });
  });

  it('a provider that sends nothing at all ends the same way', async () => {
    const h = harness({ script: { model: false } });
    const done = createChatSession(h.deps).handle(ASK);
    await vi.waitFor(() => expect(h.limitTimers()).toHaveLength(1));
    h.fireLimit();
    await done;
    expect(types(h.posts)).toEqual(['chat/turn', 'chat/end']);
    expect(h.posts.at(-1)).toMatchObject({ status: 'failed', error: 'no-answer' });
  });

  it('uses the limit it is given (the e2e build sets a short one)', async () => {
    const h = harness({ limitMs: 300 });
    const done = createChatSession(h.deps).handle(ASK);
    await sent(h);
    expect(h.limitTimers().map((t) => t.ms)).toEqual([300]);
    h.fireLimit();
    await done;
  });
});

describe('once answer text has started, the limit never cuts the answer', () => {
  it('the first text stops the clock; the answer completes however long it takes', async () => {
    const h = harness();
    const done = createChatSession(h.deps).handle(ASK);
    await sent(h);
    h.first.next();
    await vi.waitFor(() => expect(deltas(h.posts)).toHaveLength(1));
    expect(h.limitTimers()[0]!.cleared).toBe(true);

    h.clock.now += 10 * FIRST_TEXT_LIMIT_MS;
    h.fireLimit({ late: true }); // even a callback that outran its clear changes nothing
    await settle();
    expect(h.first.signal()?.aborted).toBe(false);

    h.first.next();
    await vi.waitFor(() => expect(deltas(h.posts)).toHaveLength(2));
    h.first.next();
    await done;
    expect(h.posts.at(-1)).toEqual({ type: 'chat/end', turnId: TURN_ID, status: 'complete', error: null });
    expect(h.puts.at(-1)).toMatchObject({ status: 'complete', error: null, answer: 'Pricing stays [00:00].' });
    expect(h.limitTimers()).toHaveLength(1);
  });
});

describe('the limit and the first text at the same moment: one outcome', () => {
  it('limit first, then text: no-answer, and the text is discarded', async () => {
    const h = harness();
    const done = createChatSession(h.deps).handle(ASK);
    await sent(h);
    h.fireLimit();
    h.first.next();
    await done;
    await settle();
    expect(ends(h.posts)).toEqual([{ type: 'chat/end', turnId: TURN_ID, status: 'failed', error: 'no-answer' }]);
    expect(deltas(h.posts)).toEqual([]);
    expect(h.puts.at(-1)).toMatchObject({ status: 'failed', error: 'no-answer', answer: '' });
  });

  it('text released, limit fires before it is read: still exactly one outcome', async () => {
    const h = harness();
    const done = createChatSession(h.deps).handle(ASK);
    await sent(h);
    h.first.next();
    h.fireLimit();
    await done;
    await settle();
    expect(ends(h.posts)).toHaveLength(1);
    const end = ends(h.posts)[0]!;
    // Either the text was first (an answer in progress, then stopped by nobody) or the limit was: never a failed turn
    // that also shows answer text.
    if (end.status === 'failed') {
      expect(end.error).toBe('no-answer');
      expect(deltas(h.posts)).toEqual([]);
      expect(h.puts.at(-1)!.answer).toBe('');
    } else {
      expect(deltas(h.posts).length).toBeGreaterThan(0);
    }
  });
});

describe('Stop, a closed panel and a deleted meeting win over the limit', () => {
  it('Stop during the wait ends the turn stopped, with no no-answer then or later', async () => {
    const h = harness();
    const session = createChatSession(h.deps);
    const done = session.handle(ASK);
    await sent(h);
    await session.handle({ type: 'chat/stop', turnId: TURN_ID });
    await done;
    expect(h.posts.at(-1)).toEqual({ type: 'chat/end', turnId: TURN_ID, status: 'stopped', error: null });

    const puts = h.puts.length;
    h.fireLimit({ late: true });
    await settle();
    expect(ends(h.posts)).toHaveLength(1);
    expect(h.puts).toHaveLength(puts);
    expect(h.puts.at(-1)).toMatchObject({ status: 'stopped', error: null, answer: '' });
  });

  it('Stop and the limit in the same moment: stopped', async () => {
    const h = harness();
    const session = createChatSession(h.deps);
    const done = session.handle(ASK);
    await sent(h);
    void session.handle({ type: 'chat/stop', turnId: TURN_ID });
    h.fireLimit({ late: true });
    await done;
    expect(ends(h.posts)).toEqual([{ type: 'chat/end', turnId: TURN_ID, status: 'stopped', error: null }]);
  });

  it('the panel closing during the wait stores the turn stopped and posts nothing', async () => {
    const h = harness();
    const session = createChatSession(h.deps);
    const done = session.handle(ASK);
    await sent(h);
    session.disconnect();
    await done;
    h.fireLimit({ late: true });
    await settle();
    expect(h.puts.at(-1)).toMatchObject({ status: 'stopped', error: null, answer: '' });
    expect(h.puts.some((t) => t.error === 'no-answer')).toBe(false);
    expect(ends(h.posts)).toEqual([]);
  });

  it('the meeting deleted during the wait: nothing more is stored or posted (012 FR-018)', async () => {
    const h = harness({ putResults: [true, false] });
    const done = createChatSession(h.deps).handle(ASK);
    await sent(h);
    h.fireLimit();
    await done;
    expect(h.putTurn).toHaveBeenCalledTimes(2);
    expect(h.puts).toHaveLength(1);
    expect(types(h.posts)).toEqual(['chat/turn', 'chat/model']);
  });
});

describe('a provider that does not notice the abort', () => {
  it('cannot hold the turn open, and text it sends afterwards is neither shown nor stored', async () => {
    const h = harness({ script: { honoursAbort: false } });
    const done = createChatSession(h.deps).handle(ASK);
    await sent(h);
    h.fireLimit();
    await done;
    expect(h.posts.at(-1)).toMatchObject({ type: 'chat/end', status: 'failed', error: 'no-answer' });

    const puts = h.puts.length;
    const posts = h.posts.length;
    h.first.next();
    h.first.next();
    await settle();
    expect(h.posts).toHaveLength(posts);
    expect(h.puts).toHaveLength(puts);
    expect(h.puts.at(-1)!.answer).toBe('');
  });

  it('is still stopped by Stop', async () => {
    const h = harness({ script: { honoursAbort: false } });
    const session = createChatSession(h.deps);
    const done = session.handle(ASK);
    await sent(h);
    await session.handle({ type: 'chat/stop', turnId: TURN_ID });
    await done;
    expect(h.posts.at(-1)).toMatchObject({ type: 'chat/end', status: 'stopped', error: null });
  });
});

describe('after a question that got no answer', () => {
  it('the next question in the same session is asked and answered, with its own clock', async () => {
    const h = harness();
    const session = createChatSession(h.deps);
    const first = session.handle(ASK);
    await sent(h);
    h.fireLimit();
    await first;

    const second = session.handle(ASK);
    await vi.waitFor(() => expect(h.limitTimers()).toHaveLength(2));
    await vi.waitFor(() => expect(types(h.posts).filter((t) => t === 'chat/model')).toHaveLength(2));
    for (let i = 1; i <= 3; i += 1) {
      h.provider(1).next();
      await vi.waitFor(() => expect(deltas(h.posts)).toHaveLength(i));
    }
    await second;
    expect(h.posts.at(-1)).toMatchObject({ type: 'chat/end', turnId: 'm1:chat:1', status: 'complete', error: null });
    expect(h.posts).not.toContainEqual({ type: 'chat/rejected', kind: 'busy' });
  });
});

describe('the log line for a question (FR-018b)', () => {
  const noContent = (h: ReturnType<typeof harness>) => {
    const text = JSON.stringify(h.logs);
    for (const secret of [QUESTION, LINE, 'Pricing ', 'stays ', 'Jane']) expect(text).not.toContain(secret);
  };

  it('no answer: how it ended and how long each step took, no content', async () => {
    const h = harness();
    const done = createChatSession(h.deps).handle(ASK);
    await vi.waitFor(() => expect(h.limitTimers()).toHaveLength(1));
    await sent(h);
    h.clock.now += 45_000;
    h.fireLimit();
    await done;
    expect(h.logged()).toHaveLength(1);
    expect(h.logged()[0]).toMatchObject({
      status: 'failed',
      kind: 'no-answer',
      end: 'no-first-text',
      firstEventMs: 0,
      firstTextMs: null,
      totalMs: 45_000,
      model: 'gpt-6-luna',
    });
    noContent(h);
  });

  it('nothing came back at all: no first event either', async () => {
    const h = harness({ script: { model: false } });
    const done = createChatSession(h.deps).handle(ASK);
    await vi.waitFor(() => expect(h.limitTimers()).toHaveLength(1));
    h.clock.now += 45_000;
    h.fireLimit();
    await done;
    expect(h.logged()[0]).toMatchObject({ end: 'no-first-text', firstEventMs: null, firstTextMs: null });
  });

  it('a complete answer: time to the first text', async () => {
    const h = harness();
    const done = createChatSession(h.deps).handle(ASK);
    await sent(h);
    h.clock.now += 1_200;
    h.first.next();
    await vi.waitFor(() => expect(deltas(h.posts)).toHaveLength(1));
    h.clock.now += 800;
    h.first.next();
    await vi.waitFor(() => expect(deltas(h.posts)).toHaveLength(2));
    h.first.next();
    await done;
    expect(h.logged()[0]).toMatchObject({
      status: 'complete',
      kind: null,
      end: 'done',
      firstEventMs: 0,
      firstTextMs: 1_200,
      totalMs: 2_000,
    });
    noContent(h);
  });

  it('Stop during the wait', async () => {
    const h = harness();
    const session = createChatSession(h.deps);
    const done = session.handle(ASK);
    await sent(h);
    h.clock.now += 7_000;
    await session.handle({ type: 'chat/stop', turnId: TURN_ID });
    await done;
    expect(h.logged()[0]).toMatchObject({ status: 'stopped', end: 'stopped', firstTextMs: null, totalMs: 7_000 });
  });

  it('the panel closed during the wait', async () => {
    const h = harness();
    const session = createChatSession(h.deps);
    const done = session.handle(ASK);
    await sent(h);
    session.disconnect();
    await done;
    expect(h.logged()[0]).toMatchObject({ status: 'stopped', end: 'panel-closed', firstTextMs: null });
  });

  it('a provider error', async () => {
    const h = harness();
    h.first.stream.mockImplementationOnce(async function* () {
      await Promise.resolve();
      yield* [];
      const { ChatError } = await import('@/core/chat/provider');
      throw new ChatError('overloaded');
    });
    await createChatSession(h.deps).handle(ASK);
    expect(h.logged()[0]).toMatchObject({
      status: 'failed',
      kind: 'overloaded',
      end: 'error',
      firstEventMs: null,
      firstTextMs: null,
    });
    expect(h.limitTimers()[0]!.cleared).toBe(true);
  });
});
