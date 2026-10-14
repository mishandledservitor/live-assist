// The transcript file (007, design decision 48; 004 FR-017–FR-019): name and body. Platform-free so 004's inbox
// export writes the same file as 007's download.
import { displayLabel } from '../transcript/labels';
import type { Meeting, TranscriptSegment } from '../transcript/model';
import { sortSegments } from '../transcript/ordering';
import { meetingBaseName } from './download-names';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `mm:ss` since meeting start, minutes counting past 59 (`75:12`), as the inbox files do (004 FR-019). */
export function exportTimestamp(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  return `${pad2(Math.floor(totalSeconds / 60))}:${pad2(totalSeconds % 60)}`;
}

/**
 * `Meeting — DD-MM-YYYY at HHhMM.txt` from the local date and time the meeting started (004 FR-017): the inbox name.
 * A panel download is named by src/core/export/download-names.ts (013 decision 70).
 */
export function transcriptFileName(startedAt: number): string {
  return `${meetingBaseName(startedAt)}.txt`;
}

export interface TranscriptFile {
  name: string;
  body: string;
}

/** One line per line: runs of whitespace, line breaks included, become one space (004 edge case). */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Written lines are finished and settled: in-progress text is never a segment, and a line whose name is still pending
 * (design decision 37) would otherwise be written as "Others" and then named in the panel (007 FR-006).
 */
const writable = (segment: TranscriptSegment) => segment.labelPending !== true && oneLine(segment.text) !== '';

/** `[mm:ss] Speaker: text` for each settled line, in time order, with the label the panel shows now. */
export function transcriptFileLines(
  meeting: Pick<Meeting, 'speakerRenames'>,
  segments: readonly TranscriptSegment[],
): string[] {
  return sortSegments(segments.filter(writable)).map(
    (s) => `[${exportTimestamp(s.startMs)}] ${oneLine(displayLabel(s, meeting).text)}: ${oneLine(s.text)}`,
  );
}

/** Whether the file would have a line, without building it (the panel asks on every render). */
export function hasTranscriptFileLines(segments: readonly TranscriptSegment[]): boolean {
  return segments.some(writable);
}

/** The file: no header, one blank line between lines, one newline at the end; '' when there is nothing to write. */
export function transcriptFile(
  meeting: Pick<Meeting, 'startedAt' | 'speakerRenames'>,
  segments: readonly TranscriptSegment[],
): TranscriptFile {
  const lines = transcriptFileLines(meeting, segments);
  return { name: transcriptFileName(meeting.startedAt), body: lines.length === 0 ? '' : `${lines.join('\n\n')}\n` };
}
