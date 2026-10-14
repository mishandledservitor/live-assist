// 005's account status, fetched once per trigger and shared by the header badge and the Settings section (006
// research R4): on panel open, once when a running meeting stops, and on refresh; never on a timer (005 FR-008), and
// never while a fetch is in flight. It never affects Start (005 FR-011).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountUsageReply } from '../../../core/account/usage';
import type { AccountApi } from '../account-api';

export interface AccountState {
  /** Null until the first reply. */
  reply: AccountUsageReply | null;
  busy: boolean;
  refresh: () => void;
}

/** Null when there is no account API (nothing to show). */
export function useAccount(api: AccountApi | undefined, meetingRunning: boolean): AccountState | null {
  const [reply, setReply] = useState<AccountUsageReply | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  const refresh = useCallback(() => {
    if (!api || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    void api.usage().then((r) => {
      inFlight.current = false;
      if (!mounted.current) return;
      setReply(r);
      setBusy(false);
    });
  }, [api]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
      inFlight.current = false;
    };
  }, [refresh]);

  // Usage has just changed when a meeting ends (by Stop or on its own): refresh once on the falling edge.
  const wasRunning = useRef(meetingRunning);
  useEffect(() => {
    if (wasRunning.current && !meetingRunning) refresh();
    wasRunning.current = meetingRunning;
  }, [meetingRunning, refresh]);

  return api ? { reply, busy, refresh } : null;
}
