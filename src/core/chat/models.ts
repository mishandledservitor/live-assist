// Curated chat models (design decision 21, 003 research R3) and their request options (research R4). Platform-free:
// the adapters in src/providers/chat/ turn these options into each vendor's wire fields.

export type ChatProviderId = 'anthropic' | 'openai';

export const CHAT_PROVIDERS: readonly ChatProviderId[] = ['anthropic', 'openai'];

/** Design decision 40 (constitution v1.1.1): OpenAI answers by default, with GPT-6 Luna; Claude stays selectable. */
export const DEFAULT_CHAT_PROVIDER: ChatProviderId = 'openai';

/** Answers are chat-length; hitting the cap shows the answer as cut off (FR-018). */
export const MAX_OUTPUT_TOKENS = 4000;

/** Claude: input and output share the 1M window, so the input budget is 1M minus our output cap (research R8). */
const CLAUDE_BUDGET = 1_000_000 - MAX_OUTPUT_TOKENS;
/** OpenAI publishes a 922K max input for all three models (research R3). */
const OPENAI_BUDGET = 922_000;

export interface AnthropicOptions {
  kind: 'anthropic';
  /** null: send no `thinking` field (Opus 5.5 cannot turn thinking off). */
  thinking: { type: 'between_tools' } | { type: 'disabled' } | null;
  effort: 'low';
  /** Send `fallbacks: 'default'` with the server-side fallback beta header. */
  fallbacks: boolean;
}

export interface OpenAIOptions {
  kind: 'openai';
  reasoningEffort: 'none' | 'low';
}

export interface ChatModel {
  id: string;
  provider: ChatProviderId;
  /** Shown in Settings, the Ask area and under each answer. */
  label: string;
  isDefault: boolean;
  maxInputTokens: number;
  options: AnthropicOptions | OpenAIOptions;
}

export const CHAT_MODELS: readonly ChatModel[] = Object.freeze([
  {
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5.5',
    isDefault: true,
    maxInputTokens: CLAUDE_BUDGET,
    options: { kind: 'anthropic', thinking: { type: 'between_tools' }, effort: 'low', fallbacks: true },
  },
  {
    id: 'claude-opus-5-5',
    provider: 'anthropic',
    label: 'Claude Opus 5.5',
    isDefault: false,
    maxInputTokens: CLAUDE_BUDGET,
    options: { kind: 'anthropic', thinking: null, effort: 'low', fallbacks: true },
  },
  {
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    label: 'Claude Haiku 5.5',
    isDefault: false,
    maxInputTokens: CLAUDE_BUDGET,
    options: { kind: 'anthropic', thinking: { type: 'disabled' }, effort: 'low', fallbacks: false },
  },
  {
    id: 'gpt-6-luna',
    provider: 'openai',
    label: 'GPT-6 Luna',
    isDefault: true,
    maxInputTokens: OPENAI_BUDGET,
    options: { kind: 'openai', reasoningEffort: 'none' },
  },
  {
    id: 'gpt-6.1-sol',
    provider: 'openai',
    label: 'GPT-6.1 Sol',
    isDefault: false,
    maxInputTokens: OPENAI_BUDGET,
    options: { kind: 'openai', reasoningEffort: 'low' },
  },
  {
    id: 'gpt-6-astra',
    provider: 'openai',
    label: 'GPT-6 Astra',
    isDefault: false,
    maxInputTokens: OPENAI_BUDGET,
    options: { kind: 'openai', reasoningEffort: 'low' },
  },
]);

export function modelsFor(provider: ChatProviderId): ChatModel[] {
  return CHAT_MODELS.filter((m) => m.provider === provider);
}

export function findModel(id: string): ChatModel | undefined {
  return CHAT_MODELS.find((m) => m.id === id);
}

export function isModelOf(provider: ChatProviderId, id: string): boolean {
  return findModel(id)?.provider === provider;
}

export function defaultModel(provider: ChatProviderId): string {
  const model = CHAT_MODELS.find((m) => m.provider === provider && m.isDefault);
  if (!model) throw new Error(`no default model for ${provider}`);
  return model.id;
}

/** The label of a listed model, or the raw ID (an answer written by a fallback model outside the list). */
export function modelLabel(id: string): string {
  return findModel(id)?.label ?? id;
}
