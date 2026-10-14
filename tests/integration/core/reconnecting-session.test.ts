// ReconnectingSession on recorded ElevenLabs sequences (T072, research R4): a dropped or time-limited session is
// replaced by a new one with a fresh token, the recent transcript as context and the unfinished audio replayed, so
// no finished line is lost or duplicated; unrecoverable errors fail the stream with a plain reason.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ReconnectingSession,
  type ReconnectingEvent,
  type ReconnectingSessionOptions,
} from '@/core/session/reconnecting-session';
import type { SessionOptions, TranscriptionProvider } from '@/core/transcription/provider';
import { FakeTranscriptionProvider } from '@/providers/transcription/fake/fixture-provider';
import { REFUSE } from '@/providers/transcription/fake/replay-socket';
import { loadFixture, type Script } from '../../support/fake-websocket';

const T0 = 1_760_000_000_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const OPTIONS: SessionOptions = { sampleRate: 16000, language: { kind: 'auto' }, keyterms: ['Lighthouse'] };

function setup(provider: TranscriptionProvider, over: Partial<ReconnectingSessionOptions> = {}) {
  const session = new ReconnectingSession({ provider, options: OPTIONS, ...over });
  const events: ReconnectingEvent[] = [];
  session.on((e) => events.push(e));
  let n = 0;
  /** Sends one 100 ms frame whose single sample is its index n, stamped with meeting time n × 100 ms. */
  const push = () => {
    session.sendAudio(Int16Array.of(n), n * 100);
    n += 1;
  };
  const states = () => events.flatMap((e) => (e.type === 'state' ? [e.state] : []));
  const committed = () => events.flatMap((e) => (e.type === 'committed' ? [e.text] : []));
  return { session, events, push, states, committed };
}

async function play(ms: number, push: () => void) {
  for (let t = 0; t < ms; t += 100) {
    push();
    await vi.advanceTimersByTimeAsync(100);
  }
}

async function start(session: ReconnectingSession) {
  const p = session.start();
  await vi.advanceTimersByTimeAsync(1);
  await p;
}

/** Sample values of the audio chunks sent on a socket, in order. */
function sentSamples(socket: { sentOfType(t: string): Record<string, unknown>[] }): number[] {
  return socket.sentOfType('input_audio_chunk').map((m) => {
    const bytes = Buffer.from(m.audio_base_64 as string, 'base64');
    return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)[0] ?? NaN;
  });
}

const tokenOf = (url: string) => new URL(url).searchParams.get('token');

describe('ReconnectingSession', () => {
  it('reconnects after a drop with a new token and replays the unfinished audio before live audio', async () => {
    const provider = new FakeTranscriptionProvider([loadFixture('drop-mid-partial'), loadFixture('happy-path')]);
    const { session, push, states, events } = setup(provider);
    await start(session);
    await play(4000, push);

    expect(provider.sockets).toHaveLength(2);
    const [first, second] = provider.sockets;
    expect(tokenOf(first!.url)).not.toBe(tokenOf(second!.url));
    expect(states()).toEqual(['active', 'reconnecting', 'active']);
    // 006 R14: the state word "Reconnecting…" already says what is happening.
    expect(events.find((e) => e.type === 'state' && e.state === 'reconnecting')).toMatchObject({
      reason: 'Connection to ElevenLabs lost',
    });

    // Nothing was committed before the drop, so the new session gets every frame from the start, in order, then live.
    const samples = sentSamples(second!);
    expect(samples.slice(0, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(samples).toEqual(samples.map((_, i) => i));
    expect(samples.length).toBeGreaterThan(sentSamples(first!).length);

    // The new session's audio starts at the first replayed frame.
    const origins = events.flatMap((e) => (e.type === 'origin' ? [e.audioOriginMs] : []));
    expect(origins).toEqual([0, 0]);
    session.close();
  });

  it('reconnects immediately at the session time limit, with the recent text as context, losing and duplicating nothing', async () => {
    const provider = new FakeTranscriptionProvider([loadFixture('time-limit'), loadFixture('happy-path')]);
    const { session, push, states, committed, events } = setup(provider);
    await start(session);
    await play(3500, push);
    // The limit is hit at 3500 ms; the replacement opens without any backoff delay.
    await vi.advanceTimersByTimeAsync(5);
    expect(provider.sockets).toHaveLength(2);
    await play(6000, push);

    expect(states()).toEqual(['active', 'reconnecting', 'active']);
    expect(committed()).toEqual(['Last line before the limit.', 'Hello everyone.', 'Καλημέρα σε όλους.']);
    // 006 D5: a session time limit needs no action and carries no reason.
    const reconnecting = events.find((e) => e.type === 'state' && e.state === 'reconnecting');
    expect(reconnecting && 'reason' in reconnecting ? reconnecting.reason : undefined).toBeUndefined();

    const second = provider.sockets[1]!;
    const chunks = second.sentOfType('input_audio_chunk');
    expect(chunks[0]?.previous_text).toBe('Last line before the limit.');
    expect(chunks.slice(1).every((c) => !('previous_text' in c))).toBe(true);

    // The commit finalised audio up to its last word (ends 2.9 s): replay starts with the frame holding 2.9–3.0 s.
    expect(sentSamples(second)[0]).toBe(29);
    const origins = events.flatMap((e) => (e.type === 'origin' ? [e.audioOriginMs] : []));
    expect(origins).toEqual([0, 2900]);
    expect(committed()).toEqual(['Last line before the limit.', 'Hello everyone.', 'Καλημέρα σε όλους.']);
    session.close();
  });

  // Red-team 2026-10-08 (001 T111): a commit used to empty the whole replay buffer, so audio sent after the server's
  // commit point but before the commit message arrived was lost if the session dropped next.
  it('keeps frames sent after the last committed word for replay, even when the commit message arrives later', async () => {
    const script: Script = [
      { at: 0, dir: 'in', msg: { message_type: 'session_started', session_id: 's1' } },
      { at: 3000, dir: 'in', msg: { message_type: 'committed_transcript', text: 'Early words.' } },
      {
        at: 3040,
        dir: 'in',
        msg: {
          message_type: 'committed_transcript_with_timestamps',
          text: 'Early words.',
          language_code: 'en',
          words: [
            { text: 'Early', start: 1.0, end: 1.2, type: 'word' },
            { text: ' ', start: 1.2, end: 1.25, type: 'spacing' },
            { text: 'words.', start: 1.25, end: 1.5, type: 'word' },
          ],
        },
      },
      { at: 3500, dir: 'close', msg: { code: 1006 } },
    ];
    const provider = new FakeTranscriptionProvider([script, loadFixture('happy-path')]);
    const { session, push, events } = setup(provider);
    await start(session);
    await play(5000, push);
    expect(provider.sockets).toHaveLength(2);
    const replayed = sentSamples(provider.sockets[1]!);
    // Frames 15.. (audio from 1.5 s, after the last committed word) are replayed in order; 0–14 are not.
    expect(replayed[0]).toBe(15);
    expect(replayed.slice(0, 20)).toEqual(Array.from({ length: 20 }, (_, i) => 15 + i));
    const origins = events.flatMap((e) => (e.type === 'origin' ? [e.audioOriginMs] : []));
    expect(origins).toEqual([0, 1500]);
    session.close();
  });

  it('a commit without word timings drops nothing from the replay buffer (a repeat beats a loss)', async () => {
    const script: Script = [
      { at: 0, dir: 'in', msg: { message_type: 'session_started', session_id: 's1' } },
      { at: 1000, dir: 'in', msg: { message_type: 'committed_transcript', text: 'No timings here.' } },
      { at: 1500, dir: 'close', msg: { code: 1006 } },
    ];
    const provider = new FakeTranscriptionProvider([script, loadFixture('happy-path')]);
    const { session, push } = setup(provider);
    await start(session);
    await play(3000, push);
    expect(sentSamples(provider.sockets[1]!)[0]).toBe(0);
    session.close();
  });

  it('keeps previous text to the last 50 characters', async () => {
    const long = 'x'.repeat(40) + ' and then the final words.';
    const script: Script = [
      { at: 0, dir: 'in', msg: { message_type: 'session_started', session_id: 's1' } },
      { at: 500, dir: 'in', msg: { message_type: 'committed_transcript', text: long } },
      { at: 600, dir: 'close', msg: { code: 1006 } },
    ];
    const provider = new FakeTranscriptionProvider([script, loadFixture('happy-path')]);
    const { session, push } = setup(provider);
    await start(session);
    await play(2000, push);
    const prev = provider.sockets[1]!.sentOfType('input_audio_chunk')[0]?.previous_text as string;
    expect(prev).toBe(long.slice(-50));
    session.close();
  });

  it('fails without retrying on an auth error, with a plain reason', async () => {
    const provider = new FakeTranscriptionProvider([loadFixture('auth-error')]);
    const { session, push, states, events } = setup(provider);
    await start(session);
    await play(20_000, push);
    expect(provider.sockets).toHaveLength(1);
    expect(states()).toEqual(['failed']);
    const failed = events.find((e) => e.type === 'state' && e.state === 'failed');
    // 006 R15/D6: what happened and what to do; the transcript on screen needs no reassurance.
    expect(failed).toMatchObject({
      reason: 'ElevenLabs rejected the API key — check or replace it in Settings, then press Start again.',
    });
  });

  it('fails without retrying when the quota runs out mid-session', async () => {
    const provider = new FakeTranscriptionProvider([loadFixture('quota-error')]);
    const { session, push, states, events } = setup(provider);
    await start(session);
    await play(20_000, push);
    expect(provider.sockets).toHaveLength(1);
    expect(states()).toEqual(['active', 'failed']);
    expect(events.at(-1)).toMatchObject({
      type: 'state',
      state: 'failed',
      reason:
        'Your ElevenLabs quota is used up — add credits or change plan in your ElevenLabs account, then press Start again.',
    });
  });

  it('gives up after the backoff ladder when the service stays unreachable', async () => {
    const scripts: Script[] = [loadFixture('drop-mid-partial'), ...Array<Script>(7).fill(REFUSE)];
    const provider = new FakeTranscriptionProvider(scripts);
    const { session, push, states, events } = setup(provider);
    await start(session);
    await play(2500, push);
    expect(states()).toEqual(['active', 'reconnecting']);
    await play(60_000, push);
    expect(provider.sockets).toHaveLength(8);
    expect(states()).toEqual(['active', 'reconnecting', 'failed']);
    expect(events.at(-1)).toMatchObject({
      reason:
        'Could not reconnect to ElevenLabs for about a minute — check your internet connection, then press Start again.',
    });
  });

  it('fails when a reconnect cannot get a token because the key was rejected', async () => {
    const inner = new FakeTranscriptionProvider([loadFixture('drop-mid-partial')]);
    let opened = 0;
    const provider: TranscriptionProvider = {
      id: 'fake',
      openSession: (o) => {
        opened += 1;
        if (opened === 1) return inner.openSession(o);
        return Promise.reject(Object.assign(new Error('rejected'), { name: 'CredentialError', kind: 'invalid' }));
      },
    };
    const { session, push, states, events } = setup(provider);
    await start(session);
    await play(10_000, push);
    expect(opened).toBe(2);
    expect(states()).toEqual(['active', 'reconnecting', 'failed']);
    expect(events.at(-1)).toMatchObject({ reason: expect.stringMatching(/API key/) as unknown });
  });

  it('reports audio lost to the replay cap once the stream is back', async () => {
    const scripts: Script[] = [
      loadFixture('drop-mid-partial'),
      ...Array<Script>(6).fill(REFUSE),
      loadFixture('happy-path'),
    ];
    const provider = new FakeTranscriptionProvider(scripts);
    const { session, push, events } = setup(provider);
    await start(session);
    // 0.5+1+2+4+8+15 s of failed attempts, then the seventh attempt (after another 15 s) succeeds: > 40 s outage.
    await play(50_000, push);
    const back = events.filter((e) => e.type === 'state').at(-1);
    expect(back).toMatchObject({
      state: 'active',
      reason: expect.stringMatching(/could not be transcribed/) as unknown,
    });
    session.close();
  });

  it('sends nothing and reconnects no more once closed', async () => {
    const provider = new FakeTranscriptionProvider([loadFixture('drop-mid-partial'), loadFixture('happy-path')]);
    const { session, push } = setup(provider);
    await start(session);
    await play(2000, push);
    session.close();
    const sent = provider.sockets[0]!.sent.length;
    await play(5000, push);
    expect(provider.sockets).toHaveLength(1);
    expect(provider.sockets[0]!.sent.length).toBe(sent);
  });

  it('rejects start when the first session cannot be opened', async () => {
    const provider = new FakeTranscriptionProvider([REFUSE]);
    const { session } = setup(provider);
    const p = session.start();
    const settled = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5);
    expect(await settled).toBeInstanceOf(Error);
  });
});
