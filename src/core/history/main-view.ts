// The clean main view (012 FR-020, FR-026, design decision 64; research R5). Applied to the most recent stored meeting
// only: the running meeting comes from the live port and never passes through here.
import type { Meeting } from '../transcript/model';

/**
 * `clearedAt` is the moment the main view was last cleared by deleting the meeting it showed, or null. A meeting started
 * after that moment shows, so the clean state ends with the next Start and nothing has to reset it.
 */
export function showsOnMain(meeting: Pick<Meeting, 'startedAt'>, clearedAt: number | null): boolean {
  return clearedAt === null || meeting.startedAt > clearedAt;
}
