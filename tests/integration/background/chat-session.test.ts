// 003 T030: the service worker's chat session (contracts/chat-messages.md "Service-worker flow for chat/ask") over
// fake-indexeddb, a fake port and a fake ChatCredentialSource returning the scripted fixture provider.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatProvider, ChatProviderId, ChatCredentialSource } from '@/core/chat/provider';
import { turnId, type ChatTurn } from '@/core/chat/turn';
import { createLogger } from '@/core/log';
import type { ChatPortOut } from '@/core/messaging/protocol';
import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from '@/core/settings/schema';
import type { TranscriptSegment } from '@/core/transcript/model';
import { ANSWER_WRITE_MS, createChatSession, type ChatSessionDeps } from '@/entrypoints/background/chat-session';
import { createAnthropicProvider } from '@/providers/chat/anthropic';
import { FIXTURE_ANSWER, createFixtureChatProvider } from '@/providers/chat/fixture-provider';
import { ChatRepo } from '@/storage/chat-repo';
import { openLiveAssistDb, type LiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { fixtureFetch, readChatFixture } from '../../support/chat-fixtures';
import { readChatMeeting } from '../../support/chat-meetings';

const standup = readChatMeeting('standup-en');
const empty = readChatMeeting('empty');
const KEY = 'test-chat-key-never-logged-1234';
const QUESTION = 'What was decided about pricing?';

let n = 0;
let db: LiveAssistDb;
let meetings: MeetingRepo;
let chats: ChatRepo;

beforeEach(async () => {
  n += 1;
  db = await openLiveAssistDb(`chat-session-${n}`);
  meetings = new MeetingRepo(db);
  chats = new ChatRepo(db);
  for (const f of [standup, empty]) {
    await meetings.createMeeting(f.meeting);
    for (const s of f.segments) await meetings.appendSegment(s);
  }
});

interface Harness {
  posts: ChatPortOut[];
  logs: unknown[][];
  providerFor: ReturnType<typeof vi.fn>;
  deps: ChatSessionDeps;
  timers: { pending: (() => void)[]; fire(): void };
}

function harness(
  over: {
    scenario?: string;
    delayMs?: number;
    keys?: ChatProviderId[];
    settings?: Partial<ChatSettings>;
    provider?: ChatProvider;
    now?: () => number;
  } = {},
): Harness {
  const posts: ChatPortOut[] = [];
  const logs: unknown[][] = [];
  const keys = over.keys ?? ['anthropic', 'openai'];
  const providerFor = vi.fn((p: ChatProviderId) =>
    Promise.resolve(
      keys.includes(p)
        ? (over.provider ??
            createFixtureChatProvider({ id: p, scenario: over.scenario ?? 'complete', delayMs: over.delayMs ?? 0 }))
        : null,
    ),
  );
  const credentials: ChatCredentialSource = {
    id: 'local-key',
    status: (p) => Promise.resolve(keys.includes(p) ? { configured: true, hint: '1234' } : { configured: false }),
    providerFor,
  };
  const pending: (() => void)[] = [];
  const timers = {
    pending,
    fire() {
      for (const f of pending.splice(0)) f();
    },
  };
  const sink = {
    error: (...a: unknown[]) => logs.push(a),
    warn: (...a: unknown[]) => logs.push(a),
    info: (...a: unknown[]) => logs.push(a),
  };
  const deps: ChatSessionDeps = {
    meetings,
    chats,
    chatSettings: () =>
      Promise.resolve({ ...DEFAULT_CHAT_SETTINGS, provider: 'anthropic', setupComplete: true, ...over.settings }),
    credentials,
    now: over.now ?? (() => 1_000_000),
    logger: createLogger('chat', sink),
    post: (m) => posts.push(m),
    timers: {
      // Only the answer-write timer is counted here; the first-text limit (FR-018a) has its own tests
      // (tests/unit/background/chat-session-first-text.test.ts).
      set: (f, ms) => {
        if (ms === ANSWER_WRITE_MS) pending.push(f);
        return pending.length;
      },
      clear: () => undefined,
    },
  };
  return { posts, logs, providerFor, deps, timers };
}

const ask = (meetingId = standup.meeting.id, question = QUESTION) => ({
  type: 'chat/ask' as const,
  meetingId,
  question,
});
const types = (posts: ChatPortOut[]) => posts.map((p) => p.type);
const stored = async (): Promise<ChatTurn[]> => chats.listTurns(standup.meeting.id);

/** A provider that yields events only when the test releases them. */
function gatedProvider() {
  const queue: (() => void)[] = [];
  let release: () => void = () => undefined;
  const provider: ChatProvider = {
    id: 'anthropic',
    async *stream(request, signal) {
      yield { type: 'model', model: request.model };
      for (const text of ['Pricing ', 'stays ', '[00:12].']) {
        await new Promise<void>((resolve) => {
          release = resolve;
          signal.addEventListener('abort', () => resolve());
          queue.push(resolve);
        });
        if (signal.aborted) return;
        yield { type: 'text', text };
      }
      yield { type: 'done', finish: 'complete', usage: null };
    },
    checkKey: () => Promise.resolve({ ok: true }),
  };
  return { provider, next: () => release() };
}

describe('createChatSession: happy path', () => {
  it('posts turn, model, deltas and end{complete}, and stores the turn with its context', async () => {
    const h = harness();
    await createChatSession(h.deps).handle(ask());

    expect(types(h.posts)[0]).toBe('chat/turn');
    expect(types(h.posts)[1]).toBe('chat/model');
    expect(types(h.posts).at(-1)).toBe('chat/end');
    const first = h.posts[0] as Extract<ChatPortOut, { type: 'chat/turn' }>;
    expect(first.turn).toMatchObject({ id: turnId(standup.meeting.id, 0), status: 'streaming', question: QUESTION });
    expect(first.turn).not.toHaveProperty('contextBlock');
    expect(first.turn).not.toHaveProperty('sentLines');
    const deltas = h.posts.filter((p) => p.type === 'chat/delta').map((p) => p.text);
    expect(deltas.join('')).toBe(FIXTURE_ANSWER);
    expect(h.posts.at(-1)).toEqual({ type: 'chat/end', turnId: first.turn.id, status: 'complete', error: null });

    const [turn] = await stored();
    expect(turn).toMatchObject({
      seq: 0,
      status: 'complete',
      answer: FIXTURE_ANSWER,
      provider: 'anthropic',
      requestedModel: 'claude-sonnet-5-5',
      answeredBy: 'claude-sonnet-5-5',
      error: null,
    });
    expect(turn!.contextBlock.startsWith('Transcript of the meeting so far. The person asking is Alex.')).toBe(true);
    expect(Object.keys(turn!.sentLines)).toHaveLength(standup.segments.length);
    expect(turn!.transcriptUntilMs).toBe(standup.segments.at(-1)!.endMs);
  });

  it('a follow-up is the next seq and sends only what changed', async () => {
    const h = harness();
    const session = createChatSession(h.deps);
    await session.handle(ask());
    await session.handle(ask(standup.meeting.id, 'And who disagreed?'));
    const turns = await stored();
    expect(turns.map((t) => t.seq)).toEqual([0, 1]);
    expect(turns[1]!.contextBlock).toBe('No new transcript lines since the previous question.');
  });

  it('writes the answer at most once per timer tick while streaming, and once at the end', async () => {
    const gated = gatedProvider();
    const h = harness({ provider: gated.provider });
    const put = vi.spyOn(chats, 'putTurn');
    const done = createChatSession(h.deps).handle(ask());

    await vi.waitFor(() => expect(types(h.posts)).toContain('chat/model'));
    expect(put).toHaveBeenCalledTimes(1); // created
    gated.next();
    await vi.waitFor(() => expect(h.posts.filter((p) => p.type === 'chat/delta')).toHaveLength(1));
    gated.next();
    await vi.waitFor(() => expect(h.posts.filter((p) => p.type === 'chat/delta')).toHaveLength(2));
    expect(put).toHaveBeenCalledTimes(1);
    expect(h.timers.pending).toHaveLength(1);
    h.timers.fire();
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls[1]![0].answer).toBe('Pricing stays ');
    gated.next();
    await done;
    expect(put).toHaveBeenCalledTimes(3);
    expect(put.mock.calls[2]![0]).toMatchObject({ answer: 'Pricing stays [00:12].', status: 'complete' });
  });
});

describe('createChatSession: current settings at ask time (US3, T066)', () => {
  it('sends each question to the provider and model selected when it is asked, and stores them', async () => {
    const h = harness();
    let current: ChatSettings = { ...DEFAULT_CHAT_SETTINGS, provider: 'anthropic', setupComplete: true };
    h.deps.chatSettings = () => Promise.resolve(current);
    const session = createChatSession(h.deps);
    await session.handle(ask());
    current = { ...current, provider: 'openai', models: { ...current.models, openai: 'gpt-6-astra' } };
    await session.handle(ask(standup.meeting.id, 'And who disagreed?'));

    expect(h.providerFor.mock.calls.map((c: unknown[]) => c[0] as string)).toEqual(['anthropic', 'openai']);
    const turns = await stored();
    expect(turns.map((t) => [t.provider, t.requestedModel])).toEqual([
      ['anthropic', 'claude-sonnet-5-5'],
      ['openai', 'gpt-6-astra'],
    ]);
  });
});

describe('createChatSession: stopping', () => {
  it('chat/stop aborts and stores the partial answer as stopped', async () => {
    const gated = gatedProvider();
    const h = harness({ provider: gated.provider });
    const session = createChatSession(h.deps);
    const done = session.handle(ask());
    await vi.waitFor(() => expect(types(h.posts)).toContain('chat/model'));
    gated.next();
    await vi.waitFor(() => expect(types(h.posts)).toContain('chat/delta'));
    await session.handle({ type: 'chat/stop', turnId: turnId(standup.meeting.id, 0) });
    await done;
    expect(h.posts.at(-1)).toMatchObject({ type: 'chat/end', status: 'stopped', error: null });
    expect((await stored())[0]).toMatchObject({ status: 'stopped', answer: 'Pricing ' });
  });

  it('a port disconnect aborts and stores stopped', async () => {
    const gated = gatedProvider();
    const h = harness({ provider: gated.provider });
    const session = createChatSession(h.deps);
    const done = session.handle(ask());
    await vi.waitFor(() => expect(types(h.posts)).toContain('chat/model'));
    session.disconnect();
    await done;
    expect((await stored())[0]).toMatchObject({ status: 'stopped' });
  });

  it('a second ask while one runs is rejected as busy', async () => {
    const gated = gatedProvider();
    const h = harness({ provider: gated.provider });
    const session = createChatSession(h.deps);
    const done = session.handle(ask());
    await vi.waitFor(() => expect(types(h.posts)).toContain('chat/model'));
    await session.handle(ask(standup.meeting.id, 'Another?'));
    expect(h.posts).toContainEqual({ type: 'chat/rejected', kind: 'busy' });
    session.disconnect();
    await done;
    expect(await stored()).toHaveLength(1);
  });
});

describe('createChatSession: before any request', () => {
  it('no finished line → empty-transcript, no provider call, no turn', async () => {
    const h = harness();
    await createChatSession(h.deps).handle(ask(empty.meeting.id));
    expect(h.posts).toEqual([{ type: 'chat/rejected', kind: 'empty-transcript' }]);
    expect(h.providerFor).not.toHaveBeenCalled();
    expect(await chats.listTurns(empty.meeting.id)).toEqual([]);
  });

  it('unknown meeting → unknown-meeting', async () => {
    const h = harness();
    await createChatSession(h.deps).handle(ask('no-such-meeting'));
    expect(h.posts).toEqual([{ type: 'chat/rejected', kind: 'unknown-meeting' }]);
  });

  it('no key for the selected provider → missing-key, no turn', async () => {
    const h = harness({ keys: ['openai'] });
    await createChatSession(h.deps).handle(ask());
    expect(h.posts).toEqual([{ type: 'chat/rejected', kind: 'missing-key' }]);
    expect(await stored()).toEqual([]);
  });

  it('over the model budget → a failed{too-large} turn and no provider call', async () => {
    const huge: TranscriptSegment = {
      ...standup.segments[0]!,
      id: `${standup.meeting.id}:mixed:999`,
      seq: 999,
      startMs: 1_200_000,
      endMs: 1_201_000,
      text: 'x'.repeat(2_500_000),
    };
    await meetings.appendSegment(huge);
    const provider = createFixtureChatProvider({ id: 'anthropic', scenario: 'complete' });
    const stream = vi.spyOn(provider, 'stream');
    const h = harness({ provider });
    await createChatSession(h.deps).handle(ask());
    expect(types(h.posts)).toEqual(['chat/turn', 'chat/end']);
    expect(h.posts.at(-1)).toMatchObject({ status: 'failed', error: 'too-large' });
    expect(stream).not.toHaveBeenCalled();
    expect((await stored())[0]).toMatchObject({ status: 'failed', error: 'too-large', answer: '' });
  });
});

describe('createChatSession: declines and fallbacks (US2)', () => {
  const anthropic = (fixture: string) =>
    createAnthropicProvider({ key: KEY, fetch: fixtureFetch(readChatFixture('anthropic', fixture)).fetch });

  it('an Anthropic refusal after partial output ends failed{declined} with the partial answer cleared', async () => {
    const h = harness({ provider: anthropic('c03-declined-mid-stream') });
    await createChatSession(h.deps).handle(ask());
    expect(h.posts.at(-1)).toMatchObject({ type: 'chat/end', status: 'failed', error: 'declined' });
    expect((await stored())[0]).toMatchObject({ status: 'failed', error: 'declined', answer: '' });
  });

  it('an Anthropic refusal before any output ends failed{declined}', async () => {
    const h = harness({ provider: anthropic('c03-declined') });
    await createChatSession(h.deps).handle(ask());
    expect((await stored())[0]).toMatchObject({ status: 'failed', error: 'declined', answer: '' });
  });

  it('a decline from the other provider (scripted until the OpenAI adapter, T057) is handled the same way', async () => {
    const h = harness({ scenario: 'declined', settings: { provider: 'openai' } });
    await createChatSession(h.deps).handle(ask());
    expect((await stored())[0]).toMatchObject({ provider: 'openai', status: 'failed', error: 'declined', answer: '' });
  });

  it('a server-side fallback completes, answered by the fallback model', async () => {
    const h = harness({ provider: anthropic('c04-fallback-mid-output') });
    await createChatSession(h.deps).handle(ask());
    expect(h.posts.filter((p) => p.type === 'chat/model').map((p) => p.model)).toEqual([
      'claude-sonnet-5-5',
      'claude-sonnet-5',
    ]);
    expect((await stored())[0]).toMatchObject({
      status: 'complete',
      requestedModel: 'claude-sonnet-5-5',
      answeredBy: 'claude-sonnet-5',
      answer: 'The security review was moved to next sprint [07:30].',
    });
  });
});

describe('createChatSession: failures and housekeeping', () => {
  it('a provider error ends the turn failed with its kind', async () => {
    const h = harness({ scenario: 'rate-limited' });
    await createChatSession(h.deps).handle(ask());
    expect(h.posts.at(-1)).toMatchObject({ type: 'chat/end', status: 'failed', error: 'rate-limited' });
    expect((await stored())[0]).toMatchObject({ status: 'failed', error: 'rate-limited' });
  });

  it('a stale streaming turn is marked stopped on the next ask', async () => {
    const orphan: ChatTurn = {
      id: turnId(standup.meeting.id, 0),
      meetingId: standup.meeting.id,
      seq: 0,
      question: 'Old?',
      askedAt: 1,
      contextBlock: 'x',
      sentLines: {},
      transcriptUntilMs: 0,
      provider: 'anthropic',
      requestedModel: 'claude-sonnet-5-5',
      answeredBy: null,
      answer: 'Partial',
      status: 'streaming',
      error: null,
      updatedAt: 1,
      schemaVersion: 1,
    };
    await chats.putTurn(orphan);
    const h = harness();
    await createChatSession(h.deps).handle(ask());
    const turns = await stored();
    expect(turns[0]).toMatchObject({ status: 'stopped', answer: 'Partial' });
    expect(turns[1]).toMatchObject({ seq: 1, status: 'complete' });
    // The stopped orphan is replayed: the new block holds no lines it already sent ('x' sent none).
    expect(turns[1]!.contextBlock.startsWith('Transcript lines added or changed')).toBe(true);
  });

  it('the logger gets only kind, model, status and usage numbers', async () => {
    const h = harness();
    await createChatSession(h.deps).handle(ask());
    const fail = harness({ scenario: 'overloaded' });
    await createChatSession(fail.deps).handle(ask());
    const logged = JSON.stringify([...h.logs, ...fail.logs]);
    expect(h.logs.length).toBeGreaterThan(0);
    expect(logged).toContain('claude-sonnet-5-5');
    expect(logged).toContain('overloaded');
    expect(logged).not.toContain(QUESTION);
    expect(logged).not.toContain('Pricing');
    for (const s of standup.segments) expect(logged).not.toContain(s.text);
    expect(logged).not.toContain(KEY);
  });

  it('writes no meeting or segment (FR-020)', async () => {
    const before = {
      meeting: await meetings.getMeeting(standup.meeting.id),
      segments: await meetings.listSegments(standup.meeting.id),
    };
    const h = harness();
    await createChatSession(h.deps).handle(ask());
    expect(await meetings.getMeeting(standup.meeting.id)).toEqual(before.meeting);
    expect(await meetings.listSegments(standup.meeting.id)).toEqual(before.segments);
  });
});
