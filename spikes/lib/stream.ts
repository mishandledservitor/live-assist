// Node realtime streamer for the spikes (research R7, R8). Reuses the production URL builder and wire codec; differs
// from the extension only in auth: Node can set request headers, so it sends the key as `xi-api-key` (from the
// ELEVENLABS_API_KEY shell variable) instead of minting a single-use token. The key is never logged or returned.
import { FRAME_SAMPLES, int16ToBase64, SAMPLE_RATE, silenceFrame } from '../../src/audio/pcm';
import type { LanguageMode } from '../../src/core/transcript/model';
import { classifyErrorType } from '../../src/providers/transcription/elevenlabs/errors';
import { AudioChunkEncoder, parseServerMessage } from '../../src/providers/transcription/elevenlabs/messages';
import { buildRealtimeUrl } from '../../src/providers/transcription/elevenlabs/url';
import type { ProviderErrorKind } from '../../src/providers/transcription/provider';
import type { WebSocketLike } from '../../src/providers/transcription/socket';

export interface StreamConfig {
  language: LanguageMode;
  secondaryLanguages?: readonly string[];
  keyterms?: readonly string[];
}

export type Connect = (url: string, headers: Record<string, string>) => WebSocketLike;

export interface StreamDeps {
  apiKey: string;
  connect: Connect;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface StreamOptions {
  /** Silence after the clip so VAD commits the last utterance. */
  tailSilenceMs?: number;
  /** How long to wait for late commits after the last frame. */
  drainMs?: number;
}

export interface SpikeWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface SpikeSegment {
  text: string;
  language: string | null;
  /** Clip-relative. */
  startMs: number;
  endMs: number;
  timing: 'words' | 'estimated';
  words: SpikeWord[];
}

export interface StreamResult {
  sessionId: string | null;
  segments: SpikeSegment[];
  error: { kind: ProviderErrorKind; message: string } | null;
}

const FRAME_MS = (FRAME_SAMPLES / SAMPLE_RATE) * 1000;

export function requireApiKey(env: Record<string, string | undefined>): string {
  const key = env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'ELEVENLABS_API_KEY is not set. In this shell run: export ELEVENLABS_API_KEY=<your key> (never put the key in a file), then re-run.',
    );
  }
  return key;
}

export function buildSpikeUrl(config: StreamConfig): string {
  const url = new URL(
    buildRealtimeUrl({
      token: '',
      language: config.language,
      keyterms: config.keyterms ?? [],
      ...(config.secondaryLanguages ? { secondaryLanguages: config.secondaryLanguages } : {}),
    }),
  );
  url.searchParams.delete('token');
  return url.toString();
}

export function nodeConnect(url: string, headers: Record<string, string>): WebSocketLike {
  // Node's WebSocket (undici) accepts request headers as a non-standard init option.
  const Ctor = WebSocket as unknown as new (url: string, init: { headers: Record<string, string> }) => WebSocketLike;
  return new Ctor(url, { headers });
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Streams one 16 kHz mono clip in real time through one realtime session and collects committed segments. */
export async function streamClip(
  pcm: Int16Array,
  config: StreamConfig,
  deps: StreamDeps,
  opts: StreamOptions = {},
): Promise<StreamResult> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? defaultSleep;
  const tailSilenceMs = opts.tailSilenceMs ?? 3000;
  const drainMs = opts.drainMs ?? 5000;

  const result: StreamResult = { sessionId: null, segments: [], error: null };
  const pending: { text: string; atMs: number }[] = [];
  let sentMs = 0;
  let clientClosed = false;
  let finished = false;
  let markClosed: () => void = () => {};
  const closed = new Promise<void>((resolve) => (markClosed = resolve));

  const ws = deps.connect(buildSpikeUrl(config), { 'xi-api-key': deps.apiKey });
  const fail = (kind: ProviderErrorKind, message: string) => {
    result.error ??= { kind, message };
  };

  const opened = await new Promise<boolean>((resolve) => {
    ws.onopen = () => resolve(true);
    ws.onclose = (e) => {
      fail('network', `Could not connect to ElevenLabs (code ${e.code})`);
      resolve(false);
    };
    ws.onerror = () => {};
  });
  if (!opened) return result;

  ws.onclose = (e) => {
    finished = true;
    if (!clientClosed) fail('network', `Connection closed unexpectedly (code ${e.code})`);
    markClosed();
  };
  ws.onmessage = (e) => {
    const m = parseServerMessage(e.data);
    switch (m.type) {
      case 'started':
        result.sessionId = m.sessionId;
        return;
      case 'committed':
        if (m.text.trim() !== '') pending.push({ text: m.text, atMs: sentMs });
        return;
      case 'committed-detail': {
        const commit = pending.shift();
        if (m.text.trim() === '') return;
        const words = m.words.map((w) => ({
          text: w.text,
          startMs: Math.round(w.startSec * 1000),
          endMs: Math.round(w.endSec * 1000),
        }));
        const at = commit?.atMs ?? sentMs;
        result.segments.push({
          text: m.text,
          language: m.language,
          startMs: words[0]?.startMs ?? at,
          endMs: words.at(-1)?.endMs ?? at,
          timing: words.length > 0 ? 'words' : 'estimated',
          words,
        });
        return;
      }
      case 'server-error': {
        const kind = classifyErrorType(m.errorType)?.kind ?? 'unknown';
        fail(kind, `ElevenLabs ${m.errorType}${m.text ? `: ${m.text}` : ''}`);
        clientClosed = true;
        finished = true;
        ws.close(1000);
        markClosed();
        return;
      }
      default:
        return;
    }
  };

  const encoder = new AudioChunkEncoder(SAMPLE_RATE);
  const tailFrames = Math.ceil(tailSilenceMs / FRAME_MS);
  const audioFrames = Math.ceil(pcm.length / FRAME_SAMPLES);
  const start = now();
  for (let i = 0; i < audioFrames + tailFrames && !finished; i++) {
    const frame = i < audioFrames ? padFrame(pcm.subarray(i * FRAME_SAMPLES, (i + 1) * FRAME_SAMPLES)) : silenceFrame();
    ws.send(encoder.encode(int16ToBase64(frame)));
    sentMs += FRAME_MS;
    await sleep(Math.max(0, start + (i + 1) * FRAME_MS - now()));
  }

  if (!finished) await Promise.race([sleep(drainMs), closed]);
  if (!finished) {
    clientClosed = true;
    ws.close(1000);
  }

  for (const p of pending) {
    result.segments.push({
      text: p.text,
      language: null,
      startMs: p.atMs,
      endMs: p.atMs,
      timing: 'estimated',
      words: [],
    });
  }
  result.segments.sort((a, b) => a.startMs - b.startMs);
  return result;
}

function padFrame(samples: Int16Array): Int16Array {
  if (samples.length === FRAME_SAMPLES) return samples;
  const out = silenceFrame();
  out.set(samples);
  return out;
}
