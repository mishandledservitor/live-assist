// The offscreen document's CredentialSource. Offscreen documents get only chrome.runtime — no chrome.storage — so
// they cannot read the key. Each token is minted by the service worker (LocalKeyCredentialSource) and returned as the
// direct reply to this request; the key never leaves the service worker (contracts/credential-source.md).
import { parseTokenReply, type OffscreenRequest } from '../../core/messaging/protocol';
import type { CredentialSource, TranscriptionCredential } from './credential-source';
import { credentialError } from './local-key-source';

export type CredentialRequest = (message: OffscreenRequest) => Promise<unknown>;

export class RelayCredentialSource implements CredentialSource {
  readonly id = 'local-key' as const;

  constructor(private readonly request: CredentialRequest) {}

  async getTranscriptionToken(): Promise<TranscriptionCredential> {
    let raw: unknown;
    try {
      raw = await this.request({ type: 'credentials/transcription-token' });
    } catch {
      throw credentialError('network');
    }
    const reply = parseTokenReply(raw);
    if (!reply) throw credentialError('unknown');
    if (!reply.ok) throw credentialError(reply.kind);
    return reply.credential;
  }

  async status(): Promise<{ configured: boolean; hint?: string }> {
    let raw: unknown;
    try {
      raw = await this.request({ type: 'credentials/status' });
    } catch {
      return { configured: false };
    }
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as { configured?: unknown; hint?: unknown };
    if (r.configured !== true) return { configured: false };
    return typeof r.hint === 'string' ? { configured: true, hint: r.hint } : { configured: true };
  }
}
