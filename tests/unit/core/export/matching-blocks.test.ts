// 016 T002 (research R2 "difflib, exactly"; contracts/merged-file.md): `matchingBlocks` gives exactly what Python's
// `difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks()` gives. Every expected value below was
// produced by Python 3's difflib for the same input and written in by hand; no Python runs in the tests.
import { describe, expect, it } from 'vitest';
import { matchingBlocks } from '../../../../src/core/export/matching-blocks';

/** xorshift32, the same generator the expected values were made with. */
function* xorshift(seed: number): Generator<number> {
  let x = seed >>> 0;
  for (;;) {
    x ^= (x << 13) >>> 0;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    x >>>= 0;
    yield x;
  }
}

const take = (gen: Generator<number>, n: number, map: (r: number) => number) =>
  Array.from({ length: n }, () => map(gen.next().value as number));

/** FNV-1a over the compact JSON of the blocks, as the expected digests were taken. */
function digest(blocks: readonly (readonly number[])[]): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(JSON.stringify(blocks))) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return `0x${h.toString(16)}`;
}

describe('matchingBlocks (difflib get_matching_blocks, autojunk off)', () => {
  it.each([
    ['both empty', [], [], [[0, 0, 0]]],
    ['a only', [1, 2, 3], [], [[3, 0, 0]]],
    ['b only', [], [4, 5], [[0, 2, 0]]],
    ['no match', [1, 2], [3, 4], [[2, 2, 0]]],
    [
      'identical',
      [1, 2, 3],
      [1, 2, 3],
      [
        [0, 0, 3],
        [3, 3, 0],
      ],
    ],
    [
      'one gap',
      [1, 2, 9, 3, 4],
      [1, 2, 3, 4],
      [
        [0, 0, 2],
        [3, 2, 2],
        [5, 4, 0],
      ],
    ],
    [
      'of two equal blocks, the first in a',
      [1, 2, 9, 1, 2],
      [1, 2],
      [
        [0, 0, 2],
        [5, 2, 0],
      ],
    ],
    [
      'of two equal blocks, the first in b',
      [1, 2],
      [1, 2, 9, 1, 2],
      [
        [0, 0, 2],
        [2, 5, 0],
      ],
    ],
    [
      'repeated symbols',
      [1, 1, 1, 2, 1],
      [1, 2, 1, 1, 1, 1],
      [
        [0, 2, 3],
        [4, 5, 1],
        [5, 6, 0],
      ],
    ],
    [
      'crossing blocks: only the longest survives',
      [1, 2, 3, 4, 5, 6],
      [4, 5, 6, 1, 2, 3],
      [
        [0, 3, 3],
        [6, 6, 0],
      ],
    ],
  ])('%s', (_name, a, b, expected) => {
    expect(matchingBlocks(a, b)).toEqual(expected);
  });

  it('a pseudo-random pair of 2,000 symbols each', () => {
    const symbol = (r: number) => Math.min(r % 61, (r >>> 8) % 61);
    const a = take(xorshift(2463534242), 2000, symbol);
    const b = take(xorshift(88172645), 2000, symbol);
    expect(a.slice(0, 5)).toEqual([3, 5, 21, 29, 47]);
    expect(b.slice(0, 5)).toEqual([39, 15, 2, 11, 8]);
    const blocks = matchingBlocks(a, b);
    expect(blocks.slice(0, 3)).toEqual([
      [0, 8, 1],
      [1, 120, 2],
      [3, 568, 2],
    ]);
    expect(blocks).toHaveLength(55);
    expect(blocks.reduce((n, [, , size]) => n + size, 0)).toBe(77);
    expect(digest(blocks)).toBe('0x28d379e9');
  });

  it('a 3,000-symbol sequence against a copy with drops, substitutions and insertions', () => {
    const gen = xorshift(123456789);
    const a = take(gen, 3000, (r) => Math.min(r % 300, (r >>> 9) % 300));
    // The Python that made the expected values took `a` with zip(generator, range(3000)), which draws one value more
    // before it stops.
    gen.next();
    const b: number[] = [];
    for (const x of a) {
      const r = gen.next().value as number;
      if (r % 10 === 0) continue;
      if (r % 10 === 1) {
        b.push((r >>> 4) % 300);
        continue;
      }
      if (r % 10 === 2) b.push((r >>> 4) % 300);
      b.push(x);
    }
    expect(b).toHaveLength(2989);
    const blocks = matchingBlocks(a, b);
    expect(blocks.slice(0, 3)).toEqual([
      [0, 0, 1],
      [1, 2, 3],
      [4, 6, 3],
    ]);
    expect(blocks).toHaveLength(729);
    expect(blocks.reduce((n, [, , size]) => n + size, 0)).toBe(2378);
    expect(digest(blocks)).toBe('0x77f90d6a');
  });

  it('accepts typed arrays', () => {
    expect(matchingBlocks(Int32Array.from([1, 2, 9, 3, 4]), Int32Array.from([1, 2, 3, 4]))).toEqual([
      [0, 0, 2],
      [3, 2, 2],
      [5, 4, 0],
    ]);
  });
});
