// The recorded meetings in tests/fixtures/chat/meetings/ (003 T003), in the stored shapes of src/core/transcript.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';

export interface ChatMeetingFixture {
  meeting: Meeting;
  segments: TranscriptSegment[];
  /** relabel.json only: the same meeting after a late caption name and a rename-everywhere. */
  after?: { meeting: Meeting; segments: TranscriptSegment[] };
}

const DIR = join(import.meta.dirname, '../fixtures/chat/meetings');

export function readChatMeeting(
  name: 'standup-en' | 'relabel' | 'long-1h20' | 'empty' | 'term-mention',
): ChatMeetingFixture {
  return JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as ChatMeetingFixture;
}
