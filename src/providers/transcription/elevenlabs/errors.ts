import type { ProviderErrorKind } from '../provider';

const TABLE: Record<string, { kind: ProviderErrorKind; recoverable: boolean }> = {
  auth_error: { kind: 'auth', recoverable: false },
  quota_exceeded: { kind: 'quota', recoverable: false },
  unaccepted_terms: { kind: 'terms', recoverable: false },
  invalid_request: { kind: 'invalid-request', recoverable: false },
  session_time_limit_exceeded: { kind: 'time-limit', recoverable: true },
  rate_limited: { kind: 'rate-limited', recoverable: true },
  commit_throttled: { kind: 'rate-limited', recoverable: true },
  queue_overflow: { kind: 'overloaded', recoverable: true },
  resource_exhausted: { kind: 'overloaded', recoverable: true },
  transcriber_error: { kind: 'transcriber', recoverable: true },
  error: { kind: 'transcriber', recoverable: true },
  insufficient_audio_activity: { kind: 'transcriber', recoverable: true },
  // Our bug if it happens: one retry, then fail (reconnect policy).
  input_error: { kind: 'input', recoverable: true },
  chunk_size_exceeded: { kind: 'input', recoverable: true },
};

/** ElevenLabs error message_type → contract error kind; null for anything that is not a known error. */
export function classifyErrorType(messageType: string): { kind: ProviderErrorKind; recoverable: boolean } | null {
  return Object.hasOwn(TABLE, messageType) ? { ...TABLE[messageType]! } : null;
}

const SECRET_SHAPES = /\b(?:sutkn_|sk_)[A-Za-z0-9_-]+/g;
const MAX_TEXT = 200;

/** Server error text may be shown and logged; strip anything token- or key-shaped first. */
export function sanitizeServerText(text: string): string {
  return text.replace(SECRET_SHAPES, '[redacted]').slice(0, MAX_TEXT);
}
