// Frame sources (research R5). Meetings use captureMixed: tab and mic are captured separately into one 16 kHz
// AudioContext (Chrome resamples each MediaStream to the context rate), put on two channels of one merger and turned
// into paired 100 ms PCM16 frames by the worklet. They are mixed into the single transcription stream in core, behind
// 002's mute gate, which silences the mic before the mixer while the user is muted (constitution v1.1.0 I, 002 R8).
// captureTab/captureMic (one stream each) remain for the dev-only spike recorder, which needs separate recordings.
import { PCM16_PAIR_PROCESSOR, PCM16_PROCESSOR, SAMPLE_RATE, type FramePair } from './pcm';
import { startPlayback, type AudioContextLike, type AudioNodeLike, type CreateAudioContext } from './playback';

export interface WorkletNodeLike extends AudioNodeLike {
  readonly port: { onmessage: ((e: MessageEvent) => void) | null };
}

export interface CaptureDeps {
  mediaDevices: { getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> };
  createAudioContext: CreateAudioContext;
  createWorkletNode(context: AudioContextLike, name: string, options?: AudioWorkletNodeOptions): WorkletNodeLike;
  /** Bundled URL of src/audio/pcm16-worklet.ts. */
  workletUrl: string;
}

export type FrameListener = (frame: Int16Array) => void;
/** One 100 ms frame of the tab and of the mic, captured over the same samples; `mic` is null without a mic. */
export type FramePairListener = (tab: Int16Array, mic: Int16Array | null) => void;

export interface CaptureHandle {
  readonly stream: MediaStream;
  /** Stops every track and closes every context; idempotent. */
  stop(): Promise<void>;
}

export interface MicCaptureHandle extends CaptureHandle {
  /** What Chrome actually applied (echo cancellation etc.), for status and the echo spike. */
  readonly settings: MediaTrackSettings;
}

interface FramePipeline {
  stop(): Promise<void>;
}

/** One 16 kHz context feeding the mono PCM16 worklet (one stream: the spike recorder's tab or mic recording). */
async function startFrames(stream: MediaStream, deps: CaptureDeps, onFrame: FrameListener): Promise<FramePipeline> {
  const context = deps.createAudioContext({ sampleRate: SAMPLE_RATE });
  try {
    await context.audioWorklet.addModule(deps.workletUrl);
    const source = context.createMediaStreamSource(stream);
    // No outputs: the node is a sink, so Chrome renders it without routing anything to the speakers.
    const node = deps.createWorkletNode(context, PCM16_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 0 });
    node.port.onmessage = (e) => {
      if (e.data instanceof Int16Array) onFrame(e.data);
    };
    source.connect(node as never);
    return {
      async stop() {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        await context.close();
      },
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

const isPair = (v: unknown): v is FramePair =>
  typeof v === 'object' && v !== null && (v as FramePair).tab instanceof Int16Array;

/**
 * One 16 kHz context: the tab on merger input 0 and the mic on input 1 (each downmixed to mono by the merger), into
 * the pair worklet, which posts `{ tab, mic }` frames. Without a mic, channel 1 is silence and frames carry mic null.
 */
async function startPairs(
  tab: MediaStream,
  mic: MediaStream | null,
  deps: CaptureDeps,
  onFrames: FramePairListener,
): Promise<FramePipeline> {
  const context = deps.createAudioContext({ sampleRate: SAMPLE_RATE });
  try {
    await context.audioWorklet.addModule(deps.workletUrl);
    const merger = context.createChannelMerger(2);
    const node = deps.createWorkletNode(context, PCM16_PAIR_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    });
    node.port.onmessage = (e) => {
      if (isPair(e.data)) onFrames(e.data.tab, mic ? e.data.mic : null);
    };
    const sources = [tab, ...(mic ? [mic] : [])].map((stream, input) => {
      const source = context.createMediaStreamSource(stream);
      source.connect(merger as never, 0, input);
      return source;
    });
    merger.connect(node as never);
    return {
      async stop() {
        node.port.onmessage = null;
        for (const s of sources) s.disconnect();
        merger.disconnect();
        node.disconnect();
        await context.close();
      },
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function once(fn: () => Promise<void>): () => Promise<void> {
  let done: Promise<void> | null = null;
  return () => (done ??= fn());
}

/** Opens the captured tab (stream id from tabCapture.getMediaStreamId), transcribes it and keeps it audible. */
export async function captureTab(streamId: string, deps: CaptureDeps, onFrame: FrameListener): Promise<CaptureHandle> {
  const stream = await deps.mediaDevices.getUserMedia(tabConstraints(streamId));
  let frames: FramePipeline;
  try {
    frames = await startFrames(stream, deps, onFrame);
  } catch (error) {
    stopTracks(stream);
    throw error;
  }
  const playback = startPlayback(stream, deps.createAudioContext);
  return {
    stream,
    stop: once(async () => {
      stopTracks(stream);
      await Promise.all([frames.stop(), playback.stop()]);
    }),
  };
}

/** Opens the microphone; permission errors propagate so the caller can mark the mic unavailable. */
export async function captureMic(
  constraints: MediaTrackConstraints,
  deps: CaptureDeps,
  onFrame: FrameListener,
): Promise<MicCaptureHandle> {
  const stream = await deps.mediaDevices.getUserMedia({ audio: constraints, video: false });
  let frames: FramePipeline;
  try {
    frames = await startFrames(stream, deps, onFrame);
  } catch (error) {
    stopTracks(stream);
    throw error;
  }
  return {
    stream,
    settings: stream.getAudioTracks()[0]?.getSettings() ?? {},
    stop: once(async () => {
      stopTracks(stream);
      await frames.stop();
    }),
  };
}

export interface MixedCaptureOptions {
  /** getUserMedia constraints for the meeting tab: tabConstraints(streamId) in production. */
  tab: MediaStreamConstraints;
  mic: MediaTrackConstraints;
}

export type MicInput = { ok: true; settings: MediaTrackSettings } | { ok: false; error: unknown };

export interface MixedCaptureHandle extends CaptureHandle {
  /** Whether the mic is captured; when not, frames carry mic null and the mix is the tab alone (`error` says why). */
  readonly mic: MicInput;
}

/** Constraints that open a tab from a tabCapture.getMediaStreamId stream id. */
export function tabConstraints(streamId: string): MediaStreamConstraints {
  return {
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as MediaTrackConstraints,
    video: false,
  };
}

/**
 * Opens the tab (failure rejects) and the mic (failure is reported, the tab is captured alone), delivers them as paired
 * 100 ms PCM16 frames for core to gate and mix, and keeps the tab audible.
 */
export async function captureMixed(
  opts: MixedCaptureOptions,
  deps: CaptureDeps,
  onFrames: FramePairListener,
): Promise<MixedCaptureHandle> {
  const tab = await deps.mediaDevices.getUserMedia(opts.tab);
  let micStream: MediaStream | null = null;
  let mic: MicInput;
  try {
    micStream = await deps.mediaDevices.getUserMedia({ audio: opts.mic, video: false });
    mic = { ok: true, settings: micStream.getAudioTracks()[0]?.getSettings() ?? {} };
  } catch (error) {
    mic = { ok: false, error };
  }
  const streams = micStream ? [tab, micStream] : [tab];
  let frames: FramePipeline;
  try {
    frames = await startPairs(tab, micStream, deps, onFrames);
  } catch (error) {
    streams.forEach(stopTracks);
    throw error;
  }
  const playback = startPlayback(tab, deps.createAudioContext);
  return {
    stream: tab,
    mic,
    stop: once(async () => {
      streams.forEach(stopTracks);
      await Promise.all([frames.stop(), playback.stop()]);
    }),
  };
}
