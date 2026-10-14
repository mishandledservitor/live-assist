// 003 T016 (research R14, FR-014a): chat keys under their own storage keys. The panel's store can write a candidate
// or remove a key but reads nothing; only the service worker's SettingsStore reads, promotes, discards and hints.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHAT_CREDENTIAL_KEYS,
  CREDENTIALS_KEY,
  PENDING_CREDENTIAL_KEY,
  PreferencesStore,
} from '@/storage/preferences-store';
import { SettingsStore } from '@/storage/settings-store';
import { FakeStorageArea } from '../../support/fake-chrome-storage';

const CLAUDE = 'sk-ant-test-fixture-key-ab12';
const OPENAI = 'sk-test-fixture-openai-key-cd34';

/** Records every read, so a test can prove a method read nothing. */
class ReadCountingArea extends FakeStorageArea {
  reads = 0;
  override get(keys: string | string[]) {
    this.reads += 1;
    return super.get(keys);
  }
}

describe('chat credential storage keys (research R14)', () => {
  it('are separate per provider, saved and pending', () => {
    expect(CHAT_CREDENTIAL_KEYS).toEqual({
      anthropic: { saved: 'anthropicCredential', pending: 'pendingAnthropicCredential' },
      openai: { saved: 'openaiCredential', pending: 'pendingOpenaiCredential' },
    });
  });
});

describe('PreferencesStore (the panel side): write-only', () => {
  let area: ReadCountingArea;
  let panel: PreferencesStore;
  beforeEach(() => {
    area = new ReadCountingArea();
    panel = new PreferencesStore(area);
  });

  it.each([
    ['anthropic', 'pendingAnthropicCredential', CLAUDE],
    ['openai', 'pendingOpenaiCredential', OPENAI],
  ] as const)('writePendingChatKey(%s) does one set of %s and reads nothing', async (provider, key, value) => {
    await panel.writePendingChatKey(provider, `  ${value} `);
    expect(area.writes).toEqual([{ op: 'set', keys: [key] }]);
    expect(area.data.get(key)).toBe(value);
    expect(area.reads).toBe(0);
  });

  it('refuses an empty candidate', async () => {
    await expect(panel.writePendingChatKey('anthropic', '   ')).rejects.toThrow('empty');
    expect(area.writes).toEqual([]);
  });

  it.each([
    ['anthropic', ['anthropicCredential', 'pendingAnthropicCredential']],
    ['openai', ['openaiCredential', 'pendingOpenaiCredential']],
  ] as const)('removeChatKey(%s) does one remove of saved and pending and reads nothing', async (provider, keys) => {
    area.data.set(keys[0], 'x');
    area.data.set(keys[1], 'y');
    await panel.removeChatKey(provider);
    expect(area.writes).toEqual([{ op: 'remove', keys: [...keys] }]);
    expect(area.data.has(keys[0])).toBe(false);
    expect(area.data.has(keys[1])).toBe(false);
    expect(area.reads).toBe(0);
  });

  it('has no way to read a chat key', () => {
    const p = panel as unknown as Record<string, unknown>;
    for (const name of ['readChatKey', 'readPendingChatKey', 'promotePendingChatKey', 'chatKeyHints'])
      expect(p[name]).toBeUndefined();
  });
});

describe('SettingsStore (the service worker side)', () => {
  let area: FakeStorageArea;
  let store: SettingsStore;
  beforeEach(() => {
    area = new FakeStorageArea();
    store = new SettingsStore(area);
  });

  it('reads nothing when no chat key is stored', async () => {
    expect(await store.readChatKey('anthropic')).toBeNull();
    expect(await store.readPendingChatKey('openai')).toBeNull();
    expect(await store.chatKeyHints()).toEqual({ anthropic: null, openai: null });
  });

  it('promotes a candidate into the saved key and removes the candidate', async () => {
    await store.writePendingChatKey('anthropic', CLAUDE);
    expect(await store.readPendingChatKey('anthropic')).toBe(CLAUDE);
    expect(await store.readChatKey('anthropic')).toBeNull();
    await store.promotePendingChatKey('anthropic');
    expect(await store.readChatKey('anthropic')).toBe(CLAUDE);
    expect(await store.readPendingChatKey('anthropic')).toBeNull();
    expect(area.data.get('anthropicCredential')).toBe(CLAUDE);
  });

  it('promote without a candidate keeps the saved key', async () => {
    await store.writePendingChatKey('openai', OPENAI);
    await store.promotePendingChatKey('openai');
    await store.promotePendingChatKey('openai');
    expect(await store.readChatKey('openai')).toBe(OPENAI);
  });

  it('discard drops only the candidate', async () => {
    await store.writePendingChatKey('openai', OPENAI);
    await store.promotePendingChatKey('openai');
    await store.writePendingChatKey('openai', 'sk-test-other-ffff');
    await store.discardPendingChatKey('openai');
    expect(await store.readPendingChatKey('openai')).toBeNull();
    expect(await store.readChatKey('openai')).toBe(OPENAI);
  });

  it('chatKeyHints gives only the last four characters of each saved key', async () => {
    await store.writePendingChatKey('anthropic', CLAUDE);
    await store.promotePendingChatKey('anthropic');
    await store.writePendingChatKey('openai', OPENAI); // a candidate is not a saved key
    expect(await store.chatKeyHints()).toEqual({ anthropic: 'ab12', openai: null });
  });

  it('a non-string stored value reads as no key', async () => {
    area.data.set('anthropicCredential', { key: CLAUDE });
    area.data.set('pendingOpenaiCredential', '');
    expect(await store.readChatKey('anthropic')).toBeNull();
    expect(await store.readPendingChatKey('openai')).toBeNull();
  });

  it('the providers do not share a slot', async () => {
    await store.writePendingChatKey('anthropic', CLAUDE);
    await store.promotePendingChatKey('anthropic');
    expect(await store.readChatKey('openai')).toBeNull();
    await store.removeChatKey('openai');
    expect(await store.readChatKey('anthropic')).toBe(CLAUDE);
  });

  it('replacing or removing the ElevenLabs key leaves both chat keys untouched (research R14)', async () => {
    for (const [p, k] of [
      ['anthropic', CLAUDE],
      ['openai', OPENAI],
    ] as const) {
      await store.writePendingChatKey(p, k);
      await store.promotePendingChatKey(p);
    }
    await store.writePendingKey('sk_test_fixture_elevenlabs_0001');
    await store.promotePendingKey();
    expect(area.data.get(CREDENTIALS_KEY)).toEqual({ elevenLabsApiKey: 'sk_test_fixture_elevenlabs_0001' });
    expect(await store.readChatKey('anthropic')).toBe(CLAUDE);
    expect(await store.readChatKey('openai')).toBe(OPENAI);
    await store.removeKey();
    expect(area.data.has(PENDING_CREDENTIAL_KEY)).toBe(false);
    expect(await store.readChatKey('anthropic')).toBe(CLAUDE);
    expect(await store.readChatKey('openai')).toBe(OPENAI);
  });
});
