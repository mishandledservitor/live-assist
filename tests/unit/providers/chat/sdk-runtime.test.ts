// 003 T001 (research R2): both official SDKs run without `window` or `document` (the MV3 service worker has neither),
// with the options every adapter uses: a placeholder key, `dangerouslyAllowBrowser`, no retries, an explicit base URL
// and an injected `fetch` that returns a recorded one-delta stream. Nothing here touches the network.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';

const sse = (events: [string, unknown][]) =>
  events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');

function recordedFetch(body: string): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fake = (input: string | URL | Request): Promise<Response> => {
    calls.push(input instanceof Request ? input.url : String(input));
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  };
  return { fetch: fake, calls };
}

describe('chat SDKs in a worker-like global (research R2)', () => {
  it('has no window and no document here, like a service worker', () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });

  it('@anthropic-ai/sdk streams one recorded delta through an injected fetch', async () => {
    const { fetch, calls } = recordedFetch(
      sse([
        [
          'message_start',
          {
            type: 'message_start',
            message: {
              id: 'msg_fixture',
              type: 'message',
              role: 'assistant',
              model: 'claude-sonnet-5-5',
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 1 },
            },
          },
        ],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        [
          'content_block_delta',
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Pricing [00:12]' } },
        ],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        [
          'message_delta',
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 3 },
          },
        ],
        ['message_stop', { type: 'message_stop' }],
      ]),
    );
    const client = new Anthropic({
      apiKey: 'test-key',
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
      baseURL: 'https://api.anthropic.com',
      fetch,
    });
    const stream = client.messages.stream({
      model: 'claude-sonnet-5-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'q' }],
    });
    let text = '';
    for await (const event of stream)
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') text += event.delta.text;
    expect(text).toBe('Pricing [00:12]');
    expect(calls).toEqual(['https://api.anthropic.com/v1/messages']);
  });

  it('openai streams one recorded Responses delta through an injected fetch', async () => {
    const { fetch, calls } = recordedFetch(
      sse([
        ['response.created', { type: 'response.created', sequence_number: 0, response: { id: 'resp_fixture' } }],
        [
          'response.output_text.delta',
          {
            type: 'response.output_text.delta',
            sequence_number: 1,
            item_id: 'msg_fixture',
            output_index: 0,
            content_index: 0,
            delta: 'Pricing [00:12]',
          },
        ],
        [
          'response.completed',
          { type: 'response.completed', sequence_number: 2, response: { id: 'resp_fixture', status: 'completed' } },
        ],
      ]),
    );
    const client = new OpenAI({
      apiKey: 'test-key',
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
      baseURL: 'https://api.openai.com/v1',
      fetch,
    });
    const stream = await client.responses.create({ model: 'gpt-6.1-sol', input: 'q', stream: true });
    let text = '';
    for await (const event of stream) if (event.type === 'response.output_text.delta') text += event.delta;
    expect(text).toBe('Pricing [00:12]');
    expect(calls).toEqual(['https://api.openai.com/v1/responses']);
  });
});
