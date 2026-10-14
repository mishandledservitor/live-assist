// The meeting's (mixed) stream transcribed across provider sessions (research R4, FR-019). When a session drops or hits the
// service's time limit, a new one is opened (the provider fetches a fresh token per connection), given the last
// ≤50 characters of committed text as context, and fed the audio after the last committed word before live audio
// resumes. Committed lines are only ever passed on once, so nothing is duplicated; unrecoverable errors stop the
// stream with a plain-language reason (FR-022).
import type {
  ProviderErrorKind,
  ProviderWord,
  SessionEvent,
  SessionOptions,
  TranscriptionProvider,
  TranscriptionSession,
} from '../transcription/provider';
import { ReconnectPolicy, type RetryDecision } from './reconnect-policy';
import { ReplayBuffer } from './replay-buffer';

const PREVIOUS_TEXT_MAX = 50;

export interface ReconnectingSessionOptions {
  provider: TranscriptionProvider;
  /** previousText is managed here and ignored if set. */
  options: SessionOptions;
  policy?: ReconnectPolicy;
}

export type ReconnectingEvent =
  /** A provider session is running and its audio starts at meeting time audioOriginMs. */
  | { type: 'origin'; sessionId: string; audioOriginMs: number }
  | { type: 'partial'; text: string }
  | { type: 'committed'; text: string }
  | { type: 'committed-detail'; text: string; language: string | null; words: ProviderWord[] }
  | { type: 'state'; state: 'active' | 'reconnecting' | 'failed'; reason?: string };

type Phase = 'idle' | 'live' | 'reconnecting' | 'failed' | 'closed';

/** Plain-language reason and next step for a stream that will not be retried (FR-022). */
export function failureReason(kind: ProviderErrorKind, decision: RetryDecision): string {
  switch (kind) {
    case 'auth':
      return 'ElevenLabs rejected the API key — check or replace it in Settings, then press Start again.';
    case 'quota':
      return 'Your ElevenLabs quota is used up — add credits or change plan in your ElevenLabs account, then press Start again.';
    case 'terms':
      return 'ElevenLabs needs you to accept its terms — sign in to your ElevenLabs account and accept them, then press Start again.';
    case 'invalid-request':
    case 'input':
    case 'unknown':
      return 'Internal error talking to ElevenLabs — press Start again; if it keeps happening, report it.';
    default:
      return decision.retry
        ? ''
        : 'Could not reconnect to ElevenLabs for about a minute — check your internet connection, then press Start again.';
  }
}

/** The state word "Reconnecting…" says what is happening; a session time limit needs no reason at all (006 D5). */
function reconnectingReason(kind: ProviderErrorKind): string | undefined {
  return kind === 'time-limit' ? undefined : 'Connection to ElevenLabs lost';
}

/** A failed openSession: credential problems come from the CredentialSource, everything else is the network. */
function openFailureKind(e: unknown): ProviderErrorKind {
  const err = e as { name?: unknown; kind?: unknown } | null;
  if (err?.name !== 'CredentialError') return 'network';
  if (err.kind === 'invalid' || err.kind === 'forbidden' || err.kind === 'missing') return 'auth';
  if (err.kind === 'rate-limited') return 'rate-limited';
  return 'network';
}

export class ReconnectingSession {
  private phase: Phase = 'idle';
  private session: TranscriptionSession | null = null;
  private unsubscribe: (() => void) | null = null;
  private sessionId: string | null = null;
  private audioOriginMs: number | null = null;
  private committedText = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly buffer = new ReplayBuffer();
  private readonly policy: ReconnectPolicy;
  private readonly listeners = new Set<(e: ReconnectingEvent) => void>();

  constructor(private readonly opts: ReconnectingSessionOptions) {
    this.policy = opts.policy ?? new ReconnectPolicy();
  }

  on(listener: (e: ReconnectingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Opens the first session; rejects if it cannot be opened (the caller reports that). */
  async start(): Promise<void> {
    const session = await this.opts.provider.openSession(this.sessionOptions());
    if (this.phase === 'closed') {
      session.close();
      return;
    }
    this.attach(session);
  }

  /** One 100 ms frame whose audio begins at meeting time atMs. Held for replay until the next commit. */
  sendAudio(frame: Int16Array, atMs: number): void {
    if (this.phase === 'closed' || this.phase === 'failed') return;
    this.buffer.push(frame, atMs);
    if (this.phase !== 'live' || !this.session) return;
    if (this.audioOriginMs === null) this.setOrigin(atMs);
    this.session.sendAudio(frame);
  }

  /** Idempotent; nothing is sent and nothing reconnects afterwards. */
  close(): void {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.detach();
  }

  private sessionOptions(): SessionOptions {
    const { previousText: _ignored, ...base } = this.opts.options;
    const previousText = this.committedText.slice(-PREVIOUS_TEXT_MAX);
    return previousText === '' ? base : { ...base, previousText };
  }

  private attach(session: TranscriptionSession): void {
    this.session = session;
    this.sessionId = null;
    this.audioOriginMs = null;
    this.phase = 'live';
    this.unsubscribe = session.on((e) => this.onEvent(session, e));
    if (this.session !== session) return; // the backlog already ended it
    // Unfinished audio first, so the new session hears it before live audio.
    const first = this.buffer.firstFrameMs;
    if (first !== null) {
      this.setOrigin(first);
      for (const f of this.buffer.frames()) session.sendAudio(f);
    }
  }

  private detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.session?.close();
    this.session = null;
  }

  private setOrigin(ms: number): void {
    this.audioOriginMs = ms;
    this.emitOrigin();
  }

  private emitOrigin(): void {
    if (this.sessionId !== null && this.audioOriginMs !== null)
      this.emit({ type: 'origin', sessionId: this.sessionId, audioOriginMs: this.audioOriginMs });
  }

  private onEvent(session: TranscriptionSession, e: SessionEvent): void {
    if (this.session !== session || this.phase !== 'live') return;
    switch (e.type) {
      case 'started': {
        this.sessionId = e.sessionId;
        this.policy.reset();
        const gapMs = this.buffer.takeGapMs();
        const reason =
          gapMs > 0
            ? `About ${Math.round(gapMs / 1000)} s of audio during the reconnect could not be transcribed.`
            : undefined;
        this.emit(
          reason === undefined ? { type: 'state', state: 'active' } : { type: 'state', state: 'active', reason },
        );
        this.emitOrigin();
        return;
      }
      case 'partial':
        this.emit({ type: 'partial', text: e.text });
        return;
      case 'committed':
        // The replay buffer is trimmed by the word timings in committed-detail, not here: the commit point is the
        // last committed word, and frames sent after it must stay for replay (red-team 2026-10-08).
        if (e.text.trim() !== '') this.committedText = `${this.committedText} ${e.text.trim()}`.trim().slice(-200);
        this.emit({ type: 'committed', text: e.text });
        return;
      case 'committed-detail': {
        // Word times are relative to this session's audio start. Without timings nothing is dropped: replaying
        // audio the service already transcribed may repeat a line, which beats losing one.
        const lastEndSec = e.words.reduce((max, w) => Math.max(max, w.endSec), -Infinity);
        if (this.audioOriginMs !== null && Number.isFinite(lastEndSec))
          this.buffer.commitThrough(this.audioOriginMs + lastEndSec * 1000);
        this.emit({ type: 'committed-detail', text: e.text, language: e.language, words: e.words });
        return;
      }
      case 'error':
        this.detach();
        this.emit({ type: 'partial', text: '' });
        this.handleFailure(e.kind, true);
        return;
      case 'closed':
        return;
    }
  }

  private handleFailure(kind: ProviderErrorKind, announce: boolean): void {
    const decision = this.policy.next(kind);
    if (!decision.retry) {
      this.phase = 'failed';
      this.emit({ type: 'state', state: 'failed', reason: failureReason(kind, decision) });
      return;
    }
    this.phase = 'reconnecting';
    if (announce) {
      const reason = reconnectingReason(kind);
      this.emit({ type: 'state', state: 'reconnecting', ...(reason === undefined ? {} : { reason }) });
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.reconnect();
    }, decision.delayMs);
  }

  private async reconnect(): Promise<void> {
    let session: TranscriptionSession;
    try {
      session = await this.opts.provider.openSession(this.sessionOptions());
    } catch (e) {
      if (this.phase === 'reconnecting') this.handleFailure(openFailureKind(e), false);
      return;
    }
    if (this.phase !== 'reconnecting') {
      session.close();
      return;
    }
    this.attach(session);
  }

  private emit(e: ReconnectingEvent): void {
    for (const l of this.listeners) l(e);
  }
}
