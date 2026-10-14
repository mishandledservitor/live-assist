// In-memory SettingsApi for side panel component tests: records calls, lets tests script validation results.
import { vi } from 'vitest';
import { isModelOf, type ChatProviderId } from '@/core/chat/models';
import type { ChatKeyHintsReply, ValidateChatKeyReply, ValidateKeyResult } from '@/core/messaging/protocol';
import { DEFAULT_SETTINGS, forgetMapping, rememberMapping, type Settings } from '@/core/settings/schema';
import type { SettingsApi } from '@/entrypoints/sidepanel/settings-api';

export function fakeSettingsApi(
  initial: Partial<Settings> = {},
  keyHint: string | null = null,
  chatKeyHints?: ChatKeyHintsReply,
) {
  // An install whose first run is done has also done 003's chat step, unless a test passes its own `chat`.
  const chat = { ...DEFAULT_SETTINGS.chat, setupComplete: initial.firstRunComplete === true };
  const state = {
    settings: { ...DEFAULT_SETTINGS, keyterms: [], speakerNameMappings: [], chat, ...initial } as Settings,
    keyHint,
    // An install that finished setup has a key for each provider unless a test says otherwise.
    chatKeyHints:
      chatKeyHints ??
      (initial.firstRunComplete === true ? { anthropic: 'wxyz', openai: 'abcd' } : { anthropic: null, openai: null }),
  };
  let nextValidation: ValidateKeyResult = { ok: true, hint: 'a1b2' };
  /** 003: scripted chat-key checks, per provider; the default passes with hint `c3d4`. */
  const nextChatValidation: Record<ChatProviderId, ValidateChatKeyReply> = {
    anthropic: { ok: true, hint: 'c3d4' },
    openai: { ok: true, hint: 'c3d4' },
  };
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const l of listeners) l();
  };
  const api = {
    load: vi.fn(() =>
      Promise.resolve({ settings: state.settings, keyHint: state.keyHint, chatKeyHints: { ...state.chatKeyHints } }),
    ),
    saveSettings: vi.fn((patch: Partial<Settings>) => {
      state.settings = { ...state.settings, ...patch };
      return Promise.resolve(state.settings);
    }),
    validateKey: vi.fn((_candidate: string) => {
      if (nextValidation.ok) state.keyHint = nextValidation.hint;
      return Promise.resolve(nextValidation);
    }),
    removeKey: vi.fn(() => {
      state.keyHint = null;
      return Promise.resolve();
    }),
    replaceChatKey: vi.fn((provider: ChatProviderId, candidate: string) => {
      if (candidate.trim() === '') return Promise.resolve<ValidateChatKeyReply>({ ok: false, kind: 'missing-key' });
      const result = nextChatValidation[provider];
      if (result.ok) state.chatKeyHints = { ...state.chatKeyHints, [provider]: result.hint };
      return Promise.resolve(result);
    }),
    removeChatKey: vi.fn((provider: ChatProviderId) => {
      state.chatKeyHints = { ...state.chatKeyHints, [provider]: null };
      return Promise.resolve();
    }),
    saveChatSettings: vi.fn(
      ({ provider, model, setupComplete }: { provider: ChatProviderId; model?: string; setupComplete?: boolean }) => {
        const chat = state.settings.chat;
        state.settings = {
          ...state.settings,
          chat: {
            provider,
            models:
              model !== undefined && isModelOf(provider, model) ? { ...chat.models, [provider]: model } : chat.models,
            setupComplete: setupComplete ?? chat.setupComplete,
          },
        };
        return Promise.resolve(state.settings);
      },
    ),
    openMicPermission: vi.fn(() => Promise.resolve()),
    listSpeakerNames: vi.fn(() => Promise.resolve(state.settings.speakerNameMappings)),
    rememberSpeakerName: vi.fn((captionName: string, displayName: string) => {
      state.settings = {
        ...state.settings,
        speakerNameMappings: rememberMapping(state.settings.speakerNameMappings, captionName, displayName, Date.now()),
      };
      changed();
      return Promise.resolve();
    }),
    forgetSpeakerName: vi.fn((captionName: string) => {
      state.settings = {
        ...state.settings,
        speakerNameMappings: forgetMapping(state.settings.speakerNameMappings, captionName),
      };
      changed();
      return Promise.resolve();
    }),
    onSpeakerNamesChanged: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    }),
  } satisfies SettingsApi;
  return {
    api,
    state,
    failNextValidation(kind: Extract<ValidateKeyResult, { ok: false }>['kind']) {
      nextValidation = { ok: false, kind };
    },
    /** 003: the next chat-key checks for `provider` give `result`. */
    setChatValidation(provider: ChatProviderId, result: ValidateChatKeyReply) {
      nextChatValidation[provider] = result;
    },
  };
}
