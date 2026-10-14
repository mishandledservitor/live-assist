// A scripted ChatProvider for tests and the e2e build (003 contracts/chat-provider.md): it answers by scenario name,
// never touches the network, and honours abort. The e2e build picks the scenario from storage, as 001's fixture
// transcription provider does.
import {
  ChatError,
  type ChatErrorKind,
  type ChatEvent,
  type ChatProvider,
  type ChatProviderId,
  type ChatRequest,
  type ChatUsage,
  type CheckKeyResult,
} from '../../core/chat/provider';

/** Cites lines of tests/fixtures/chat/meetings/standup-en.json. */
export const FIXTURE_ANSWER =
  'Pricing stays at the current tier until January [00:12]. Jane will send the new deck by Friday [03:45] [04:02].';
export const FIXTURE_FALLBACK_MODEL = 'claude-sonnet-5';
export const FIXTURE_USAGE: Readonly<ChatUsage> = Object.freeze({
  inputTokens: 1820,
  outputTokens: 42,
  cacheReadTokens: 1536,
  cacheWriteTokens: 0,
});

/** Scenarios that fail before any output, by the error kind they end in. */
const FAIL_BEFORE_OUTPUT: Record<string, ChatErrorKind> = {
  'invalid-key': 'invalid-key',
  forbidden: 'forbidden',
  billing: 'billing',
  'model-unavailable': 'model-unavailable',
  'rate-limited': 'rate-limited',
  overloaded: 'overloaded',
  unavailable: 'unavailable',
  'too-large': 'too-large',
  network: 'network',
};

const CHECK_KEY: Record<string, CheckKeyResult> = {
  'check-key-invalid': { ok: false, kind: 'invalid-key' },
  'check-key-forbidden': { ok: false, kind: 'forbidden' },
  'check-key-network': { ok: false, kind: 'network' },
  'check-key-unknown': { ok: false, kind: 'unknown' },
};

export const FIXTURE_CHAT_SCENARIOS = [
  'complete',
  'cut-off',
  'declined',
  'fallback',
  'mid-stream-error',
  'silent',
  ...Object.keys(FAIL_BEFORE_OUTPUT),
  ...Object.keys(CHECK_KEY),
] as const;

export interface FixtureChatOptions {
  id: ChatProviderId;
  /** Unknown names answer like `complete`. */
  scenario: string;
  /** Pause before each delta, e.g. so an e2e test can press Stop mid-answer. */
  delayMs?: number;
  /** 008: sees every request, so an e2e test can check what was sent (e.g. the notes block). */
  onRequest?: (request: ChatRequest) => void;
}

/** Resolves after `ms`, or as soon as the signal aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

/** The answer in a few word-sized chunks, so a test can stop after any of them. */
const chunks = (text: string): string[] => text.match(/\S+\s*/g) ?? [text];

export function createFixtureChatProvider(options: FixtureChatOptions): ChatProvider {
  const { id, scenario, delayMs = 0, onRequest } = options;

  async function* stream(request: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    onRequest?.(request);
    const failure = FAIL_BEFORE_OUTPUT[scenario];
    if (signal.aborted) return;
    await pause(0, signal);
    if (signal.aborted) return;
    if (failure) throw new ChatError(failure);
    yield { type: 'model', model: request.model };
    // 003 FR-018a: the response starts and no answer text ever follows, until the request is aborted.
    if (scenario === 'silent') {
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return;
    }

    const parts = chunks(FIXTURE_ANSWER);
    for (const [i, text] of parts.entries()) {
      await pause(delayMs, signal);
      if (signal.aborted) return;
      if (scenario === 'fallback' && i === 2) yield { type: 'model', model: FIXTURE_FALLBACK_MODEL };
      yield { type: 'text', text };
      if (signal.aborted) return;
      if (i === 1 && scenario === 'declined') throw new ChatError('declined');
      if (i === 1 && scenario === 'mid-stream-error') throw new ChatError('overloaded');
      if (i === 1 && scenario === 'cut-off') {
        yield { type: 'done', finish: 'cut-off', usage: { ...FIXTURE_USAGE } };
        return;
      }
    }
    yield { type: 'done', finish: 'complete', usage: { ...FIXTURE_USAGE } };
  }

  return {
    id,
    stream,
    checkKey: () => Promise.resolve(CHECK_KEY[scenario] ?? { ok: true }),
  };
}
