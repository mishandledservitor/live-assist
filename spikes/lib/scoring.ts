// Spike scoring (research R7, R8): text normalisation, WER/CER, and the echo-duplicate rule.

/** Lowercase, fold diacritics (Greek tonos/dialytika, Latin accents) and final sigma, drop punctuation. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokens(text: string): string[] {
  const n = normalizeText(text);
  return n === '' ? [] : n.split(' ');
}

function editDistance<T>(ref: readonly T[], hyp: readonly T[]): number {
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j++) {
      const sub = prev[j - 1]! + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      cur[j] = Math.min(sub, prev[j]! + 1, cur[j - 1]! + 1);
    }
    prev = cur;
  }
  return prev[hyp.length]!;
}

/** Word error rate: edits over reference words (insertions over an empty reference count against 1). */
export function wer(reference: string, hypothesis: string): number {
  const ref = tokens(reference);
  return editDistance(ref, tokens(hypothesis)) / Math.max(1, ref.length);
}

/** Character error rate on normalised text, spaces included (matters for Greek morphology). */
export function cer(reference: string, hypothesis: string): number {
  const ref = [...normalizeText(reference)];
  return editDistance(ref, [...normalizeText(hypothesis)]) / Math.max(1, ref.length);
}

/** Share of `a`'s tokens (as a multiset) that also occur in `b`; 0 when either is empty. */
export function tokenOverlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of tb) counts.set(t, (counts.get(t) ?? 0) + 1);
  let shared = 0;
  for (const t of ta) {
    const c = counts.get(t) ?? 0;
    if (c > 0) {
      shared += 1;
      counts.set(t, c - 1);
    }
  }
  return shared / ta.length;
}

export interface TimedText {
  startMs: number;
  endMs: number;
  text: string;
}

export const ECHO_TIME_TOLERANCE_MS = 1500;
export const ECHO_MIN_OVERLAP = 0.6;

export interface EchoResult {
  /** Mic lines judged to be echoes of a remote (tab) line. */
  duplicatedMicLines: number;
  /** Remote lines echoed by at least one mic line. */
  duplicatedRemoteLines: number;
  remoteLines: number;
  micLines: number;
  /** duplicatedRemoteLines / remoteLines — the figure research R7's 5 % rule uses. */
  rate: number;
  pairs: { mic: number; tab: number; overlap: number }[];
}

const nearInTime = (a: TimedText, b: TimedText) =>
  a.startMs <= b.endMs + ECHO_TIME_TOLERANCE_MS && b.startMs <= a.endMs + ECHO_TIME_TOLERANCE_MS;

/**
 * Research R7: a mic line is an echo duplicate of a tab line if they are within ±1.5 s of each other and at least
 * 60 % of the mic line's tokens occur in the tab line.
 */
export function findEchoDuplicates(mic: readonly TimedText[], tab: readonly TimedText[]): EchoResult {
  const pairs: EchoResult['pairs'] = [];
  mic.forEach((m, i) => {
    tab.forEach((t, j) => {
      if (!nearInTime(m, t)) return;
      const overlap = tokenOverlap(m.text, t.text);
      if (overlap >= ECHO_MIN_OVERLAP) pairs.push({ mic: i, tab: j, overlap });
    });
  });
  const duplicatedRemoteLines = new Set(pairs.map((p) => p.tab)).size;
  return {
    duplicatedMicLines: new Set(pairs.map((p) => p.mic)).size,
    duplicatedRemoteLines,
    remoteLines: tab.length,
    micLines: mic.length,
    rate: tab.length === 0 ? 0 : duplicatedRemoteLines / tab.length,
    pairs,
  };
}
