// Recorded WebSocket sequence format (contracts/transcription-provider.md "Fixture format"):
// one JSON object per line — { at: ms since open, dir: 'in' | 'out' | 'close', msg }.

export type FixtureLine =
  | { at: number; dir: 'in'; msg: Record<string, unknown> }
  | { at: number; dir: 'out'; msg: Record<string, unknown> }
  | { at: number; dir: 'close'; msg: { code: number } };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseFixture(text: string): FixtureLine[] {
  const out: FixtureLine[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') return;
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      throw new Error(`fixture line ${i + 1}: not JSON`);
    }
    if (!isRec(v) || typeof v.at !== 'number' || !isRec(v.msg)) throw new Error(`fixture line ${i + 1}: malformed`);
    if (v.dir === 'in' || v.dir === 'out') out.push({ at: v.at, dir: v.dir, msg: v.msg });
    else if (v.dir === 'close' && typeof v.msg.code === 'number')
      out.push({ at: v.at, dir: 'close', msg: { code: v.msg.code } });
    else throw new Error(`fixture line ${i + 1}: unknown dir`);
  });
  return out;
}
