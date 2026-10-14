// 005: the service worker answers `account/usage` with derived fields only; the key stays here (FR-009, FR-012).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUBSCRIPTION_URL } from '@/providers/account/elevenlabs-subscription';
import { CREDENTIALS_KEY } from '@/storage/settings-store';
import { FakeStorageArea } from '../../support/fake-chrome-storage';

const KEY = 'sk_test_fixture_account_bg_77aa';

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined;

let listener: Listener | null = null;
let local: FakeStorageArea;
let fetchMock: ReturnType<typeof vi.fn>;
let logged: unknown[][];

beforeEach(async () => {
  vi.resetModules();
  listener = null;
  logged = [];
  local = new FakeStorageArea();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  for (const level of ['warn', 'error', 'info'] as const)
    vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void logged.push(a));
  vi.stubGlobal('chrome', {
    storage: { local, sync: new FakeStorageArea(), onChanged: { addListener: vi.fn() } },
    sidePanel: { setPanelBehavior: vi.fn(() => Promise.resolve()), open: vi.fn(() => Promise.resolve()) },
    action: { onClicked: { addListener: vi.fn() } },
    tabs: { onRemoved: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
    runtime: {
      // 003: the service worker also listens for the side panel's `chat` port.
      onConnect: { addListener: vi.fn() },
      onMessage: {
        addListener: (l: Listener) => {
          listener = l;
        },
      },
    },
  });
  const background = (await import('@/entrypoints/background')).default as { main: () => void };
  background.main();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function send(message: unknown): Promise<{ handled: boolean | undefined; reply: unknown }> {
  let resolve: (r: unknown) => void = () => {};
  const replied = new Promise((r) => (resolve = r));
  const handled = listener!(message, { id: 'test' }, resolve);
  if (!handled) return { handled, reply: undefined };
  return { handled, reply: await replied };
}

const respond = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('account/usage in the service worker', () => {
  it('fetches with the saved key and replies with the derived fields', async () => {
    local.data.set(CREDENTIALS_KEY, { elevenLabsApiKey: KEY });
    fetchMock.mockReturnValue(
      respond(200, { tier: 'pro', character_count: 1, character_limit: 600_000, next_character_count_reset_unix: 2 }),
    );
    const { handled, reply } = await send({ type: 'account/usage' });
    expect(handled).toBe(true);
    expect(reply).toStrictEqual({
      ok: true,
      usage: { tier: 'pro', creditsUsed: 1, creditsLimit: 600_000, resetAt: 2_000 },
    });
    expect(fetchMock).toHaveBeenCalledWith(SUBSCRIPTION_URL, { method: 'GET', headers: { 'xi-api-key': KEY } });
  });

  it('answers missing without a request when no key is saved', async () => {
    const { reply } = await send({ type: 'account/usage' });
    expect(reply).toEqual({ ok: false, kind: 'missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs a failure through the redacting logger without the key', async () => {
    local.data.set(CREDENTIALS_KEY, { elevenLabsApiKey: KEY });
    fetchMock.mockReturnValue(respond(500, { detail: `boom for ${KEY}` }));
    const { reply } = await send({ type: 'account/usage' });
    expect(reply).toEqual({ ok: false, kind: 'unknown' });
    expect(logged.length).toBe(1);
    expect(String(logged[0]![0])).toMatch(/^live-assist\[account\]: account status unavailable: unknown \(HTTP 500\)/);
    expect(JSON.stringify(logged)).not.toContain(KEY);
  });
});
