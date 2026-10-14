// Audio sent after the last committed word (research R4). After a drop it is replayed into the new session, so
// speech the old session had not finished is transcribed. A commit without word timings drops nothing (a repeat beats
// a loss). Bounded at REPLAY_CAP_MS, so a long outage drops the oldest audio and reports the gap instead of growing.

/** Above ElevenLabs' ~36 s auto-commit, so a healthy session never overflows it. */
export const REPLAY_CAP_MS = 40_000;
const FRAME_MS = 100;
const MAX_FRAMES = REPLAY_CAP_MS / FRAME_MS;

interface Entry {
  frame: Int16Array;
  /** Meeting time at which the frame's audio begins. */
  atMs: number;
}

export class ReplayBuffer {
  private entries: Entry[] = [];
  private gapMs = 0;

  push(frame: Int16Array, atMs: number): void {
    this.entries.push({ frame, atMs });
    while (this.entries.length > MAX_FRAMES) {
      this.entries.shift();
      this.gapMs += FRAME_MS;
    }
  }

  /**
   * The service finalised audio up to meeting time `endMs` (the committed segment's last word). Frames that end at or
   * before it are dropped; later ones — including frames sent after the commit point but before the commit message
   * arrived — stay for replay (red-team 2026-10-08).
   */
  commitThrough(endMs: number): void {
    while (this.entries.length > 0 && this.entries[0]!.atMs + FRAME_MS <= endMs) this.entries.shift();
  }

  frames(): Int16Array[] {
    return this.entries.map((e) => e.frame);
  }

  get firstFrameMs(): number | null {
    return this.entries[0]?.atMs ?? null;
  }

  /** Audio dropped by the cap since the last call, in ms. */
  takeGapMs(): number {
    const gap = this.gapMs;
    this.gapMs = 0;
    return gap;
  }
}
