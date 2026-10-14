// What a Transcripts row shows about a stored meeting (012 data-model.md "Meeting.summary", "MeetingState", "Row";
// research R2, R3). Pure: no clock, local time through Date getters as 007's transcriptFileName.
import { transcriptFileLines } from '../export/transcript-file';
import { displayLabel } from '../transcript/labels';
import type { Meeting, MeetingSummary, TranscriptSegment } from '../transcript/model';
import { sortSegments } from '../transcript/ordering';

/** Raised when the rules below change, so every stored summary is worked out again. */
export const SUMMARY_VERSION = 1;

export type MeetingState = 'in-progress' | 'stopped' | 'interrupted';

/**
 * The parts of a row that need every line. Names are the confirmed labels the panel shows now (renames and single-line
 * corrections applied) in order of first appearance; "Others" is a fallback and is never one (constitution II).
 */
export function summariseMeeting(
  meeting: Pick<Meeting, 'startedAt' | 'speakerRenames'>,
  segments: readonly TranscriptSegment[],
): MeetingSummary {
  const names = new Set<string>();
  let lastLineEndMs: number | null = null;
  for (const segment of sortSegments(segments)) {
    const label = displayLabel(segment, meeting);
    if (label.confirmed) names.add(label.text);
    if (lastLineEndMs === null || segment.endMs > lastLineEndMs) lastLineEndMs = segment.endMs;
  }
  return {
    v: SUMMARY_VERSION,
    names: [...names],
    fileLines: transcriptFileLines(meeting, segments).length,
    lastLineEndMs,
  };
}

/** The stored summary when it is current, else null. */
export function currentSummary(meeting: Pick<Meeting, 'summary'>): MeetingSummary | null {
  const summary = meeting.summary;
  return summary?.v === SUMMARY_VERSION ? summary : null;
}

/**
 * `runningId` is the meeting the live port reports as running. An open record that is not that meeting was cut off:
 * its record is only closed at the next Start (spec Clarifications D1).
 */
export function meetingState(
  meeting: Pick<Meeting, 'id' | 'endedAt' | 'endReason'>,
  runningId: string | null,
): MeetingState {
  if (meeting.id === runningId) return 'in-progress';
  if (meeting.endReason === 'crashed' || meeting.endedAt === null) return 'interrupted';
  return 'stopped';
}

/**
 * null where no duration is shown: the running meeting (out of date as soon as it is drawn), and an interrupted meeting
 * with no line or whose summary is not ready. An interrupted meeting is measured to its last line, never to the time
 * its record was closed afterwards (FR-007).
 */
export function meetingDurationMs(
  meeting: Pick<Meeting, 'startedAt' | 'endedAt'>,
  state: MeetingState,
  summary: MeetingSummary | null,
): number | null {
  if (state === 'in-progress') return null;
  if (state === 'interrupted') return summary?.lastLineEndMs ?? null;
  return meeting.endedAt === null ? null : meeting.endedAt - meeting.startedAt;
}

/** `under 1 min`, `45 min`, `2 h`, `1 h 15 min`; minutes floored, a negative length reads as zero. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMinutes < 1) return 'under 1 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `7 Oct 2026`: the local date transcription started, day first as in the file name. */
export function formatMeetingDate(startedAt: number): string {
  const d = new Date(startedAt);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `14:30`: the local 24-hour time transcription started. */
export function formatMeetingTime(startedAt: number): string {
  const d = new Date(startedAt);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** The names a row shows and how many it leaves out (`+{more} more`). */
export function rowNames(names: readonly string[], max = 4): { shown: string[]; more: number } {
  return { shown: names.slice(0, max), more: Math.max(0, names.length - max) };
}
