// OpenAI Responses API adapter (003 contracts/chat-provider.md, research R2/R4). The only code that knows OpenAI's
// wire format. Runs in the service worker with the user's key; storage is off (`store: false`) and no per-meeting
// identifier is sent, so OpenAI's implicit prompt caching is the only state across requests.
import OpenAI from 'openai';
import { findModel, type OpenAIOptions } from '../../core/chat/models';
import {
  ChatError,
  type ChatErrorKind,
  type ChatEvent,
  type ChatProvider,
  type ChatRequest,
  type ChatUsage,
  type CheckKeyResult,
} from '../../core/chat/provider';
import { OPENAI_BASE_URL } from './base-urls';

export interface OpenAIDeps {
  key: string;
  fetch: typeof fetch;
}

type Params = OpenAI.Responses.ResponseCreateParamsStreaming;

const DEFAULT_OPTIONS: OpenAIOptions = { kind: 'openai', reasoningEffort: 'low' };

function optionsFor(model: string): OpenAIOptions {
  const options = findModel(model)?.options;
  return options?.kind === 'openai' ? options : DEFAULT_OPTIONS;
}

/** Same request → same key order → byte-identical body, so the cached prefix never changes. */
function toParams(request: ChatRequest): Params {
  const input: OpenAI.Responses.ResponseInput = request.turns.map((turn) =>
    turn.role === 'user'
      ? {
          role: 'user',
          content: [
            // 008: the person's notes block, first, only when the turn carries one (003 bodies unchanged otherwise).
            ...(turn.notes === undefined ? [] : [{ type: 'input_text' as const, text: turn.notes }]),
            { type: 'input_text', text: turn.context },
            { type: 'input_text', text: turn.question },
          ],
        }
      : { role: 'assistant', content: turn.text },
  );
  return {
    model: request.model,
    instructions: request.system,
    input,
    max_output_tokens: request.maxOutputTokens,
    reasoning: { effort: optionsFor(request.model).reasoningEffort },
    store: false,
    stream: true,
  };
}

/** An OpenAI error code (HTTP body, mid-stream `error` event or `response.failed`) as a kind. */
function kindOfCode(code: unknown): ChatErrorKind | null {
  switch (code) {
    case 'invalid_api_key':
      return 'invalid-key';
    case 'insufficient_quota':
      return 'billing';
    case 'rate_limit_exceeded':
      return 'rate-limited';
    case 'context_length_exceeded':
      return 'too-large';
    case 'model_not_found':
      return 'model-unavailable';
    case 'server_error':
      return 'unavailable';
    default:
      return null;
  }
}

/** Maps an SDK failure to a kind; the SDK error itself (which may hold request details) never leaves here. */
function errorKind(error: unknown): ChatErrorKind {
  if (error instanceof OpenAI.APIConnectionError) return 'network';
  if (!(error instanceof OpenAI.APIError)) return 'unknown';
  const code = error.code ?? error.type;
  switch (error.status) {
    case 401:
      return 'invalid-key';
    case 403:
      return 'forbidden';
    case 404:
      return 'model-unavailable';
    case 413:
      return 'too-large';
    case 400:
      return code === 'context_length_exceeded' ? 'too-large' : 'unknown';
    case 429:
      return code === 'insufficient_quota' ? 'billing' : 'rate-limited';
    case undefined:
      // A mid-stream `error` event carries no status, only the code.
      return kindOfCode(code) ?? 'unknown';
    default:
      return error.status >= 500 ? 'unavailable' : 'unknown';
  }
}

const isAbort = (error: unknown) => error instanceof OpenAI.APIUserAbortError;

export function createOpenAIProvider(deps: OpenAIDeps): ChatProvider {
  const client = () =>
    new OpenAI({
      apiKey: deps.key,
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
      baseURL: OPENAI_BASE_URL,
      fetch: deps.fetch,
    });

  async function* stream(request: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    if (signal.aborted) return;
    let finish: 'complete' | 'cut-off' | null = null;
    let usage: ChatUsage | null = null;
    let failure: ChatErrorKind | null = null;
    try {
      const events = await client().responses.create(toParams(request), { signal });
      for await (const event of events) {
        if (signal.aborted) return;
        switch (event.type) {
          case 'response.created':
            yield { type: 'model', model: event.response.model };
            break;
          case 'response.output_text.delta':
            yield { type: 'text', text: event.delta };
            break;
          // A refusal is a decline: any partial answer is discarded by the session.
          case 'response.refusal.delta':
          case 'response.refusal.done':
            failure = 'declined';
            break;
          case 'response.completed': {
            finish = 'complete';
            const u = event.response.usage;
            usage = u
              ? {
                  inputTokens: u.input_tokens,
                  outputTokens: u.output_tokens,
                  cacheReadTokens: u.input_tokens_details?.cached_tokens ?? 0,
                  cacheWriteTokens: 0,
                }
              : null;
            break;
          }
          case 'response.incomplete': {
            const reason = event.response.incomplete_details?.reason;
            if (reason === 'content_filter') failure = 'declined';
            else finish = 'cut-off';
            break;
          }
          case 'response.failed':
            failure = kindOfCode(event.response.error?.code) ?? 'unknown';
            break;
          case 'error':
            failure = kindOfCode(event.code) ?? 'unknown';
            break;
          default:
            break;
        }
        if (failure) break;
      }
    } catch (error) {
      if (signal.aborted || isAbort(error)) return;
      throw new ChatError(errorKind(error));
    }
    if (signal.aborted) return;
    if (failure) throw new ChatError(failure);
    if (finish === null) throw new ChatError('unknown');
    yield { type: 'done', finish, usage };
  }

  async function checkKey(): Promise<CheckKeyResult> {
    try {
      // The first page of the model list: free and content-free (research R4).
      await client().models.list();
      return { ok: true };
    } catch (error) {
      const kind = errorKind(error);
      return {
        ok: false,
        kind: kind === 'invalid-key' || kind === 'forbidden' || kind === 'network' ? kind : 'unknown',
      };
    }
  }

  return { id: 'openai', stream, checkKey };
}
