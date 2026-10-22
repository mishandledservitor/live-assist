// Download originals (016, design decision 97; copy review K47): on the Transcripts screen's single-meeting view of a
// meeting with both a transcript line and kept captions, saves the two files the merged transcript is made from, as
// 013 saves them (a zip of live-assist's transcript and Meet's captions). Nowhere else.
import type { MeetingDownload } from '../../../core/export/meeting-download';
import type { SaveBlob } from '../save-file';
import { DownloadButton } from './DownloadButton';

export interface DownloadOriginalsProps {
  available: boolean;
  /** 013's download for the meeting, read on press; null or a rejection saves nothing. */
  load(): MeetingDownload | null | Promise<MeetingDownload | null>;
  save?: SaveBlob | undefined;
}

export function DownloadOriginals(props: DownloadOriginalsProps) {
  return <DownloadButton {...props} label="Download originals" />;
}
