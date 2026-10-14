// Spike builds only (002 T067, research R11): records an alignment trace of the running meeting — caption turns read
// off the Meet port, segment timing and attribution from the store — and answers `spike/alignment-trace` from the
// spike recorder page. Imported dynamically in spike mode, so production and e2e builds do not contain it. The trace
// holds placeholder names and times only (src/core/speakers/alignment-trace.ts).
import { parseFromPage } from '../../core/messaging/meet-bridge';
import { AlignmentTraceRecorder } from '../../core/speakers/alignment-trace';
import type { HostPort } from './host';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null;

export function installAlignmentTrace(
  onPlatformPort: (l: (port: HostPort) => void) => unknown,
): AlignmentTraceRecorder {
  const recorder = new AlignmentTraceRecorder();
  onPlatformPort((port) => {
    (port as chrome.runtime.Port).onMessage.addListener((raw: unknown) => {
      const m = parseFromPage(raw, Date.now());
      if (m?.type === 'meet/caption')
        recorder.caption({ turnKey: m.turnKey, speakerName: m.speakerName, self: m.self, observedAt: m.observedAt });
    });
  });
  chrome.runtime.onMessage.addListener((m: unknown, _sender, sendResponse) => {
    if (!isRec(m) || m.type !== 'spike/alignment-trace') return false;
    sendResponse(recorder.export());
    return false;
  });
  return recorder;
}

/**
 * Retest 2026-10-08 (T100): when a meeting ends, however it ends, the service worker saves the trace and its names
 * key into Downloads/live-assist-meet/ — no need to remember the recorder page before pressing Stop.
 */
export function saveTraceOnEnd(recorder: AlignmentTraceRecorder): void {
  const saved = recorder.export();
  if (saved.trace.captions.length === 0 && saved.trace.segments.length === 0) return;
  void chrome.runtime.sendMessage({ type: 'spike/save-trace', ...saved }).catch(() => undefined);
}
