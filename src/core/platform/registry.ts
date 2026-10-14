import type { PlatformAdapter, PlatformRegistry } from './adapter';
import { GenericAdapter } from './generic-adapter';

export type AdapterFactory = () => PlatformAdapter;

/** Specific adapters are tried in order; a fresh GenericAdapter is the last resort. */
export function createPlatformRegistry(factories: readonly AdapterFactory[]): PlatformRegistry {
  return {
    forUrl(url: URL): PlatformAdapter {
      for (const create of factories) {
        const adapter = create();
        if (adapter.matches(url)) return adapter;
        adapter.dispose();
      }
      return new GenericAdapter();
    },
  };
}
