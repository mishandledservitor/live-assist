// What one press of `Download transcript` saves (013 FR-012, FR-017, FR-018; decisions 67, 68, 75): nothing, the one
// file the meeting has, or a zip of both. One file per press, so the browser never asks about multiple downloads.
// Platform-free and pure; saving is the panel's (src/entrypoints/sidepanel/save-file.ts).
import { downloadZipName } from './download-names';
import { meetingFiles, type MeetingFileSource } from './meeting-files';
import { zipStored } from './zip';

export interface MeetingDownload {
  name: string;
  type: 'text/plain;charset=utf-8' | 'application/zip';
  /** The body of the one file, or the bytes of the zip. */
  data: string | Uint8Array<ArrayBuffer>;
}

/**
 * Null when the meeting has neither a transcript line nor a caption turn. `at` stamps the entries of a zip (spec P5:
 * the moment of the download).
 */
export function meetingDownload(source: MeetingFileSource, at: Date): MeetingDownload | null {
  const files = meetingFiles(source);
  const [only] = files;
  if (only === undefined) return null;
  if (files.length === 1) return { name: only.name, type: 'text/plain;charset=utf-8', data: only.body };
  // UTF-8 without a byte-order mark, in `meetingFiles` order.
  const encoder = new TextEncoder();
  return {
    name: downloadZipName(source.meeting.startedAt),
    type: 'application/zip',
    data: zipStored(
      files.map((file) => ({ name: file.name, data: encoder.encode(file.body) })),
      at,
    ),
  };
}
