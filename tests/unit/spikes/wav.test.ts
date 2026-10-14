import { describe, expect, it } from 'vitest';
import { encodeWavPcm16, parseWav, resample, toMono16k } from '../../../spikes/lib/wav';

/** Builds a WAV file by hand (independent of the code under test). */
function wavBytes(opts: {
  format: 1 | 3 | 0xfffe;
  sampleRate: number;
  channels: number;
  bits: 16 | 32;
  frames: number[][]; // frames[i][ch]
  extraChunk?: boolean;
}): Uint8Array {
  const bytesPerSample = opts.bits / 8;
  const dataLen = opts.frames.length * opts.channels * bytesPerSample;
  const fmtLen = opts.format === 0xfffe ? 40 : 16;
  const extra = opts.extraChunk ? 8 + 4 : 0;
  const buf = new ArrayBuffer(12 + 8 + fmtLen + extra + 8 + dataLen);
  const v = new DataView(buf);
  let o = 0;
  const str = (s: string) => {
    for (const c of s) v.setUint8(o++, c.charCodeAt(0));
  };
  str('RIFF');
  v.setUint32(o, buf.byteLength - 8, true);
  o += 4;
  str('WAVE');
  str('fmt ');
  v.setUint32(o, fmtLen, true);
  o += 4;
  v.setUint16(o, opts.format, true);
  v.setUint16(o + 2, opts.channels, true);
  v.setUint32(o + 4, opts.sampleRate, true);
  v.setUint32(o + 8, opts.sampleRate * opts.channels * bytesPerSample, true);
  v.setUint16(o + 12, opts.channels * bytesPerSample, true);
  v.setUint16(o + 14, opts.bits, true);
  o += 16;
  if (opts.format === 0xfffe) {
    v.setUint16(o, 22, true); // cbSize
    v.setUint16(o + 2, opts.bits, true);
    v.setUint32(o + 4, 0, true); // channel mask
    v.setUint16(o + 8, 3, true); // subformat GUID starts with the format code (float)
    o += 24;
  }
  if (opts.extraChunk) {
    str('LIST');
    v.setUint32(o, 4, true);
    o += 4;
    str('INFO');
  }
  str('data');
  v.setUint32(o, dataLen, true);
  o += 4;
  for (const frame of opts.frames) {
    for (const s of frame) {
      if (opts.bits === 16) v.setInt16(o, s, true);
      else v.setFloat32(o, s, true);
      o += bytesPerSample;
    }
  }
  return new Uint8Array(buf);
}

describe('parseWav', () => {
  it('reads PCM16 mono', () => {
    const wav = parseWav(
      wavBytes({ format: 1, sampleRate: 16000, channels: 1, bits: 16, frames: [[0], [16384], [-32768]] }),
    );
    expect(wav.sampleRate).toBe(16000);
    expect(wav.channels).toHaveLength(1);
    expect(Array.from(wav.channels[0]!)).toEqual([0, 0.5, -1]);
  });

  it('reads Float32 stereo and skips unknown chunks', () => {
    const wav = parseWav(
      wavBytes({
        format: 3,
        sampleRate: 48000,
        channels: 2,
        bits: 32,
        frames: [
          [0.25, -0.25],
          [1, 0],
        ],
        extraChunk: true,
      }),
    );
    expect(wav.sampleRate).toBe(48000);
    expect(Array.from(wav.channels[0]!)).toEqual([0.25, 1]);
    expect(Array.from(wav.channels[1]!)).toEqual([-0.25, 0]);
  });

  it('reads WAVE_FORMAT_EXTENSIBLE float', () => {
    const wav = parseWav(wavBytes({ format: 0xfffe, sampleRate: 44100, channels: 1, bits: 32, frames: [[0.5]] }));
    expect(Array.from(wav.channels[0]!)).toEqual([0.5]);
  });

  it('rejects non-WAV data and unsupported encodings with a clear error', () => {
    expect(() => parseWav(new TextEncoder().encode('ID3 not a wav file at all'))).toThrow(/not a WAV/i);
    const bytes = wavBytes({ format: 1, sampleRate: 16000, channels: 1, bits: 16, frames: [[0]] });
    new DataView(bytes.buffer).setUint16(34, 24, true); // claim 24-bit
    expect(() => parseWav(bytes)).toThrow(/unsupported/i);
  });
});

describe('resample', () => {
  const sine = (rate: number, seconds: number, hz: number) =>
    Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate));

  it('returns the input unchanged at the same rate', () => {
    const s = sine(16000, 0.1, 440);
    expect(resample(s, 16000, 16000)).toEqual(s);
  });

  it.each([48000, 44100, 8000])('converts a 440 Hz sine from %i Hz to 16 kHz', (rate) => {
    const out = resample(sine(rate, 1, 440), rate, 16000);
    expect(out.length).toBe(16000);
    const expected = sine(16000, 1, 440);
    // Skip the edges; the interior should track the ideal 16 kHz sine closely.
    let maxErr = 0;
    for (let i = 100; i < out.length - 100; i++) maxErr = Math.max(maxErr, Math.abs(out[i]! - expected[i]!));
    expect(maxErr).toBeLessThan(0.02);
  });
});

describe('toMono16k', () => {
  it('downmixes, resamples and converts to Int16', () => {
    const pcm = toMono16k({
      sampleRate: 32000,
      channels: [new Float32Array(64).fill(0.5), new Float32Array(64).fill(0)],
    });
    expect(pcm).toBeInstanceOf(Int16Array);
    expect(pcm.length).toBe(32);
    expect(pcm[10]).toBe(Math.round(0.25 * 32767));
  });
});

describe('encodeWavPcm16', () => {
  it('round-trips through parseWav as 16 kHz mono', () => {
    const samples = Int16Array.from([0, 100, -100, 32767, -32768]);
    const wav = parseWav(encodeWavPcm16(samples, 16000));
    expect(wav.sampleRate).toBe(16000);
    expect(wav.channels).toHaveLength(1);
    expect(Array.from(wav.channels[0]!).map((x) => Math.round(x * 32768))).toEqual([0, 100, -100, 32767, -32768]);
  });
});
