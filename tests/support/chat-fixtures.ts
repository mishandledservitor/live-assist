// Recorded chat-provider responses (tests/fixtures/chat/{anthropic,openai}/*.json, 003 T002) served through an
// injected `fetch` that records every request. No network, no real key.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatUsage } from '@/core/chat/provider';

export interface ChatFixture {
  description: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  /** The fetch rejects (a network failure) instead of answering. */
  reject?: boolean;
  /** For streams: the answer the deltas concatenate to, the answering model and the reported usage. */
  answer?: string;
  model?: string;
  usage?: ChatUsage;
}

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

const DIR = join(import.meta.dirname, '../fixtures/chat');

export function readChatFixture(provider: 'anthropic' | 'openai', name: string): ChatFixture {
  return JSON.parse(readFileSync(join(DIR, provider, `${name}.json`), 'utf8')) as ChatFixture;
}

/** A `fetch` that answers every call with the fixture and records the request. */
export function fixtureFetch(fixture: ChatFixture): { fetch: typeof fetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const body = init?.body ?? null;
    requests.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: body === null ? null : typeof body === 'string' ? body : await request.text(),
    });
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    if (fixture.reject) throw new TypeError('Failed to fetch');
    return new Response(fixture.status === 204 ? null : fixture.body, {
      status: fixture.status,
      headers: fixture.headers,
    });
  };
  return { fetch: fake, requests };
}
