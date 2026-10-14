// One stored meeting on the Transcripts screen (012 FR-011, FR-012, FR-014, FR-017; contracts/transcripts-ui.md "one
// meeting"): its actions in a row that stays under the title, then every line, read from the top. Read-only: the
// Transcript gets no edit handlers, no in-progress lines and no footer, so labels are text and nothing of the meeting
// can change here except that it can be deleted. Download saves what the meeting's row saves (013 FR-019): the screen
// reads the meeting again at the press, so the kept captions are in hand for that one file and nowhere else.
import { useMemo } from 'react';
import type { MeetingDownload } from '../../../core/export/meeting-download';
import { hasTranscriptFileLines } from '../../../core/export/transcript-file';
import type { MeetingState } from '../../../core/history/meeting-summary';
import type { Meeting, TranscriptSegment } from '../../../core/transcript/model';
import { DeleteTranscript } from './DeleteTranscript';
import { DownloadTranscript } from './DownloadTranscript';
import { deletePrompt } from './MeetingRow';
import { Transcript } from './Transcript';
import type { SaveBlob } from '../save-file';

export interface PastTranscriptProps {
  meeting: Meeting;
  segments: readonly TranscriptSegment[];
  /** `interrupted` is said beside the actions: the transcript may stop mid-meeting (FR-007). */
  state: MeetingState;
  /** What a press saves for this meeting, read from storage on press; null when it is gone. */
  load: () => Promise<MeetingDownload | null>;
  /** Injected in tests; the panel saves through a browser download. */
  save?: SaveBlob | undefined;
  /** Real deletion of this meeting. */
  remove: () => Promise<void>;
  /** The meeting was deleted. */
  onDeleted: () => void;
  /** The delete confirmation, held by the screen so Escape anywhere on it closes the confirmation first. */
  confirming: boolean;
  onConfirmingChange: (open: boolean) => void;
}

const NO_PARTIALS: never[] = [];

export function PastTranscript({
  meeting,
  segments,
  state,
  load,
  save,
  remove,
  onDeleted,
  confirming,
  onConfirmingChange,
}: PastTranscriptProps) {
  const hasFileLines = useMemo(() => hasTranscriptFileLines(segments), [segments]);
  return (
    <div className="past-transcript">
      <div className="past-actions transcript-actions">
        {state === 'interrupted' && <span className="meeting-marker">Interrupted</span>}
        {/* 013 FR-018: also for a meeting with kept captions and no line to write. */}
        <DownloadTranscript
          available={hasFileLines || meeting.hasCaptions === true}
          load={load}
          {...(save ? { save } : {})}
        />
        <DeleteTranscript
          remove={remove}
          onDeleted={onDeleted}
          prompt={deletePrompt(meeting)}
          confirming={confirming}
          onConfirmingChange={onConfirmingChange}
        />
      </div>
      {segments.length === 0 ? (
        <p>Nothing was transcribed.</p>
      ) : (
        <Transcript segments={segments} partials={NO_PARTIALS} meeting={meeting} follow={false} />
      )}
    </div>
  );
}
