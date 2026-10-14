// In-memory stand-in for a chrome.storage StorageArea (promise API), recording every write.
import type { StorageAreaLike } from '@/storage/settings-store';

export class FakeStorageArea implements StorageAreaLike {
  readonly data = new Map<string, unknown>();
  readonly writes: { op: 'set' | 'remove'; keys: string[] }[] = [];

  get(keys: string | string[]): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      if (this.data.has(k)) out[k] = structuredClone(this.data.get(k));
    }
    return Promise.resolve(out);
  }

  set(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) this.data.set(k, structuredClone(v));
    this.writes.push({ op: 'set', keys: Object.keys(items) });
    return Promise.resolve();
  }

  remove(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) this.data.delete(k);
    this.writes.push({ op: 'remove', keys: list });
    return Promise.resolve();
  }
}

/** Installs a minimal `chrome.storage` global with separate local and sync areas. */
export function installFakeChromeStorage(): { local: FakeStorageArea; sync: FakeStorageArea; uninstall: () => void } {
  const local = new FakeStorageArea();
  const sync = new FakeStorageArea();
  const g = globalThis as { chrome?: unknown };
  const previous = g.chrome;
  g.chrome = { storage: { local, sync } };
  return {
    local,
    sync,
    uninstall: () => {
      g.chrome = previous;
    },
  };
}
