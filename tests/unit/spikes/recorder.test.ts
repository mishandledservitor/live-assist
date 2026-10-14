import { describe, expect, it, vi } from 'vitest';
import type { CaptureHandle, FrameListener, MicCaptureHandle } from '@/audio/capture';
import {
  buildRunPlan,
  chromeVersionFrom,
  micConstraintsFor,
  runFolderName,
  startRun,
  type RecorderCapture,
} from '@/entrypoints/spike-recorder/recorder';
import { ECHO_CONDITIONS, parseRunMeta } from '../../../spikes/lib/echo-runs';
import { parseWav } from '../../../spikes/lib/wav';

const run2 = ECHO_CONDITIONS[1]!;

describe('buildRunPlan', () => {
  it('offers run 4 only when the mic reports echoCancellation "all"', () => {
    expect(buildRunPlan([true, false]).map((c) => c.run)).toEqual([1, 2, 3]);
    expect(buildRunPlan(undefined).map((c) => c.run)).toEqual([1, 2, 3]);
    expect(buildRunPlan(['all', 'remote-only', true, false]).map((c) => c.run)).toEqual([1, 2, 3, 4]);
  });
});

describe('micConstraintsFor', () => {
  it('sets echo cancellation per run and keeps the production noise/gain settings', () => {
    expect(micConstraintsFor(ECHO_CONDITIONS[2]!)).toEqual({
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(micConstraintsFor(ECHO_CONDITIONS[3]!).echoCancellation).toBe('all');
  });
});

describe('chromeVersionFrom / runFolderName', () => {
  it('extracts the Chrome version', () => {
    expect(chromeVersionFrom('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/141.0.7390.54 Safari/537.36')).toBe(
      '141.0.7390.54',
    );
    expect(chromeVersionFrom('Firefox')).toBeNull();
  });

  it('names run folders by run number, condition and local time', () => {
    expect(runFolderName(run2, new Date(2026, 9, 8, 14, 5))).toBe('run-2-speakers-aec-on-20261008-1405');
  });
});

function fakeCapture(opts: { micFails?: boolean } = {}) {
  const emit: { tab?: FrameListener; mic?: FrameListener } = {};
  const tabStop = vi.fn(() => Promise.resolve());
  const micStop = vi.fn(() => Promise.resolve());
  const requested: { tabStreamId?: string; mic?: MediaTrackConstraints } = {};
  const capture: RecorderCapture = {
    tab: (streamId, onFrame) => {
      requested.tabStreamId = streamId;
      emit.tab = onFrame;
      onFrame(Int16Array.from([9, 9])); // before both streams run: dropped
      return Promise.resolve({ stream: {} as MediaStream, stop: tabStop } satisfies CaptureHandle);
    },
    mic: (constraints, onFrame) => {
      requested.mic = constraints;
      if (opts.micFails) return Promise.reject(new Error('NotAllowedError'));
      emit.mic = onFrame;
      return Promise.resolve({
        stream: {} as MediaStream,
        settings: { echoCancellation: true, sampleRate: 48000 },
        stop: micStop,
      } satisfies MicCaptureHandle);
    },
  };
  return { capture, emit, tabStop, micStop, requested };
}

describe('startRun', () => {
  it('records both streams from the moment both run and returns tab.wav, mic.wav and run.json', async () => {
    const f = fakeCapture();
    let t = 1000;
    const rec = await startRun({
      condition: run2,
      tabStreamId: 'stream-1',
      capture: f.capture,
      now: () => t,
      startedAt: () => new Date('2026-10-08T10:00:00Z'),
      userAgent: 'Chrome/141.0.1.2',
    });
    expect(f.requested.tabStreamId).toBe('stream-1');
    expect(f.requested.mic).toEqual(micConstraintsFor(run2));

    f.emit.tab!(Int16Array.from([1, 2]));
    f.emit.mic!(Int16Array.from([3]));
    f.emit.tab!(Int16Array.from([4]));
    t = 121_000;
    const out = await rec.stop();

    expect(f.tabStop).toHaveBeenCalled();
    expect(f.micStop).toHaveBeenCalled();
    expect(out.files.map((x) => x.name)).toEqual(['tab.wav', 'mic.wav', 'run.json']);
    const tab = parseWav(out.files[0]!.bytes);
    expect(tab.sampleRate).toBe(16000);
    expect(Array.from(tab.channels[0]!).map((x) => Math.round(x * 32768))).toEqual([1, 2, 4]);
    expect(parseWav(out.files[1]!.bytes).channels[0]!.length).toBe(1);

    const meta = parseRunMeta(JSON.parse(new TextDecoder().decode(out.files[2]!.bytes)));
    expect(meta).toEqual({
      schema: 1,
      condition: 'speakers-aec-on',
      startedAt: '2026-10-08T10:00:00.000Z',
      durationMs: 120_000,
      chromeVersion: '141.0.1.2',
      requestedMic: micConstraintsFor(run2),
      appliedMic: { echoCancellation: true, sampleRate: 48000 },
      sampleRate: 16000,
    });
  });

  it('ignores frames after stop and stop is idempotent', async () => {
    const f = fakeCapture();
    const rec = await startRun({ condition: run2, tabStreamId: 's', capture: f.capture });
    f.emit.tab!(Int16Array.from([1]));
    const a = await rec.stop();
    f.emit.tab!(Int16Array.from([2]));
    const b = await rec.stop();
    expect(b).toBe(a);
    expect(f.tabStop).toHaveBeenCalledTimes(1);
  });

  it('stops the tab capture when the mic cannot be opened', async () => {
    const f = fakeCapture({ micFails: true });
    await expect(startRun({ condition: run2, tabStreamId: 's', capture: f.capture })).rejects.toThrow(/NotAllowed/);
    expect(f.tabStop).toHaveBeenCalled();
  });
});
