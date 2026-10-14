// Pure PCM helpers (research R5): mono 16 kHz PCM16 LE in 100 ms frames, as ElevenLabs realtime requires.
// No Web Audio here, so these run in the AudioWorklet, the offscreen page, Node spikes and Vitest alike.

export const SAMPLE_RATE = 16_000;
export const FRAME_SAMPLES = SAMPLE_RATE / 10;
/** registerProcessor name of src/audio/pcm16-worklet.ts. */
export const PCM16_PROCESSOR = 'pcm16-frames';
/** registerProcessor name of the two-channel (tab, mic) processor in src/audio/pcm16-worklet.ts (002 T049). */
export const PCM16_PAIR_PROCESSOR = 'pcm16-pairs';

export function downmixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first.slice();
  const out = new Float32Array(first.length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i]! += ch[i] ?? 0;
  for (let i = 0; i < out.length; i++) out[i]! /= channels.length;
  return out;
}

export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    const s = Number.isNaN(v) ? 0 : Math.max(-1, Math.min(1, v));
    out[i] = Math.round(s < 0 ? s * 32768 : s * 32767);
  }
  return out;
}

/** Collects arbitrary-size sample blocks (e.g. 128-sample render quanta) into fixed-size frames. */
export class FrameAssembler {
  private buffer: Int16Array;
  private filled = 0;

  constructor(private readonly frameSamples: number = FRAME_SAMPLES) {
    this.buffer = new Int16Array(frameSamples);
  }

  push(block: Int16Array): Int16Array[] {
    const frames: Int16Array[] = [];
    let offset = 0;
    while (offset < block.length) {
      const take = Math.min(this.frameSamples - this.filled, block.length - offset);
      this.buffer.set(block.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.frameSamples) {
        frames.push(this.buffer);
        this.buffer = new Int16Array(this.frameSamples);
        this.filled = 0;
      }
    }
    return frames;
  }

  pending(): number {
    return this.filled;
  }

  /** The partial frame padded with silence, or null if nothing is pending. */
  flush(): Int16Array | null {
    if (this.filled === 0) return null;
    const frame = this.buffer;
    this.buffer = new Int16Array(this.frameSamples);
    this.filled = 0;
    return frame;
  }
}

/** One 100 ms frame of each input of the mix, captured over the same samples. */
export interface FramePair {
  tab: Int16Array;
  mic: Int16Array;
}

/**
 * Collects two-channel blocks (channel 0 the tab, channel 1 the mic) into paired frames. A missing channel is silence,
 * so the two inputs always stay aligned sample for sample (the mute gate relies on it, 002 research R8).
 */
export class FramePairAssembler {
  private readonly tab: FrameAssembler;
  private readonly mic: FrameAssembler;

  constructor(private readonly frameSamples: number = FRAME_SAMPLES) {
    this.tab = new FrameAssembler(frameSamples);
    this.mic = new FrameAssembler(frameSamples);
  }

  push(channels: readonly Float32Array[]): FramePair[] {
    const length = channels[0]?.length ?? channels[1]?.length ?? this.frameSamples;
    const channel = (i: number) => floatToInt16(channels[i] ?? new Float32Array(length));
    const tabs = this.tab.push(channel(0));
    const mics = this.mic.push(channel(1));
    return tabs.map((tab, i) => ({ tab, mic: mics[i]! }));
  }
}

export function int16ToBase64(frame: Int16Array): string {
  const bytes = new Uint8Array(frame.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < frame.length; i++) view.setInt16(i * 2, frame[i]!, true);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

export function silenceFrame(samples: number = FRAME_SAMPLES): Int16Array {
  return new Int16Array(samples);
}
