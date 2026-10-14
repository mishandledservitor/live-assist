// Spike builds only (retest 2026-10-08, T100): when a meeting ends, the offscreen document sends its alignment trace
// and names key here, and this saves both into Downloads/live-assist-meet/ (the spike build's downloads permission).
// Imported dynamically in spike mode, so production and e2e builds do not contain it.
import { dataUrl, traceFiles } from '../spike-recorder/meet-helpers';

export interface TraceSaverDeps {
  download(file: { url: string; filename: string }): Promise<unknown>;
  now(): Date;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function parse(raw: unknown): { trace: Rec; key: Record<string, string> } | null {
  if (!isRec(raw) || raw.type !== 'spike/save-trace' || !isRec(raw.trace) || !isRec(raw.key)) return null;
  const key = raw.key;
  if (!Object.values(key).every((v) => typeof v === 'string')) return null;
  return { trace: raw.trace, key: key as Record<string, string> };
}

/** Saves a `spike/save-trace` message's files; false (and nothing saved) for anything else. */
export async function saveTrace(raw: unknown, deps: TraceSaverDeps): Promise<boolean> {
  const saved = parse(raw);
  if (!saved) return false;
  for (const f of traceFiles(saved, deps.now()))
    await deps.download({ url: dataUrl(f.text, f.type), filename: f.filename });
  return true;
}
