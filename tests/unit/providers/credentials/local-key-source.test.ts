import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialError } from '@/providers/credentials/credential-source';
import { LocalKeyCredentialSource, TOKEN_URL } from '@/providers/credentials/local-key-source';
import { credentialSourceContract } from '../../../contract/credential-source.contract';
import { StaticCredentialSource } from '../../../support/static-credential-source';

const KEY = 'sk_test_fixture_key_9f9f';
const NOW = 1_700_000_000_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function harness(key: string | null = KEY) {
  let counter = 0;
  let nextFailure: 'invalid' | 'forbidden' | 'network' | 'rate-limited' | 'missing' | null = null;
  let currentKey = key;
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({ url, init });
    const failure = nextFailure;
    nextFailure = null;
    if (failure === 'network') return Promise.reject(new TypeError(`Failed to fetch ${KEY}`));
    if (failure === 'invalid') return Promise.resolve(new Response('{"detail":"bad key"}', { status: 401 }));
    if (failure === 'forbidden') return Promise.resolve(new Response('{}', { status: 403 }));
    if (failure === 'rate-limited') return Promise.resolve(new Response('{}', { status: 429 }));
    counter += 1;
    return Promise.resolve(Response.json({ token: `sutkn_fixture_${counter}` }));
  };
  const source = new LocalKeyCredentialSource({
    readKey: () => Promise.resolve(currentKey),
    fetch: fetchImpl,
    now: () => NOW,
  });
  return {
    source,
    calls,
    secret: KEY,
    failNext(kind: 'missing' | 'invalid' | 'forbidden' | 'network' | 'rate-limited') {
      if (kind === 'missing') currentKey = null;
      else nextFailure = kind;
    },
  };
}

credentialSourceContract('LocalKeyCredentialSource', () => harness());
credentialSourceContract('StaticCredentialSource', () => {
  const source = new StaticCredentialSource();
  return { source, secret: source.secret, failNext: (kind) => source.failNext(kind) };
});

describe('LocalKeyCredentialSource', () => {
  let consoleSpies: { mock: { calls: unknown[][] }; mockRestore(): void }[];
  beforeEach(() => {
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
  });
  afterEach(() => {
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(KEY);
      spy.mockRestore();
    }
  });

  it('POSTs to the realtime_scribe single-use token endpoint with xi-api-key', async () => {
    const h = harness();
    const credential = await h.source.getTranscriptionToken();
    expect(credential).toEqual({ token: 'sutkn_fixture_1', expiresAt: NOW + 15 * 60_000 - 60_000 });
    expect(TOKEN_URL).toBe('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe');
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.url).toBe(TOKEN_URL);
    expect(h.calls[0]?.init?.method).toBe('POST');
    expect(new Headers(h.calls[0]?.init?.headers).get('xi-api-key')).toBe(KEY);
  });

  it('missing key → missing, without any request', async () => {
    const h = harness(null);
    await expect(h.source.getTranscriptionToken()).rejects.toMatchObject({ kind: 'missing' });
    expect(h.calls).toHaveLength(0);
  });

  it('other HTTP errors and malformed bodies → unknown', async () => {
    const bad = new LocalKeyCredentialSource({
      readKey: () => Promise.resolve(KEY),
      fetch: () => Promise.resolve(new Response('oops', { status: 500 })),
      now: () => NOW,
    });
    await expect(bad.getTranscriptionToken()).rejects.toMatchObject({ kind: 'unknown' });
    const noToken = new LocalKeyCredentialSource({
      readKey: () => Promise.resolve(KEY),
      fetch: () => Promise.resolve(Response.json({ nope: true })),
      now: () => NOW,
    });
    await expect(noToken.getTranscriptionToken()).rejects.toBeInstanceOf(CredentialError);
  });

  it('status() reports configured with a last-4 hint, or not configured', async () => {
    expect(await harness().source.status()).toEqual({ configured: true, hint: '…9f9f' });
    expect(await harness(null).source.status()).toEqual({ configured: false });
  });

  it('has id local-key', () => {
    expect(harness().source.id).toBe('local-key');
  });
});
