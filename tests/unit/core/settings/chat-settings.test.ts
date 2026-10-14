// 003 T006: `settings.chat` (data-model ChatSettings): parsed with defaults, never holding a key.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '@/core/settings/schema';

// Design decision 40 (constitution v1.1.1): OpenAI → GPT-6 Luna by default; Claude Sonnet 5.5 stays Claude's default.
const DEFAULT_CHAT = {
  provider: 'openai',
  models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
  setupComplete: false,
};

describe('parseSettings: chat (003 data-model ChatSettings)', () => {
  it('defaults include the chat settings, with the chat setup step not done', () => {
    expect(DEFAULT_SETTINGS.chat).toEqual(DEFAULT_CHAT);
  });

  it.each([undefined, null, 'claude', 42, true])(
    'reads a missing or malformed chat (%s) as the defaults',
    (chat: unknown) => {
      expect(parseSettings({ userName: 'Alex', chat }).chat).toEqual(DEFAULT_CHAT);
    },
  );

  it('reads nothing stored as the defaults', () => {
    expect(parseSettings(undefined).chat).toEqual(DEFAULT_CHAT);
  });

  it('reads an unknown provider as the default provider, OpenAI', () => {
    expect(parseSettings({ chat: { provider: 'gemini' } }).chat.provider).toBe('openai');
  });

  it('keeps Claude when it is chosen', () => {
    expect(parseSettings({ chat: { provider: 'anthropic' } }).chat.provider).toBe('anthropic');
  });

  it("reads a model not in the provider's list as that provider's default", () => {
    const chat = parseSettings({
      chat: { provider: 'openai', models: { anthropic: 'gpt-6-luna', openai: 'claude-opus-5-5' }, setupComplete: true },
    }).chat;
    expect(chat.models).toEqual({ anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' });
  });

  it('keeps valid values', () => {
    const chat = {
      provider: 'openai',
      models: { anthropic: 'claude-haiku-5-5', openai: 'gpt-6-astra' },
      setupComplete: true,
    };
    expect(parseSettings({ chat }).chat).toEqual(chat);
  });

  it('a non-boolean setupComplete reads as false', () => {
    expect(parseSettings({ chat: { setupComplete: 'yes' } }).chat.setupComplete).toBe(false);
  });

  it('drops every other field, so nothing named like a key survives', () => {
    const chat = parseSettings({
      chat: {
        provider: 'anthropic',
        apiKey: 'sk-ant-fixture',
        anthropicCredential: 'x',
        models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6.1-sol', token: 'y' },
        setupComplete: true,
      },
    }).chat;
    expect(Object.keys(chat).sort()).toEqual(['models', 'provider', 'setupComplete']);
    expect(Object.keys(chat.models).sort()).toEqual(['anthropic', 'openai']);
    expect(JSON.stringify(chat)).not.toMatch(/key|credential|token/i);
  });
});
