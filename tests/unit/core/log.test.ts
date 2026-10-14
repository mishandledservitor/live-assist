import { describe, expect, it, vi } from 'vitest';
import { createLogger, redact, type LogSink } from '@/core/log';

function fakeSink(): LogSink & { calls: { level: string; args: unknown[] }[] } {
  const calls: { level: string; args: unknown[] }[] = [];
  return {
    calls,
    error: (...args: unknown[]) => calls.push({ level: 'error', args }),
    warn: (...args: unknown[]) => calls.push({ level: 'warn', args }),
    info: (...args: unknown[]) => calls.push({ level: 'info', args }),
  };
}

describe('redact', () => {
  it('replaces values under key-, token- and authorization-like keys at any depth', () => {
    const out = redact({
      apiKey: 'sk_test_fixture_log_0001',
      elevenLabsApiKey: 'sk_test_fixture_log_0002',
      credential: { token: 'sutkn_fixture_log', expiresAt: 5 },
      headers: { Authorization: 'Bearer abc', 'xi-api-key': 'k' },
      list: [{ accessToken: 't' }],
      stream: 'others',
    });
    expect(out).toEqual({
      apiKey: '[redacted]',
      elevenLabsApiKey: '[redacted]',
      credential: { token: '[redacted]', expiresAt: 5 },
      headers: { Authorization: '[redacted]', 'xi-api-key': '[redacted]' },
      list: [{ accessToken: '[redacted]' }],
      stream: 'others',
    });
  });

  it('never passes audio through: typed arrays and buffers become a size note', () => {
    const out = redact({ frame: new Int16Array(160), raw: new ArrayBuffer(8), floats: new Float32Array(4) });
    expect(out).toEqual({
      frame: '[audio omitted: 320 bytes]',
      raw: '[audio omitted: 8 bytes]',
      floats: '[audio omitted: 16 bytes]',
    });
  });

  it('masks key- and token-shaped strings inside free text', () => {
    expect(redact('Invalid token sutkn_abc123XYZ for sk_1234567890abcdef')).toBe(
      'Invalid token [redacted] for [redacted]',
    );
  });

  it('keeps Error messages (redacted) and survives cycles', () => {
    const cyclic: Record<string, unknown> = { name: 'a' };
    cyclic.self = cyclic;
    expect(redact(new Error('bad key sk_1234567890abcdef'))).toBe('Error: bad key [redacted]');
    expect(redact(cyclic)).toEqual({ name: 'a', self: '[circular]' });
  });
});

describe('createLogger', () => {
  it('prefixes the scope and redacts every argument before it reaches the sink', () => {
    const sink = fakeSink();
    const log = createLogger('offscreen', sink);
    log.error('could not store a line', { token: 'sutkn_fixture_x', frame: new Uint8Array(3) });
    expect(sink.calls).toEqual([
      {
        level: 'error',
        args: [
          'live-assist[offscreen]: could not store a line',
          { token: '[redacted]', frame: '[audio omitted: 3 bytes]' },
        ],
      },
    ]);
  });

  it('defaults to the console', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createLogger('bg').warn('hello sk_1234567890abcdef');
    expect(spy).toHaveBeenCalledWith('live-assist[bg]: hello [redacted]');
    spy.mockRestore();
  });
});
