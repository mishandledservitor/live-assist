// What the Transcripts screen (012) needs from storage, behind one interface so the screen is tested with a fake. The
// side panel reads IndexedDB directly, as it already does for the stored meeting it shows: no message, port or
// permission is involved, and nothing leaves the machine (FR-023).
import type { StoredCaptionTurn } from '../../core/captions/model';
import { summariseMeeting } from '../../core/history/meeting-summary';
import type { Meeting, MeetingSummary, TranscriptSegment } from '../../core/transcript/model';
import type { MeetingRepo } from '../../storage/meeting-repo';

export interface TranscriptsApi {
  /** Newest first. Rejects when storage cannot be read. */
  list(): Promise<Meeting[]>;
  /** The meeting's row details, computed and cached; null when the meeting is gone. */
  summarise(id: string): Promise<MeetingSummary | null>;
  /**
   * The meeting and every line, for reading and for downloading; null when the meeting is gone. From 013 also its kept
   * caption turns, for a download only: [] without reading the store when the meeting has none, and a rejection when
   * they cannot be read.
   */
  open(id: string): Promise<OpenedMeeting | null>;
  /** Real deletion (MeetingRepo.deleteMeeting). */
  remove(id: string): Promise<void>;
}

export interface OpenedMeeting {
  meeting: Meeting;
  segments: TranscriptSegment[];
  captionTurns: StoredCaptionTurn[];
}

export interface TranscriptsApiDeps {
  repo(): Promise<
    Pick<
      MeetingRepo,
      'listMeetings' | 'summarise' | 'getMeeting' | 'listSegments' | 'listCaptionTurns' | 'deleteMeeting'
    >
  >;
}

export function createTranscriptsApi(deps: TranscriptsApiDeps): TranscriptsApi {
  return {
    async list() {
      return (await deps.repo()).listMeetings();
    },
    async summarise(id) {
      return (await deps.repo()).summarise(id, summariseMeeting);
    },
    async open(id) {
      const repo = await deps.repo();
      const meeting = await repo.getMeeting(id);
      if (!meeting) return null;
      const segments = await repo.listSegments(id);
      const captionTurns = meeting.hasCaptions === true ? await repo.listCaptionTurns(id) : [];
      return { meeting, segments, captionTurns };
    },
    async remove(id) {
      await (await deps.repo()).deleteMeeting(id);
    },
  };
}
