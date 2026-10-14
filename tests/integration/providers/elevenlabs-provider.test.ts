import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsRealtimeProvider } from '@/providers/transcription/elevenlabs/realtime-provider';
import { CredentialError } from '@/providers/credentials/credential-source';
import { baseOptions, open, transcriptionProviderContract } from '../../contract/transcription-provider.contract';
import { FakeSocketServer, REFUSE, loadFixture, type Script } from '../../support/fake-websocket';
import { StaticCredentialSource } from '../../support/static-credential-source';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(scripts: Script[]) {
  const server = new FakeSocketServer(scripts);
  const credentials = new StaticCredentialSource();
  const provider = new ElevenLabsRealtimeProvider({ credentials, WebSocket: server.WebSocket });
  return {
    provider,
    server,
    credentials,
    chunks: (i: number) => server.sockets[i]?.sentOfType('input_audio_chunk') ?? [],
  };
}

transcriptionProviderContract('ElevenLabsRealtimeProvider', setup);

describe('ElevenLabsRealtimeProvider', () => {
  it('has id elevenlabs', () => {
    expect(setup([]).provider.id).toBe('elevenlabs');
  });

  it('mints a fresh token per session and puts it, the language and keyterms in the URL', async () => {
    const h = setup([loadFixture('happy-path'), loadFixture('happy-path')]);
    const a = await open(h, { ...baseOptions, language: { kind: 'fixed', code: 'el' }, keyterms: ['Northwind'] });
    const b = await open(h);
    const urlA = new URL(h.server.sockets[0]!.url);
    const urlB = new URL(h.server.sockets[1]!.url);
    expect(urlA.searchParams.get('token')).toBe('sutkn_fixture_1');
    expect(urlB.searchParams.get('token')).toBe('sutkn_fixture_2');
    expect(urlA.searchParams.get('language_code')).toBe('el');
    expect(urlA.searchParams.getAll('keyterms')).toEqual(['Northwind']);
    expect(urlB.searchParams.has('language_code')).toBe(false);
    a.session.close();
    b.session.close();
  });

  // Design decision 41 (001 FR-011b): clean transcript asks ElevenLabs to leave out fillers and false starts.
  it('sends no_verbatim=true only when the session asks for a clean transcript', async () => {
    const h = setup([loadFixture('happy-path'), loadFixture('happy-path')]);
    const a = await open(h, { ...baseOptions, noVerbatim: true });
    const b = await open(h, { ...baseOptions, noVerbatim: false });
    expect(new URL(h.server.sockets[0]!.url).searchParams.get('no_verbatim')).toBe('true');
    expect(new URL(h.server.sockets[1]!.url).searchParams.has('no_verbatim')).toBe(false);
    a.session.close();
    b.session.close();
  });

  it('rejects openSession with the CredentialError when no token can be minted, without connecting', async () => {
    const h = setup([loadFixture('happy-path')]);
    h.credentials.failNext('invalid');
    await expect(h.provider.openSession(baseOptions)).rejects.toBeInstanceOf(CredentialError);
    expect(h.server.sockets).toHaveLength(0);
  });

  it('rejects openSession when the socket never opens', async () => {
    const h = setup([REFUSE]);
    const pending = h.provider.openSession(baseOptions);
    const assertion = expect(pending).rejects.toThrow(/connect/i);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });

  it('error messages never contain the token', async () => {
    const h = setup([loadFixture('auth-error')]);
    const { events } = await open(h);
    await vi.advanceTimersByTimeAsync(100);
    expect(JSON.stringify(events)).not.toContain('sutkn_fixture_1');
  });
});
