// Shared contract suite every CredentialSource runs (contracts/credential-source.md).
import { describe, expect, it } from 'vitest';
import { CredentialError, type CredentialSource } from '@/providers/credentials/credential-source';

export interface CredentialHarness {
  source: CredentialSource;
  /** The secret that must never leak (key for local sources). */
  secret: string;
  /** Make the next token request fail with this kind. */
  failNext(kind: 'missing' | 'invalid' | 'forbidden' | 'network' | 'rate-limited'): void;
}

export function credentialSourceContract(name: string, setup: () => CredentialHarness): void {
  describe(`CredentialSource contract: ${name}`, () => {
    it('returns a fresh token on every call', async () => {
      const { source } = setup();
      const a = await source.getTranscriptionToken();
      const b = await source.getTranscriptionToken();
      expect(a.token).not.toBe(b.token);
      expect(a.expiresAt).toBeGreaterThan(0);
    });

    it.each(['missing', 'invalid', 'forbidden', 'network', 'rate-limited'] as const)(
      'maps failure to CredentialError kind %s without leaking the secret',
      async (kind) => {
        const h = setup();
        h.failNext(kind);
        const error = await h.source.getTranscriptionToken().then(
          () => null,
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(CredentialError);
        expect((error as CredentialError).kind).toBe(kind);
        expect(String((error as Error).message)).not.toContain(h.secret);
        expect(JSON.stringify(error)).not.toContain(h.secret);
        expect(String((error as Error).stack)).not.toContain(h.secret);
      },
    );

    it('status() never reveals the secret', async () => {
      const { source, secret } = setup();
      const status = await source.status();
      expect(status.configured).toBe(true);
      expect(JSON.stringify(status)).not.toContain(secret);
    });

    it('returned tokens do not contain the secret', async () => {
      const { source, secret } = setup();
      const credential = await source.getTranscriptionToken();
      expect(JSON.stringify(credential)).not.toContain(secret);
    });
  });
}
