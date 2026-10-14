// Download transcript (007, design decision 48): saves a meeting's transcript: on the main view the meeting shown,
// running or stopped; from 012 also a Transcripts row and a past transcript (FR-014). From 013 the one file a press
// saves also holds Meet's captions when the meeting has them (a zip of both), or is the captions alone (decisions 67,
// 68, 75). Absent until there is something to save; Chrome's own download indicator is the feedback.
import type { MeetingDownload } from '../../../core/export/meeting-download';
import { saveBlob, saveDownload, type SaveBlob } from '../save-file';

export interface DownloadTranscriptProps {
  /** Whether there is anything to save; the button is absent otherwise. */
  available: boolean;
  /** Builds the download on press only; null or a rejection saves nothing. */
  load(): MeetingDownload | null | Promise<MeetingDownload | null>;
  /** Accessible name when it differs from the visible `Download transcript` (a list row). */
  accessibleName?: string;
  /** Injected in tests; the panel saves through a browser download. */
  save?: SaveBlob;
}

const isPromise = <T,>(value: T | Promise<T>): value is Promise<T> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

export function DownloadTranscript(props: DownloadTranscriptProps) {
  const { available, accessibleName, save = saveBlob } = props;
  if (!available) return null;
  // The download is built on press only, so a long transcript is not formatted on every render (007 research R5). One
  // already in hand is saved in the same task as the press; a load that fails or finds nothing saves nothing, and
  // nothing is shown for it (012 FR-016, 013 FR-020).
  const onClick = () => {
    const saveIt = (download: MeetingDownload | null) => {
      if (download) saveDownload(download, save);
    };
    const loaded = props.load();
    if (isPromise(loaded)) void loaded.then(saveIt, () => undefined);
    else saveIt(loaded);
  };
  return (
    <button type="button" className="secondary" aria-label={accessibleName} onClick={onClick}>
      Download transcript
    </button>
  );
}
