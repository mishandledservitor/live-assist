import { describe, expect, it } from 'vitest';
import { ECHO_CONDITIONS, parseRunMeta, type RunMeta } from '../../../spikes/lib/echo-runs';
import { recommendEcho, renderEchoFindings, scoreRun, type EchoRunResult } from '../../../spikes/lib/echo';

const meta = (condition: RunMeta['condition']): RunMeta => ({
  schema: 1,
  condition,
  startedAt: '2026-10-08T10:00:00.000Z',
  durationMs: 120_000,
  chromeVersion: '141.0.7390.54',
  requestedMic: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  appliedMic: { echoCancellation: true, sampleRate: 48000 },
  sampleRate: 16000,
});

describe('ECHO_CONDITIONS (research R7)', () => {
  it('lists the four runs in order', () => {
    expect(ECHO_CONDITIONS.map((c) => [c.run, c.id, c.echoCancellation])).toEqual([
      [1, 'headphones-aec-on', true],
      [2, 'speakers-aec-on', true],
      [3, 'speakers-aec-off', false],
      [4, 'speakers-aec-all', 'all'],
    ]);
  });
});

describe('parseRunMeta', () => {
  it('accepts a valid run.json', () => {
    expect(parseRunMeta(JSON.parse(JSON.stringify(meta('speakers-aec-on'))))).toEqual(meta('speakers-aec-on'));
  });

  it('rejects unknown conditions and malformed data', () => {
    expect(parseRunMeta({ ...meta('speakers-aec-on'), condition: 'loud' })).toBeNull();
    expect(parseRunMeta({ ...meta('speakers-aec-on'), durationMs: 'long' })).toBeNull();
    expect(parseRunMeta(null)).toBeNull();
  });
});

describe('scoreRun', () => {
  it('applies the duplicate rule to the run’s mic and tab segments', () => {
    const r = scoreRun('run-2', meta('speakers-aec-on'), {
      tab: [
        { startMs: 1000, endMs: 3000, text: 'Let us look at the numbers' },
        { startMs: 5000, endMs: 7000, text: 'Any questions so far' },
      ],
      mic: [{ startMs: 1200, endMs: 3100, text: 'let us look at the numbers' }],
      errors: [],
    });
    expect(r.condition).toBe('speakers-aec-on');
    expect(r.echo.duplicatedRemoteLines).toBe(1);
    expect(r.echo.rate).toBeCloseTo(0.5);
  });
});

const result = (condition: RunMeta['condition'], rate: number, errors: string[] = []): EchoRunResult => ({
  folder: `run-${condition}`,
  condition,
  durationMs: 120_000,
  appliedEchoCancellation: condition === 'speakers-aec-off' ? false : true,
  echo: {
    rate,
    remoteLines: 50,
    duplicatedRemoteLines: Math.round(rate * 50),
    micLines: 20,
    duplicatedMicLines: Math.round(rate * 50),
    pairs: [],
  },
  errors,
});

describe('recommendEcho (research R7 decision rule)', () => {
  it('ships the headphones notice when speakers + AEC duplicates more than 5 % of remote lines', () => {
    const r = recommendEcho([result('headphones-aec-on', 0), result('speakers-aec-on', 0.08)]);
    expect(r.showNotice).toBe(true);
    expect(r.text).toMatch(/FR-028/);
    expect(r.text).toMatch(/T087/);
    expect(r.text).toMatch(/echo-suppression/i);
  });

  it('does not ship it at or below 5 %', () => {
    expect(recommendEcho([result('speakers-aec-on', 0.05)]).showNotice).toBe(false);
  });

  it('is inconclusive without a clean run 2', () => {
    expect(recommendEcho([result('headphones-aec-on', 0)]).showNotice).toBeNull();
    expect(recommendEcho([result('speakers-aec-on', 0.5, ['tab: network'])]).showNotice).toBeNull();
  });
});

describe('renderEchoFindings', () => {
  it('writes the per-run table, the recommendation and a notes section', () => {
    const results = [result('headphones-aec-on', 0), result('speakers-aec-on', 0.08), result('speakers-aec-off', 0.4)];
    const md = renderEchoFindings({
      date: '2026-10-08',
      chromeVersion: '141.0',
      results,
      recommendation: recommendEcho(results),
    });
    expect(md).toMatch(/^# Spike A/m);
    expect(md).toContain('| 2 | speakers-aec-on | 50 | 4 | 8.0 % |');
    expect(md).toContain('| 3 | speakers-aec-off | 50 | 20 | 40.0 % |');
    expect(md).toMatch(/## Recommendation/);
    expect(md).toMatch(/## Your notes/);
  });
});
