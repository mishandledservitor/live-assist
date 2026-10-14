// 003 T004: curated model lists (design decision 21, research R3) and per-model request options (research R4).
import { describe, expect, it } from 'vitest';
import {
  CHAT_MODELS,
  CHAT_PROVIDERS,
  DEFAULT_CHAT_PROVIDER,
  MAX_OUTPUT_TOKENS,
  defaultModel,
  findModel,
  isModelOf,
  modelLabel,
  modelsFor,
} from '@/core/chat/models';

describe('curated chat models (research R3)', () => {
  it('lists the two providers', () => {
    expect(CHAT_PROVIDERS).toEqual(['anthropic', 'openai']);
  });

  it('lists three Claude models with their labels and budgets', () => {
    expect(modelsFor('anthropic').map((m) => [m.id, m.label, m.maxInputTokens])).toEqual([
      ['claude-sonnet-5-5', 'Claude Sonnet 5.5', 996_000],
      ['claude-opus-5-5', 'Claude Opus 5.5', 996_000],
      ['claude-haiku-5-5', 'Claude Haiku 5.5', 996_000],
    ]);
  });

  it('lists three OpenAI models with their labels and budgets, the default first', () => {
    expect(modelsFor('openai').map((m) => [m.id, m.label, m.maxInputTokens])).toEqual([
      ['gpt-6-luna', 'GPT-6 Luna', 922_000],
      ['gpt-6.1-sol', 'GPT-6.1 Sol', 922_000],
      ['gpt-6-astra', 'GPT-6 Astra', 922_000],
    ]);
  });

  // Design decision 40 (constitution v1.1.1): OpenAI GPT-6 Luna is the default; Claude stays selectable.
  it('the default provider is OpenAI', () => {
    expect(DEFAULT_CHAT_PROVIDER).toBe('openai');
  });

  it('has exactly one default per provider', () => {
    for (const p of CHAT_PROVIDERS) expect(modelsFor(p).filter((m) => m.isDefault)).toHaveLength(1);
    expect(defaultModel('anthropic')).toBe('claude-sonnet-5-5');
    expect(defaultModel('openai')).toBe('gpt-6-luna');
  });

  it('every model belongs to the provider it is listed under', () => {
    for (const m of CHAT_MODELS) expect(isModelOf(m.provider, m.id)).toBe(true);
    expect(isModelOf('openai', 'claude-sonnet-5-5')).toBe(false);
    expect(isModelOf('anthropic', 'claude-fable-5-1')).toBe(false);
  });

  it('answers are capped at 4,000 output tokens', () => {
    expect(MAX_OUTPUT_TOKENS).toBe(4000);
  });
});

describe('per-model request options (research R4)', () => {
  const options = (id: string) => findModel(id)?.options;

  it('Sonnet 5.5: thinking between_tools (off), effort low, server-side fallback', () => {
    expect(options('claude-sonnet-5-5')).toEqual({
      kind: 'anthropic',
      thinking: { type: 'between_tools' },
      effort: 'low',
      fallbacks: true,
    });
  });

  it('Opus 5.5: no thinking field (it cannot be turned off), effort low, server-side fallback', () => {
    expect(options('claude-opus-5-5')).toEqual({ kind: 'anthropic', thinking: null, effort: 'low', fallbacks: true });
  });

  it('Haiku 5.5: thinking disabled, effort low, no fallback', () => {
    expect(options('claude-haiku-5-5')).toEqual({
      kind: 'anthropic',
      thinking: { type: 'disabled' },
      effort: 'low',
      fallbacks: false,
    });
  });

  it.each([
    ['gpt-6.1-sol', 'low'],
    ['gpt-6-luna', 'none'],
    ['gpt-6-astra', 'low'],
  ])('%s: reasoning effort %s', (id, effort) => {
    expect(options(id)).toEqual({ kind: 'openai', reasoningEffort: effort });
  });
});

describe('modelLabel', () => {
  it('gives the label of a listed model', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Claude Opus 5.5');
    expect(modelLabel('gpt-6-luna')).toBe('GPT-6 Luna');
  });

  it('gives the raw ID of a model outside the list (e.g. a server-side fallback)', () => {
    expect(modelLabel('claude-sonnet-5')).toBe('claude-sonnet-5');
    expect(findModel('claude-sonnet-5')).toBeUndefined();
  });
});
