// Loads a spike clip as 16 kHz mono PCM16: WAV is read in-process; anything else (or an exotic WAV) goes through
// ffmpeg when it is installed (research R8).
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseWav, toMono16k } from './wav';

export interface AudioFileDeps {
  readFile(path: string): Promise<Uint8Array>;
  /** Runs ffmpeg with the given args and returns stdout; null when ffmpeg is not installed. */
  ffmpeg: ((args: string[]) => Promise<Uint8Array>) | null;
}

function bytesToInt16(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(Math.floor(bytes.byteLength / 2));
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length; i++) out[i] = v.getInt16(i * 2, true);
  return out;
}

export async function loadClip16k(path: string, deps: AudioFileDeps): Promise<Int16Array> {
  let wavError: unknown = null;
  if (path.toLowerCase().endsWith('.wav')) {
    try {
      return toMono16k(parseWav(await deps.readFile(path)));
    } catch (e) {
      wavError = e;
    }
  }
  if (!deps.ffmpeg) {
    const why = wavError instanceof Error ? ` (${wavError.message})` : '';
    throw new Error(
      `Cannot read ${path}${why}: only PCM16/Float32 WAV is read without ffmpeg. Install ffmpeg (brew install ffmpeg) or convert the clip to WAV.`,
    );
  }
  return bytesToInt16(await deps.ffmpeg(['-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', '16000', '-']));
}

function runFfmpeg(args: string[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(new Error(`ffmpeg failed: ${error.message}`));
      else resolve(new Uint8Array(stdout));
    });
  });
}

function hasFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => execFile('ffmpeg', ['-version'], (error) => resolve(!error)));
}

export async function nodeAudioFileDeps(): Promise<AudioFileDeps> {
  return {
    readFile: async (p) => new Uint8Array(await readFile(p)),
    ffmpeg: (await hasFfmpeg()) ? runFfmpeg : null,
  };
}
