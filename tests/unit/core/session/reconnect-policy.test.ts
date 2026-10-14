// Reconnect policy (T069, research R4): what to do after a session error, and how long to wait.
import { describe, expect, it } from 'vitest';
import { BACKOFF_MS, ReconnectPolicy } from '@/core/session/reconnect-policy';
import type { ProviderErrorKind } from '@/core/transcription/provider';

describe('ReconnectPolicy', () => {
  it('retries a session time limit immediately, every time', () => {
    const p = new ReconnectPolicy();
    for (let i = 0; i < 20; i++) expect(p.next('time-limit')).toEqual({ retry: true, delayMs: 0 });
  });

  it.each<ProviderErrorKind>(['network', 'rate-limited', 'overloaded', 'transcriber'])(
    'backs off 0.5, 1, 2, 4, 8, 15, 15 s for %s, then gives up',
    (kind) => {
      const p = new ReconnectPolicy();
      const delays: number[] = [];
      for (;;) {
        const d = p.next(kind);
        if (!d.retry) {
          expect(d.reason).toBe('exhausted');
          break;
        }
        delays.push(d.delayMs);
      }
      expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 15000, 15000]);
      expect(BACKOFF_MS).toEqual(delays);
    },
  );

  it('mixes kinds on one backoff ladder', () => {
    const p = new ReconnectPolicy();
    expect(p.next('network')).toEqual({ retry: true, delayMs: 500 });
    expect(p.next('overloaded')).toEqual({ retry: true, delayMs: 1000 });
  });

  it.each<ProviderErrorKind>(['auth', 'quota', 'terms', 'invalid-request'])('never retries %s', (kind) => {
    expect(new ReconnectPolicy().next(kind)).toEqual({ retry: false, reason: 'non-recoverable' });
  });

  it.each<ProviderErrorKind>(['input', 'unknown'])('retries %s once, then fails', (kind) => {
    const p = new ReconnectPolicy();
    expect(p.next(kind)).toEqual({ retry: true, delayMs: 500 });
    expect(p.next(kind)).toEqual({ retry: false, reason: 'exhausted' });
  });

  it('starts over after a session came back (reset)', () => {
    const p = new ReconnectPolicy();
    for (let i = 0; i < 7; i++) p.next('network');
    expect(p.next('network').retry).toBe(false);
    p.reset();
    expect(p.next('network')).toEqual({ retry: true, delayMs: 500 });
    p.next('input');
    p.reset();
    expect(p.next('input')).toEqual({ retry: true, delayMs: 500 });
  });
});
