// T046: Meet's mute state from the mic button's `data-is-muted` (research R7, contracts/meet-dom.md D5), against the
// saved snapshots. Readings carry the moment the page changed, so the mute gate can silence from then (research R8).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIC_MISSING_MS, observeMute, type MuteObservation } from '@/platforms/meet/mute-observer';
import { loadMeetSnapshot, removeMicButton, setMuted } from '../../../support/meet-snapshot';

const T0 = 1_760_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

/** jsdom delivers MutationObserver records in a microtask; this lets them through without moving the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

function setup(snapshot = 'in-call-captions-off') {
  const doc = loadMeetSnapshot(snapshot);
  const readings: MuteObservation[] = [];
  const observer = observeMute({ doc, onReading: (r) => void readings.push(r) });
  return { doc, readings, observer };
}

const micButton = (doc: Document) => doc.querySelector<HTMLElement>('button[data-mute-button]')!;

describe('observeMute', () => {
  it('reports the current reading at once', () => {
    expect(setup().readings).toEqual([{ muted: false, observedAt: T0 }]);
    expect(setup('in-call-captions-on').readings).toEqual([{ muted: true, observedAt: T0 }]);
  });

  it('the lobby reads muted from the pre-join mic toggle', () => {
    expect(setup('lobby').readings).toEqual([{ muted: true, observedAt: T0 }]);
  });

  it('reads the mic button, not the camera button (which also carries data-is-muted)', async () => {
    const { doc, readings } = setup();
    const camera = doc.querySelector('button[jsname="psRWwc"]')!;
    camera.setAttribute('data-is-muted', 'true');
    await flush();
    expect(readings).toHaveLength(1);
  });

  it('every flip of data-is-muted → a reading stamped with the time it was seen', async () => {
    const { doc, readings } = setup();
    vi.setSystemTime(T0 + 1000);
    setMuted(doc, true);
    await flush();
    vi.setSystemTime(T0 + 1300);
    setMuted(doc, false);
    await flush();
    expect(readings).toEqual([
      { muted: false, observedAt: T0 },
      { muted: true, observedAt: T0 + 1000 },
      { muted: false, observedAt: T0 + 1300 },
    ]);
  });

  it('does not repeat an unchanged reading', async () => {
    const { doc, readings } = setup();
    setMuted(doc, false);
    micButton(doc).setAttribute('aria-label', 'Turn off microphone (⌘ + d)');
    await flush();
    expect(readings).toHaveLength(1);
  });

  it('keeps reading from a new mic button when Meet re-renders the control bar', async () => {
    const { doc, readings } = setup();
    const old = micButton(doc);
    const replacement = old.cloneNode(true) as HTMLElement;
    replacement.setAttribute('data-is-muted', 'true');
    old.replaceWith(replacement);
    await flush();
    expect(readings.at(-1)).toEqual({ muted: true, observedAt: T0 });
    vi.setSystemTime(T0 + 500);
    replacement.setAttribute('data-is-muted', 'false');
    await flush();
    expect(readings.at(-1)).toEqual({ muted: false, observedAt: T0 + 500 });
  });

  it(`no mic button for ${MIC_MISSING_MS} ms → null; a button that comes back within that is not reported missing`, async () => {
    const { doc, readings } = setup();
    const button = micButton(doc);
    const parent = button.parentElement!;
    button.remove();
    await flush();
    await vi.advanceTimersByTimeAsync(MIC_MISSING_MS - 100);
    parent.append(button);
    await flush();
    await vi.advanceTimersByTimeAsync(MIC_MISSING_MS);
    expect(readings).toEqual([{ muted: false, observedAt: T0 }]);

    removeMicButton(doc);
    await flush();
    await vi.advanceTimersByTimeAsync(MIC_MISSING_MS - 1);
    expect(readings).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(readings.at(-1)).toEqual({ muted: null, observedAt: T0 + 2 * MIC_MISSING_MS - 100 + MIC_MISSING_MS });
  });

  it('a page without a mic button reads null at once', () => {
    expect(setup('changed-page').readings).toEqual([{ muted: null, observedAt: T0 }]);
  });

  it('stop() ends observation', async () => {
    const { doc, readings, observer } = setup();
    observer.stop();
    setMuted(doc, true);
    await flush();
    await vi.advanceTimersByTimeAsync(MIC_MISSING_MS * 2);
    expect(readings).toHaveLength(1);
  });
});
