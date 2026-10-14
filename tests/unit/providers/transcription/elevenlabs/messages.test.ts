import { describe, expect, it } from 'vitest';
import { REALTIME_ENDPOINT, buildRealtimeUrl } from '@/providers/transcription/elevenlabs/url';
import { AudioChunkEncoder, parseServerMessage } from '@/providers/transcription/elevenlabs/messages';
import { classifyErrorType, sanitizeServerText } from '@/providers/transcription/elevenlabs/errors';

describe('buildRealtimeUrl', () => {
  it('sets every fixed parameter from research R2 and omits language for auto', () => {
    const url = new URL(buildRealtimeUrl({ token: 'sutkn_abc', language: { kind: 'auto' }, keyterms: [] }));
    expect(`${url.origin}${url.pathname}`).toBe(REALTIME_ENDPOINT);
    expect(REALTIME_ENDPOINT).toBe('wss://api.elevenlabs.io/v1/speech-to-text/realtime');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      model_id: 'scribe_v2_realtime',
      token: 'sutkn_abc',
      audio_format: 'pcm_16000',
      commit_strategy: 'vad',
      // Real call 2026-10-09 (001 FR-011a, research R3): a line ends after 1.0 s of silence, not the service default.
      vad_silence_threshold_secs: '1.0',
      include_timestamps: 'true',
      include_language_detection: 'true',
    });
  });

  it('adds language_code for a fixed language', () => {
    const url = new URL(buildRealtimeUrl({ token: 't', language: { kind: 'fixed', code: 'el' }, keyterms: [] }));
    expect(url.searchParams.get('language_code')).toBe('el');
  });

  it('encodes keyterms as repeated keys, URL-escaped', () => {
    const url = new URL(
      buildRealtimeUrl({ token: 't', language: { kind: 'auto' }, keyterms: ['Northwind', 'Καλημέρα', 'a&b'] }),
    );
    expect(url.searchParams.getAll('keyterms')).toEqual(['Northwind', 'Καλημέρα', 'a&b']);
  });

  it('adds secondary_languages as repeated keys when given (spike B)', () => {
    const url = new URL(
      buildRealtimeUrl({
        token: 't',
        language: { kind: 'fixed', code: 'el' },
        keyterms: [],
        secondaryLanguages: ['en'],
      }),
    );
    expect(url.searchParams.getAll('secondary_languages')).toEqual(['en']);
  });
});

describe('AudioChunkEncoder', () => {
  it('serialises input_audio_chunk and sends previous_text on the first chunk only', () => {
    const encoder = new AudioChunkEncoder(16000, 'the last thing said');
    const first = JSON.parse(encoder.encode('AAAA')) as Record<string, unknown>;
    const second = JSON.parse(encoder.encode('BBBB')) as Record<string, unknown>;
    expect(first).toEqual({
      message_type: 'input_audio_chunk',
      audio_base_64: 'AAAA',
      commit: false,
      sample_rate: 16000,
      previous_text: 'the last thing said',
    });
    expect(second).toEqual({
      message_type: 'input_audio_chunk',
      audio_base_64: 'BBBB',
      commit: false,
      sample_rate: 16000,
    });
  });

  it('never sends previous_text when none is given or it is empty', () => {
    expect(JSON.parse(new AudioChunkEncoder(16000).encode('A'))).not.toHaveProperty('previous_text');
    expect(JSON.parse(new AudioChunkEncoder(16000, '').encode('A'))).not.toHaveProperty('previous_text');
  });

  it('caps previous_text at its last 50 characters', () => {
    const long = 'x'.repeat(40) + 'y'.repeat(20);
    const msg = JSON.parse(new AudioChunkEncoder(16000, long).encode('A')) as { previous_text: string };
    expect(msg.previous_text).toBe('x'.repeat(30) + 'y'.repeat(20));
  });
});

describe('parseServerMessage', () => {
  const p = (m: unknown) => parseServerMessage(JSON.stringify(m));

  it('parses session_started', () => {
    expect(p({ message_type: 'session_started', session_id: 's1', config: {} })).toEqual({
      type: 'started',
      sessionId: 's1',
    });
  });

  it('parses partial and committed transcripts', () => {
    expect(p({ message_type: 'partial_transcript', text: 'hel' })).toEqual({ type: 'partial', text: 'hel' });
    expect(p({ message_type: 'committed_transcript', text: 'Hello.' })).toEqual({ type: 'committed', text: 'Hello.' });
  });

  it('parses committed_transcript_with_timestamps, dropping non-word entries', () => {
    expect(
      p({
        message_type: 'committed_transcript_with_timestamps',
        text: 'Hi there',
        language_code: 'en',
        words: [
          { text: 'Hi', start: 1, end: 1.2, type: 'word', logprob: -0.1 },
          { text: ' ', start: 1.2, end: 1.25, type: 'spacing' },
          { text: 'there', start: 1.25, end: 1.6, type: 'word' },
          { text: '(cough)', start: 1.6, end: 1.9, type: 'audio_event' },
        ],
      }),
    ).toEqual({
      type: 'committed-detail',
      text: 'Hi there',
      language: 'en',
      words: [
        { text: 'Hi', startSec: 1, endSec: 1.2 },
        { text: 'there', startSec: 1.25, endSec: 1.6 },
      ],
    });
  });

  it('treats a missing language_code or words as null / empty', () => {
    expect(p({ message_type: 'committed_transcript_with_timestamps', text: 'x' })).toEqual({
      type: 'committed-detail',
      text: 'x',
      language: null,
      words: [],
    });
  });

  it('parses error messages with their type and sanitised text', () => {
    expect(p({ message_type: 'quota_exceeded', error: 'Quota exceeded.' })).toEqual({
      type: 'server-error',
      errorType: 'quota_exceeded',
      text: 'Quota exceeded.',
    });
  });

  it('ignores unknown message types and malformed data (forward compatibility)', () => {
    expect(p({ message_type: 'future_feature_announcement', payload: 1 })).toEqual({ type: 'ignored' });
    expect(parseServerMessage('not json')).toEqual({ type: 'ignored' });
    expect(p({ text: 'no type' })).toEqual({ type: 'ignored' });
    expect(p({ message_type: 'partial_transcript', text: 5 })).toEqual({ type: 'ignored' });
  });
});

describe('classifyErrorType (ElevenLabs → ProviderErrorKind)', () => {
  it.each([
    ['auth_error', 'auth', false],
    ['quota_exceeded', 'quota', false],
    ['unaccepted_terms', 'terms', false],
    ['invalid_request', 'invalid-request', false],
    ['session_time_limit_exceeded', 'time-limit', true],
    ['rate_limited', 'rate-limited', true],
    ['commit_throttled', 'rate-limited', true],
    ['queue_overflow', 'overloaded', true],
    ['resource_exhausted', 'overloaded', true],
    ['transcriber_error', 'transcriber', true],
    ['error', 'transcriber', true],
    ['insufficient_audio_activity', 'transcriber', true],
    ['input_error', 'input', true],
    ['chunk_size_exceeded', 'input', true],
  ] as const)('%s → %s (recoverable %s)', (type, kind, recoverable) => {
    expect(classifyErrorType(type)).toEqual({ kind, recoverable });
  });

  it('returns null for non-error types', () => {
    expect(classifyErrorType('partial_transcript')).toBeNull();
    expect(classifyErrorType('future_thing')).toBeNull();
  });
});

describe('sanitizeServerText', () => {
  it('removes token- and key-shaped strings', () => {
    expect(sanitizeServerText('Invalid token sutkn_abc123XYZ for sk_1234567890abcdef')).toBe(
      'Invalid token [redacted] for [redacted]',
    );
  });

  it('truncates to 200 characters', () => {
    expect(sanitizeServerText('a'.repeat(500))).toHaveLength(200);
  });
});
