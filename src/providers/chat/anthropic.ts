// Anthropic Messages API adapter (003 contracts/chat-provider.md, research R2/R4). The only code that knows Claude's
// wire format. Runs in the service worker with the user's key; streams raw events so the server-side fallback block
// (which names the model that took over) is seen as it arrives.
import Anthropic from '@anthropic-ai/sdk';
import { findModel, type AnthropicOptions } from '../../core/chat/models';
import {
  ChatError,
  type ChatErrorKind,
  type ChatEvent,
  type ChatProvider,
  type ChatRequest,
  type ChatUsage,
  type CheckKeyResult,
} from '../../core/chat/provider';
import { ANTHROPIC_BASE_URL } from './base-urls';

/** Server-side refusal fallback, `fallbacks: 'default'` form (research R4). */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface AnthropicDeps {
  key: string;
  fetch: typeof fetch;
}

type Params = Anthropic.Beta.Messages.MessageCreateParamsStreaming;

const DEFAULT_OPTIONS: AnthropicOptions = { kind: 'anthropic', thinking: null, effort: 'low', fallbacks: false };

function optionsFor(model: string): AnthropicOptions {
  const options = findModel(model)?.options;
  return options?.kind === 'anthropic' ? options : DEFAULT_OPTIONS;
}

/** Same request → same key order → byte-identical body, so the prompt cache prefix never changes. */
function toParams(request: ChatRequest): Params {
  const options = optionsFor(request.model);
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = request.turns.map((turn) =>
    turn.role === 'user'
      ? {
          role: 'user',
          content: [
            // 008: the person's notes block, first, only when the turn carries one (003 bodies unchanged otherwise).
            ...(turn.notes === undefined ? [] : [{ type: 'text' as const, text: turn.notes }]),
            { type: 'text', text: turn.context },
            { type: 'text', text: turn.question },
          ],
        }
      : { role: 'assistant', content: turn.text },
  );
  return {
    model: request.model,
    max_tokens: request.maxOutputTokens,
    system: request.system,
    messages,
    cache_control: { type: 'ephemeral' },
    ...(options.thinking ? { thinking: options.thinking } : {}),
    output_config: { effort: options.effort },
    ...(options.fallbacks ? { fallbacks: 'default' as const, betas: [FALLBACK_BETA] } : {}),
    stream: true,
  };
}

/** Maps an SDK failure to a kind; the SDK error itself (which may hold request details) never leaves here. */
function errorKind(error: unknown): ChatErrorKind {
  if (error instanceof Anthropic.APIConnectionError) return 'network';
  if (!(error instanceof Anthropic.APIError)) return 'unknown';
  const body = error.error as { error?: { type?: unknown; message?: unknown } } | undefined;
  const type = body?.error?.type;
  const message = typeof body?.error?.message === 'string' ? body.error.message : '';
  switch (error.status) {
    case 401:
      return 'invalid-key';
    case 403:
      return 'forbidden';
    case 402:
      return 'billing';
    case 404:
      return 'model-unavailable';
    case 413:
      return 'too-large';
    case 400:
      return /prompt is too long/i.test(message) ? 'too-large' : 'unknown';
    case 429:
      return 'rate-limited';
    case 529:
      return 'overloaded';
    case undefined:
      break;
    default:
      if (error.status >= 500) return 'unavailable';
      return 'unknown';
  }
  // A mid-stream `error` event carries no status, only the error type.
  switch (type) {
    case 'overloaded_error':
      return 'overloaded';
    case 'rate_limit_error':
      return 'rate-limited';
    case 'api_error':
      return 'unavailable';
    case 'billing_error':
      return 'billing';
    case 'authentication_error':
      return 'invalid-key';
    case 'permission_error':
      return 'forbidden';
    case 'request_too_large':
      return 'too-large';
    default:
      return 'unknown';
  }
}

const isAbort = (error: unknown) => error instanceof Anthropic.APIUserAbortError;

export function createAnthropicProvider(deps: AnthropicDeps): ChatProvider {
  const client = () =>
    new Anthropic({
      apiKey: deps.key,
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
      baseURL: ANTHROPIC_BASE_URL,
      fetch: deps.fetch,
    });

  async function* stream(request: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    if (signal.aborted) return;
    const usage: ChatUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    let stop: string | null = null;
    try {
      const events = await client().beta.messages.create(toParams(request), { signal });
      for await (const event of events) {
        if (signal.aborted) return;
        switch (event.type) {
          case 'message_start':
            usage.inputTokens = event.message.usage.input_tokens;
            usage.cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
            usage.cacheWriteTokens = event.message.usage.cache_creation_input_tokens ?? 0;
            yield { type: 'model', model: event.message.model };
            break;
          case 'content_block_start':
            if (event.content_block.type === 'fallback') yield { type: 'model', model: event.content_block.to.model };
            break;
          case 'content_block_delta':
            if (event.delta.type === 'text_delta') yield { type: 'text', text: event.delta.text };
            break;
          case 'message_delta':
            stop = event.delta.stop_reason ?? stop;
            usage.outputTokens = event.usage.output_tokens;
            break;
          default:
            break;
        }
      }
    } catch (error) {
      if (signal.aborted || isAbort(error)) return;
      throw new ChatError(errorKind(error));
    }
    if (signal.aborted) return;
    if (stop === 'refusal') throw new ChatError('declined');
    yield { type: 'done', finish: stop === 'max_tokens' ? 'cut-off' : 'complete', usage };
  }

  async function checkKey(): Promise<CheckKeyResult> {
    try {
      await client().models.list({ limit: 1 });
      return { ok: true };
    } catch (error) {
      const kind = errorKind(error);
      return {
        ok: false,
        kind: kind === 'invalid-key' || kind === 'forbidden' || kind === 'network' ? kind : 'unknown',
      };
    }
  }

  return { id: 'anthropic', stream, checkKey };
}
