// e2e builds only (002 T005): counts Meet page ports and their hellos, and answers `e2e/meet-bridge-stats` so the
// bridge proof can see that the offscreen document received them. Imported dynamically in e2e mode, so production
// builds do not contain it.
import { parseFromPage } from '../../core/messaging/meet-bridge';
import type { HostPort } from './host';

interface Stats {
  ports: number;
  hellos: { meetingId: string; inCall: boolean }[];
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null;

export function installBridgeStats(onPlatformPort: (l: (port: HostPort) => void) => unknown): void {
  const stats: Stats = { ports: 0, hellos: [] };
  onPlatformPort((port) => {
    stats.ports += 1;
    (port as chrome.runtime.Port).onMessage.addListener((raw: unknown) => {
      const m = parseFromPage(raw, Date.now());
      if (m?.type === 'meet/hello') stats.hellos.push({ meetingId: m.meetingId, inCall: m.inCall });
    });
  });
  chrome.runtime.onMessage.addListener((m: unknown, _sender, sendResponse) => {
    if (!isRec(m) || m.type !== 'e2e/meet-bridge-stats') return false;
    sendResponse(stats);
    return false;
  });
}
