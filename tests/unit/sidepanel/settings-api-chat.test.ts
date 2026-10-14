// 003 T060: the panel's settings api for chat (contracts/chat-messages.md, FR-014a). The panel writes a chat-key
// candidate into its write-only slot and asks the service worker to check it; it never reads a chat key, and learns
// only each key's last four characters.
import { describe, expect, it } from 'vitest';
import type { Command } from '@/core/messaging/protocol';
import { createSettingsApi } from '@/entrypoints/sidepanel/settings-api';
import { PanelSettingsStore } from '@/storage/panel-settings-store';
import { CHAT_CREDENTIAL_KEYS, CREDENTIALS_KEY, PENDING_CREDENTIAL_KEY } from '@/storage/preferences-store';
import { SettingsStore } from '@/storage/settings-store';
import { FakeStorageArea } from '../../support/fake-chrome-storage';

const CLAUDE_KEY = 'test-claude-fixture-key-c1d2';
const OPENAI_KEY = 'test-openai-fixture-key-o3p4';

const SECRET_KEYS = new Set<string>([
  CREDENTIALS_KEY,
  PENDING_CREDENTIAL_KEY,
  ...Object.values(CHAT_CREDENTIAL_KEYS).flatMap((k) => [k.saved, k.pending]),
]);

/** The panel's view of storage: any read of a saved or pending key throws. */
class PanelView extends FakeStorageArea {
  constructor(private readonly backing: FakeStorageArea) {
    super();
  }
  override get(keys: string | string[]): Promise<Record<string, unknown>> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.some((k) => SECRET_KEYS.has(k))) throw new Error(`the side panel read ${list.join(', ')}`);
    return this.backing.get(keys);
  }
  override set(items: Record<string, unknown>): Promise<void> {
    return this.backing.set(items);
  }
  override remove(keys: string | string[]): Promise<void> {
    return this.backing.remove(keys);
  }
}

/** `store` is the service worker's view; `validate` scripts its reply to `settings/validate-chat-key`. */
function setup(validate: (store: SettingsStore, provider: 'anthropic' | 'openai') => Promise<unknown>) {
  const area = new FakeStorageArea();
  const store = new SettingsStore(area);
  const sent: Command[] = [];
  const api = createSettingsApi({
    store: new PanelSettingsStore(new PanelView(area)),
    sendCommand: async (c) => {
      sent.push(c);
      if (c.type === 'settings/key-hint') return { hint: await store.keyHint() };
      if (c.type === 'settings/chat-key-hints') return store.chatKeyHints();
      if (c.type === 'settings/validate-chat-key') return validate(store, c.provider);
      return undefined;
    },
    openTab: () => Promise.resolve(),
  });
  return { api, store, area, sent };
}

const promote = async (store: SettingsStore, provider: 'anthropic' | 'openai') => {
  await store.promotePendingChatKey(provider);
  return { ok: true, hint: (await store.chatKeyHints())[provider] };
};

describe('settings api: chat', () => {
  it('load() includes the chat settings and both chat key hints', async () => {
    const h = setup(promote);
    await h.area.set({ anthropicCredential: CLAUDE_KEY });
    const loaded = await h.api.load();
    expect(loaded.settings.chat).toEqual({
      provider: 'openai',
      models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
      setupComplete: false,
    });
    expect(loaded.chatKeyHints).toEqual({ anthropic: 'c1d2', openai: null });
    expect(h.sent).toContainEqual({ type: 'settings/chat-key-hints' });
  });

  it('load() reads a malformed or missing hints reply as no keys', async () => {
    const area = new FakeStorageArea();
    const api = createSettingsApi({
      store: new PanelSettingsStore(new PanelView(area)),
      sendCommand: (c) =>
        Promise.resolve(c.type === 'settings/chat-key-hints' ? { anthropic: CLAUDE_KEY, openai: 7 } : undefined),
      openTab: () => Promise.resolve(),
    });
    expect((await api.load()).chatKeyHints).toEqual({ anthropic: null, openai: null });
    const down = createSettingsApi({
      store: new PanelSettingsStore(new PanelView(area)),
      sendCommand: () => Promise.reject(new Error('Receiving end does not exist')),
      openTab: () => Promise.resolve(),
    });
    expect((await down.load()).chatKeyHints).toEqual({ anthropic: null, openai: null });
  });

  it.each([
    ['anthropic', CLAUDE_KEY, 'c1d2'],
    ['openai', OPENAI_KEY, 'o3p4'],
  ] as const)(
    'replaceChatKey(%s) writes the candidate, then sends validate-chat-key without the key',
    async (provider, key, hint) => {
      const h = setup(async (store, p) => {
        expect(p).toBe(provider);
        expect(await store.readPendingChatKey(provider)).toBe(key);
        return promote(store, p);
      });
      expect(await h.api.replaceChatKey(provider, `  ${key} `)).toEqual({ ok: true, hint });
      expect(h.sent).toEqual([{ type: 'settings/validate-chat-key', provider }]);
      expect(JSON.stringify(h.sent)).not.toContain(key);
      expect(await h.store.readChatKey(provider)).toBe(key);
    },
  );

  it('passes failure kinds through', async () => {
    const h = setup(() => Promise.resolve({ ok: false, kind: 'invalid-key' }));
    expect(await h.api.replaceChatKey('openai', OPENAI_KEY)).toEqual({ ok: false, kind: 'invalid-key' });
  });

  it('a malformed or missing reply → unknown, and the candidate is discarded', async () => {
    const bad = setup(() => Promise.resolve({ ok: true, hint: OPENAI_KEY }));
    expect(await bad.api.replaceChatKey('openai', OPENAI_KEY)).toEqual({ ok: false, kind: 'unknown' });
    expect(await bad.store.readPendingChatKey('openai')).toBeNull();

    const thrown = setup(() => Promise.reject(new Error('Receiving end does not exist')));
    expect(await thrown.api.replaceChatKey('anthropic', CLAUDE_KEY)).toEqual({ ok: false, kind: 'unknown' });
    expect(await thrown.store.readPendingChatKey('anthropic')).toBeNull();
  });

  it('an empty key is missing-key and nothing is written or sent', async () => {
    const h = setup(promote);
    expect(await h.api.replaceChatKey('openai', '   ')).toEqual({ ok: false, kind: 'missing-key' });
    expect(h.sent).toEqual([]);
    expect(h.area.writes).toEqual([]);
  });

  it('removeChatKey(provider) removes that provider only', async () => {
    const h = setup(promote);
    await h.area.set({ anthropicCredential: CLAUDE_KEY, openaiCredential: OPENAI_KEY });
    await h.api.removeChatKey('anthropic');
    expect(await h.store.readChatKey('anthropic')).toBeNull();
    expect(await h.store.readChatKey('openai')).toBe(OPENAI_KEY);
  });

  it('saveChatSettings sets the provider and that provider’s model, keeping the other provider’s choice', async () => {
    const h = setup(promote);
    await h.api.saveChatSettings({ provider: 'openai', model: 'gpt-6.1-sol' });
    let saved = await h.api.saveChatSettings({ provider: 'anthropic', model: 'claude-haiku-5-5' });
    expect(saved.chat).toEqual({
      provider: 'anthropic',
      models: { anthropic: 'claude-haiku-5-5', openai: 'gpt-6.1-sol' },
      setupComplete: false,
    });
    saved = await h.api.saveChatSettings({ provider: 'openai' });
    expect(saved.chat.models).toEqual({ anthropic: 'claude-haiku-5-5', openai: 'gpt-6.1-sol' });
    expect(saved.chat.provider).toBe('openai');
    saved = await h.api.saveChatSettings({ provider: 'openai', setupComplete: true });
    expect(saved.chat.setupComplete).toBe(true);
    expect((await h.store.getSettings()).chat).toEqual(saved.chat);
  });

  it('saveChatSettings ignores a model of the other provider', async () => {
    const h = setup(promote);
    const saved = await h.api.saveChatSettings({ provider: 'openai', model: 'claude-opus-5-5' });
    expect(saved.chat.models.openai).toBe('gpt-6-luna');
  });

  it('saveChatSettings keeps the rest of the settings', async () => {
    const h = setup(promote);
    await h.api.saveSettings({ userName: 'Alex', keyterms: ['Northwind'] });
    const saved = await h.api.saveChatSettings({ provider: 'anthropic' });
    expect(saved).toMatchObject({ userName: 'Alex', keyterms: ['Northwind'] });
  });
});
