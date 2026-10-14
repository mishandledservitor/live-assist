// Replay buffer (T070, research R4): audio sent since the last commit, replayed into a new session after a drop.
import { describe, expect, it } from 'vitest';
import { REPLAY_CAP_MS, ReplayBuffer } from '@/core/session/replay-buffer';

const frame = (n: number) => Int16Array.of(n);

describe('ReplayBuffer', () => {
  it('holds frames in order with the meeting time of the first one', () => {
    const b = new ReplayBuffer();
    expect(b.firstFrameMs).toBeNull();
    b.push(frame(1), 1000);
    b.push(frame(2), 1100);
    expect(b.frames().map((f) => f[0])).toEqual([1, 2]);
    expect(b.firstFrameMs).toBe(1000);
  });

  // Red-team 2026-10-08 (001 T111): a commit drops only audio the service finalised, never frames sent after it.
  it('commitThrough(ms) drops only frames whose audio ends at or before ms', () => {
    const b = new ReplayBuffer();
    for (let i = 0; i < 5; i++) b.push(frame(i), i * 100);
    b.commitThrough(250);
    expect(b.frames().map((f) => f[0])).toEqual([2, 3, 4]);
    expect(b.firstFrameMs).toBe(200);
    b.commitThrough(500);
    expect(b.frames()).toEqual([]);
    expect(b.firstFrameMs).toBeNull();
    b.push(frame(5), 500);
    expect(b.firstFrameMs).toBe(500);
  });

  it('is capped at 40 s, dropping the oldest frames and reporting the gap once', () => {
    expect(REPLAY_CAP_MS).toBe(40_000);
    const b = new ReplayBuffer();
    for (let i = 0; i < 400; i++) b.push(frame(i), i * 100);
    expect(b.takeGapMs()).toBe(0);
    b.push(frame(400), 40_000);
    b.push(frame(401), 40_100);
    expect(b.frames()).toHaveLength(400);
    expect(b.frames()[0]?.[0]).toBe(2);
    expect(b.firstFrameMs).toBe(200);
    expect(b.takeGapMs()).toBe(200);
    expect(b.takeGapMs()).toBe(0);
  });
});
