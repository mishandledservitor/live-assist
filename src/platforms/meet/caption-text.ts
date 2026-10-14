// What a kept caption turn's text becomes when the page shows something new (013 research R1, spec P3). Meet rewrites
// a turn while it is spoken, and in a long turn it takes the beginning off the page; "the latest text replaces the
// earlier" alone would lose the start of every long turn. Pure: no DOM. A wrong guess errs towards keeping words Meet
// removed, never towards losing words.

/** Beginning of the new text looked for in the old. */
export const OVERLAP_PROBE_CHARS = 24;
/** A text this much shorter than the one before, with no overlap, is the item starting over. */
export const START_OVER_SHRINK_CHARS = 250;

export interface TurnText {
  /** Text that has left the page. */
  kept: string;
  /** The page's text at the last read. */
  shown: string;
}

/** What is stored for the turn. */
export const fullText = (t: TurnText): string => t.kept + t.shown;

/** The turn's text after the page shows `next`. */
export function mergeCaptionText(previous: TurnText, next: string): TurnText {
  // 1. A turn never loses its text to an empty read.
  if (next === '') return previous;
  // 2. Nothing shown yet.
  if (previous.shown === '') return { kept: previous.kept, shown: next };
  const at = previous.shown.indexOf(next.slice(0, OVERLAP_PROBE_CHARS));
  // 3. The new text begins inside the shown one: Meet dropped what came before it.
  if (at > 0) return { kept: previous.kept + previous.shown.slice(0, at), shown: next };
  // 4. Much shorter and unrelated: the item started over.
  if (at === -1 && previous.shown.length - next.length > START_OVER_SHRINK_CHARS)
    return { kept: `${previous.kept}${previous.shown} `, shown: next };
  // 5. Growth, a rewrite of recent words, a correction.
  return { kept: previous.kept, shown: next };
}
