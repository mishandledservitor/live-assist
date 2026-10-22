// 006 T003 (FR-017, FR-019, SC-004): every enabled copy-review Delete fragment is gone from the user-facing strings in
// src/ and wxt.config.ts, and every Rewrite replacement is there. DOM-only entries are checked by component tests.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkEntry,
  collectHtmlStrings,
  collectProjectStrings,
  collectStrings,
  loadCopyFixture,
} from '../../support/copy-scan';

const ROOT = join(import.meta.dirname, '../../..');

describe('copy scanner self-test', () => {
  const sample = `
    // a comment saying fallback label
    /* block comment: Clear override */
    const fallbackLabel = 'plain literal';
    const t = \`head \${x} middle \${y} tail\`;
    const n = \`no substitution\`;
    export const C = () => <p title="attr literal">
      JSX text across
      two lines &ldquo;quoted&rdquo;
    </p>;
  `;
  const strings = collectStrings(sample, 'sample.tsx');

  it('collects literals, template pieces, attributes and JSX text', () => {
    expect(strings).toEqual(
      expect.arrayContaining([
        'plain literal',
        'head ',
        ' middle ',
        ' tail',
        'no substitution',
        'attr literal',
        'JSX text across two lines “quoted”',
      ]),
    );
  });

  it('ignores comments and identifiers', () => {
    expect(strings.some((s) => s.includes('fallback label') || s.includes('Clear override'))).toBe(false);
    expect(strings.some((s) => s.includes('fallbackLabel'))).toBe(false);
  });

  it('reads HTML text and ignores HTML comments', () => {
    expect(collectHtmlStrings('<title>live-assist</title><!-- Clear override --><p>Hi\n  there</p>')).toEqual([
      'live-assist',
      'Hi there',
    ]);
  });

  it('reports a found absent fragment and a missing present fragment', () => {
    const byFile = new Map([['a.ts', ['Clear override now']]]);
    const problems = checkEntry(
      { id: 'X', enabled: true, absent: ['Clear override'], present: ['Reset this line'] },
      byFile,
    );
    expect(problems).toEqual(['X: "Clear override" still in a.ts', 'X: "Reset this line" not found']);
  });
});

describe('copy review (copy-review.md)', () => {
  const fixture = loadCopyFixture(ROOT);
  const byFile = collectProjectStrings(ROOT);

  it('has one entry per Delete and Rewrite ID', () => {
    // 006 D1-D12, R1-R29; 003 A1-A7; 008 A8-A9 (K41, R30-R31); 013 W1 (C2 withdrawn, decision 79); 003 A10 (K45,
    // decision 80); 014 A11 (K46, decisions 91, 92); 016 A12 (K47, decisions 93-99); 017 A13 (K48, decisions 102,
    // 103)
    expect(fixture.entries).toHaveLength(55);
  });

  for (const entry of fixture.entries.filter((e) => e.enabled && !e.dom)) {
    it(`${entry.id} is applied`, () => {
      expect(checkEntry(entry, byFile)).toEqual([]);
    });
  }
});
