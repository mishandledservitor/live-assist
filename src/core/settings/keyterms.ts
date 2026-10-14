// ElevenLabs realtime keyterm limits (research R2): at most 50 terms of at most 20 characters.
export const MAX_KEYTERMS = 50;
export const MAX_KEYTERM_LENGTH = 20;

export type KeytermFlagReason = 'too-long' | 'too-many';

export interface KeytermPlan {
  /** Sent to the transcription session. */
  send: string[];
  /** Kept in settings but not sent; listed in the UI. */
  flagged: { term: string; reason: KeytermFlagReason }[];
}

/** Storage form: trimmed, non-empty, de-duplicated case-insensitively (first spelling wins). */
export function normalizeKeyterms(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    const folded = term.toLowerCase();
    if (term === '' || seen.has(folded)) continue;
    seen.add(folded);
    out.push(term);
  }
  return out;
}

export function planKeyterms(terms: readonly string[]): KeytermPlan {
  const plan: KeytermPlan = { send: [], flagged: [] };
  for (const term of normalizeKeyterms(terms)) {
    if (term.length > MAX_KEYTERM_LENGTH) plan.flagged.push({ term, reason: 'too-long' });
    else if (plan.send.length >= MAX_KEYTERMS) plan.flagged.push({ term, reason: 'too-many' });
    else plan.send.push(term);
  }
  return plan;
}

/** A typed or pasted list (FR-004a): one term per line or comma-separated; trimmed, empty pieces dropped. */
export function splitKeyterms(text: string): string[] {
  return text
    .split(/[\r\n,]/)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '');
}

/** The stored list after adding a typed or pasted list to it. */
export function addKeyterms(existing: readonly string[], text: string): string[] {
  return normalizeKeyterms([...existing, ...splitKeyterms(text)]);
}

/**
 * A single-line field loses pasted line breaks, so a pasted list goes in comma-separated: `pasted` replaces
 * `current[start, end)` and the result is one comma-separated line.
 */
export function insertKeytermList(current: string, start: number, end: number, pasted: string): string {
  return [current.slice(0, start), pasted, current.slice(end)].flatMap(splitKeyterms).join(', ');
}
