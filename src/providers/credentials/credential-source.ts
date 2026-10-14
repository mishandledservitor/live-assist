// Credential source contract (contracts/credential-source.md). Providers ask this for what they need to connect;
// nothing outside an implementation assumes the key is local (Constitution V).
import type { CredentialErrorKind } from '../../core/messaging/protocol';

export type { CredentialErrorKind };

export interface TranscriptionCredential {
  /** Single-use; consumed by exactly one connection. */
  token: string;
  /** Epoch ms (mint time + 15 min, minus a 60 s safety margin). */
  expiresAt: number;
}

/** Message is always a fixed string plus the kind — never the key or a token. */
export class CredentialError extends Error {
  override readonly name = 'CredentialError';
  constructor(
    readonly kind: CredentialErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface CredentialSource {
  readonly id: 'local-key' | 'backend';
  /** A fresh single-use realtime STT token. Called once per connection, including reconnects. */
  getTranscriptionToken(): Promise<TranscriptionCredential>;
  /** Whether a credential is configured, without revealing it. */
  status(): Promise<{ configured: boolean; hint?: string }>;
}
