import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSpikeUrl, requireApiKey, streamClip, type StreamConfig } from '../../../spikes/lib/stream';
import { FakeSocketServer, REFUSE, loadFixture, type Script } from '../../support/fake-websocket';

const KEY = 'sk_test_fixture_spike_key_0000';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(scripts: Script[]) {
  const server = new FakeSocketServer(scripts);
  const headers: Record<string, string>[] = [];
  const connect = (url: string, h: Record<string, string>) => {
    headers.push(h);
    return new server.WebSocket(url);
  };
  return { server, headers, deps: { apiKey: KEY, connect } };
}

const auto: StreamConfig = { language: { kind: 'auto' } };
const seconds = (s: number) => new Int16Array(16000 * s);

async function run<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

describe('requireApiKey', () => {
  it('returns the key from ELEVENLABS_API_KEY', () => {
    expect(requireApiKey({ ELEVENLABS_API_KEY: ` ${KEY} ` })).toBe(KEY);
  });

  it('fails with instructions when unset', () => {
    expect(() => requireApiKey({})).toThrow(/ELEVENLABS_API_KEY.*export/s);
    expect(() => requireApiKey({ ELEVENLABS_API_KEY: '' })).toThrow(/ELEVENLABS_API_KEY/);
  });
});

describe('buildSpikeUrl', () => {
  it('uses the production URL builder without a token, plus language and secondary languages', () => {
    const url = new URL(buildSpikeUrl({ language: { kind: 'fixed', code: 'el' }, secondaryLanguages: ['en'] }));
    expect(url.origin + url.pathname).toBe('wss://api.elevenlabs.io/v1/speech-to-text/realtime');
    expect(url.searchParams.has('token')).toBe(false);
    expect(url.searchParams.get('model_id')).toBe('scribe_v2_realtime');
    expect(url.searchParams.get('commit_strategy')).toBe('vad');
    expect(url.searchParams.get('include_timestamps')).toBe('true');
    expect(url.searchParams.get('language_code')).toBe('el');
    expect(url.searchParams.getAll('secondary_languages')).toEqual(['en']);
  });

  it('omits language_code for auto', () => {
    expect(new URL(buildSpikeUrl(auto)).searchParams.has('language_code')).toBe(false);
  });
});

describe('streamClip', () => {
  it('authenticates with the xi-api-key header and keeps the key out of the URL', async () => {
    const h = setup([loadFixture('happy-path')]);
    await run(streamClip(seconds(6), auto, h.deps));
    expect(h.headers[0]).toEqual({ 'xi-api-key': KEY });
    expect(h.server.sockets[0]!.url).not.toContain(KEY);
  });

  it('streams the clip in real time in 100 ms frames, then trailing silence', async () => {
    const h = setup([loadFixture('happy-path')]);
    const p = streamClip(seconds(1), auto, h.deps, { tailSilenceMs: 500, drainMs: 1000 });
    await vi.advanceTimersByTimeAsync(450);
    const early = h.server.sockets[0]!.sentOfType('input_audio_chunk').length;
    expect(early).toBeGreaterThanOrEqual(4);
    expect(early).toBeLessThanOrEqual(6);
    await run(p);
    const chunks = h.server.sockets[0]!.sentOfType('input_audio_chunk');
    expect(chunks).toHaveLength(15); // 10 audio + 5 silence frames
    expect(chunks[0]).toMatchObject({ commit: false, sample_rate: 16000 });
    expect(typeof chunks[0]!.audio_base_64).toBe('string');
  });

  it('returns committed segments with clip-relative word timings and language', async () => {
    const h = setup([loadFixture('happy-path')]);
    const r = await run(streamClip(seconds(6), auto, h.deps));
    expect(r.error).toBeNull();
    expect(r.sessionId).toBe('sess-fixture-1');
    expect(r.segments).toEqual([
      {
        text: 'Hello everyone.',
        language: 'en',
        startMs: 2100,
        endMs: 2900,
        timing: 'words',
        words: [
          { text: 'Hello', startMs: 2100, endMs: 2400 },
          { text: 'everyone.', startMs: 2450, endMs: 2900 },
        ],
      },
      expect.objectContaining({ text: 'Καλημέρα σε όλους.', language: 'el', startMs: 4100, endMs: 4950 }),
    ]);
  });

  it('keeps a commit whose timestamps never arrive, with estimated timing', async () => {
    const h = setup([loadFixture('no-detail-after-commit')]);
    const r = await run(streamClip(seconds(7), auto, h.deps));
    expect(r.segments).toEqual([
      {
        text: 'No timestamps for this one.',
        language: null,
        startMs: 3000,
        endMs: 3000,
        timing: 'estimated',
        words: [],
      },
    ]);
  });

  it('stops on a server error and reports it without the key', async () => {
    const h = setup([loadFixture('auth-error')]);
    const r = await run(streamClip(seconds(3), auto, h.deps));
    expect(r.error).toMatchObject({ kind: 'auth' });
    expect(r.segments).toEqual([]);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it('reports an unexpected close as a network error', async () => {
    const h = setup([loadFixture('drop-mid-partial')]);
    const r = await run(streamClip(seconds(5), auto, h.deps));
    expect(r.error).toMatchObject({ kind: 'network' });
  });

  it('reports a refused connection', async () => {
    const h = setup([REFUSE]);
    const r = await run(streamClip(seconds(1), auto, h.deps));
    expect(r.error).toMatchObject({ kind: 'network' });
    expect(r.error!.message).toMatch(/connect/i);
  });
});
