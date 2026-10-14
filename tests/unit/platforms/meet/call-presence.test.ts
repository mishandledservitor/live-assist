// T102 (FR-024, design decision 36): leaving the Meet call is seen when Meet's in-call controls have been gone for
// CALL_GONE_MS after the user was in the call. The lobby, a brief re-render of the controls and presenting never count.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALL_GONE_MS, observeCallPresence } from '@/platforms/meet/call-presence';
import { loadMeetSnapshot } from '../../../support/meet-snapshot';

const T0 = 1_760_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

/** Meet's page after "Leave call": the controls are gone, a short notice and two buttons remain. */
function leaveCall(doc: Document): void {
  doc.body.innerHTML =
    '<div role="main"><h1>You left the meeting</h1><button>Rejoin</button><button>Return to home screen</button></div>';
}

const controls = (doc: Document) => doc.querySelector('[role="region"][aria-label="Call controls"]')!;

function setup(snapshot = 'real-dom-captions-on') {
  const doc = loadMeetSnapshot(snapshot);
  const left: number[] = [];
  const presence = observeCallPresence({ doc, onLeft: (at) => void left.push(at) });
  return { doc, left, presence };
}

describe('observeCallPresence', () => {
  it(`in the call, then the controls gone for ${CALL_GONE_MS} ms → left, once, stamped when they went`, async () => {
    const { doc, left } = setup();
    await vi.advanceTimersByTimeAsync(2000);
    leaveCall(doc);
    await vi.advanceTimersByTimeAsync(CALL_GONE_MS - 600);
    expect(left).toEqual([]);
    await vi.advanceTimersByTimeAsync(1200);
    expect(left).toHaveLength(1);
    expect(left[0]! - T0).toBeGreaterThanOrEqual(2000);
    expect(left[0]! - T0).toBeLessThanOrEqual(2600);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(left).toHaveLength(1);
  });

  it('the lobby before joining never counts as leaving, however long the wait', async () => {
    const { left } = setup('lobby');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(left).toEqual([]);
  });

  it('joining from the lobby is not leaving', async () => {
    const { doc, left } = setup('lobby');
    await vi.advanceTimersByTimeAsync(5000);
    doc.body.innerHTML = loadMeetSnapshot('real-dom-captions-on').body.innerHTML;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(left).toEqual([]);
  });

  it(`controls re-rendered (gone for less than ${CALL_GONE_MS} ms) is not leaving`, async () => {
    const { doc, left } = setup();
    await vi.advanceTimersByTimeAsync(1000);
    const bar = controls(doc);
    const parent = bar.parentElement!;
    bar.remove();
    await vi.advanceTimersByTimeAsync(CALL_GONE_MS - 1000);
    parent.append(bar.cloneNode(true));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(left).toEqual([]);
  });

  it('presenting (the layout changes, the controls stay) is not leaving', async () => {
    const { doc, left } = setup();
    await vi.advanceTimersByTimeAsync(1000);
    for (const tile of doc.querySelectorAll('[data-participant-id]')) tile.remove();
    doc.querySelector('[role="region"][aria-label="Captions"]')?.remove();
    const banner = doc.createElement('div');
    banner.textContent = 'You are presenting';
    doc.body.prepend(banner);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(left).toEqual([]);
  });

  it('stop() ends watching', async () => {
    const { doc, left, presence } = setup();
    await vi.advanceTimersByTimeAsync(1000);
    presence.stop();
    leaveCall(doc);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(left).toEqual([]);
  });
});
