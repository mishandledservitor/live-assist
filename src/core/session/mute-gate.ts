// The mute gate (002 research R8, data-model.md "Mute gate"; constitution I): the mic input is silenced in front of
// the mixer while the user is muted, so nothing said while muted reaches the mix, the reconnect replay buffer or the
// session. Both inputs are held MUTE_GUARD_MS before mixing, delayed equally so they stay in sync, which lets a mute
// reading still silence mic audio captured just before the mute was detected (FR-014). Frames keep their capture time.
// On Meet the gate fails closed (design decision 34): without a reading saying "unmuted" the mic stays silenced.
import type { MuteReading } from '../platform/adapter';

/** Both inputs are held this long before the mixer. */
export const MUTE_GUARD_MS = 500;
/** A mute reading silences mic audio from this long before it was observed (the page's detection path). */
export const MUTE_DETECT_SLACK_MS = 150;
/**
 * On Start the panel says "checking" this long while waiting for the first reading, then that Meet's mute button
 * can't be seen. The mic stays silenced either way: on Meet the gate fails closed (design decision 34).
 */
export const MUTE_INITIAL_WAIT_MS = 3000;
/** A lost reading while muted reads as "checking" this long while the page reconnects, then as unreadable. */
export const MUTE_STALE_GRACE_MS = 5000;

const FRAME_MS = 100;

/** `unreadable`: Meet's mute state can't be read; the mic stays silenced until a reading (decision 34). */
export type GateMode = 'unsupported' | 'awaiting-first' | 'following' | 'stale-muted' | 'unreadable';

/** One 100 ms frame of each input; `mic` is null when the mix is the tab alone. `atMs` is the frame's start. */
export interface GateFrame {
  tab: Int16Array;
  mic: Int16Array | null;
  atMs: number;
}

export interface MuteGateDeps {
  /** Whether the platform's mute state can be read; when not, frames pass at once (001 behaviour). */
  supported: boolean;
  /** Same clock as the frames' `atMs` and the readings' `observedAt`. */
  now(): number;
  /** Receives frames after the hold, mic gated, in order. */
  release(frame: GateFrame): void;
  /** Every mode change, and every changed reading while following; `muted` is the reading followed, else null. */
  onMode?(mode: GateMode, muted: boolean | null): void;
}

/** A muted interval of mic audio: [from, to). */
interface Span {
  from: number;
  to: number;
}

/** Sums two PCM16 frames, clipping to the PCM16 range; without a mic the mix is the tab. */
export function mixFrames(tab: Int16Array, mic: Int16Array | null): Int16Array {
  if (!mic) return tab;
  const out = new Int16Array(tab.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-32768, Math.min(32767, tab[i]! + (mic[i] ?? 0)));
  return out;
}

export class MuteGate {
  private modeValue: GateMode;
  private muted: boolean | null = null;
  private readonly held: GateFrame[] = [];
  private readonly spans: Span[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly deps: MuteGateDeps) {
    if (!deps.supported) {
      this.modeValue = 'unsupported';
      return;
    }
    this.modeValue = 'awaiting-first';
    this.spans.push({ from: -Infinity, to: Infinity });
    this.after(MUTE_INITIAL_WAIT_MS, () => this.becomeUnreadable());
    deps.onMode?.('awaiting-first', null);
  }

  get mode(): GateMode {
    return this.modeValue;
  }

  push(frame: GateFrame): void {
    if (this.disposed) return;
    if (this.modeValue === 'unsupported') return this.deps.release(frame);
    this.held.push(frame);
    this.releaseDue(this.deps.now() - MUTE_GUARD_MS);
  }

  /** A reading from the platform; null means it cannot be read right now (page reloading, button gone). */
  reading(r: MuteReading): void {
    if (this.disposed || this.modeValue === 'unsupported') return;
    if (r.muted === null) return this.lost();
    this.clearTimer();
    const open = this.openSpan();
    if (r.muted && !open) this.spans.push({ from: r.observedAt - MUTE_DETECT_SLACK_MS, to: Infinity });
    if (!r.muted && open) open.to = Math.max(open.from, r.observedAt);
    const changed = this.modeValue !== 'following' || this.muted !== r.muted;
    this.muted = r.muted;
    if (changed) this.setMode('following', r.muted);
  }

  /** Releases every held frame now (tests and draining); a running meeting relies on the hold instead. */
  flush(): void {
    this.releaseDue(Infinity);
  }

  /** Drops held frames and stops; nothing is released afterwards. */
  dispose(): void {
    this.disposed = true;
    this.held.length = 0;
    this.clearTimer();
  }

  private lost(): void {
    if (this.modeValue === 'following' && this.muted === true) {
      this.setMode('stale-muted', null);
      this.after(MUTE_STALE_GRACE_MS, () => this.becomeUnreadable());
    } else if (this.modeValue === 'following') {
      // Unmuted until now: silence the mic from the detection slack before the loss, like a mute reading would.
      this.spans.push({ from: this.deps.now() - MUTE_DETECT_SLACK_MS, to: Infinity });
      this.becomeUnreadable();
    }
    // awaiting-first keeps waiting for its first real reading; stale-muted and unreadable stay as they are.
  }

  /** Fail closed (design decision 34): the open muted span stays open until a real reading arrives. */
  private becomeUnreadable(): void {
    this.clearTimer();
    this.muted = null;
    this.setMode('unreadable', null);
  }

  private setMode(mode: GateMode, muted: boolean | null): void {
    this.modeValue = mode;
    this.deps.onMode?.(mode, muted);
  }

  private openSpan(): Span | undefined {
    const last = this.spans[this.spans.length - 1];
    return last && last.to === Infinity ? last : undefined;
  }

  private releaseDue(endedBy: number): void {
    while (this.held.length > 0 && this.held[0]!.atMs + FRAME_MS <= endedBy) {
      const frame = this.held.shift()!;
      const silenced = frame.mic !== null && this.isMuted(frame.atMs, frame.atMs + FRAME_MS);
      this.deps.release(silenced ? { ...frame, mic: new Int16Array(frame.mic!.length) } : frame);
    }
    // Spans that ended before every frame still held can no longer matter.
    const oldest = this.held[0]?.atMs ?? this.deps.now() - MUTE_GUARD_MS;
    while (this.spans.length > 0 && this.spans[0]!.to <= oldest) this.spans.shift();
  }

  private isMuted(from: number, to: number): boolean {
    return this.spans.some((s) => s.from < to && s.to > from);
  }

  private after(ms: number, fn: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.disposed) fn();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
