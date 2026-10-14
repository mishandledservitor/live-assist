// Saves a file to the browser's downloads (007 research R1): a local blob and an anchor download, so no `downloads`
// permission and nothing leaves the machine. Chrome numbers the name itself if the file already exists, and honours
// the user's "Ask where to save" setting. One press saves one download (013 FR-012), a text file or a zip, so Chrome's
// multiple-downloads prompt never appears.
import type { MeetingDownload } from '../../core/export/meeting-download';

/** Long enough for Chrome to start reading the blob; the URL is only freed afterwards. */
const REVOKE_AFTER_MS = 10_000;

/** How a file reaches Downloads; tests inject one that records instead. */
export type SaveBlob = (name: string, data: BlobPart, type: string) => void;

export const saveBlob: SaveBlob = (name, data, type) => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
};

/** Saves what one press of `Download transcript` built. */
export function saveDownload(download: MeetingDownload, save: SaveBlob = saveBlob): void {
  save(download.name, download.data, download.type);
}
