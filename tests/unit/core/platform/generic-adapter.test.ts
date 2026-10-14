import { describe, expect, it } from 'vitest';
import type { PlatformAdapter } from '@/core/platform/adapter';
import { GenericAdapter } from '@/core/platform/generic-adapter';
import { createPlatformRegistry } from '@/core/platform/registry';
import { platformAdapterContract } from '../../../contract/platform-adapter.contract';

const urls = [
  new URL('https://meet.google.com/abc-defg-hij'),
  new URL('https://example.com/'),
  new URL('https://zoom.us/wc/123'),
];

platformAdapterContract('GenericAdapter', () => new GenericAdapter(), urls);

describe('GenericAdapter', () => {
  const adapter = new GenericAdapter();

  it('has id generic and matches every URL', () => {
    expect(adapter.id).toBe('generic');
    for (const url of urls) expect(adapter.matches(url)).toBe(true);
  });

  it('reports captions unsupported: speaker names are on Google Meet only (FR-012)', () => {
    expect(adapter.captions).toEqual({
      supported: false,
      reason: 'Speaker names work on Google Meet only.', // 006 R9
    });
  });

  it('reports mute unsupported with a reason', () => {
    expect(adapter.mute).toEqual({ supported: false, reason: "This site's mute state cannot be read." });
  });

  it('returns empty metadata', async () => {
    await expect(adapter.metadata()).resolves.toEqual({});
  });
});

describe('PlatformRegistry', () => {
  it('falls back to the generic adapter when nothing else matches', () => {
    const registry = createPlatformRegistry([]);
    expect(registry.forUrl(new URL('https://example.com')).id).toBe('generic');
  });

  it('returns the first matching specific adapter before generic', () => {
    const meetLike: PlatformAdapter = {
      ...new GenericAdapter(),
      id: 'meet',
      matches: (url) => url.hostname === 'meet.google.com',
      metadata: () => Promise.resolve({}),
      dispose: () => undefined,
    };
    const registry = createPlatformRegistry([() => meetLike]);
    expect(registry.forUrl(new URL('https://meet.google.com/x')).id).toBe('meet');
    expect(registry.forUrl(new URL('https://example.com')).id).toBe('generic');
  });
});
