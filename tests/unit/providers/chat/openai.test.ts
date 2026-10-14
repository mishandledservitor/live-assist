// 003 T056: the OpenAI adapter runs the shared contract suite on recorded fixtures (tests/fixtures/chat/openai/) and
// sends the request of contracts/chat-provider.md "Request assertions". No network, no real key.
import { describe, expect, it } from 'vitest';
import type { ChatEvent, ChatRequest } from '@/core/chat/provider';
import { createChatProvider } from '@/providers/chat/factory';
import { createOpenAIProvider } from '@/providers/chat/openai';
import { chatProviderContract } from '../../../contract/chat-provider.contract';
import { fixtureFetch, readChatFixture } from '../../../support/chat-fixtures';

const KEY = 'test-openai-key-0000';

chatProviderContract('OpenAI adapter', {
  key: KEY,
  model: 'gpt-6-luna',
  load: (name) => {
    const fixture = readChatFixture('openai', name);
    const { fetch, requests } = fixtureFetch(fixture);
    return {
      provider: createOpenAIProvider({ key: KEY, fetch }),
      requests,
      expected: { answer: fixture.answer, model: fixture.model, usage: fixture.usage },
    };
  },
  cases: {
    C1: [{ name: 'c01-complete' }],
    C2: [{ name: 'c02-cut-off' }],
    C3: [{ name: 'c03-declined-refusal' }, { name: 'c03-declined-content-filter' }],
    C5: [{ name: 'c05-401' }],
    C6: [{ name: 'c06-403' }],
    C7: [
      { name: 'c07-429', kind: 'rate-limited' },
      { name: 'c07-429-insufficient-quota', kind: 'billing' },
    ],
    C8: [{ name: 'c08-503', kind: 'unavailable' }],
    C9: [{ name: 'c09-400-context-length' }],
    C10: [{ name: 'c10-network' }],
    C11: [{ name: 'c11-abort' }],
    C12: [
      { name: 'c12-mid-stream-error', kind: 'unavailable' },
      { name: 'c12-response-failed', kind: 'unavailable' },
    ],
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
  const { fetch, requests } = fixtureFetch(readChatFixture('openai', 'c01-complete'));
  const provider = createOpenAIProvider({ key: KEY, fetch });
  const events: ChatEvent[] = [];
  for await (const e of provider.stream(request(model), new AbortController().signal)) events.push(e);
  expect(requests).toHaveLength(1);
  const [sent] = requests;
  return { sent: sent!, body: JSON.parse(sent!.body!) as Record<string, unknown>, events };
}

describe('OpenAI request (contracts/chat-provider.md)', () => {
  it('posts to the Responses API with a Bearer key, a stream and storage off', async () => {
    const { sent, body } = await capture('gpt-6-luna');
    const url = new URL(sent.url);
    expect(url.origin + url.pathname).toBe('https://api.openai.com/v1/responses');
    expect(sent.method).toBe('POST');
    expect(sent.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(body.stream).toBe(true);
    expect(body.store).toBe(false);
    expect(body.model).toBe('gpt-6-luna');
    expect(body.max_output_tokens).toBe(4000);
    expect(body.instructions).toBe('GROUNDING');
  });

  it('sends no prompt_cache_key, metadata or user (no per-meeting identifier)', async () => {
    const { body } = await capture('gpt-6-luna');
    expect(body).not.toHaveProperty('prompt_cache_key');
    expect(body).not.toHaveProperty('metadata');
    expect(body).not.toHaveProperty('user');
    expect(body).not.toHaveProperty('previous_response_id');
  });

  it('sends each user turn as two input_text parts (context, then question) and replays the answer', async () => {
    const { body } = await capture('gpt-6-luna');
    expect(body.input).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Transcript of the meeting so far. The person asking is Alex.\n[00:12] Jane: x',
          },
          { type: 'input_text', text: 'Question: a' },
        ],
      },
      { role: 'assistant', content: 'Answer a [00:12]' },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'No new transcript lines since the previous question.' },
          { type: 'input_text', text: 'Question: b' },
        ],
      },
    ]);
  });

  it.each([
    ['gpt-6-luna', 'none'],
    ['gpt-6.1-sol', 'low'],
    ['gpt-6-astra', 'low'],
  ])('%s: reasoning effort %s', async (model, effort) => {
    const { body } = await capture(model);
    expect(body.reasoning).toEqual({ effort });
  });

  it('the same request gives a byte-identical body (cache stability)', async () => {
    const a = await capture('gpt-6-luna');
    const b = await capture('gpt-6-luna');
    expect(a.sent.body).toBe(b.sent.body);
  });

  it('reports usage with cached tokens as cache reads', async () => {
    const { events } = await capture('gpt-6-luna');
    expect(events.at(-1)).toEqual({
      type: 'done',
      finish: 'complete',
      usage: { inputTokens: 1820, outputTokens: 42, cacheReadTokens: 1536, cacheWriteTokens: 0 },
    });
  });

  it('the key check is GET /v1/models with the key', async () => {
    const { fetch, requests } = fixtureFetch(readChatFixture('openai', 'c14-check-key-200'));
    expect(await createOpenAIProvider({ key: KEY, fetch }).checkKey()).toEqual({ ok: true });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!.url);
    expect(url.origin + url.pathname).toBe('https://api.openai.com/v1/models');
    expect(requests[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
  });
});

describe('createChatProvider', () => {
  it("builds the OpenAI adapter for 'openai', which streams the recorded answer", async () => {
    const fixture = readChatFixture('openai', 'c01-complete');
    const { fetch, requests } = fixtureFetch(fixture);
    const provider = createChatProvider('openai', KEY, fetch);
    expect(provider.id).toBe('openai');
    let text = '';
    for await (const e of provider.stream(request('gpt-6-luna'), new AbortController().signal))
      if (e.type === 'text') text += e.text;
    expect(text).toBe(fixture.answer);
    expect(requests).toHaveLength(1);
  });
});
