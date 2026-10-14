// T080: the language override list (FR-014, spec assumption): Greek and English first, then every other language
// ElevenLabs Scribe supports, with the codes its docs list.
import { describe, expect, it } from 'vitest';
import { languageName, PINNED_LANGUAGES, SUPPORTED_LANGUAGES } from '@/core/settings/languages';

describe('supported languages', () => {
  it('pins Greek and English first', () => {
    expect(PINNED_LANGUAGES.map((l) => l.code)).toEqual(['ell', 'eng']);
    expect(SUPPORTED_LANGUAGES.slice(0, 2)).toEqual([...PINNED_LANGUAGES]);
  });

  it('lists the rest alphabetically by name, each code once', () => {
    const rest = SUPPORTED_LANGUAGES.slice(2);
    const names = rest.map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(rest.some((l) => l.code === 'ell' || l.code === 'eng')).toBe(false);
  });

  it('uses the three-letter codes from the Scribe docs', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(99);
    for (const l of SUPPORTED_LANGUAGES) expect(l.code).toMatch(/^[a-z]{3}$/);
    expect(SUPPORTED_LANGUAGES).toContainEqual({ code: 'deu', name: 'German' });
    expect(SUPPORTED_LANGUAGES).toContainEqual({ code: 'zho', name: 'Mandarin Chinese' });
  });

  it('names a code, falling back to the code itself', () => {
    expect(languageName('ell')).toBe('Greek');
    expect(languageName('xyz')).toBe('xyz');
  });
});
