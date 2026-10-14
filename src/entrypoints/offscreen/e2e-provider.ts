// e2e builds only (imported behind `import.meta.env.MODE === 'e2e'`, so production bundles never contain it): a
// provider replaying recorded ElevenLabs sessions for the meeting's one transcription session (constitution v1.1.0).
// The first connection's script comes from `e2eScenario` in chrome.storage.local, which the e2e background passes as
// the meeting's source title (tests/e2e/resilience.spec.ts); every reconnect replays the happy path.
import type { TranscriptionProvider } from '../../core/transcription/provider';
import { FakeTranscriptionProvider } from '../../providers/transcription/fake/fixture-provider';
import { parseFixture } from '../../providers/transcription/fixture';
import authScript from '../../../tests/fixtures/elevenlabs/auth-error.jsonl?raw';
import dropScript from '../../../tests/fixtures/elevenlabs/drop-mid-partial.jsonl?raw';
import happyScript from '../../../tests/fixtures/elevenlabs/happy-path.jsonl?raw';
import mixedScript from '../../../tests/fixtures/elevenlabs/mixed-happy-path.jsonl?raw';
import namesScript from '../../../tests/fixtures/elevenlabs/meet-names.jsonl?raw';
import limitScript from '../../../tests/fixtures/elevenlabs/time-limit.jsonl?raw';

/** First connection's script per scenario; without a scenario, the mixed tab + mic happy path. */
const FIRST: Record<string, string> = {
  drop: dropScript,
  'time-limit': limitScript,
  'auth-error': authScript,
  /** 002 tests/e2e/meet.spec.ts: one remote line, then ten seconds later one of the user's. */
  names: namesScript,
};

export function e2eProvider(scenario: string): TranscriptionProvider {
  const first = parseFixture(FIRST[scenario] ?? mixedScript);
  const happy = parseFixture(happyScript);
  return new FakeTranscriptionProvider((i) => (i === 0 ? first : happy));
}
