// Transcription provider contract (contracts/transcription-provider.md). Lives in core so core can depend on it;
// src/providers/transcription/elevenlabs/** is the only code that knows the ElevenLabs wire protocol.
import type { LanguageMode } from '../transcript/model';

export interface SessionOptions {
  /** PCM16 LE mono. */
  sampleRate: 16000;
  language: LanguageMode;
  /** Already validated (≤50 × ≤20 chars). */
  keyterms: readonly string[];
  /** Design decision 41: ask for a clean transcript (fillers and false starts left out). Absent = off. */
  noVerbatim?: boolean;
  /** ≤50 chars; sent with the first chunk only. */
  previousText?: string;
}

export interface ProviderWord {
  text: string;
  startSec: number;
  endSec: number;
}

export type ProviderErrorKind =
  | 'auth'
  | 'quota'
  | 'terms'
  | 'invalid-request' // non-recoverable
  | 'time-limit' // recoverable, reconnect immediately
  | 'rate-limited'
  | 'overloaded'
  | 'transcriber'
  | 'network' // recoverable with backoff
  | 'input'
  | 'unknown'; // one retry, then fail

export type SessionEvent =
  | { type: 'started'; sessionId: string }
  /** Empty text = keepalive / no speech. */
  | { type: 'partial'; text: string }
  /** Final text; clears the partial. */
  | { type: 'committed'; text: string }
  | { type: 'committed-detail'; text: string; language: string | null; words: ProviderWord[] }
  /** message never contains secrets. */
  | { type: 'error'; kind: ProviderErrorKind; recoverable: boolean; message: string }
  | { type: 'closed'; code: number; wasClean: boolean };

export interface TranscriptionSession {
  /** null until 'started'. */
  readonly id: string | null;
  /** 100 ms frames; no-op after close. */
  sendAudio(frame: Int16Array): void;
  /** Idempotent. */
  close(): void;
  on(listener: (e: SessionEvent) => void): () => void;
}

export interface TranscriptionProvider {
  readonly id: 'elevenlabs' | 'fake';
  /** Obtains its own credential via CredentialSource. Resolves once the socket is open. */
  openSession(opts: SessionOptions): Promise<TranscriptionSession>;
}
