// 012 T036 (FR-026, spec Clarifications C5; research R5): the one thing remembered for the clean main view, a moment in
// time under its own key in chrome.storage.local. It names no meeting.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIN_VIEW_CLEARED_KEY, MainViewStore } from '@/storage/main-view-store';
import { FakeStorageArea } from '../../support/fake-chrome-storage';

/** The part of chrome.storage.onChanged the panel wires in: one call per changed key. */
function fakeChanges() {
  const listeners = new Set<(key: string) => void>();
  return {
    listeners,
    subscribe(listener: (key: string) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(key: string) {
      for (const l of [...listeners]) l(key);
    },
  };
}

let area: FakeStorageArea;

beforeEach(() => {
  area = new FakeStorageArea();
});

describe('MainViewStore', () => {
  it('uses the key mainViewClearedAt', () => {
    expect(MAIN_VIEW_CLEARED_KEY).toBe('mainViewClearedAt');
  });

  it('reads null when the key is absent', async () => {
    expect(await new MainViewStore(area).clearedAt()).toBeNull();
  });

  it.each([
    ['a string', '1760000000000'],
    ['null', null],
    ['an object', { at: 5 }],
    ['NaN', NaN],
    ['infinity', Infinity],
    ['minus infinity', -Infinity],
    ['a boolean', true],
  ])('reads null when the stored value is %s', async (_what, value) => {
    area.data.set(MAIN_VIEW_CLEARED_KEY, value);
    expect(await new MainViewStore(area).clearedAt()).toBeNull();
  });

  it('reads the stored moment', async () => {
    area.data.set(MAIN_VIEW_CLEARED_KEY, 1_760_000_000_000);
    expect(await new MainViewStore(area).clearedAt()).toBe(1_760_000_000_000);
    area.data.set(MAIN_VIEW_CLEARED_KEY, 0);
    expect(await new MainViewStore(area).clearedAt()).toBe(0);
  });

  it('clear stores the number under its key and touches no other key', async () => {
    area.data.set('settings', { userName: 'Alex' });
    area.data.set('credentials', { elevenLabsApiKey: 'never-read' });
    const store = new MainViewStore(area);
    await store.clear(1_760_000_000_000);
    expect(area.writes).toEqual([{ op: 'set', keys: [MAIN_VIEW_CLEARED_KEY] }]);
    expect(area.data.get(MAIN_VIEW_CLEARED_KEY)).toBe(1_760_000_000_000);
    expect(area.data.get('settings')).toEqual({ userName: 'Alex' });
    expect(area.data.get('credentials')).toEqual({ elevenLabsApiKey: 'never-read' });
    expect(await store.clearedAt()).toBe(1_760_000_000_000);
  });

  it('reads only its own key', async () => {
    const get = vi.spyOn(area, 'get');
    await new MainViewStore(area).clearedAt();
    expect(get.mock.calls).toEqual([[MAIN_VIEW_CLEARED_KEY]]);
  });

  it('a later clear overwrites the earlier one', async () => {
    const store = new MainViewStore(area);
    await store.clear(1_000);
    await store.clear(2_000);
    expect(await store.clearedAt()).toBe(2_000);
  });

  it('rejects when the area cannot be read or written, so the caller decides what that means', async () => {
    const broken = {
      get: () => Promise.reject(new Error('read failed')),
      set: () => Promise.reject(new Error('write failed')),
      remove: () => Promise.resolve(),
    };
    const store = new MainViewStore(broken);
    await expect(store.clearedAt()).rejects.toThrow('read failed');
    await expect(store.clear(5)).rejects.toThrow('write failed');
  });

  it('onChange fires for its key only', () => {
    const changes = fakeChanges();
    const listener = vi.fn();
    new MainViewStore(area, changes).onChange(listener);
    changes.emit('settings');
    changes.emit('credentials');
    expect(listener).not.toHaveBeenCalled();
    changes.emit(MAIN_VIEW_CLEARED_KEY);
    changes.emit(MAIN_VIEW_CLEARED_KEY);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith();
  });

  it('the unsubscriber stops it', () => {
    const changes = fakeChanges();
    const listener = vi.fn();
    const stop = new MainViewStore(area, changes).onChange(listener);
    stop();
    changes.emit(MAIN_VIEW_CLEARED_KEY);
    expect(listener).not.toHaveBeenCalled();
    expect(changes.listeners.size).toBe(0);
  });

  it('without a changes source onChange is a no-op with a callable unsubscriber', async () => {
    const store = new MainViewStore(area);
    const listener = vi.fn();
    const stop = store.onChange(listener);
    await store.clear(5);
    expect(listener).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });
});
