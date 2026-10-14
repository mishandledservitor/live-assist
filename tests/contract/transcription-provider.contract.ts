// Shared contract suite every TranscriptionProvider runs (contracts/transcription-provider.md, behaviours 1–6).
// Callers must enable Vitest fake timers around it.
import { describe, expect, it, vi } from 'vitest';
import type {
  SessionEvent,
  SessionOptions,
  TranscriptionProvider,
  TranscriptionSession,
} from '@/providers/transcription/provider';
import { loadFixture, type Script } from '../support/fake-websocket';

export interface ProviderHarness {
  provider: TranscriptionProvider;
  /** Outbound input_audio_chunk messages of the i-th connection. */
  chunks(connection: number): Record<string, unknown>[];
}

export const baseOptions: SessionOptions = {
  sampleRate: 16000,
  language: { kind: 'auto' },
  keyterms: [],
};

export async function open(
  h: ProviderHarness,
  opts: SessionOptions = baseOptions,
): Promise<{ session: TranscriptionSession; events: SessionEvent[] }> {
  const pending = h.provider.openSession(opts);
  await vi.advanceTimersByTimeAsync(0);
  const session = await pending;
  const events: SessionEvent[] = [];
  session.on((e) => events.push(e));
  return { session, events };
}

const types = (events: SessionEvent[]) => events.map((e) => e.type);

export function transcriptionProviderContract(name: string, setup: (scripts: Script[]) => ProviderHarness): void {
  describe(`TranscriptionProvider contract: ${name}`, () => {
    it('1. openSession resolves once open; started follows session_started', async () => {
      const h = setup([loadFixture('happy-path')]);
      const { session, events } = await open(h);
      expect(events[0]).toEqual({ type: 'started', sessionId: 'sess-fixture-1' });
      expect(session.id).toBe('sess-fixture-1');
      session.close();
    });

    it('streams partials, then committed followed by a committed-detail with the same text', async () => {
      const h = setup([loadFixture('happy-path')]);
      const { session, events } = await open(h);
      await vi.advanceTimersByTimeAsync(6_000);
      expect(types(events)).toEqual([
        'started',
        'partial',
        'partial',
        'partial',
        'committed',
        'committed-detail',
        'partial',
        'committed',
        'committed-detail',
      ]);
      const committed = events.filter((e) => e.type === 'committed');
      const details = events.filter((e) => e.type === 'committed-detail');
      expect(details.map((d) => d.text)).toEqual(committed.map((c) => c.text));
      expect(details[0]).toEqual({
        type: 'committed-detail',
        text: 'Hello everyone.',
        language: 'en',
        words: [
          { text: 'Hello', startSec: 2.1, endSec: 2.4 },
          { text: 'everyone.', startSec: 2.45, endSec: 2.9 },
        ],
      });
      expect(details[1]).toMatchObject({ language: 'el', text: 'Καλημέρα σε όλους.' });
      session.close();
    });

    it('2. tolerates a committed with no committed-detail', async () => {
      const h = setup([loadFixture('no-detail-after-commit')]);
      const { session, events } = await open(h);
      await vi.advanceTimersByTimeAsync(7_000);
      expect(types(events)).toEqual(['started', 'partial', 'committed', 'partial']);
      session.close();
    });

    it.each([
      ['quota-error', 'quota', false],
      ['auth-error', 'auth', false],
      ['time-limit', 'time-limit', true],
    ] as const)('3. server error (%s) yields exactly one error then one closed', async (fixture, kind, recoverable) => {
      const h = setup([loadFixture(fixture)]);
      const { events } = await open(h);
      await vi.advanceTimersByTimeAsync(10_000);
      const errors = events.filter((e) => e.type === 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ kind, recoverable });
      expect(events.filter((e) => e.type === 'closed')).toHaveLength(1);
      expect(types(events).slice(-2)).toEqual(['error', 'closed']);
    });

    it('4. a close without an error yields error{network, recoverable} then closed', async () => {
      const h = setup([loadFixture('drop-mid-partial')]);
      const { events } = await open(h);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(events.slice(-2)).toEqual([
        { type: 'error', kind: 'network', recoverable: true, message: expect.any(String) as string },
        { type: 'closed', code: 1006, wasClean: false },
      ]);
    });

    it('5. previousText rides on the first audio chunk only', async () => {
      const h = setup([loadFixture('happy-path')]);
      const { session } = await open(h, { ...baseOptions, previousText: 'what was said last' });
      session.sendAudio(new Int16Array(1600));
      session.sendAudio(new Int16Array(1600));
      const chunks = h.chunks(0);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toMatchObject({ previous_text: 'what was said last', sample_rate: 16000, commit: false });
      expect(chunks[1]).not.toHaveProperty('previous_text');
      expect(Buffer.from(String(chunks[0]?.audio_base_64), 'base64')).toHaveLength(3200);
      session.close();
    });

    it('6. unknown message types are ignored', async () => {
      const h = setup([loadFixture('unknown-message')]);
      const { session, events } = await open(h);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(events.some((e) => e.type === 'error')).toBe(false);
      expect(events.find((e) => e.type === 'committed')).toEqual({ type: 'committed', text: 'Still works.' });
      session.close();
    });

    it('close() is idempotent, emits one clean closed and no error; sendAudio after close is a no-op', async () => {
      const h = setup([loadFixture('happy-path')]);
      const { session, events } = await open(h);
      session.close();
      session.close();
      expect(() => session.sendAudio(new Int16Array(1600))).not.toThrow();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(events.filter((e) => e.type === 'closed')).toEqual([{ type: 'closed', code: 1000, wasClean: true }]);
      expect(events.some((e) => e.type === 'error')).toBe(false);
      expect(events.some((e) => e.type === 'committed')).toBe(false);
      expect(h.chunks(0)).toHaveLength(0);
    });

    it('on() returns a working unsubscribe', async () => {
      const h = setup([loadFixture('happy-path')]);
      const { session } = await open(h);
      const late: SessionEvent[] = [];
      const off = session.on((e) => late.push(e));
      off();
      await vi.advanceTimersByTimeAsync(6_000);
      expect(late).toEqual([]);
      session.close();
    });
  });
}
