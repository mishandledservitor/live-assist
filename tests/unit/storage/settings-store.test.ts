import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/settings/schema';
import { CREDENTIALS_KEY, SETTINGS_KEY, SettingsStore } from '@/storage/settings-store';
import { FakeStorageArea, installFakeChromeStorage } from '../../support/fake-chrome-storage';

const KEY = 'sk_test_fixture_0000a1b2';

describe('SettingsStore', () => {
  let area: FakeStorageArea;
  let store: SettingsStore;

  beforeEach(() => {
    area = new FakeStorageArea();
    store = new SettingsStore(area);
  });

  it('returns defaults when nothing is stored', async () => {
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings and normalizes keyterms', async () => {
    await store.saveSettings({ userName: 'Alex', keyterms: ['Meet', 'meet', ' Scribe '], consentReminder: false });
    const fresh = new SettingsStore(area);
    expect(await fresh.getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      userName: 'Alex',
      keyterms: ['Meet', 'Scribe'],
      consentReminder: false,
    });
  });

  it('merges partial updates', async () => {
    await store.saveSettings({ userName: 'Alex' });
    await store.saveSettings({ firstRunComplete: true });
    expect(await store.getSettings()).toMatchObject({ userName: 'Alex', firstRunComplete: true });
  });

  it('keeps credentials under a separate storage key from settings', async () => {
    await store.saveSettings({ userName: 'Alex' });
    await store.setPendingKey(KEY);
    await store.promotePendingKey();
    expect(JSON.stringify(area.data.get(SETTINGS_KEY))).not.toContain(KEY);
    expect(area.data.get(CREDENTIALS_KEY)).toEqual({ elevenLabsApiKey: KEY });
    expect(await store.getSettings()).not.toHaveProperty('elevenLabsApiKey');
  });

  it('keyHint() reveals only the last 4 characters', async () => {
    expect(await store.keyHint()).toBeNull();
    await store.setPendingKey(KEY);
    expect(await store.keyHint()).toBeNull(); // a pending key is not a saved key
    await store.promotePendingKey();
    expect(await store.keyHint()).toBe('a1b2');
  });

  it('pending key: promote replaces the saved key; discard deletes only the candidate', async () => {
    await store.setPendingKey(KEY);
    await store.promotePendingKey();
    await store.setPendingKey('sk_test_other_ffff');
    expect(await store.readPendingKey()).toBe('sk_test_other_ffff');
    await store.discardPendingKey();
    expect(await store.readPendingKey()).toBeNull();
    expect(await store.readApiKey()).toBe(KEY);
  });

  it('removeKey() deletes the saved key and any candidate', async () => {
    await store.setPendingKey(KEY);
    await store.promotePendingKey();
    await store.removeKey();
    expect(await store.readApiKey()).toBeNull();
    expect(await store.keyHint()).toBeNull();
  });

  it('ignores an empty or whitespace key', async () => {
    await expect(store.setPendingKey('   ')).rejects.toThrow('empty');
  });
  // T055: Settings → Remembered names (002 FR-022).
  describe('remembered speaker names', () => {
    it('remember, list, edit, forget; persisted in settings', async () => {
      expect(await store.listSpeakerNames()).toEqual([]);
      await store.rememberSpeakerName('Jane D.', 'Jane');
      await store.rememberSpeakerName('Emma Jones', 'Emma');
      await store.rememberSpeakerName('jane d.', 'Mary');
      const fresh = new SettingsStore(area);
      expect((await fresh.listSpeakerNames()).map((x) => [x.captionName, x.displayName])).toEqual([
        ['Emma Jones', 'Emma'],
        ['jane d.', 'Mary'],
      ]);
      expect((await fresh.getSettings()).speakerNameMappings).toHaveLength(2);
      await fresh.forgetSpeakerName('Emma Jones');
      expect((await fresh.listSpeakerNames()).map((x) => x.displayName)).toEqual(['Mary']);
    });

    it('remembering a name equal to its caption name removes the mapping', async () => {
      await store.rememberSpeakerName('Jane D.', 'Jane');
      await store.rememberSpeakerName('Jane D.', 'Jane D.');
      expect(await store.listSpeakerNames()).toEqual([]);
    });

    it('saving other settings keeps the mappings', async () => {
      await store.rememberSpeakerName('Jane D.', 'Jane');
      await store.saveSettings({ userName: 'Alex' });
      expect(await store.listSpeakerNames()).toHaveLength(1);
    });
  });
});

describe('SettingsStore.fromChrome', () => {
  let fake: ReturnType<typeof installFakeChromeStorage>;
  beforeEach(() => {
    fake = installFakeChromeStorage();
  });
  afterEach(() => fake.uninstall());

  it('uses chrome.storage.local and never writes to storage.sync (FR-003)', async () => {
    const store = SettingsStore.fromChrome();
    await store.saveSettings({ userName: 'Alex', keyterms: ['x'] });
    await store.setPendingKey(KEY);
    await store.promotePendingKey();
    await store.removeKey();
    expect(fake.local.writes.length).toBeGreaterThan(0);
    expect(fake.sync.writes).toEqual([]);
    expect(fake.sync.data.size).toBe(0);
  });
});
