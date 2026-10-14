// 003 T020: the scripted chat provider (tests and the e2e build) runs the shared contract suite.
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_ANSWER,
  FIXTURE_FALLBACK_MODEL,
  FIXTURE_USAGE,
  createFixtureChatProvider,
} from '@/providers/chat/fixture-provider';
import { chatProviderContract } from '../../../contract/chat-provider.contract';

chatProviderContract('fixture provider', {
  key: 'no-key-fixture-provider',
  model: 'claude-sonnet-5-5',
  load: (scenario) => ({
    provider: createFixtureChatProvider({ id: 'anthropic', scenario }),
    requests: [],
    expected: {
      answer: scenario === 'complete' ? FIXTURE_ANSWER : undefined,
      model: scenario === 'fallback' ? FIXTURE_FALLBACK_MODEL : 'claude-sonnet-5-5',
      usage: FIXTURE_USAGE,
    },
  }),
  cases: {
    C1: [{ name: 'complete' }],
    C2: [{ name: 'cut-off' }],
    C3: [{ name: 'declined' }],
    C4: [{ name: 'fallback' }],
    C5: [{ name: 'invalid-key' }],
    C6: [{ name: 'forbidden' }],
    C7: [
      { name: 'rate-limited', kind: 'rate-limited' },
      { name: 'billing', kind: 'billing' },
    ],
    C8: [
      { name: 'overloaded', kind: 'overloaded' },
      { name: 'unavailable', kind: 'unavailable' },
    ],
    C9: [{ name: 'too-large' }],
    C10: [{ name: 'network' }],
    C11: [{ name: 'complete' }],
    C12: [{ name: 'mid-stream-error', kind: 'overloaded' }],
  },
  checkKey: {
    ok: 'complete',
    'invalid-key': 'check-key-invalid',
    forbidden: 'check-key-forbidden',
    network: 'check-key-network',
  },
});

describe('fixture provider specifics', () => {
  const request = {
    model: 'gpt-6.1-sol',
    system: 's',
    turns: [{ role: 'user' as const, context: 'c', question: 'q' }],
    maxOutputTokens: 4000,
  };

  it('has the id it was given', () => {
    expect(createFixtureChatProvider({ id: 'openai', scenario: 'complete' }).id).toBe('openai');
  });

  it('answers with the requested model and the standup answer, citing [00:12]', async () => {
    const events = [];
    for await (const e of createFixtureChatProvider({ id: 'openai', scenario: 'complete' }).stream(
      request,
      new AbortController().signal,
    ))
      events.push(e);
    expect(events[0]).toEqual({ type: 'model', model: 'gpt-6.1-sol' });
    expect(FIXTURE_ANSWER).toContain('[00:12]');
  });

  it('reads an unknown scenario as complete', async () => {
    const events = [];
    for await (const e of createFixtureChatProvider({ id: 'anthropic', scenario: 'nonsense' }).stream(
      request,
      new AbortController().signal,
    ))
      events.push(e);
    expect(events.at(-1)).toMatchObject({ type: 'done', finish: 'complete' });
  });

  it('a slow scenario stops promptly when aborted between deltas', async () => {
    const controller = new AbortController();
    const provider = createFixtureChatProvider({ id: 'anthropic', scenario: 'complete', delayMs: 10_000 });
    const started = Date.now();
    const events = [];
    setTimeout(() => controller.abort(), 20);
    for await (const e of provider.stream(request, controller.signal)) events.push(e);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('the silent scenario names the model and then sends nothing until it is aborted (003 T103)', async () => {
    const controller = new AbortController();
    const events: unknown[] = [];
    let ended = false;
    const reading = (async () => {
      for await (const e of createFixtureChatProvider({ id: 'openai', scenario: 'silent' }).stream(
        request,
        controller.signal,
      ))
        events.push(e);
      ended = true;
    })();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(events).toEqual([{ type: 'model', model: 'gpt-6.1-sol' }]);
    expect(ended).toBe(false);
    controller.abort();
    await reading;
    expect(events).toHaveLength(1);
  });

  it('an already aborted signal yields nothing', async () => {
    const controller = new AbortController();
    controller.abort();
    const events = [];
    for await (const e of createFixtureChatProvider({ id: 'anthropic', scenario: 'complete' }).stream(
      request,
      controller.signal,
    ))
      events.push(e);
    expect(events).toEqual([]);
  });
});

describe('request recording (008 T020, for e2e assertions)', () => {
  it('hands each request it receives to onRequest before answering', async () => {
    const seen: unknown[] = [];
    const provider = createFixtureChatProvider({ id: 'openai', scenario: 'complete', onRequest: (r) => seen.push(r) });
    const request = {
      model: 'gpt-6-luna',
      system: 'S',
      turns: [{ role: 'user' as const, notes: 'N', context: 'C', question: 'Q' }],
      maxOutputTokens: 10,
    };
    for await (const _ of provider.stream(request, new AbortController().signal)) {
      // drain
    }
    expect(seen).toEqual([request]);
  });
});
