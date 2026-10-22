// Download transcript (007, design decision 48): saves a meeting's transcript: on the main view the meeting shown,
// running or stopped; from 012 also a Transcripts row and a past transcript (FR-014). From 013 the one file a press
// saves also holds Meet's captions when the meeting has them (a zip of both), or is the captions alone (decisions 67,
// 68, 75); from 016, once the meeting no longer runs, a meeting with both is saved as one merged transcript (decision
// 93). What a press saves is its caller's `load`; the press itself is `DownloadButton`'s.
import type { MeetingDownload } from '../../../core/export/meeting-download';
import type { SaveBlob } from '../save-file';
import { DownloadButton } from './DownloadButton';

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

export function DownloadTranscript(props: DownloadTranscriptProps) {
  return <DownloadButton {...props} label="Download transcript" />;
}
