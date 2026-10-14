// Shared contract suite every ChatProvider runs (003 contracts/chat-provider.md, cases C1–C14): the Anthropic and
// OpenAI adapters fed recorded fixtures through an injected fetch, and the fixture provider by scenario name.
import { describe, expect, it } from 'vitest';
import {
  ChatError,
  type ChatErrorKind,
  type ChatEvent,
  type ChatProvider,
  type ChatRequest,
  type ChatUsage,
} from '@/core/chat/provider';
import type { CapturedRequest } from '../support/chat-fixtures';

/** One recorded fixture or scripted scenario, and the error kind it must end in (for error cases). */
export interface ContractVariant {
  name: string;
  kind?: ChatErrorKind;
}

export interface ContractSetup {
  provider: ChatProvider;
  /** Every HTTP request the provider made (empty for a provider that makes none). */
  requests: CapturedRequest[];
  /** What a stream fixture must produce, where it says. */
  expected: { answer?: string | undefined; model?: string | undefined; usage?: ChatUsage | undefined };
}

export type ContractCase = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10' | 'C11' | 'C12';

export interface ChatProviderHarness {
  /** The credential that must never leak (C13). */
  key: string;
  /** A curated model of this provider, used in the request. */
  model: string;
  /** Builds a fresh provider answering with the named fixture or scenario. */
  load(name: string): ContractSetup;
  /** Variants per case; C4 is omitted by providers without server-side fallback. */
  cases: Partial<Record<ContractCase, ContractVariant[]>> & Record<Exclude<ContractCase, 'C4'>, ContractVariant[]>;
  /** C14: key-check variants for ok, invalid-key, forbidden and network. */
  checkKey: Record<'ok' | 'invalid-key' | 'forbidden' | 'network', string>;
}

const TRANSCRIPT_SENTINEL = 'contract-transcript-line-7f3a';
const QUESTION_SENTINEL = 'contract-question-9b1c';

const request = (model: string): ChatRequest => ({
  model,
  system: 'You answer questions about a meeting using only its transcript.',
  turns: [
    {
      role: 'user',
      context: `Transcript of the meeting so far. The person asking is Alex.\n[00:12] Jane: ${TRANSCRIPT_SENTINEL}`,
      question: `Question: ${QUESTION_SENTINEL}`,
    },
  ],
  maxOutputTokens: 4000,
});

interface Run {
  events: ChatEvent[];
  error: unknown;
}

async function run(provider: ChatProvider, model: string, abortAfterTexts?: number): Promise<Run> {
  const controller = new AbortController();
  const events: ChatEvent[] = [];
  try {
    for await (const event of provider.stream(request(model), controller.signal)) {
      events.push(event);
      if (abortAfterTexts !== undefined && events.filter((e) => e.type === 'text').length === abortAfterTexts)
        controller.abort();
    }
    return { events, error: null };
  } catch (error) {
    return { events, error };
  }
}

const texts = (events: ChatEvent[]) =>
  events
    .filter((e): e is Extract<ChatEvent, { type: 'text' }> => e.type === 'text')
    .map((e) => e.text)
    .join('');
const dones = (events: ChatEvent[]) => events.filter((e) => e.type === 'done');
const models = (events: ChatEvent[]) =>
  events.filter((e): e is Extract<ChatEvent, { type: 'model' }> => e.type === 'model').map((e) => e.model);

function expectChatError(error: unknown, kind: ChatErrorKind | undefined): asserts error is ChatError {
  expect(error).toBeInstanceOf(ChatError);
  expect((error as ChatError).kind).toBe(kind);
}

const ERROR_CASES: ContractCase[] = ['C3', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C12'];
const FIXED_KIND: Partial<Record<ContractCase, ChatErrorKind>> = {
  C3: 'declined',
  C5: 'invalid-key',
  C6: 'forbidden',
  C9: 'too-large',
  C10: 'network',
};

export function chatProviderContract(name: string, h: ChatProviderHarness): void {
  describe(`ChatProvider contract: ${name}`, () => {
    it.each(h.cases.C1)('C1 $name: model, then deltas, then done{complete} with usage', async ({ name: n }) => {
      const s = h.load(n);
      const { events, error } = await run(s.provider, h.model);
      expect(error).toBeNull();
      expect(events[0]?.type).toBe('model');
      if (s.expected.model) expect(models(events)[0]).toBe(s.expected.model);
      expect(events.filter((e) => e.type === 'text').length).toBeGreaterThanOrEqual(2);
      if (s.expected.answer) expect(texts(events)).toBe(s.expected.answer);
      const last = events.at(-1);
      expect(last).toMatchObject({ type: 'done', finish: 'complete' });
      expect(dones(events)).toHaveLength(1);
      const usage = (last as Extract<ChatEvent, { type: 'done' }>).usage;
      if (s.expected.usage) expect(usage).toEqual(s.expected.usage);
      else expect(usage).not.toBeNull();
    });

    it.each(h.cases.C2)('C2 $name: deltas, then done{cut-off}', async ({ name: n }) => {
      const s = h.load(n);
      const { events, error } = await run(s.provider, h.model);
      expect(error).toBeNull();
      expect(texts(events)).not.toBe('');
      if (s.expected.answer) expect(texts(events)).toBe(s.expected.answer);
      expect(events.at(-1)).toMatchObject({ type: 'done', finish: 'cut-off' });
    });

    if (h.cases.C4)
      it.each(h.cases.C4)('C4 $name: the fallback model is reported, then done{complete}', async ({ name: n }) => {
        const s = h.load(n);
        const { events, error } = await run(s.provider, h.model);
        expect(error).toBeNull();
        expect(models(events).at(-1)).toBe(s.expected.model);
        if (s.expected.answer) expect(texts(events)).toBe(s.expected.answer);
        expect(events.at(-1)).toMatchObject({ type: 'done', finish: 'complete' });
      });

    for (const c of ERROR_CASES)
      it.each(h.cases[c] ?? [])(`${c} $name: ChatError $kind, no done`, async (variant) => {
        const s = h.load(variant.name);
        const { events, error } = await run(s.provider, h.model);
        expectChatError(error, FIXED_KIND[c] ?? variant.kind);
        expect(dones(events)).toEqual([]);
      });

    it.each(h.cases.C11)('C11 $name: abort after two deltas ends iteration, no done, no error', async ({ name: n }) => {
      const s = h.load(n);
      const { events, error } = await run(s.provider, h.model, 2);
      expect(error).toBeNull();
      expect(events.filter((e) => e.type === 'text')).toHaveLength(2);
      expect(dones(events)).toEqual([]);
    });

    it.each(ERROR_CASES.flatMap((c) => h.cases[c] ?? []))(
      'C13 $name: the error text holds neither the key nor any request header',
      async ({ name: n }) => {
        const s = h.load(n);
        const { error } = await run(s.provider, h.model);
        expect(error).toBeInstanceOf(ChatError);
        const shown = [(error as Error).message, String(error), JSON.stringify(error)];
        const headerValues = s.requests.flatMap((r) => Object.values(r.headers)).filter((v) => v.length >= 8);
        for (const text of shown) {
          expect(text).not.toContain(h.key);
          for (const v of headerValues) expect(text).not.toContain(v);
          expect(text).not.toContain(TRANSCRIPT_SENTINEL);
          expect(text).not.toContain(QUESTION_SENTINEL);
        }
      },
    );

    it.each([
      ['ok', { ok: true }],
      ['invalid-key', { ok: false, kind: 'invalid-key' }],
      ['forbidden', { ok: false, kind: 'forbidden' }],
      ['network', { ok: false, kind: 'network' }],
    ] as const)('C14 checkKey %s, carrying no transcript or chat', async (variant, expected) => {
      const s = h.load(h.checkKey[variant]);
      expect(await s.provider.checkKey()).toEqual(expected);
      for (const r of s.requests) {
        expect(r.method).toBe('GET');
        expect(r.body ?? '').toBe('');
        expect(r.url).not.toContain(TRANSCRIPT_SENTINEL);
      }
    });
  });
}
