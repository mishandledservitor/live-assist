// The matching blocks of two sequences, exactly as Python's `difflib.SequenceMatcher(None, a, b, autojunk=False)
// .get_matching_blocks()` gives them (016 research R2 "difflib, exactly"). The merged download (016) aligns the
// realtime transcript's words with the captions' words through it; the reference merge the user measured used difflib,
// and its tie-breaks decide which of two identical passages an anchor goes to, so they are kept. Pure and synchronous.
//
// Changed from difflib for speed only, never for the result: the positions of a value in `b` are one sorted array,
// searched for the lower bound instead of skipped one by one; and each row's run lengths live in two typed arrays
// stamped with a row number instead of two dictionaries.

/** `[i, j, size]`: `a[i, i + size)` equals `b[j, j + size)`. */
export type MatchingBlock = [i: number, j: number, size: number];

/**
 * Non-overlapping blocks increasing in both sequences, adjacent blocks joined, ending with `[a.length, b.length, 0]`.
 * Of equally long blocks the one starting first in `a`, then first in `b`, is taken (difflib's `find_longest_match`).
 */
export function matchingBlocks(a: ArrayLike<number>, b: ArrayLike<number>): MatchingBlock[] {
  const la = a.length;
  const lb = b.length;

  // b2j: for each distinct value of b, its positions in b, ascending, as slices of one array.
  const idOf = new Map<number, number>();
  const bIds = new Int32Array(lb);
  for (let j = 0; j < lb; j += 1) {
    const value = b[j]!;
    let id = idOf.get(value);
    if (id === undefined) {
      id = idOf.size;
      idOf.set(value, id);
    }
    bIds[j] = id;
  }
  const starts = new Int32Array(idOf.size + 1);
  for (let j = 0; j < lb; j += 1) starts[bIds[j]! + 1]! += 1;
  for (let id = 0; id < idOf.size; id += 1) starts[id + 1]! += starts[id]!;
  const positions = new Int32Array(lb);
  const fill = starts.slice(0, idOf.size);
  for (let j = 0; j < lb; j += 1) positions[fill[bIds[j]!]!++] = j;
  // a's values as b's ids; -1 for a value b does not hold.
  const aIds = new Int32Array(la);
  for (let i = 0; i < la; i += 1) aIds[i] = idOf.get(a[i]!) ?? -1;

  // j2len rows, shifted by one so that index j holds the run ending at j - 1. A slot counts only when its stamp is the
  // previous row's; rows are numbered across calls, and each call skips a number so its first row starts empty.
  let prevLen = new Int32Array(lb + 1);
  let prevRow = new Int32Array(lb + 1).fill(-1);
  let curLen = new Int32Array(lb + 1);
  let curRow = new Int32Array(lb + 1).fill(-1);
  let row = 0;

  const firstAtOrAfter = (lo: number, hi: number, blo: number): number => {
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (positions[mid]! < blo) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const findLongestMatch = (alo: number, ahi: number, blo: number, bhi: number): MatchingBlock => {
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    row += 1;
    for (let i = alo; i < ahi; i += 1) {
      row += 1;
      const id = aIds[i]!;
      if (id >= 0) {
        const end = starts[id + 1]!;
        for (let p = firstAtOrAfter(starts[id]!, end, blo); p < end; p += 1) {
          const j = positions[p]!;
          if (j >= bhi) break;
          const k = (prevRow[j] === row - 1 ? prevLen[j]! : 0) + 1;
          curLen[j + 1] = k;
          curRow[j + 1] = row;
          if (k > bestsize) {
            besti = i - k + 1;
            bestj = j - k + 1;
            bestsize = k;
          }
        }
      }
      [prevLen, curLen] = [curLen, prevLen];
      [prevRow, curRow] = [curRow, prevRow];
    }
    // difflib extends the block over equal neighbours that are not junk; with no junk the block is already maximal,
    // but the loops are kept so the port reads as the original.
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize])
      bestsize += 1;
    return [besti, bestj, bestsize];
  };

  const found: MatchingBlock[] = [];
  const queue: [number, number, number, number][] = [[0, la, 0, lb]];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const [alo, ahi, blo, bhi] = next;
    const block = findLongestMatch(alo, ahi, blo, bhi);
    const [i, j, k] = block;
    if (k > 0) {
      found.push(block);
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  found.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);

  const blocks: MatchingBlock[] = [];
  let [i1, j1, k1] = [0, 0, 0];
  for (const [i2, j2, k2] of found) {
    if (i1 + k1 === i2 && j1 + k1 === j2) k1 += k2;
    else {
      if (k1 > 0) blocks.push([i1, j1, k1]);
      [i1, j1, k1] = [i2, j2, k2];
    }
  }
  if (k1 > 0) blocks.push([i1, j1, k1]);
  blocks.push([la, lb, 0]);
  return blocks;
}
