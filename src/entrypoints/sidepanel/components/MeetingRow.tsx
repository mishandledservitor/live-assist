// One stored meeting in the Transcripts list (012 FR-006 to FR-008, FR-014, FR-017, FR-028; contracts/transcripts-ui.md
// "A row"): its title when it has one (design decision 76), when it started, how long it ran, who spoke, whether it is
// running or was cut off, and its Download and Delete. The title and the date line are the control that opens it. Names and Download come from the meeting's summary, which may
// arrive after the row is drawn (FR-009). The running meeting's row only leads back to the main view: it has no
// actions (FR-008). A meeting with kept captions (013) has Download whatever its lines, and its confirmation names them.
import { memo, useId } from 'react';
import type { MeetingDownload } from '../../../core/export/meeting-download';
import {
  formatDuration,
  formatMeetingDate,
  formatMeetingTime,
  meetingDurationMs,
  rowNames,
  type MeetingState,
} from '../../../core/history/meeting-summary';
import { displayTitle } from '../../../core/history/meeting-title';
import type { Meeting, MeetingSummary } from '../../../core/transcript/model';
import { DeleteTranscript } from './DeleteTranscript';
import { DownloadTranscript } from './DownloadTranscript';
import type { SaveBlob } from '../save-file';

export interface MeetingRowProps {
  meeting: Meeting;
  state: MeetingState;
  /** The row's details from the meeting's lines; null until they are worked out. */
  summary: MeetingSummary | null;
  /** The opening control was pressed. */
  onOpen: (id: string) => void;
  /** What a press saves for the meeting, read from storage on press; null when it is gone. */
  load: (id: string) => Promise<MeetingDownload | null>;
  /** Injected in tests; the panel saves through a browser download. */
  save?: SaveBlob | undefined;
  /** Real deletion of the meeting. */
  remove: (id: string) => Promise<void>;
  /** The meeting was deleted. */
  onDeleted: (id: string) => void;
  /** Whether this row's delete confirmation is the open one; the list allows one at a time (FR-017). */
  confirming: boolean;
  onConfirmingChange: (id: string, open: boolean) => void;
}

const MARKERS: Record<MeetingState, string | null> = {
  'in-progress': 'In progress',
  interrupted: 'Interrupted',
  stopped: null,
};

/** `{date}, {time}`: how a meeting is named in titles, accessible names and the delete confirmation. */
export function meetingTitle(meeting: Pick<Meeting, 'startedAt'>): string {
  return `${formatMeetingDate(meeting.startedAt)}, ${formatMeetingTime(meeting.startedAt)}`;
}

/**
 * The Transcripts screen's delete confirmation (FR-017): it names the meeting because several are in view, and the
 * questions, answers and notes because this screen does not show them. For a meeting with kept captions it names those
 * too (013 FR-022).
 */
export function deletePrompt(meeting: Pick<Meeting, 'startedAt' | 'hasCaptions'>): string {
  const title = meetingTitle(meeting);
  return meeting.hasCaptions === true
    ? `Delete the transcript of ${title} permanently? Its questions, answers, notes and Meet's captions are deleted too. It cannot be recovered.`
    : `Delete the transcript of ${title} permanently? Its questions, answers and notes are deleted too. It cannot be recovered.`;
}

/**
 * A meeting's title line (FR-028, FR-031): the meeting's own words, as text. One line, cut by the stylesheet when it is
 * too long, with all of it on hover. Null when the meeting has no title: nothing stands in for it.
 */
export function MeetingTitleLine({ meeting }: { meeting: Pick<Meeting, 'source'> }) {
  const shown = displayTitle(meeting.source);
  return shown === null ? null : (
    <span className="meeting-title" title={shown}>
      {shown}
    </span>
  );
}

/** `Jane, Alex +2 more`; null when no confirmed name is in the meeting. */
function namesText(summary: MeetingSummary): string | null {
  const { shown, more } = rowNames(summary.names);
  if (shown.length === 0) return null;
  return more > 0 ? `${shown.join(', ')} +${more} more` : shown.join(', ');
}

// Memoised: a list of hundreds of rows re-renders only the row whose details just arrived. The callbacks take the
// meeting's id so the list can pass the same functions to every row.
export const MeetingRow = memo(function MeetingRow({
  meeting,
  state,
  summary,
  onOpen,
  load,
  save,
  remove,
  onDeleted,
  confirming,
  onConfirmingChange,
}: MeetingRowProps) {
  const id = useId();
  const title = meetingTitle(meeting);
  const shown = displayTitle(meeting.source);
  const opens = shown === null ? title : `${shown}, ${title}`;
  const durationMs = meetingDurationMs(meeting, state, summary);
  const when = [formatMeetingDate(meeting.startedAt), formatMeetingTime(meeting.startedAt)];
  if (durationMs !== null) when.push(formatDuration(durationMs));
  const marker = MARKERS[state];
  const running = state === 'in-progress';
  // The running meeting's lines are still arriving; who spoke is on the main view.
  const details = running ? null : summary;
  const names = details && namesText(details);
  const empty = details !== null && details.lastLineEndMs === null;
  const describedBy = [marker && `${id}-marker`, (names !== null || empty) && `${id}-names`].filter(Boolean).join(' ');

  return (
    <li className="meeting-row" data-meeting-id={meeting.id} data-state={state}>
      <button
        type="button"
        className="meeting-open"
        aria-label={`Open transcript of ${opens}`}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        onClick={() => onOpen(meeting.id)}
      >
        <MeetingTitleLine meeting={meeting} />
        <span className="meeting-when">{when.join(' · ')}</span>
      </button>
      {marker && (
        <span className="meeting-marker" id={`${id}-marker`}>
          {marker}
        </span>
      )}
      {empty ? (
        <span className="meeting-empty" id={`${id}-names`}>
          Nothing was transcribed.
        </span>
      ) : (
        names && (
          <span className="meeting-names" id={`${id}-names`}>
            {names}
          </span>
        )
      )}
      {!running && (
        <div className="meeting-actions transcript-actions">
          {/* Absent until the details say a file would have a line (007 FR-002; unknown counts as none), unless the
              meeting has kept captions, which its own record says (013 FR-018). */}
          <DownloadTranscript
            available={(details !== null && details.fileLines > 0) || meeting.hasCaptions === true}
            load={() => load(meeting.id)}
            accessibleName={`Download transcript of ${title}`}
            {...(save ? { save } : {})}
          />
          <DeleteTranscript
            remove={() => remove(meeting.id)}
            onDeleted={() => onDeleted(meeting.id)}
            prompt={deletePrompt(meeting)}
            accessibleName={`Delete transcript of ${title}`}
            confirming={confirming}
            onConfirmingChange={(open) => onConfirmingChange(meeting.id, open)}
          />
        </div>
      )}
    </li>
  );
});
