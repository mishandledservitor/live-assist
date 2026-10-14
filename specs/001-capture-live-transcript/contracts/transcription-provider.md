# Contract: Transcription provider

Constitution V. Core code (`src/core/**`) depends only on this interface; `src/providers/transcription/elevenlabs/**` is the only code that knows the ElevenLabs wire protocol.

```ts
// One session per meeting carries the locally mixed stream (constitution v1.1.0); options no longer name a stream
// (revised 2026-10-08, superseded: `stream: 'mic' | 'tab'`, one session per stream).
export interface SessionOptions {
  sampleRate: 16000;                  // PCM16 LE mono
  language: { kind: 'auto' } | { kind: 'fixed'; code: string };
  keyterms: readonly string[];        // already validated (≤50 × ≤20 chars)
  previousText?: string;              // ≤50 chars; sent with the first chunk only
}

export interface ProviderWord { text: string; startSec: number; endSec: number }

export type SessionEvent =
  | { type: 'started'; sessionId: string }
  | { type: 'partial'; text: string }                                 // empty text = keepalive/no speech
  | { type: 'committed'; text: string }                               // final text, clears partial
  | { type: 'committed-detail'; text: string; language: string | null; words: ProviderWord[] }
  | { type: 'error'; kind: ProviderErrorKind; recoverable: boolean; message: string } // message never contains secrets
  | { type: 'closed'; code: number; wasClean: boolean };

export type ProviderErrorKind =
  | 'auth' | 'quota' | 'terms' | 'invalid-request'            // non-recoverable
  | 'time-limit'                                              // recoverable, reconnect immediately
  | 'rate-limited' | 'overloaded' | 'transcriber' | 'network' // recoverable with backoff
  | 'input' | 'unknown';                                      // one retry, then fail

export interface TranscriptionSession {
  readonly id: string | null;          // null until 'started'
  sendAudio(frame: Int16Array): void;  // 100 ms frames; no-op after close
  close(): void;                        // idempotent
  on(listener: (e: SessionEvent) => void): () => void;
}

export interface TranscriptionProvider {
  readonly id: 'elevenlabs' | 'fake';
  openSession(opts: SessionOptions): Promise<TranscriptionSession>; // obtains its own credential via CredentialSource
}
```

## Behavioural contract (fixture-tested)

1. `openSession` resolves once the socket is open; `started` follows `session_started`.
2. Every `committed` is followed by at most one `committed-detail` with the same text; consumers must tolerate it never arriving.
3. A server error message yields exactly one `error` event followed by one `closed` event.
4. A socket close without a preceding error yields `error{kind:'network', recoverable:true}` then `closed`.
5. `previousText` is attached to the first `sendAudio` call only.
6. Messages of unknown `message_type` are ignored (forward compatibility), never thrown.

## ElevenLabs mapping (`ElevenLabsRealtimeProvider`)

| ElevenLabs | Contract |
|------------|----------|
| `session_started` | `started` |
| `partial_transcript` | `partial` |
| `committed_transcript` | `committed` |
| `committed_transcript_with_timestamps` | `committed-detail` (`words[].start/end` seconds; `type !== 'word'` entries such as spacing are dropped) |
| `auth_error` / `quota_exceeded` / `unaccepted_terms` / `invalid_request` | `auth` / `quota` / `terms` / `invalid-request`, `recoverable:false` |
| `session_time_limit_exceeded` | `time-limit`, recoverable |
| `rate_limited` / `queue_overflow` / `resource_exhausted` / `commit_throttled` | `rate-limited` / `overloaded`, recoverable |
| `transcriber_error` / `error` / `insufficient_audio_activity` | `transcriber`, recoverable |
| `input_error` / `chunk_size_exceeded` | `input` |

Connection URL: `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=…&audio_format=pcm_16000&commit_strategy=vad&include_timestamps=true&include_language_detection=true[&language_code=…][&keyterms=…]`. Array parameters are encoded as repeated query keys (verify against a recorded `session_started.config` echo during the first manual check; the encoder is one function).

## Fixture format

`tests/fixtures/elevenlabs/<scenario>.jsonl` — one JSON object per line: `{ "at": <ms since open>, "dir": "in" | "out" | "close", "msg": <payload> | { "code": n } }`. `FakeWebSocket` replays `in` and `close` lines on a fake clock and records `out` messages for assertions. Scenarios: `happy-path`, `drop-mid-partial`, `time-limit`, `auth-error`, `quota-error`, `no-detail-after-commit`, `unknown-message`.
