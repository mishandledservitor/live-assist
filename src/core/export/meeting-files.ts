// The files a meeting can be downloaded as (012 FR-014, research R7; 013 FR-012–FR-018). Every Download in the panel
// goes through here and through `meetingDownload`, so the main view, a Transcripts row and a past transcript cannot
// differ. A meeting has up to two files: live-assist's transcript, and the meeting platform's own captions as kept.
import type { StoredCaptionTurn } from '../captions/model';
import type { Meeting, TranscriptSegment } from '../transcript/model';
import { captionsFile } from './captions-file';
import { transcriptDownloadName } from './download-names';
import { transcriptFile } from './transcript-file';

export interface MeetingFile {
  kind: 'transcript' | 'captions';
  name: string;
  body: string;
}

/**
 * The meeting, its lines and its kept caption turns, nothing else: questions, answers and notes have no way into a file
 * (constitution II).
 */
export interface MeetingFileSource {
  meeting: Pick<Meeting, 'startedAt' | 'userName' | 'speakerRenames'>;
  segments: readonly TranscriptSegment[];
  /** Absent or empty = the meeting has none. */
  captionTurns?: readonly StoredCaptionTurn[];
}

/**
 * Every file this meeting can be downloaded as: the transcript, then the captions, each only when it has a line. The
 * transcript's body is the inbox file's (007); its name is the panel download's (013 decision 70).
 */
export function meetingFiles(source: MeetingFileSource): MeetingFile[] {
  const files: MeetingFile[] = [];
  const transcript = transcriptFile(source.meeting, source.segments);
  if (transcript.body !== '')
    files.push({
      kind: 'transcript',
      name: transcriptDownloadName(source.meeting.startedAt),
      body: transcript.body,
    });
  const captions = captionsFile(source.meeting, source.captionTurns ?? []);
  if (captions.body !== '') files.push({ kind: 'captions', name: captions.name, body: captions.body });
  return files;
}
