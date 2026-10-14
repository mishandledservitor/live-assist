// e2e builds only (002 T054): records the peak level of each mic frame as it leaves the mute gate (before mixing) and
// answers `e2e/mic-tap`, so tests/e2e/meet.spec.ts can check the mic was silent while Meet showed muted. Imported
// dynamically in e2e mode, so production builds do not contain it. Levels only; no audio is kept.
import type { GateFrame } from '../../core/session/mute-gate';

interface TapEntry {
  /** Epoch ms at which the frame's audio begins. */
  atMs: number;
  /** Largest absolute sample; 0 = silence. */
  peak: number;
}

const MAX_ENTRIES = 3000;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null;

export function installMicTap(): (frame: GateFrame) => void {
  const entries: TapEntry[] = [];
  chrome.runtime.onMessage.addListener((m: unknown, _sender, sendResponse) => {
    if (!isRec(m) || m.type !== 'e2e/mic-tap') return false;
    sendResponse(entries);
    return false;
  });
  return (frame) => {
    if (!frame.mic) return;
    let peak = 0;
    for (const s of frame.mic) peak = Math.max(peak, Math.abs(s));
    entries.push({ atMs: frame.atMs, peak });
    if (entries.length > MAX_ENTRIES) entries.shift();
  };
}
