// Meet's mute state (002 research R7, contracts/meet-dom.md D5): the mic button's `data-is-muted`, read again on every
// page mutation so a flip is stamped with the moment it happened (the mute gate silences from then, research R8) and a
// re-rendered control bar is followed to its new button. A button missing for MIC_MISSING_MS reads null.
import { isMuted, micButton } from './locators';

/** How long the mic button may be missing (Meet re-rendering the bar) before the reading becomes null. */
export const MIC_MISSING_MS = 2000;

export interface MuteObservation {
  muted: boolean | null;
  /** Epoch ms. */
  observedAt: number;
}

export interface MuteObserverDeps {
  doc: Document;
  onReading(reading: MuteObservation): void;
  now?: () => number;
}

export function observeMute(deps: MuteObserverDeps): { stop(): void } {
  const { doc } = deps;
  const now = deps.now ?? (() => Date.now());
  let last: boolean | null | undefined;
  let missingTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const report = (muted: boolean | null) => {
    if (stopped || muted === last) return;
    last = muted;
    deps.onReading({ muted, observedAt: now() });
  };

  const read = () => {
    if (stopped) return;
    const button = micButton(doc).value;
    if (button) {
      if (missingTimer !== null) clearTimeout(missingTimer);
      missingTimer = null;
      report(isMuted(button).value);
      return;
    }
    // Nothing to read yet on first look: say so at once. Later, give a re-render time to put the button back.
    if (last === undefined) return report(null);
    if (missingTimer !== null || last === null) return;
    missingTimer = setTimeout(() => {
      missingTimer = null;
      report(null);
    }, MIC_MISSING_MS);
  };

  const MutationObserverCtor = doc.defaultView?.MutationObserver;
  const observer = MutationObserverCtor ? new MutationObserverCtor(read) : null;
  observer?.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-is-muted', 'aria-label'],
    characterData: true,
  });
  read();

  return {
    stop() {
      stopped = true;
      observer?.disconnect();
      if (missingTimer !== null) clearTimeout(missingTimer);
    },
  };
}
