// Test double: hands out numbered fixture tokens, or fails once with a chosen kind.
import {
  CredentialError,
  type CredentialErrorKind,
  type CredentialSource,
  type TranscriptionCredential,
} from '@/providers/credentials/credential-source';

export class StaticCredentialSource implements CredentialSource {
  readonly id = 'local-key' as const;
  readonly secret = 'static-fixture-secret';
  issued = 0;
  private nextFailure: CredentialErrorKind | null = null;

  failNext(kind: CredentialErrorKind): void {
    this.nextFailure = kind;
  }

  getTranscriptionToken(): Promise<TranscriptionCredential> {
    const failure = this.nextFailure;
    this.nextFailure = null;
    if (failure) return Promise.reject(new CredentialError(failure, `token request failed (${failure})`));
    this.issued += 1;
    return Promise.resolve({ token: `sutkn_fixture_${this.issued}`, expiresAt: Number.MAX_SAFE_INTEGER });
  }

  status(): Promise<{ configured: boolean; hint?: string }> {
    return Promise.resolve({ configured: true, hint: '…test' });
  }
}
