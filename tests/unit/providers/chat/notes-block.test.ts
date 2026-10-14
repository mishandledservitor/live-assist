// 008 T020: both adapters send a user turn's notes block first (notes → context → question), and a request without
// notes produces exactly the body 003 sent.
import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@/core/chat/provider';
import { createAnthropicProvider } from '@/providers/chat/anthropic';
import { createOpenAIProvider } from '@/providers/chat/openai';
import { fixtureFetch, readChatFixture } from '../../../support/chat-fixtures';

const withNotes: ChatRequest = {
  model: 'x',
  system: 'GROUNDING',
  turns: [{ role: 'user', notes: 'NOTES', context: 'CTX', question: 'Question: a' }],
  maxOutputTokens: 4000,
};
const withoutNotes: ChatRequest = {
  ...withNotes,
  turns: [{ role: 'user', context: 'CTX', question: 'Question: a' }],
};

async function body(provider: 'anthropic' | 'openai', request: ChatRequest) {
  const { fetch, requests } = fixtureFetch(readChatFixture(provider, 'c01-complete'));
  const p =
    provider === 'anthropic'
      ? createAnthropicProvider({ key: 'test-key', fetch })
      : createOpenAIProvider({ key: 'test-key', fetch });
  const model = provider === 'anthropic' ? 'claude-sonnet-5-5' : 'gpt-6-luna';
  for await (const _ of p.stream({ ...request, model }, new AbortController().signal)) {
    // drain
  }
  return requests[0]!.body!;
}

describe('notes block in the request', () => {
  it('Anthropic: notes, then context, then question', async () => {
    const sent = JSON.parse(await body('anthropic', withNotes)) as { messages: unknown[] };
    expect(sent.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'NOTES' },
        { type: 'text', text: 'CTX' },
        { type: 'text', text: 'Question: a' },
      ],
    });
  });

  it('OpenAI: notes, then context, then question', async () => {
    const sent = JSON.parse(await body('openai', withNotes)) as { input: unknown[] };
    expect(sent.input[0]).toEqual({
      role: 'user',
      content: [
        { type: 'input_text', text: 'NOTES' },
        { type: 'input_text', text: 'CTX' },
        { type: 'input_text', text: 'Question: a' },
      ],
    });
  });

  it.each(['anthropic', 'openai'] as const)(
    '%s: without notes, two parts as in 003; bodies deterministic',
    async (p) => {
      const a = await body(p, withoutNotes);
      expect(a).not.toContain('NOTES');
      const parts = JSON.parse(a) as { messages?: { content: unknown[] }[]; input?: { content: unknown[] }[] };
      expect((parts.messages ?? parts.input)![0]!.content).toHaveLength(2);
      expect(await body(p, withNotes)).toBe(await body(p, withNotes));
    },
  );
});
