// The captions file (013 FR-014, FR-015, decision 66): the meeting platform's own captions as kept, one line per turn,
// with the names the transcript shows. It is the platform's transcription, saved under a name that says so; it is
// never merged with live-assist's transcript and carries no header, footer or gap marker. Platform-free.
import type { StoredCaptionTurn } from '../captions/model';
import { normaliseName } from '../transcript/labels';
import type { Meeting } from '../transcript/model';
import { captionsFileName } from './download-names';
import { exportTimestamp } from './transcript-file';

/** One line per turn: runs of whitespace, line breaks included, become one space. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The name a caption turn is written under (research R8): what the transcript shows for a line attributed to that
 * caption name, without the two things that belong to a single line (its override and the pending placeholder). The
 * platform's label for the user reads the user's name; any other name reads its rename, if the meeting has one. Never
 * "Others": a caption turn always has the name the platform gave it.
 */
export function captionSpeaker(
  turn: Pick<StoredCaptionTurn, 'speakerName' | 'self'>,
  meeting: Pick<Meeting, 'userName' | 'speakerRenames'>,
): string {
  if (turn.self) return meeting.speakerRenames.self?.name ?? (oneLine(meeting.userName) || turn.speakerName);
  return meeting.speakerRenames[`caption:${normaliseName(turn.speakerName)}`]?.name ?? turn.speakerName;
}

/** `[mm:ss] Speaker: text` for each turn that has text, by start time, then in the order the turns first appeared. */
export function captionsFileLines(
  meeting: Pick<Meeting, 'userName' | 'speakerRenames'>,
  turns: readonly StoredCaptionTurn[],
): string[] {
  return turns
    .filter((t) => oneLine(t.text) !== '')
    .sort((a, b) => a.startMs - b.startMs || a.seq - b.seq)
    .map((t) => `[${exportTimestamp(t.startMs)}] ${oneLine(captionSpeaker(t, meeting))}: ${oneLine(t.text)}`);
}

/** The file: no header, one blank line between lines, one newline at the end; '' when there is no turn to write. */
export function captionsFile(
  meeting: Pick<Meeting, 'startedAt' | 'userName' | 'speakerRenames'>,
  turns: readonly StoredCaptionTurn[],
): { name: string; body: string } {
  const lines = captionsFileLines(meeting, turns);
  return { name: captionsFileName(meeting.startedAt), body: lines.length === 0 ? '' : `${lines.join('\n\n')}\n` };
}
