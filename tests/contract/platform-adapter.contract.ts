// Shared contract suite every PlatformAdapter runs (002 contracts/platform-adapter.md, revision 2; revision 3 adds
// captions.subscribeText, specs/013-captions-download/contracts/captions-capture.md).
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  CaptionActivity,
  CaptionsState,
  CaptionText,
  MuteReading,
  PlatformAdapter,
} from '@/core/platform/adapter';

/** Makes the adapter's platform show a kept caption turn with this whole text (invented). Absent = cannot be driven. */
export type EmitCaptionText = (adapter: PlatformAdapter, text: CaptionText) => void;

export function platformAdapterContract(
  name: string,
  create: () => PlatformAdapter,
  sampleUrls: URL[],
  emitText?: EmitCaptionText,
): void {
  describe(`PlatformAdapter contract: ${name}`, () => {
    it('matches() is pure: same answer for the same URL, no side effects', () => {
      const adapter = create();
      for (const url of sampleUrls) {
        const first = adapter.matches(url);
        expect(adapter.matches(new URL(url.href))).toBe(first);
      }
      adapter.dispose();
    });

    it('unsupported capabilities carry a non-empty reason', () => {
      const adapter = create();
      for (const capability of [adapter.captions, adapter.mute]) {
        if (!capability.supported) expect(capability.reason.trim().length).toBeGreaterThan(0);
      }
      adapter.dispose();
    });

    it('dispose() is idempotent', () => {
      const adapter = create();
      expect(() => {
        adapter.dispose();
        adapter.dispose();
      }).not.toThrow();
    });

    it('subscribe() returns a working unsubscribe', () => {
      const adapter = create();
      if (adapter.captions.supported) {
        const off = adapter.captions.subscribe(() => undefined);
        expect(typeof off).toBe('function');
        expect(() => off()).not.toThrow();
      }
      if (adapter.mute.supported) {
        const off = adapter.mute.subscribe(() => undefined);
        expect(typeof off).toBe('function');
        expect(() => off()).not.toThrow();
      }
      adapter.dispose();
    });

    it('captions.subscribeState() replays the current state on subscribe, and unsubscribes', () => {
      const adapter = create();
      if (adapter.captions.supported) {
        const seen: CaptionsState[] = [];
        const off = adapter.captions.subscribeState((s) => void seen.push(s));
        expect(seen).toHaveLength(1);
        expect(['starting', 'on', 'unavailable', 'off-by-user']).toContain(seen[0]?.state);
        expect(() => off()).not.toThrow();
      }
      adapter.dispose();
    });

    it('captions.restore() is idempotent and never rejects', async () => {
      const adapter = create();
      if (adapter.captions.supported) {
        await expect(adapter.captions.restore()).resolves.toBeUndefined();
        await expect(adapter.captions.restore()).resolves.toBeUndefined();
      }
      adapter.dispose();
    });

    it('mute.current() returns a reading with observedAt', () => {
      const adapter = create();
      if (adapter.mute.supported) {
        const reading: MuteReading = adapter.mute.current();
        expect([true, false, null]).toContain(reading.muted);
        expect(Number.isFinite(reading.observedAt)).toBe(true);
      }
      adapter.dispose();
    });

    it('caption activity carries names and timing only, never caption text (FR-004)', () => {
      expectTypeOf<CaptionActivity>().toEqualTypeOf<{
        turnKey: string;
        speakerName: string;
        self: boolean | null;
        observedAt: number;
      }>();
    });

    it('an unsupported captions capability has no subscribeText', () => {
      const adapter = create();
      if (!adapter.captions.supported) expect(adapter.captions).not.toHaveProperty('subscribeText');
      else expect(adapter.captions).toHaveProperty('subscribeText');
      adapter.dispose();
    });

    it('captions.subscribeText() returns an unsubscriber that stops delivery', () => {
      const adapter = create();
      if (adapter.captions.supported) {
        const seen: CaptionText[] = [];
        const off = adapter.captions.subscribeText((t) => void seen.push(t));
        expect(typeof off).toBe('function');
        const turn = { turnKey: 'pg:1', speakerName: 'Emma Jones', self: null, firstSeenAt: Date.now() };
        emitText?.(adapter, { ...turn, text: 'The budget is' });
        if (emitText) expect(seen).toEqual([{ ...turn, text: 'The budget is' }]);
        expect(() => off()).not.toThrow();
        emitText?.(adapter, { ...turn, text: 'The budget is approved.' });
        expect(seen).toHaveLength(emitText ? 1 : 0);
      }
      adapter.dispose();
    });

    it('captions.subscribeText() never replays earlier text to a new listener', () => {
      const adapter = create();
      if (adapter.captions.supported) {
        const first: CaptionText[] = [];
        adapter.captions.subscribeText((t) => void first.push(t));
        const turn = { turnKey: 'pg:1', speakerName: 'Emma Jones', self: null, firstSeenAt: Date.now() };
        emitText?.(adapter, { ...turn, text: 'The budget is approved.' });
        if (emitText) expect(first).toHaveLength(1);
        const late: CaptionText[] = [];
        adapter.captions.subscribeText((t) => void late.push(t));
        expect(late).toEqual([]);
        emitText?.(adapter, { ...turn, turnKey: 'pg:2', text: 'Thank you.' });
        if (emitText) expect(late).toEqual([{ ...turn, turnKey: 'pg:2', text: 'Thank you.' }]);
      }
      adapter.dispose();
    });

    it('caption text is its own event type; caption activity still has no text', () => {
      expectTypeOf<CaptionText>().toEqualTypeOf<{
        turnKey: string;
        speakerName: string;
        self: boolean | null;
        firstSeenAt: number;
        text: string;
      }>();
      expectTypeOf<CaptionActivity>().not.toHaveProperty('text');
    });

    it('metadata() resolves to an object', async () => {
      const adapter = create();
      await expect(adapter.metadata()).resolves.toBeTypeOf('object');
      adapter.dispose();
    });
  });
}
