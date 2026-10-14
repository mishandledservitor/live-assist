import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeTranscriptionProvider } from '@/providers/transcription/fake/fixture-provider';
import { parseFixture } from '@/providers/transcription/fixture';
import { baseOptions, open, transcriptionProviderContract } from '../../contract/transcription-provider.contract';
import { loadFixture, type Script } from '../../support/fake-websocket';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(scripts: Script[]) {
  const provider = new FakeTranscriptionProvider(scripts);
  return { provider, chunks: (i: number) => provider.sockets[i]?.sentOfType('input_audio_chunk') ?? [] };
}

transcriptionProviderContract('FakeTranscriptionProvider', setup);

describe('FakeTranscriptionProvider', () => {
  it('has id fake', () => {
    expect(setup([]).provider.id).toBe('fake');
  });

  it('accepts a per-connection script function (e.g. a scripted first session, then reconnects, in e2e)', async () => {
    const provider = new FakeTranscriptionProvider((i) => (i === 0 ? loadFixture('happy-path') : undefined));
    const { session, events } = await open({ provider, chunks: () => [] });
    expect(events[0]).toMatchObject({ type: 'started' });
    session.close();
    await expect(provider.openSession(baseOptions)).rejects.toThrow(/no script/);
  });

  it('can be built from raw JSONL text (bundled fixtures in e2e builds)', async () => {
    const text = '{"at":0,"dir":"in","msg":{"message_type":"session_started","session_id":"raw"}}';
    const provider = new FakeTranscriptionProvider([parseFixture(text)]);
    const { session } = await open({ provider, chunks: () => [] });
    expect(session.id).toBe('raw');
    session.close();
  });
});
