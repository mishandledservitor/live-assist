// 003 T030: the v1 chat credential source reads the saved key at request time and hands back a ready provider; the
// key itself never comes out (contracts/chat-provider.md, FR-021).
import { describe, expect, it, vi } from 'vitest';
import { LocalChatKeySource } from '@/providers/credentials/local-chat-key-source';
import { fixtureFetch, readChatFixture } from '../../../support/chat-fixtures';

const KEY = 'test-chat-key-wxyz';

const source = (keys: Partial<Record<'anthropic' | 'openai', string>>) => {
  const { fetch, requests } = fixtureFetch(readChatFixture('anthropic', 'c01-complete'));
  const readKey = vi.fn((p: 'anthropic' | 'openai') => Promise.resolve(keys[p] ?? null));
  return { source: new LocalChatKeySource({ readKey, fetch }), readKey, requests };
};

const deepStrings = (v: unknown, seen = new Set<unknown>()): string[] => {
  if (typeof v === 'string') return [v];
  if (typeof v !== 'object' || v === null || seen.has(v)) return [];
  seen.add(v);
  return Object.values(v).flatMap((x) => deepStrings(x, seen));
};

describe('LocalChatKeySource', () => {
  it('is the local-key source', () => {
    expect(source({}).source.id).toBe('local-key');
  });

  it('status: configured with the last four characters, or not configured', async () => {
    const { source: s } = source({ anthropic: KEY });
    expect(await s.status('anthropic')).toEqual({ configured: true, hint: 'wxyz' });
    expect(await s.status('openai')).toEqual({ configured: false });
  });

  it('providerFor: null without a key', async () => {
    expect(await source({}).source.providerFor('anthropic')).toBeNull();
  });

  it('providerFor: an adapter for that provider, built with the saved key read at request time', async () => {
    const { source: s, readKey, requests } = source({ anthropic: KEY });
    const provider = await s.providerFor('anthropic');
    expect(provider?.id).toBe('anthropic');
    expect(readKey).toHaveBeenCalledWith('anthropic');
    await provider!.checkKey();
    expect(requests[0]!.headers['x-api-key']).toBe(KEY);
  });

  it('the key is in no enumerable field of what it returns', async () => {
    const { source: s } = source({ anthropic: KEY });
    const provider = await s.providerFor('anthropic');
    expect(deepStrings(provider).some((x) => x.includes(KEY))).toBe(false);
    expect(JSON.stringify(provider)).not.toContain(KEY);
    expect(JSON.stringify(await s.status('anthropic'))).not.toContain(KEY);
  });
});
