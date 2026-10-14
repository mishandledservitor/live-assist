// 003 T058: chat-key commands answered by the service worker. The panel learns whether each chat key is saved only as
// its last four characters, through ChatCredentialSource.status; a candidate key is checked with its provider, then
// promoted or discarded, and only a hint or an error kind goes back.
import { describe, expect, it } from 'vitest';
import type { ChatCredentialSource } from '@/core/chat/provider';
import {
  answerChatKeyHints,
  validatePendingChatKey,
  type ValidateChatKeyDeps,
} from '@/entrypoints/background/chat-keys';
import { createChatProvider } from '@/providers/chat/factory';
import { PreferencesStore } from '@/storage/preferences-store';
import { SettingsStore } from '@/storage/settings-store';
import { fixtureFetch, readChatFixture } from '../../support/chat-fixtures';
import { FakeStorageArea } from '../../support/fake-chrome-storage';

const source = (hints: Partial<Record<'anthropic' | 'openai', string>>): ChatCredentialSource => ({
  id: 'local-key',
  status: (p) => Promise.resolve(hints[p] ? { configured: true, hint: hints[p] } : { configured: false }),
  providerFor: () => Promise.resolve(null),
});

describe('answerChatKeyHints', () => {
  it('gives each provider its last four characters, or null', async () => {
    expect(await answerChatKeyHints(source({ anthropic: 'wxyz' }))).toEqual({ anthropic: 'wxyz', openai: null });
    expect(await answerChatKeyHints(source({}))).toEqual({ anthropic: null, openai: null });
  });

  it('never passes on more than four characters', async () => {
    expect(await answerChatKeyHints(source({ openai: 'sk-test-whole-key-abcd' }))).toEqual({
      anthropic: null,
      openai: 'abcd',
    });
  });
});

describe('validatePendingChatKey', () => {
  const CANDIDATE = 'test-chat-candidate-key-wxyz';

  async function setup(
    fixture: string,
    provider: 'anthropic' | 'openai' = 'openai',
    candidate: string | null = CANDIDATE,
  ) {
    const area = new FakeStorageArea();
    if (candidate !== null) await new PreferencesStore(area).writePendingChatKey(provider, candidate);
    const { fetch, requests } = fixtureFetch(readChatFixture(provider, fixture));
    const keysSeen: string[] = [];
    const store = new SettingsStore(area);
    const deps: ValidateChatKeyDeps = {
      store,
      providerWithKey: (p, key) => {
        keysSeen.push(key);
        return createChatProvider(p, key, fetch);
      },
    };
    return { area, deps, requests, keysSeen, store };
  }

  it.each(['anthropic', 'openai'] as const)('%s: success promotes the candidate and returns the hint', async (p) => {
    const s = await setup('c14-check-key-200', p);
    expect(await validatePendingChatKey(p, s.deps)).toEqual({ ok: true, hint: 'wxyz' });
    expect(s.keysSeen).toEqual([CANDIDATE]);
    expect(await s.store.readChatKey(p)).toBe(CANDIDATE);
    expect(await s.store.readPendingChatKey(p)).toBeNull();
  });

  it.each([
    ['c14-check-key-401', 'invalid-key'],
    ['c14-check-key-403', 'forbidden'],
    ['c10-network', 'network'],
  ] as const)('%s discards the candidate and returns %s', async (fixture, kind) => {
    const s = await setup(fixture);
    expect(await validatePendingChatKey('openai', s.deps)).toEqual({ ok: false, kind });
    expect(await s.store.readChatKey('openai')).toBeNull();
    expect(await s.store.readPendingChatKey('openai')).toBeNull();
  });

  it('a rejected candidate keeps the key saved before it', async () => {
    const s = await setup('c14-check-key-401');
    await s.area.set({ openaiCredential: 'test-earlier-saved-key-1234' });
    expect(await validatePendingChatKey('openai', s.deps)).toEqual({ ok: false, kind: 'invalid-key' });
    expect(await s.store.readChatKey('openai')).toBe('test-earlier-saved-key-1234');
  });

  it('no candidate → missing-key and no request', async () => {
    const s = await setup('c14-check-key-200', 'anthropic', null);
    expect(await validatePendingChatKey('anthropic', s.deps)).toEqual({ ok: false, kind: 'missing-key' });
    expect(s.keysSeen).toEqual([]);
    expect(s.requests).toEqual([]);
  });

  it('the check request carries no transcript or chat, and the reply holds no key', async () => {
    const s = await setup('c14-check-key-200', 'anthropic');
    const reply = await validatePendingChatKey('anthropic', s.deps);
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0]!.method).toBe('GET');
    expect(s.requests[0]!.body ?? '').toBe('');
    expect(JSON.stringify(reply)).not.toContain(CANDIDATE);
  });

  it('the other provider and the ElevenLabs key are untouched', async () => {
    const s = await setup('c14-check-key-200', 'openai');
    await s.area.set({ anthropicCredential: 'test-claude-saved-key-5678', credentials: { elevenLabsApiKey: 'x' } });
    await validatePendingChatKey('openai', s.deps);
    expect(await s.store.readChatKey('anthropic')).toBe('test-claude-saved-key-5678');
    expect(s.area.data.get('credentials')).toEqual({ elevenLabsApiKey: 'x' });
  });
});
