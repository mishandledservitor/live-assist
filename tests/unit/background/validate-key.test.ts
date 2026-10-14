import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_URL } from '@/providers/credentials/local-key-source';
import { CREDENTIALS_KEY, PENDING_CREDENTIAL_KEY } from '@/storage/settings-store';
import { FakeStorageArea } from '../../support/fake-chrome-storage';

const NEW_KEY = 'sk_test_fixture_new_key_n3w1';
const OLD_KEY = 'sk_test_fixture_old_key_0ld9';

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined;

let listener: Listener | null = null;
let local: FakeStorageArea;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  listener = null;
  local = new FakeStorageArea();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
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
  vi.unstubAllGlobals();
});

async function send(message: unknown): Promise<{ handled: boolean | undefined; reply: unknown }> {
  let resolve: (r: unknown) => void = () => {};
  const replied = new Promise((r) => (resolve = r));
  const handled = listener!(message, { id: 'test' }, resolve);
  if (!handled) return { handled, reply: undefined };
  return { handled, reply: await replied };
}

const credentials = () => local.data.get(CREDENTIALS_KEY) as Record<string, string> | undefined;
const respond = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('settings/validate-key in the service worker', () => {
  it('mints a token with the pending key, promotes it and replies with the last four characters only', async () => {
    local.data.set(PENDING_CREDENTIAL_KEY, NEW_KEY);
    fetchMock.mockReturnValue(respond(200, { token: 'sutkn_fixture_discarded' }));

    const { handled, reply } = await send({ type: 'settings/validate-key' });

    expect(handled).toBe(true);
    expect(reply).toEqual({ ok: true, hint: 'n3w1' });
    expect(fetchMock).toHaveBeenCalledWith(TOKEN_URL, { method: 'POST', headers: { 'xi-api-key': NEW_KEY } });
    expect(credentials()).toEqual({ elevenLabsApiKey: NEW_KEY });
    expect(local.data.has(PENDING_CREDENTIAL_KEY)).toBe(false);
  });

  it.each([
    [401, 'invalid'],
    [403, 'forbidden'],
    [429, 'rate-limited'],
    [500, 'unknown'],
  ] as const)('HTTP %i → %s; the candidate is discarded and the old key kept', async (status, kind) => {
    local.data.set(CREDENTIALS_KEY, { elevenLabsApiKey: OLD_KEY });
    local.data.set(PENDING_CREDENTIAL_KEY, NEW_KEY);
    fetchMock.mockReturnValue(respond(status));
    const { reply } = await send({ type: 'settings/validate-key' });
    expect(reply).toEqual({ ok: false, kind });
    expect(credentials()).toEqual({ elevenLabsApiKey: OLD_KEY });
    expect(local.data.has(PENDING_CREDENTIAL_KEY)).toBe(false);
  });

  it('reports network failures', async () => {
    local.data.set(PENDING_CREDENTIAL_KEY, NEW_KEY);
    fetchMock.mockRejectedValue(new TypeError(`Failed to fetch with ${NEW_KEY}`));
    const { reply } = await send({ type: 'settings/validate-key' });
    expect(reply).toEqual({ ok: false, kind: 'network' });
    expect(credentials() ?? {}).toEqual({});
    expect(local.data.has(PENDING_CREDENTIAL_KEY)).toBe(false);
  });

  it('reports missing when no candidate was written', async () => {
    const { reply } = await send({ type: 'settings/validate-key' });
    expect(reply).toEqual({ ok: false, kind: 'missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never puts the key in a reply or on the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    local.data.set(PENDING_CREDENTIAL_KEY, NEW_KEY);
    fetchMock.mockRejectedValue(new Error(NEW_KEY));
    const { reply } = await send({ type: 'settings/validate-key' });
    expect(JSON.stringify(reply)).not.toContain(NEW_KEY);
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(NEW_KEY);
  });

  it('ignores malformed messages and messages carrying a key-like field', async () => {
    expect((await send({ type: 'settings/validate-key', apiKey: NEW_KEY })).handled).toBeFalsy();
    expect((await send({ type: 'nope' })).handled).toBeFalsy();
    expect((await send('settings/validate-key')).handled).toBeFalsy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Red-team 2026-10-08 (001 T109, FR-003a): the panel never reads credentials; the service worker gives it the hint.
describe('settings/key-hint in the service worker', () => {
  it('replies with the last four characters of the saved key only', async () => {
    local.data.set(CREDENTIALS_KEY, { elevenLabsApiKey: OLD_KEY });
    local.data.set(PENDING_CREDENTIAL_KEY, NEW_KEY);
    const { handled, reply } = await send({ type: 'settings/key-hint' });
    expect(handled).toBe(true);
    expect(reply).toEqual({ hint: '0ld9' });
    expect(JSON.stringify(reply)).not.toContain(OLD_KEY);
  });

  it('replies null without a saved key (a pending key is not a saved key)', async () => {
    local.data.set(PENDING_CREDENTIAL_KEY, NEW_KEY);
    expect((await send({ type: 'settings/key-hint' })).reply).toEqual({ hint: null });
  });
});
