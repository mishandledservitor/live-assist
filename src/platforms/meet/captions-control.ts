// Turning Meet's captions on, hiding them, and putting them back (002 research R4). Captions are per user, so nothing
// here changes what other participants see (design decision 5). The control never fights the user: if they turn
// captions off, it reports that and waits. State is read by polling the few elements involved, which keeps it
// independent of how Meet re-renders its control bar. Hiding is skipped while the user has Settings → Show Meet
// captions on (FR-028, design decision 61); the band Meet reserves for captions is never touched either way.
import { MEET_REASONS } from '../../core/messaging/meet-bridge';
import type { CaptionsState } from '../../core/platform/adapter';
import { captionsButton, captionsOn, captionsRegion, inCall, micButton } from './locators';

/** How often the page is checked while enabled. */
export const POLL_MS = 250;
/** Once in a call, how long the captions button may be missing (research R4). */
export const CAPTIONS_BUTTON_TIMEOUT_MS = 4000;
/** After our click, how long the button may take to report on. */
export const CAPTIONS_ON_TIMEOUT_MS = 4000;

export const HIDE_STYLE_ID = 'live-assist-captions-hide';
export const HIDE_ATTR = 'data-live-assist-hidden';
/**
 * Invisible but still rendered, so Meet keeps updating the captions. Opacity only: collapsing the band stopped the
 * updates in a real call and freed no space (design decisions 58 and 61).
 */
export const HIDE_CSS = `[${HIDE_ATTR}] { opacity: 0 !important; pointer-events: none !important; }`;

type Phase = 'idle' | 'waiting-call' | 'finding-button' | 'turning-on' | 'on' | 'failed' | 'off-by-user';

export interface CaptionsControlDeps {
  doc: Document;
  onState(state: CaptionsState): void;
  now?: () => number;
}

export class CaptionsControl {
  private phase: Phase = 'idle';
  private current: CaptionsState = { state: 'starting', reason: MEET_REASONS.starting };
  private timer: ReturnType<typeof setInterval> | null = null;
  private phaseSince = 0;
  /** Captions state before our first enable (null until known). */
  private wasOn: boolean | null = null;
  /**
   * When `restore()` last clicked captions off, until Meet's button reports off. Meet flips the button some time after
   * the click, so an `enable()` in between must not read the stale "on" as the user's own captions (T080).
   */
  private restoreClickAt: number | null = null;
  /** Settings → Show Meet captions (FR-028): while true nothing is hidden. */
  private shown = false;
  private readonly now: () => number;

  constructor(private readonly deps: CaptionsControlDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  state(): CaptionsState {
    return this.current;
  }

  /**
   * Shows or hides the captions from now on, at any time (FR-029). It only adds or removes the hide tag and
   * stylesheet: no click, no phase change, no state report, so naming and what restore() puts back are untouched.
   */
  setShown(shown: boolean): void {
    this.shown = shown;
    if (shown) this.unhide();
    else if (this.phase === 'on') this.hide();
  }

  /** Starts the enable flow; idempotent while enabled. */
  enable(): void {
    if (this.phase !== 'idle') return;
    // A restore click older than Meet's reaction time has been applied or lost; what the button shows now is the user's.
    if (this.restoreClickAt !== null && this.now() - this.restoreClickAt >= CAPTIONS_ON_TIMEOUT_MS)
      this.restoreClickAt = null;
    this.enter('waiting-call');
    this.timer = setInterval(() => this.check(), POLL_MS);
    this.check();
  }

  /** Unhides; turns captions off only if they were off before enable and are still on. Idempotent. */
  restore(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const wasEnabled = this.phase !== 'idle';
    this.phase = 'idle';
    this.unhide();
    if (!wasEnabled || this.wasOn !== false) return;
    this.wasOn = null;
    const button = captionsButton(this.deps.doc).value;
    if (button && captionsOn(button).value === true) {
      button.click();
      this.restoreClickAt = this.now();
    }
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseSince = this.now();
  }

  private report(state: CaptionsState): void {
    const same =
      state.state === this.current.state &&
      ('reason' in state ? state.reason : '') === ('reason' in this.current ? this.current.reason : '');
    this.current = state;
    if (!same) this.deps.onState(state);
  }

  private elapsed(): number {
    return this.now() - this.phaseSince;
  }

  private check(): void {
    const { doc } = this.deps;
    if (this.phase === 'waiting-call') {
      if (!inCall(doc).value) {
        // The lobby (its mic toggle is there) is waited out with no timeout; a page that is recognisably neither the
        // lobby nor a call has changed under us, and fails like a missing captions button (keeps polling to recover).
        if (micButton(doc).value) this.report({ state: 'starting', reason: MEET_REASONS.lobby });
        else if (this.elapsed() >= CAPTIONS_BUTTON_TIMEOUT_MS)
          this.report({ state: 'unavailable', reason: MEET_REASONS.cantTurnOn });
        return;
      }
      this.report({ state: 'starting', reason: MEET_REASONS.starting });
      this.enter('finding-button');
    }

    const button = captionsButton(doc).value;
    const on = button ? captionsOn(button).value : null;

    switch (this.phase) {
      case 'finding-button':
        if (!button || on === null) {
          if (this.elapsed() >= CAPTIONS_BUTTON_TIMEOUT_MS) this.fail();
          return;
        }
        if (this.restoreClickAt !== null) {
          // Our own restore click is still on its way: wait for Meet to show it. If it never does, captions are on
          // only because of us, so they still count as off before Start.
          const pending = this.now() - this.restoreClickAt < CAPTIONS_ON_TIMEOUT_MS;
          if (on && pending) return;
          this.restoreClickAt = null;
          this.wasOn ??= false;
        }
        this.wasOn ??= on;
        if (on) return this.turnedOn();
        button.click();
        this.enter('turning-on');
        return;
      case 'turning-on':
        if (on === true) return this.turnedOn();
        if (this.elapsed() >= CAPTIONS_ON_TIMEOUT_MS) this.fail();
        return;
      case 'failed':
        // Keep watching: a button that appears or turns on late still recovers (FR-011).
        if (on === true) {
          this.wasOn ??= false;
          this.turnedOn();
        }
        return;
      case 'on':
        if (on === false) {
          this.enter('off-by-user');
          this.report({ state: 'off-by-user', reason: MEET_REASONS.turnedOff });
          return;
        }
        this.hide(); // Meet may re-render the captions band
        return;
      case 'off-by-user':
        if (on === true) this.turnedOn();
        return;
      default:
        return;
    }
  }

  private turnedOn(): void {
    this.enter('on');
    this.hide();
    this.report({ state: 'on' });
  }

  private fail(): void {
    this.enter('failed');
    this.report({ state: 'unavailable', reason: MEET_REASONS.cantTurnOn });
  }

  private hide(): void {
    if (this.shown) return;
    const { doc } = this.deps;
    if (!doc.getElementById(HIDE_STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = HIDE_STYLE_ID;
      style.textContent = HIDE_CSS;
      (doc.head ?? doc.documentElement).append(style);
    }
    // Only the captions region itself: never a parent or a neighbour (research R13: hiding the parent once hid
    // Meet's admit/notifications area).
    const region = captionsRegion(doc).value;
    if (region && !region.hasAttribute(HIDE_ATTR)) region.setAttribute(HIDE_ATTR, '');
  }

  private unhide(): void {
    const { doc } = this.deps;
    doc.getElementById(HIDE_STYLE_ID)?.remove();
    for (const el of doc.querySelectorAll(`[${HIDE_ATTR}]`)) el.removeAttribute(HIDE_ATTR);
  }
}
