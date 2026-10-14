// 006 T048 (FR-020): every colour pair the panel uses reads in both modes — text at least 4.5:1, dots, badge and
// control borders at least 3:1 — computed from the stylesheet's own tokens.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '../../../src/entrypoints/sidepanel/style.css'), 'utf8');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
}

const light = tokens(/:root\s*{([^}]*)}/.exec(css)![1]!);
const dark = { ...light, ...tokens(/@media \(prefers-color-scheme: dark\)\s*{\s*:root\s*{([^}]*)}/.exec(css)![1]!) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [foreground, background] token pairs. */
const TEXT: [string, string][] = [
  ['fg', 'bg'],
  ['muted', 'bg'],
  ['error', 'bg'],
  ['accent', 'bg'],
  ['on-accent', 'accent'],
  ['confirmed', 'confirmed-bg'],
  ['fallback', 'fallback-bg'],
];
const GRAPHICS: [string, string][] = [
  ['ok', 'bg'],
  ['muted', 'bg'],
  ['error', 'bg'],
  ['border', 'bg'],
  ['accent', 'bg'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s mode', (_mode, t) => {
  it('defines every token it needs', () => {
    for (const [fg, bg] of [...TEXT, ...GRAPHICS]) {
      expect(t[fg], fg).toMatch(/^#/);
      expect(t[bg], bg).toMatch(/^#/);
    }
  });

  it.each(TEXT)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHICS)('%s on %s is at least 3:1', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });
});
