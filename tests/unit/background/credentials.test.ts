// The service worker answers the offscreen document's token requests (offscreen documents cannot read storage).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_URL } from '@/providers/credentials/local-key-source';
import { CREDENTIALS_KEY } from '@/storage/settings-store';
import { FakeStorageArea } from '../../support/fake-chrome-storage';

const KEY = 'sk_test_fixture_bg_relay_r3l4';
const OFFSCREEN = { id: 'ext', url: 'chrome-extension://ext/offscreen.html' };
const PANEL = { id: 'ext', url: 'chrome-extension://ext/sidepanel.html' };

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined;

let listener: Listener | null;
let local: FakeStorageArea;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  listener = null;
  local = new FakeStorageArea();
  fetchMock = vi.fn(() => Promise.resolve(Response.json({ token: 'sutkn_fixture_minted' })));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('chrome', {
    storage: {
      local,
      sync: new FakeStorageArea(),
      session: new FakeStorageArea(),
      onChanged: { addListener: vi.fn() },
    },
    sidePanel: { setPanelBehavior: vi.fn(() => Promise.resolve()), open: vi.fn(() => Promise.resolve()) },
    action: { onClicked: { addListener: vi.fn() } },
    tabs: { onRemoved: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
    runtime: {
      // 003: the service worker also listens for the side panel's `chat` port.
      onConnect: { addListener: vi.fn() },
      id: 'ext',
      getURL: (p: string) => `chrome-extension://ext/${p}`,
      onMessage: { addListener: (l: Listener) => (listener = l) },
    },
  });
  const background = (await import('@/entrypoints/background')).default as { main: () => void };
  background.main();
});

afterEach(() => vi.unstubAllGlobals());

function send(message: unknown, sender: unknown): Promise<unknown> | undefined {
  let resolve: (r: unknown) => void = () => {};
  const replied = new Promise((r) => (resolve = r));
  return listener!(message, sender, resolve) ? replied : undefined;
}

describe('credentials/* requests from the offscreen document', () => {
  it('mints a single-use token with the stored key and replies with the token only', async () => {
    local.data.set(CREDENTIALS_KEY, { elevenLabsApiKey: KEY });
    const reply = await send({ type: 'credentials/transcription-token' }, OFFSCREEN);
    expect(reply).toEqual({
      ok: true,
      credential: { token: 'sutkn_fixture_minted', expiresAt: expect.any(Number) as unknown },
    });
    expect(fetchMock).toHaveBeenCalledWith(TOKEN_URL, { method: 'POST', headers: { 'xi-api-key': KEY } });
    expect(JSON.stringify(reply)).not.toContain(KEY);
  });

  it('replies with the error kind when no key is saved', async () => {
    expect(await send({ type: 'credentials/transcription-token' }, OFFSCREEN)).toEqual({ ok: false, kind: 'missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers status without the key', async () => {
    local.data.set(CREDENTIALS_KEY, { elevenLabsApiKey: KEY });
    const reply = await send({ type: 'credentials/status' }, OFFSCREEN);
    expect(reply).toEqual({ configured: true, hint: '…r3l4' });
  });

  it('ignores the same request from any other extension page', () => {
    local.data.set(CREDENTIALS_KEY, { elevenLabsApiKey: KEY });
    expect(send({ type: 'credentials/transcription-token' }, PANEL)).toBeUndefined();
    expect(
      send({ type: 'credentials/transcription-token' }, { id: 'other-extension', url: OFFSCREEN.url }),
    ).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
