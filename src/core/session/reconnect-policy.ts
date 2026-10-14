// What to do after a transcription session error (research R4): reconnect immediately on a session time limit,
// back off on transient failures, never retry errors that a retry cannot fix.
import type { ProviderErrorKind } from '../transcription/provider';

/** Delays between reconnect attempts; about a minute in total before a stream is marked failed. */
export const BACKOFF_MS: readonly number[] = [500, 1000, 2000, 4000, 8000, 15000, 15000];

export type RetryDecision =
  { retry: true; delayMs: number } | { retry: false; reason: 'non-recoverable' | 'exhausted' };

const NON_RECOVERABLE: ReadonlySet<ProviderErrorKind> = new Set(['auth', 'quota', 'terms', 'invalid-request']);
/** Bugs on our side (bad input) or unclassified errors: one retry, then fail. */
const ONE_RETRY: ReadonlySet<ProviderErrorKind> = new Set(['input', 'unknown']);

export class ReconnectPolicy {
  private attempt = 0;
  private oneRetryUsed = false;

  next(kind: ProviderErrorKind): RetryDecision {
    if (kind === 'time-limit') return { retry: true, delayMs: 0 };
    if (NON_RECOVERABLE.has(kind)) return { retry: false, reason: 'non-recoverable' };
    if (ONE_RETRY.has(kind)) {
      if (this.oneRetryUsed) return { retry: false, reason: 'exhausted' };
      this.oneRetryUsed = true;
    }
    const delayMs = BACKOFF_MS[this.attempt];
    if (delayMs === undefined) return { retry: false, reason: 'exhausted' };
    this.attempt += 1;
    return { retry: true, delayMs };
  }

  /** A session came back: the next failure starts the ladder again. */
  reset(): void {
    this.attempt = 0;
    this.oneRetryUsed = false;
  }
}
