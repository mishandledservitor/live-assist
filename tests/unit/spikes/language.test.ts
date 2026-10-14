import { describe, expect, it } from 'vitest';
import {
  LANGUAGE_CONFIGS,
  pairClips,
  recommendLanguage,
  renderLanguageFindings,
  scoreClip,
  summarize,
  type ClipScore,
} from '../../../spikes/lib/language';

describe('LANGUAGE_CONFIGS (research R8)', () => {
  it('runs auto, el, en and el + secondary en', () => {
    expect(LANGUAGE_CONFIGS.map((c) => c.id)).toEqual(['auto', 'el', 'en', 'el+en']);
    expect(LANGUAGE_CONFIGS[0]!.config).toEqual({ language: { kind: 'auto' } });
    expect(LANGUAGE_CONFIGS[3]!.config).toEqual({
      language: { kind: 'fixed', code: 'el' },
      secondaryLanguages: ['en'],
    });
  });
});

describe('pairClips', () => {
  it('pairs audio files with same-basename .txt references and lists the rest', () => {
    const r = pairClips(['a.wav', 'a.txt', 'b.mp3', 'b.txt', 'c.m4a', 'd.txt', 'notes.md', 'results']);
    expect(r.clips).toEqual([
      { name: 'a', audio: 'a.wav', reference: 'a.txt' },
      { name: 'b', audio: 'b.mp3', reference: 'b.txt' },
    ]);
    expect(r.missingReference).toEqual(['c.m4a']);
    expect(r.missingAudio).toEqual(['d.txt']);
  });

  it('is case-insensitive on extensions', () => {
    expect(pairClips(['X.WAV', 'X.txt']).clips).toEqual([{ name: 'X', audio: 'X.WAV', reference: 'X.txt' }]);
  });
});

describe('scoreClip', () => {
  it('joins committed segments in order and scores against the reference', () => {
    const s = scoreClip('Καλημέρα σε όλους, το meeting ξεκινά.', [
      { text: 'Καλημέρα σε όλους.', startMs: 0 },
      { text: 'Το meeting ξεκινά.', startMs: 2000 },
    ]);
    expect(s.wer).toBe(0);
    expect(s.cer).toBe(0);
  });
});

const row = (clip: string, config: string, wer: number, cer: number, error: string | null = null): ClipScore => ({
  clip,
  config,
  wer,
  cer,
  durationMs: 60_000,
  error,
});

describe('summarize', () => {
  it('averages per config over clips where every config succeeded', () => {
    const rows = [
      row('a', 'auto', 0.2, 0.1),
      row('a', 'el', 0.3, 0.2),
      row('b', 'auto', 0.4, 0.3),
      row('b', 'el', 0.1, 0.1),
      row('c', 'auto', 0.9, 0.9),
      row('c', 'el', 0, 0, 'auth'),
    ];
    const s = summarize(rows, ['auto', 'el']);
    expect(s.map((x) => [x.config, x.clips])).toEqual([
      ['auto', 2],
      ['el', 2],
    ]);
    expect(s[0]!.meanWer).toBeCloseTo(0.3);
    expect(s[0]!.meanCer).toBeCloseTo(0.2);
    expect(s[1]!.meanWer).toBeCloseTo(0.2);
    expect(s[1]!.meanCer).toBeCloseTo(0.15);
  });
});

describe('recommendLanguage', () => {
  const s = (auto: number, el: number, en: number, elen: number) => [
    { config: 'auto', meanWer: 0, meanCer: auto, clips: 5 },
    { config: 'el', meanWer: 0, meanCer: el, clips: 5 },
    { config: 'en', meanWer: 0, meanCer: en, clips: 5 },
    { config: 'el+en', meanWer: 0, meanCer: elen, clips: 5 },
  ];

  it('keeps Automatic when auto has the lowest CER', () => {
    const r = recommendLanguage(s(0.1, 0.12, 0.4, 0.11));
    expect(r.best).toBe('auto');
    expect(r.specChange).toBe(false);
    expect(r.text).toMatch(/keep automatic/i);
  });

  it('flags a spec change when el + secondary en wins by ≥ 10 % relative', () => {
    const r = recommendLanguage(s(0.2, 0.19, 0.4, 0.15));
    expect(r.best).toBe('el+en');
    expect(r.specChange).toBe(true);
    expect(r.text).toMatch(/T083/);
  });

  it('reports a narrow win as not clear', () => {
    const r = recommendLanguage(s(0.2, 0.21, 0.4, 0.19));
    expect(r.best).toBe('el+en');
    expect(r.specChange).toBe(false);
    expect(r.text).toMatch(/not a clear win/i);
  });

  it('is inconclusive without data', () => {
    expect(recommendLanguage([]).best).toBeNull();
  });
});

describe('renderLanguageFindings', () => {
  it('writes a summary table, per-clip rows, errors, the recommendation and a notes section', () => {
    const md = renderLanguageFindings({
      date: '2026-10-08',
      rows: [row('standup-1', 'auto', 0.25, 0.125), row('standup-1', 'el', 0.5, 0.25, 'quota')],
      summary: [{ config: 'auto', meanWer: 0.25, meanCer: 0.125, clips: 1 }],
      recommendation: { best: 'auto', specChange: false, text: 'Keep Automatic.' },
    });
    expect(md).toMatch(/^# Spike B/m);
    expect(md).toContain('| auto | 1 | 25.0 % | 12.5 % |');
    expect(md).toContain('standup-1');
    expect(md).toContain('quota');
    expect(md).toContain('Keep Automatic.');
    expect(md).toMatch(/## Your notes/);
  });
});
