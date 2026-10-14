// RelayCredentialSource: the offscreen document's credential source. It asks the service worker, which holds the
// key, for each single-use token (offscreen documents have no chrome.storage).
import { describe, expect, it } from 'vitest';
import type { CredentialErrorKind } from '@/core/messaging/protocol';
import { CredentialError } from '@/providers/credentials/credential-source';
import { RelayCredentialSource } from '@/providers/credentials/relay-source';
import { credentialSourceContract } from '../../../contract/credential-source.contract';

const KEY = 'sk_test_fixture_relay_k3y1';

/** Plays the service worker: mints tokens from a key the relay never sees. */
function worker() {
  let n = 0;
  let fail: CredentialErrorKind | null = null;
  const requests: unknown[] = [];
  const request = (m: unknown): Promise<unknown> => {
    requests.push(m);
    const type = (m as { type: string }).type;
    if (type === 'credentials/status') return Promise.resolve({ configured: true, hint: KEY.slice(-4) });
    const f = fail;
    fail = null;
    if (f) return Promise.resolve({ ok: false, kind: f });
    n += 1;
    return Promise.resolve({ ok: true, credential: { token: `sutkn_fixture_relay_${n}`, expiresAt: 1000 + n } });
  };
  return { request, requests, failNext: (k: CredentialErrorKind) => (fail = k) };
}

credentialSourceContract('RelayCredentialSource', () => {
  const w = worker();
  return { source: new RelayCredentialSource(w.request), secret: KEY, failNext: w.failNext };
});

describe('RelayCredentialSource', () => {
  it('asks for exactly one token per call', async () => {
    const w = worker();
    const source = new RelayCredentialSource(w.request);
    expect(await source.getTranscriptionToken()).toEqual({ token: 'sutkn_fixture_relay_1', expiresAt: 1001 });
    expect(w.requests).toEqual([{ type: 'credentials/transcription-token' }]);
  });

  it('treats a malformed reply as unknown and an unreachable service worker as network', async () => {
    const odd = new RelayCredentialSource(() => Promise.resolve({ ok: true, credential: { token: '' } }));
    await expect(odd.getTranscriptionToken()).rejects.toMatchObject({ kind: 'unknown' });
    const gone = new RelayCredentialSource(() => Promise.reject(new Error('Receiving end does not exist.')));
    const error = await gone.getTranscriptionToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CredentialError);
    expect(error).toMatchObject({ kind: 'network' });
  });

  it('reports status from the service worker, and not configured when it cannot answer', async () => {
    expect(await new RelayCredentialSource(worker().request).status()).toEqual({ configured: true, hint: 'k3y1' });
    expect(await new RelayCredentialSource(() => Promise.resolve(null)).status()).toEqual({ configured: false });
  });
});
