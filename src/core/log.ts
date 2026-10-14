// The only way src logs (FR-003, Constitution I): secrets are redacted and audio never reaches a log.
// Values under key/token/authorization-like keys are replaced, key- and token-shaped text is masked,
// and binary data (audio frames) is reduced to its size.

export interface LogSink {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
}

export type Logger = LogSink;

const SECRET_KEY = /key|token|authorization/i;
const SECRET_TEXT = /\b(?:sutkn_|sk_)[A-Za-z0-9_-]+/g;
const REDACTED = '[redacted]';

const redactText = (text: string): string => text.replace(SECRET_TEXT, REDACTED);

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return `[audio omitted: ${value.byteLength} bytes]`;
  if (value instanceof Error) return redactText(`${value.name}: ${value.message}`);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? REDACTED : redactValue(v, seen);
  return out;
}

export function redact(value: unknown): unknown {
  return redactValue(value, new WeakSet());
}

export function createLogger(scope: string, sink: LogSink = console): Logger {
  const write =
    (level: keyof LogSink) =>
    (message: unknown, ...rest: unknown[]) =>
      sink[level](`live-assist[${scope}]: ${String(redact(message))}`, ...rest.map(redact));
  return { error: write('error'), warn: write('warn'), info: write('info') };
}
