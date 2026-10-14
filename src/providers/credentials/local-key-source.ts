import {
  CredentialError,
  type CredentialErrorKind,
  type CredentialSource,
  type TranscriptionCredential,
} from './credential-source';

export const TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';
const TOKEN_LIFETIME_MS = 15 * 60_000;
const SAFETY_MARGIN_MS = 60_000;

export interface LocalKeyDeps {
  /** Reads the saved key (or, for validation on save, the pending candidate). */
  readKey: () => Promise<string | null>;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
}

export const CREDENTIAL_MESSAGES: Record<CredentialErrorKind, string> = {
  missing: 'No ElevenLabs API key is saved.',
  invalid: 'ElevenLabs rejected the API key.',
  forbidden: 'This ElevenLabs API key is not allowed to use speech-to-text.',
  network: 'Could not reach ElevenLabs.',
  'rate-limited': 'ElevenLabs is rate-limiting token requests; try again shortly.',
  unknown: 'ElevenLabs returned an unexpected response to the token request.',
};

export const credentialError = (kind: CredentialErrorKind) => new CredentialError(kind, CREDENTIAL_MESSAGES[kind]);
const fail = credentialError;

/** v1: mints ElevenLabs single-use realtime tokens from the user's key in chrome.storage.local (research R1). */
export class LocalKeyCredentialSource implements CredentialSource {
  readonly id = 'local-key' as const;

  constructor(private readonly deps: LocalKeyDeps) {}

  async getTranscriptionToken(): Promise<TranscriptionCredential> {
    const key = await this.deps.readKey();
    if (!key) throw fail('missing');

    let response: Response;
    try {
      response = await this.deps.fetch(TOKEN_URL, { method: 'POST', headers: { 'xi-api-key': key } });
    } catch {
      // The underlying error is discarded on purpose: it may echo request details.
      throw fail('network');
    }

    if (response.status === 401) throw fail('invalid');
    if (response.status === 403) throw fail('forbidden');
    if (response.status === 429) throw fail('rate-limited');
    if (!response.ok) throw fail('unknown');

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw fail('unknown');
    }
    const token = (body as { token?: unknown } | null)?.token;
    if (typeof token !== 'string' || token === '') throw fail('unknown');

    return { token, expiresAt: this.deps.now() + TOKEN_LIFETIME_MS - SAFETY_MARGIN_MS };
  }

  async status(): Promise<{ configured: boolean; hint?: string }> {
    const key = await this.deps.readKey();
    return key ? { configured: true, hint: `…${key.slice(-4)}` } : { configured: false };
  }
}
