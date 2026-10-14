// Leaving the Meet call (002 FR-024, design decision 36): once the user has been in the call, Meet's in-call controls
// gone for CALL_GONE_MS means they left ("You left the meeting", the call ended, they were removed). The lobby before
// joining is never "left"; a re-render of the controls shorter than CALL_GONE_MS and presenting (the controls stay)
// do not count. Polled, like the captions control, so it is independent of how Meet re-renders its page.
import { inCall } from './locators';

/** How often the page is checked. */
export const PRESENCE_POLL_MS = 500;
/** How long the in-call controls must be gone, continuously, before the call counts as left. */
export const CALL_GONE_MS = 4000;

export interface CallPresenceDeps {
  doc: Document;
  /** Called once, with the epoch ms when the controls were first seen gone. */
  onLeft(observedAt: number): void;
  now?: () => number;
}

export function observeCallPresence(deps: CallPresenceDeps): { stop(): void } {
  const now = deps.now ?? (() => Date.now());
  let wasInCall = false;
  let goneSince: number | null = null;
  let done = false;

  const check = () => {
    if (done) return;
    const t = now();
    if (inCall(deps.doc).value) {
      wasInCall = true;
      goneSince = null;
      return;
    }
    if (!wasInCall) return; // the lobby before joining
    goneSince ??= t;
    if (t - goneSince < CALL_GONE_MS) return;
    done = true;
    clearInterval(timer);
    deps.onLeft(goneSince);
  };

  const timer = setInterval(check, PRESENCE_POLL_MS);
  check();
  return {
    stop() {
      done = true;
      clearInterval(timer);
    },
  };
}
