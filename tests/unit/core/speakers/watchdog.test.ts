// T041: captions on but silent while people talk → names degraded, and back on the next caption (US2-2, US2-3, SC-003).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptionsWatchdog, WATCHDOG_REASON } from '@/core/speakers/watchdog';

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

function setup() {
  const changes: boolean[] = [];
  const dog = new CaptionsWatchdog({ now: () => Date.now(), onChange: (degraded) => void changes.push(degraded) });
  /** Speech in the mixed stream every `everyMs` for `ms`. */
  const talk = async (ms: number, everyMs = 500) => {
    for (let t = 0; t < ms; t += everyMs) {
      dog.speech();
      await vi.advanceTimersByTimeAsync(everyMs);
    }
  };
  return { dog, changes, talk };
}

describe('CaptionsWatchdog', () => {
  it('says what it means for the lines', () => {
    expect(WATCHDOG_REASON).toBe('No captions seen for a while'); // 006 R10
  });

  it("captions on, speech going on and no caption for 8 s → degraded, within SC-003's 10 s", async () => {
    const { dog, changes, talk } = setup();
    dog.captionsOn(true);
    await talk(7500);
    expect(changes).toEqual([]);
    await talk(1500);
    expect(changes).toEqual([true]);
    expect(dog.degraded()).toBe(true);
  });

  it('silence never degrades', async () => {
    const { dog, changes } = setup();
    dog.captionsOn(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(changes).toEqual([]);
  });

  it('speech on fewer than 3 distinct seconds in the window does not degrade', async () => {
    const { dog, changes } = setup();
    dog.captionsOn(true);
    await vi.advanceTimersByTimeAsync(6000);
    dog.speech();
    dog.speech();
    await vi.advanceTimersByTimeAsync(1000);
    dog.speech();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(changes).toEqual([]);
  });

  it('the next caption activity recovers at once', async () => {
    const { dog, changes, talk } = setup();
    dog.captionsOn(true);
    await talk(9000);
    dog.caption();
    expect(changes).toEqual([true, false]);
    expect(dog.degraded()).toBe(false);
  });

  it('regular caption activity keeps it quiet', async () => {
    const { dog, changes } = setup();
    dog.captionsOn(true);
    for (let t = 0; t < 30_000; t += 500) {
      dog.speech();
      if (t % 4000 === 0) dog.caption();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(changes).toEqual([]);
  });

  it('only watches while captions are on; turning them off clears a degraded state without reporting', async () => {
    const { dog, changes, talk } = setup();
    await talk(10_000);
    expect(changes).toEqual([]);
    dog.captionsOn(true);
    await talk(9000);
    expect(changes).toEqual([true]);
    dog.captionsOn(false);
    expect(dog.degraded()).toBe(false);
    await talk(10_000);
    expect(changes).toEqual([true]);
  });

  it('dispose() stops checking', async () => {
    const { dog, changes } = setup();
    dog.captionsOn(true);
    for (let i = 0; i < 4; i++) {
      dog.speech();
      await vi.advanceTimersByTimeAsync(1000);
    }
    dog.dispose();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(changes).toEqual([]);
  });
});
