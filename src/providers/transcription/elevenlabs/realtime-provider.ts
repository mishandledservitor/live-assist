// Thin ElevenLabs Scribe v2 Realtime client (research R2): one WebSocket per session, authenticated with a fresh
// single-use token from the CredentialSource. The WebSocket constructor is injected so fixtures can replay sessions.
import { int16ToBase64, SAMPLE_RATE } from '../../../audio/pcm';
import type { CredentialSource } from '../../credentials/credential-source';
import type { SessionEvent, SessionOptions, TranscriptionProvider, TranscriptionSession } from '../provider';
import { WS_OPEN, type WebSocketCtor, type WebSocketLike } from '../socket';
import { classifyErrorType } from './errors';
import { AudioChunkEncoder, parseServerMessage } from './messages';
import { buildRealtimeUrl } from './url';

export interface ElevenLabsDeps {
  credentials: CredentialSource;
  WebSocket: WebSocketCtor;
}

type Listener = (e: SessionEvent) => void;

class ElevenLabsSession implements TranscriptionSession {
  id: string | null = null;
  private readonly listeners = new Set<Listener>();
  /** Events emitted before anyone subscribed are held and delivered to the first subscriber. */
  private backlog: SessionEvent[] | null = [];
  private readonly encoder: AudioChunkEncoder;
  private clientClosed = false;
  private errored = false;
  private ended = false;

  constructor(
    private readonly ws: WebSocketLike,
    opts: SessionOptions,
  ) {
    this.encoder = new AudioChunkEncoder(SAMPLE_RATE, opts.previousText);
    ws.onmessage = (e) => this.handleMessage(e.data);
    ws.onclose = (e) => this.handleClose(e.code, e.wasClean);
  }

  sendAudio(frame: Int16Array): void {
    if (this.clientClosed || this.ended || this.ws.readyState !== WS_OPEN) return;
    this.ws.send(this.encoder.encode(int16ToBase64(frame)));
  }

  close(): void {
    if (this.clientClosed || this.ended) return;
    this.clientClosed = true;
    this.ws.close(1000);
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    const held = this.backlog;
    this.backlog = null;
    for (const e of held ?? []) listener(e);
    return () => this.listeners.delete(listener);
  }

  private emit(e: SessionEvent): void {
    if (this.backlog) this.backlog.push(e);
    else for (const l of this.listeners) l(e);
  }

  private handleMessage(data: string): void {
    if (this.clientClosed || this.ended || this.errored) return;
    const m = parseServerMessage(data);
    switch (m.type) {
      case 'started':
        this.id = m.sessionId;
        this.emit({ type: 'started', sessionId: m.sessionId });
        return;
      case 'partial':
      case 'committed':
        this.emit({ type: m.type, text: m.text });
        return;
      case 'committed-detail':
        this.emit({ type: 'committed-detail', text: m.text, language: m.language, words: m.words });
        return;
      case 'server-error': {
        const { kind, recoverable } = classifyErrorType(m.errorType) ?? { kind: 'unknown' as const, recoverable: true };
        this.errored = true;
        const detail = m.text ? `: ${m.text}` : '';
        this.emit({ type: 'error', kind, recoverable, message: `ElevenLabs ${m.errorType}${detail}` });
        // The session is over once the server reports an error; do not wait for the server to hang up.
        this.ws.close(1000);
        return;
      }
      case 'ignored':
        return;
    }
  }

  private handleClose(code: number, wasClean: boolean): void {
    if (this.ended) return;
    this.ended = true;
    if (!this.clientClosed && !this.errored) {
      this.emit({ type: 'error', kind: 'network', recoverable: true, message: `Connection closed (code ${code})` });
    }
    this.emit({ type: 'closed', code, wasClean });
  }
}

export class ElevenLabsRealtimeProvider implements TranscriptionProvider {
  readonly id = 'elevenlabs' as const;

  constructor(private readonly deps: ElevenLabsDeps) {}

  async openSession(opts: SessionOptions): Promise<TranscriptionSession> {
    const { token } = await this.deps.credentials.getTranscriptionToken();
    const { language, keyterms } = opts;
    const noVerbatim = opts.noVerbatim === true;
    const ws = new this.deps.WebSocket(buildRealtimeUrl({ token, language, keyterms, noVerbatim }));
    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        ws.onopen = null;
        resolve(new ElevenLabsSession(ws, opts));
      };
      ws.onclose = (e) => reject(new Error(`Could not connect to ElevenLabs (code ${e.code})`));
    });
  }
}
