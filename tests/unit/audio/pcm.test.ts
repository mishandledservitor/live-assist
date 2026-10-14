import { describe, expect, it } from 'vitest';
import {
  FRAME_SAMPLES,
  FrameAssembler,
  FramePairAssembler,
  SAMPLE_RATE,
  downmixToMono,
  floatToInt16,
  int16ToBase64,
  silenceFrame,
} from '@/audio/pcm';

describe('constants', () => {
  it('frames are 100 ms at 16 kHz', () => {
    expect(SAMPLE_RATE).toBe(16_000);
    expect(FRAME_SAMPLES).toBe(1_600);
  });
});

describe('downmixToMono', () => {
  it('averages channels sample by sample', () => {
    const mono = downmixToMono([new Float32Array([1, 0.5, -1]), new Float32Array([0, 0.5, 1])]);
    expect(Array.from(mono)).toEqual([0.5, 0.5, 0]);
  });

  it('returns a copy of a single channel', () => {
    const ch = new Float32Array([0.25, -0.25]);
    const mono = downmixToMono([ch]);
    expect(Array.from(mono)).toEqual([0.25, -0.25]);
    expect(mono).not.toBe(ch);
  });

  it('returns an empty array for no channels', () => {
    expect(downmixToMono([])).toHaveLength(0);
  });
});

describe('floatToInt16', () => {
  it('maps full scale to the Int16 range and rounds', () => {
    expect(Array.from(floatToInt16(new Float32Array([0, 1, -1, 0.5, -0.5])))).toEqual([
      0, 32767, -32768, 16384, -16384,
    ]);
  });

  it('clamps out-of-range samples', () => {
    expect(Array.from(floatToInt16(new Float32Array([1.5, -2, Number.NaN])))).toEqual([32767, -32768, 0]);
  });
});

describe('FrameAssembler', () => {
  it('emits exact 1600-sample frames across uneven input blocks', () => {
    const asm = new FrameAssembler();
    const ramp = (from: number, n: number) => Int16Array.from({ length: n }, (_, i) => (from + i) % 30000);
    expect(asm.push(ramp(0, 128))).toEqual([]);
    const out1 = asm.push(ramp(128, 1500));
    expect(out1).toHaveLength(1);
    expect(out1[0]).toHaveLength(FRAME_SAMPLES);
    expect(out1[0]?.[0]).toBe(0);
    expect(out1[0]?.[1599]).toBe(1599);
    const out2 = asm.push(ramp(1628, 3400));
    expect(out2).toHaveLength(2);
    expect(out2[0]?.[0]).toBe(1600);
    expect(out2[1]?.[1599]).toBe(4799);
    expect(asm.pending()).toBe(5028 - 4800);
  });

  it('emits frames that do not alias each other', () => {
    const asm = new FrameAssembler(4);
    const frames = asm.push(Int16Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    frames[0]![0] = 99;
    expect(frames[1]?.[0]).toBe(5);
  });

  it('flush() pads the remainder with silence, or returns null when empty', () => {
    const asm = new FrameAssembler(4);
    asm.push(Int16Array.from([7, 8]));
    expect(Array.from(asm.flush() ?? [])).toEqual([7, 8, 0, 0]);
    expect(asm.flush()).toBeNull();
  });
});

describe('int16ToBase64', () => {
  it('encodes little-endian bytes', () => {
    // 1 → 01 00, -1 → FF FF, 256 → 00 01
    expect(int16ToBase64(Int16Array.from([1, -1, 256]))).toBe(Buffer.from([1, 0, 255, 255, 0, 1]).toString('base64'));
  });

  it('round-trips a full frame', () => {
    const frame = Int16Array.from({ length: FRAME_SAMPLES }, (_, i) => ((i * 37) % 65536) - 32768);
    const bytes = Buffer.from(int16ToBase64(frame), 'base64');
    const back = new Int16Array(FRAME_SAMPLES);
    for (let i = 0; i < FRAME_SAMPLES; i++) back[i] = bytes.readInt16LE(i * 2);
    expect(back).toEqual(frame);
  });
});

describe('silenceFrame', () => {
  it('is a zeroed 100 ms frame', () => {
    const s = silenceFrame();
    expect(s).toHaveLength(FRAME_SAMPLES);
    expect(s.every((v) => v === 0)).toBe(true);
  });
});

// 002 T049: tab and mic leave the worklet as separate, paired frames, so the mute gate can silence the mic before the
// mix (research R8).
describe('FramePairAssembler', () => {
  it('turns two-channel render quanta into paired 100 ms PCM16 frames, channel 0 the tab and channel 1 the mic', () => {
    const pairs = new FramePairAssembler();
    const out = [];
    for (let i = 0; i < 13; i++)
      out.push(...pairs.push([new Float32Array(128).fill(0.5), new Float32Array(128).fill(-0.25)]));
    expect(out).toHaveLength(1);
    expect(out[0]!.tab).toHaveLength(FRAME_SAMPLES);
    expect(out[0]!.mic).toHaveLength(FRAME_SAMPLES);
    expect(out[0]!.tab.every((s) => s === 16384)).toBe(true);
    expect(out[0]!.mic.every((s) => s === -8192)).toBe(true);
  });

  it('a missing channel is silence, so the pair stays aligned', () => {
    const pairs = new FramePairAssembler(4);
    expect(pairs.push([new Float32Array(4).fill(1)])).toEqual([
      { tab: Int16Array.from([32767, 32767, 32767, 32767]), mic: new Int16Array(4) },
    ]);
    expect(pairs.push([])).toEqual([{ tab: new Int16Array(4), mic: new Int16Array(4) }]);
  });
});
