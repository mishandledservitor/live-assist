import { describe, expect, it, vi } from 'vitest';
import type { Command } from '@/core/messaging/protocol';
import { createSettingsApi, MIC_PERMISSION_PAGE } from '@/entrypoints/sidepanel/settings-api';
import { PanelSettingsStore } from '@/storage/panel-settings-store';
import { CREDENTIALS_KEY, PENDING_CREDENTIAL_KEY, SettingsStore } from '@/storage/settings-store';
import { FakeStorageArea } from '../../support/fake-chrome-storage';

const KEY = 'sk_test_fixture_api_9z8y';

/**
 * Red-team 2026-10-08 (001 T109, FR-003a): the panel never reads the key. Its store sits on a view of storage that
 * throws on any read of the credentials or the pending candidate, so every panel path below proves it.
 */
class PanelView extends FakeStorageArea {
  constructor(private readonly backing: FakeStorageArea) {
    super();
  }
  override get(keys: string | string[]): Promise<Record<string, unknown>> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.some((k) => k === CREDENTIALS_KEY || k === PENDING_CREDENTIAL_KEY))
      throw new Error(`the side panel read ${list.join(', ')}`);
    return this.backing.get(keys);
  }
  override set(items: Record<string, unknown>): Promise<void> {
    return this.backing.set(items);
  }
  override remove(keys: string | string[]): Promise<void> {
    return this.backing.remove(keys);
  }
}

/** `store` is the service worker's view (full access); the api gets only the panel's. */
function setup(reply: (store: SettingsStore) => Promise<unknown>) {
  const area = new FakeStorageArea();
  const store = new SettingsStore(area);
  const sent: Command[] = [];
  const openTab = vi.fn(() => Promise.resolve());
  const api = createSettingsApi({
    store: new PanelSettingsStore(new PanelView(area)),
    sendCommand: async (c) => {
      sent.push(c);
      // The service worker answers the hint itself, as background/index.ts does.
      if (c.type === 'settings/key-hint') return { hint: await store.keyHint() };
      return reply(store);
    },
    openTab,
  });
  return { api, store, area, sent, openTab };
}

describe('createSettingsApi', () => {
  it('writes the candidate as pending, then sends a validate-key command without the key', async () => {
    const h = setup(async (store) => {
      expect(await store.readPendingKey()).toBe(KEY);
      await store.promotePendingKey();
      return { ok: true, hint: '9z8y' };
    });
    expect(await h.api.validateKey(KEY)).toEqual({ ok: true, hint: '9z8y' });
    expect(h.sent).toEqual([{ type: 'settings/validate-key' }]);
    expect(JSON.stringify(h.sent)).not.toContain(KEY);
    expect(await h.api.load()).toMatchObject({ keyHint: '9z8y' });
  });

  it('passes failure kinds through', async () => {
    const h = setup(() => Promise.resolve({ ok: false, kind: 'forbidden' }));
    expect(await h.api.validateKey(KEY)).toEqual({ ok: false, kind: 'forbidden' });
  });

  it('discards the pending key and reports unknown when the service worker does not answer properly', async () => {
    const bad = setup(() => Promise.resolve(undefined));
    expect(await bad.api.validateKey(KEY)).toEqual({ ok: false, kind: 'unknown' });
    expect(await bad.store.readPendingKey()).toBeNull();

    const thrown = setup(() => Promise.reject(new Error('Receiving end does not exist')));
    expect(await thrown.api.validateKey(KEY)).toEqual({ ok: false, kind: 'unknown' });
    expect(await thrown.store.readPendingKey()).toBeNull();
  });

  it('loads and saves settings through the store, and removes the key', async () => {
    const h = setup(() => Promise.resolve({ ok: true, hint: 'x' }));
    await h.api.saveSettings({ userName: 'Alex', keyterms: ['Northwind', 'northwind'] });
    expect((await h.api.load()).settings).toMatchObject({ userName: 'Alex', keyterms: ['Northwind'] });
    await h.store.setPendingKey(KEY);
    await h.store.promotePendingKey();
    await h.api.removeKey();
    expect((await h.api.load()).keyHint).toBeNull();
  });

  it('replacing a saved key never reads it: the old key stays until the service worker promotes the new one', async () => {
    const h = setup(async (store) => {
      expect(await store.readApiKey()).toBe('sk_test_fixture_old_0ld9');
      await store.promotePendingKey();
      return { ok: true, hint: '9z8y' };
    });
    await h.store.setPendingKey('sk_test_fixture_old_0ld9');
    await h.store.promotePendingKey();
    expect(await h.api.load()).toMatchObject({ keyHint: '0ld9' });
    expect(await h.api.validateKey(KEY)).toEqual({ ok: true, hint: '9z8y' });
    expect(await h.store.readApiKey()).toBe(KEY);
  });

  it('takes the key hint from the service worker, and reads a malformed reply as no key', async () => {
    const h = setup(() => Promise.resolve(undefined));
    await h.store.setPendingKey(KEY);
    await h.store.promotePendingKey();
    expect((await h.api.load()).keyHint).toBe('9z8y');
    // 003: load also asks for the chat key hints (settings-api-chat.test.ts).
    expect(h.sent).toEqual([{ type: 'settings/key-hint' }, { type: 'settings/chat-key-hints' }]);

    const odd = createSettingsApi({
      store: new PanelSettingsStore(new PanelView(h.area)),
      sendCommand: () => Promise.resolve({ hint: KEY }),
      openTab: () => Promise.resolve(),
    });
    expect((await odd.load()).keyHint).toBeNull();
    const down = createSettingsApi({
      store: new PanelSettingsStore(new PanelView(h.area)),
      sendCommand: () => Promise.reject(new Error('Receiving end does not exist')),
      openTab: () => Promise.resolve(),
    });
    expect((await down.load()).keyHint).toBeNull();
  });

  it('opens the microphone permission page', async () => {
    const h = setup(() => Promise.resolve(null));
    await h.api.openMicPermission();
    expect(h.openTab).toHaveBeenCalledWith(MIC_PERMISSION_PAGE);
  });
  // T059/T060: Settings → Remembered names through the store (002 FR-022).
  it('lists, remembers and forgets speaker names through the settings store', async () => {
    const h = setup(() => Promise.resolve(undefined));
    await h.api.rememberSpeakerName('Emma Jones', 'Emma');
    expect((await h.api.listSpeakerNames()).map((m) => [m.captionName, m.displayName])).toEqual([
      ['Emma Jones', 'Emma'],
    ]);
    expect((await h.store.getSettings()).speakerNameMappings).toHaveLength(1);
    await h.api.forgetSpeakerName('Emma Jones');
    expect(await h.api.listSpeakerNames()).toEqual([]);
  });

  // T082: Settings → Remembered names must hear about renames made through the transcript (MeetingApi) and elsewhere.
  it('tells listeners after each remember and forget, until they unsubscribe', async () => {
    const h = setup(() => Promise.resolve(undefined));
    const heard: string[][] = [];
    const off = h.api.onSpeakerNamesChanged(() => {
      void h.api.listSpeakerNames().then((l) => heard.push(l.map((m) => m.displayName)));
    });
    await h.api.rememberSpeakerName('Emma Jones', 'Emma');
    await vi.waitFor(() => expect(heard).toEqual([['Emma']]));
    await h.api.forgetSpeakerName('Emma Jones');
    await vi.waitFor(() => expect(heard).toEqual([['Emma'], []]));
    off();
    await h.api.rememberSpeakerName('Jane D.', 'Jane');
    await new Promise((r) => setTimeout(r, 10));
    expect(heard).toHaveLength(2);
  });
});
