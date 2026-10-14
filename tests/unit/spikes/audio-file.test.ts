import { describe, expect, it, vi } from 'vitest';
import { loadClip16k, type AudioFileDeps } from '../../../spikes/lib/audio-file';
import { encodeWavPcm16 } from '../../../spikes/lib/wav';

const pcmBytes = (samples: number[]) => new Uint8Array(Int16Array.from(samples).buffer);

function deps(files: Record<string, Uint8Array>, ffmpeg: AudioFileDeps['ffmpeg']): AudioFileDeps {
  return {
    readFile: (p) => {
      const f = files[p];
      return f ? Promise.resolve(f) : Promise.reject(new Error(`ENOENT ${p}`));
    },
    ffmpeg,
  };
}

describe('loadClip16k', () => {
  it('reads a WAV directly without ffmpeg', async () => {
    const ffmpeg = vi.fn();
    const pcm = await loadClip16k(
      'a.wav',
      deps({ 'a.wav': encodeWavPcm16(Int16Array.from([1, 2, 3]), 16000) }, ffmpeg),
    );
    expect(Array.from(pcm)).toEqual([1, 2, 3]);
    expect(ffmpeg).not.toHaveBeenCalled();
  });

  it('decodes other formats with ffmpeg to 16 kHz mono s16le', async () => {
    const ffmpeg = vi.fn(() => Promise.resolve(pcmBytes([5, -5])));
    const pcm = await loadClip16k('clip.mp3', deps({}, ffmpeg));
    expect(ffmpeg).toHaveBeenCalledWith([
      '-v',
      'error',
      '-i',
      'clip.mp3',
      '-f',
      's16le',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-',
    ]);
    expect(Array.from(pcm)).toEqual([5, -5]);
  });

  it('falls back to ffmpeg for WAV encodings it cannot read', async () => {
    const wav = encodeWavPcm16(Int16Array.from([0]), 16000);
    new DataView(wav.buffer).setUint16(34, 24, true);
    const ffmpeg = vi.fn(() => Promise.resolve(pcmBytes([7])));
    expect(Array.from(await loadClip16k('odd.wav', deps({ 'odd.wav': wav }, ffmpeg)))).toEqual([7]);
  });

  it('explains how to fix it when ffmpeg is missing', async () => {
    await expect(loadClip16k('clip.m4a', deps({}, null))).rejects.toThrow(/clip\.m4a.*ffmpeg.*brew install ffmpeg/s);
  });
});
