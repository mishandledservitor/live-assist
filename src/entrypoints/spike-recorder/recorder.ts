// DEV-ONLY (pnpm build:spike): records one Spike A run — tab and mic at the same time, through the tested
// src/audio/capture.ts — as two 16 kHz mono WAVs plus run.json (research R7). Never part of a production build.
import type { CaptureHandle, FrameListener, MicCaptureHandle } from '../../audio/capture';
import { SAMPLE_RATE } from '../../audio/pcm';
import { ECHO_CONDITIONS, type EchoCondition, type RunMeta } from '../../../spikes/lib/echo-runs';
import { encodeWavPcm16 } from '../../../spikes/lib/wav';

export interface RecorderCapture {
  tab(streamId: string, onFrame: FrameListener): Promise<CaptureHandle>;
  mic(constraints: MediaTrackConstraints, onFrame: FrameListener): Promise<MicCaptureHandle>;
}

/** Run 4 needs Chrome to report echoCancellation "all" in the mic's capabilities. */
export function buildRunPlan(echoCancellationCapability: readonly unknown[] | undefined): EchoCondition[] {
  const all = echoCancellationCapability?.includes('all') ?? false;
  return ECHO_CONDITIONS.filter((c) => c.echoCancellation !== 'all' || all);
}

/** Production mic settings (research R5) with the run's echo cancellation. */
export function micConstraintsFor(condition: EchoCondition): MediaTrackConstraints {
  return {
    echoCancellation: condition.echoCancellation as boolean,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

export function chromeVersionFrom(userAgent: string): string | null {
  return /Chrome\/([\d.]+)/.exec(userAgent)?.[1] ?? null;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function runFolderName(condition: EchoCondition, at: Date): string {
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `run-${condition.run}-${condition.id}-${stamp}`;
}

export interface RunFiles {
  meta: RunMeta;
  files: { name: 'tab.wav' | 'mic.wav' | 'run.json'; bytes: Uint8Array }[];
}

export interface RunningRecording {
  stop(): Promise<RunFiles>;
}

export interface StartRunOptions {
  condition: EchoCondition;
  tabStreamId: string;
  capture: RecorderCapture;
  now?: () => number;
  startedAt?: () => Date;
  userAgent?: string;
}

function concat(frames: readonly Int16Array[]): Int16Array {
  const out = new Int16Array(frames.reduce((n, f) => n + f.length, 0));
  let o = 0;
  for (const f of frames) {
    out.set(f, o);
    o += f.length;
  }
  return out;
}

/** Frames are kept only while both streams are running, so tab.wav and mic.wav start at the same moment. */
export async function startRun(opts: StartRunOptions): Promise<RunningRecording> {
  const now = opts.now ?? (() => performance.now());
  const tabFrames: Int16Array[] = [];
  const micFrames: Int16Array[] = [];
  let recording = false;
  const keep = (into: Int16Array[]) => (frame: Int16Array) => {
    if (recording) into.push(frame.slice());
  };

  const requestedMic = micConstraintsFor(opts.condition);
  const tab = await opts.capture.tab(opts.tabStreamId, keep(tabFrames));
  let mic: MicCaptureHandle;
  try {
    mic = await opts.capture.mic(requestedMic, keep(micFrames));
  } catch (error) {
    await tab.stop();
    throw error;
  }

  recording = true;
  const startedAt = (opts.startedAt ?? (() => new Date()))();
  const t0 = now();
  let result: Promise<RunFiles> | null = null;

  return {
    stop() {
      result ??= (async () => {
        recording = false;
        const durationMs = Math.round(now() - t0);
        await Promise.all([tab.stop(), mic.stop()]);
        const meta: RunMeta = {
          schema: 1,
          condition: opts.condition.id,
          startedAt: startedAt.toISOString(),
          durationMs,
          chromeVersion: chromeVersionFrom(opts.userAgent ?? globalThis.navigator?.userAgent ?? ''),
          requestedMic: { ...requestedMic },
          appliedMic: { ...mic.settings },
          sampleRate: 16000,
        };
        return {
          meta,
          files: [
            { name: 'tab.wav', bytes: encodeWavPcm16(concat(tabFrames), SAMPLE_RATE) },
            { name: 'mic.wav', bytes: encodeWavPcm16(concat(micFrames), SAMPLE_RATE) },
            { name: 'run.json', bytes: new TextEncoder().encode(JSON.stringify(meta, null, 2)) },
          ],
        };
      })();
      return result;
    },
  };
}
