// Replays recorded ElevenLabs sequences through the real ElevenLabs client, so e2e runs (and anything else that
// needs a provider without network or a key) exercise the same message mapping as production.
import type { CredentialSource, TranscriptionCredential } from '../../credentials/credential-source';
import { ElevenLabsRealtimeProvider } from '../elevenlabs/realtime-provider';
import type { SessionOptions, TranscriptionProvider, TranscriptionSession } from '../provider';
import { ReplaySocketServer, type ReplaySocket, type Script } from './replay-socket';

class FixtureCredentials implements CredentialSource {
  readonly id = 'local-key' as const;
  private issued = 0;

  getTranscriptionToken(): Promise<TranscriptionCredential> {
    this.issued += 1;
    return Promise.resolve({ token: `fixture-token-${this.issued}`, expiresAt: Number.MAX_SAFE_INTEGER });
  }

  status(): Promise<{ configured: boolean; hint?: string }> {
    return Promise.resolve({ configured: true, hint: '…fake' });
  }
}

export class FakeTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'fake' as const;
  private readonly server: ReplaySocketServer;
  private readonly inner: ElevenLabsRealtimeProvider;

  /** One script per connection, in connection order (or a function of the connection index). */
  constructor(scripts: readonly Script[] | ((index: number) => Script | undefined)) {
    this.server = new ReplaySocketServer(scripts);
    this.inner = new ElevenLabsRealtimeProvider({
      credentials: new FixtureCredentials(),
      WebSocket: this.server.WebSocket,
    });
  }

  /** Every connection made so far, with the messages sent on it. */
  get sockets(): readonly ReplaySocket[] {
    return this.server.sockets;
  }

  openSession(opts: SessionOptions): Promise<TranscriptionSession> {
    return this.inner.openSession(opts);
  }
}
