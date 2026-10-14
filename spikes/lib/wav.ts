// Pure WAV helpers for the spikes (research R7, R8). No Node or DOM APIs here, so the dev-only recorder page can
// use encodeWavPcm16 too; reading files and ffmpeg live in audio-file.ts.
import { downmixToMono, floatToInt16, SAMPLE_RATE } from '../../src/audio/pcm';

export interface DecodedAudio {
  sampleRate: number;
  /** One Float32Array per channel, samples in [-1, 1]. */
  channels: Float32Array[];
}

const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

const tag = (v: DataView, o: number) =>
  String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

/** Parses PCM16 and Float32 WAV (incl. WAVE_FORMAT_EXTENSIBLE); throws a clear error for anything else. */
export function parseWav(bytes: Uint8Array): DecodedAudio {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || tag(v, 0) !== 'RIFF' || tag(v, 8) !== 'WAVE') {
    throw new Error('Not a WAV file (no RIFF/WAVE header).');
  }
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  let data: { offset: number; length: number } | null = null;
  for (let o = 12; o + 8 <= bytes.byteLength;) {
    const id = tag(v, o);
    const size = v.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ') {
      let format = v.getUint16(body, true);
      if (format === EXTENSIBLE && size >= 26) format = v.getUint16(body + 24, true);
      fmt = {
        format,
        channels: v.getUint16(body + 2, true),
        sampleRate: v.getUint32(body + 4, true),
        bits: v.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      data = { offset: body, length: Math.min(size, bytes.byteLength - body) };
    }
    o = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('Not a WAV file (missing fmt or data chunk).');

  const { format, channels, sampleRate, bits } = fmt;
  const isPcm16 = format === PCM && bits === 16;
  const isFloat32 = format === FLOAT && bits === 32;
  if (!isPcm16 && !isFloat32) {
    throw new Error(`Unsupported WAV encoding (format ${format}, ${bits}-bit); only PCM16 and Float32 are read.`);
  }
  if (channels < 1) throw new Error('Unsupported WAV: no channels.');

  const bytesPerSample = bits / 8;
  const frames = Math.floor(data.length / (bytesPerSample * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  let o = data.offset;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      out[ch]![i] = isPcm16 ? v.getInt16(o, true) / 32768 : v.getFloat32(o, true);
      o += bytesPerSample;
    }
  }
  return { sampleRate, channels: out };
}

const TAPS_PER_SIDE = 16;

/** Band-limited (Hann-windowed sinc) resampler; good enough for speech recognition input. */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples.slice();
  const ratio = toRate / fromRate;
  const cutoff = Math.min(1, ratio) * 0.95; // fraction of the input Nyquist
  const half = Math.ceil(TAPS_PER_SIDE / Math.min(1, ratio));
  const outLength = Math.round(samples.length * ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const t = i / ratio;
    const centre = Math.floor(t);
    let acc = 0;
    let weight = 0;
    for (let k = centre - half + 1; k <= centre + half; k++) {
      if (k < 0 || k >= samples.length) continue;
      const d = t - k;
      const x = Math.PI * cutoff * d;
      const sinc = x === 0 ? 1 : Math.sin(x) / x;
      const w = 0.5 * (1 + Math.cos((Math.PI * d) / half));
      const h = sinc * w;
      acc += samples[k]! * h;
      weight += h;
    }
    out[i] = weight === 0 ? 0 : acc / weight;
  }
  return out;
}

/** What the realtime API wants: mono, 16 kHz, PCM16 LE (research R2). */
export function toMono16k(audio: DecodedAudio): Int16Array {
  return floatToInt16(resample(downmixToMono(audio.channels), audio.sampleRate, SAMPLE_RATE));
}

/** A minimal PCM16 mono WAV file. */
export function encodeWavPcm16(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, PCM, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataLen, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i]!, true);
  return new Uint8Array(buf);
}
