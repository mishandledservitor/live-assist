// Captions on but silent while people talk (002 research R6 "Watchdog", US2-2, US2-3): speaker names degrade with a
// reason after NO_CAPTIONS_MS, and recover on the next caption activity. Silence never degrades: muted mic audio is
// silenced before mixing, so talking while muted is not speech in the stream either.
import { ATTRIBUTION } from './attribution';

export const WATCHDOG_REASON = 'No captions seen for a while';
/** Speech must be heard on at least this many distinct seconds of the window. */
export const MIN_SPEECH_SECONDS = 3;
const CHECK_MS = 1000;

export interface CaptionsWatchdogDeps {
  /** Epoch ms. */
  now(): number;
  onChange(degraded: boolean): void;
  noCaptionsMs?: number;
}

export class CaptionsWatchdog {
  private on = false;
  private isDegraded = false;
  private lastCaptionAt = 0;
  /** Epoch seconds in which speech was heard, ascending. */
  private speechSeconds: number[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly windowMs: number;

  constructor(private readonly deps: CaptionsWatchdogDeps) {
    this.windowMs = deps.noCaptionsMs ?? ATTRIBUTION.NO_CAPTIONS_MS;
  }

  degraded(): boolean {
    return this.isDegraded;
  }

  /** Watching starts when captions are on and stops otherwise (their own state then explains the names). */
  captionsOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.isDegraded = false;
    if (on) {
      this.lastCaptionAt = this.deps.now();
      this.timer = setInterval(() => this.check(), CHECK_MS);
    } else this.stopTimer();
  }

  /** The stream shows speech now (a partial or a finished line). */
  speech(): void {
    const second = Math.floor(this.deps.now() / 1000);
    if (this.speechSeconds.at(-1) !== second) this.speechSeconds.push(second);
    this.check();
  }

  caption(): void {
    this.lastCaptionAt = this.deps.now();
    if (!this.isDegraded) return;
    this.isDegraded = false;
    this.deps.onChange(false);
  }

  dispose(): void {
    this.on = false;
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private check(): void {
    const now = this.deps.now();
    const from = Math.floor((now - this.windowMs) / 1000);
    this.speechSeconds = this.speechSeconds.filter((s) => s > from);
    if (!this.on || this.isDegraded || now - this.lastCaptionAt < this.windowMs) return;
    if (this.speechSeconds.length < MIN_SPEECH_SECONDS) return;
    this.isDegraded = true;
    this.deps.onChange(true);
  }
}
