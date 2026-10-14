// Test entry point for replaying recorded ElevenLabs WebSocket sequences on Vitest fake timers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseFixture, type FixtureLine } from '@/providers/transcription/fixture';

export {
  REFUSE,
  ReplaySocket as FakeSocket,
  ReplaySocketServer as FakeSocketServer,
  type Script,
} from '@/providers/transcription/fake/replay-socket';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/elevenlabs/', import.meta.url));

export function loadFixture(name: string): FixtureLine[] {
  return parseFixture(readFileSync(`${FIXTURE_DIR}${name}.jsonl`, 'utf8'));
}
