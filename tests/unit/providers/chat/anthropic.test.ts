// 003 T028: the Anthropic adapter runs the shared contract suite on recorded fixtures (tests/fixtures/chat/anthropic/)
// and sends the request of contracts/chat-provider.md "Request assertions". No network, no real key.
import { describe, expect, it } from 'vitest';
import type { ChatEvent, ChatRequest } from '@/core/chat/provider';
import { createAnthropicProvider } from '@/providers/chat/anthropic';
import { createChatProvider } from '@/providers/chat/factory';
import { chatProviderContract } from '../../../contract/chat-provider.contract';
import { fixtureFetch, readChatFixture } from '../../../support/chat-fixtures';

const KEY = 'test-anthropic-key-0000';

chatProviderContract('Anthropic adapter', {
  key: KEY,
  model: 'claude-sonnet-5-5',
  load: (name) => {
    const fixture = readChatFixture('anthropic', name);
    const { fetch, requests } = fixtureFetch(fixture);
    return {
      provider: createAnthropicProvider({ key: KEY, fetch }),
      requests,
      expected: { answer: fixture.answer, model: fixture.model, usage: fixture.usage },
    };
  },
  cases: {
    C1: [{ name: 'c01-complete' }],
    C2: [{ name: 'c02-cut-off' }],
    C3: [{ name: 'c03-declined' }, { name: 'c03-declined-mid-stream' }],
    C4: [{ name: 'c04-fallback-mid-output' }, { name: 'c04-fallback-pre-output' }],
    C5: [{ name: 'c05-401' }],
    C6: [{ name: 'c06-403' }],
    C7: [
      { name: 'c07-429', kind: 'rate-limited' },
      { name: 'c07-402-billing', kind: 'billing' },
    ],
    C8: [
      { name: 'c08-529', kind: 'overloaded' },
      { name: 'c08-500', kind: 'unavailable' },
    ],
    C9: [{ name: 'c09-413' }, { name: 'c09-400-prompt-too-long' }],
    C10: [{ name: 'c10-network' }],
    C11: [{ name: 'c11-abort' }],
    C12: [{ name: 'c12-mid-stream-error', kind: 'overloaded' }],
  },
  checkKey: {
    ok: 'c14-check-key-200',
    'invalid-key': 'c14-check-key-401',
    forbidden: 'c14-check-key-403',
    network: 'c10-network',
  },
});

const request = (model: string): ChatRequest => ({
  model,
  system: 'GROUNDING',
  turns: [
    {
      role: 'user',
      context: 'Transcript of the meeting so far. The person asking is Alex.\n[00:12] Jane: x',
      question: 'Question: a',
    },
    { role: 'assistant', text: 'Answer a [00:12]' },
    { role: 'user', context: 'No new transcript lines since the previous question.', question: 'Question: b' },
  ],
  maxOutputTokens: 4000,
});

async function capture(model: string) {
  const { fetch, requests } = fixtureFetch(readChatFixture('anthropic', 'c01-complete'));
  const provider = createAnthropicProvider({ key: KEY, fetch });
  const events: ChatEvent[] = [];
  for await (const e of provider.stream(request(model), new AbortController().signal)) events.push(e);
  expect(requests).toHaveLength(1);
  const [sent] = requests;
  return { sent: sent!, body: JSON.parse(sent!.body!) as Record<string, unknown>, events };
}

describe('Anthropic request (contracts/chat-provider.md)', () => {
  it('posts to the Messages API with the key, the browser-access header and a stream', async () => {
    const { sent, body } = await capture('claude-sonnet-5-5');
    const url = new URL(sent.url);
    expect(url.origin + url.pathname).toBe('https://api.anthropic.com/v1/messages');
    expect(sent.method).toBe('POST');
    expect(sent.headers['x-api-key']).toBe(KEY);
    expect(sent.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(body.stream).toBe(true);
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.max_tokens).toBe(4000);
    expect(body.system).toBe('GROUNDING');
    expect(body.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('sends each user turn as two text blocks (context, then question) and replays the answer', async () => {
    const { body } = await capture('claude-sonnet-5-5');
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transcript of the meeting so far. The person asking is Alex.\n[00:12] Jane: x' },
          { type: 'text', text: 'Question: a' },
        ],
      },
      { role: 'assistant', content: 'Answer a [00:12]' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'No new transcript lines since the previous question.' },
          { type: 'text', text: 'Question: b' },
        ],
      },
    ]);
  });

  it('Sonnet 5.5: thinking between_tools, effort low, server-side fallback with its beta header', async () => {
    const { sent, body } = await capture('claude-sonnet-5-5');
    expect(body.thinking).toEqual({ type: 'between_tools' });
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.fallbacks).toBe('default');
    expect(sent.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
  });

  it('Opus 5.5: no thinking field, effort low, fallback', async () => {
    const { sent, body } = await capture('claude-opus-5-5');
    expect(body).not.toHaveProperty('thinking');
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.fallbacks).toBe('default');
    expect(sent.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
  });

  it('Haiku 5.5: thinking disabled, effort low, no fallback and no beta header', async () => {
    const { sent, body } = await capture('claude-haiku-5-5');
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body).not.toHaveProperty('fallbacks');
    expect(sent.headers['anthropic-beta']).toBeUndefined();
  });

  it('the same request gives a byte-identical body (cache stability)', async () => {
    const a = await capture('claude-sonnet-5-5');
    const b = await capture('claude-sonnet-5-5');
    expect(a.sent.body).toBe(b.sent.body);
  });

  it('reports usage with cache read and write tokens', async () => {
    const { events } = await capture('claude-sonnet-5-5');
    expect(events.at(-1)).toEqual({
      type: 'done',
      finish: 'complete',
      usage: { inputTokens: 1820, outputTokens: 42, cacheReadTokens: 1536, cacheWriteTokens: 0 },
    });
  });

  it('the key check is GET /v1/models?limit=1 with the key', async () => {
    const { fetch, requests } = fixtureFetch(readChatFixture('anthropic', 'c14-check-key-200'));
    expect(await createAnthropicProvider({ key: KEY, fetch }).checkKey()).toEqual({ ok: true });
    const url = new URL(requests[0]!.url);
    expect(url.origin + url.pathname).toBe('https://api.anthropic.com/v1/models');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(requests[0]!.headers['x-api-key']).toBe(KEY);
  });
});

describe('createChatProvider', () => {
  it("builds the Anthropic adapter for 'anthropic'", () => {
    const { fetch } = fixtureFetch(readChatFixture('anthropic', 'c01-complete'));
    expect(createChatProvider('anthropic', KEY, fetch).id).toBe('anthropic');
  });
});
