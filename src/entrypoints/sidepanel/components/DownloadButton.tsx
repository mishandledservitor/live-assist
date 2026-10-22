// The press behind every download button (007, 012, 013; 016 research R6): the file is built on press only, one press
// saves one file, and a load that fails or finds nothing saves nothing and shows nothing (012 FR-016, 013 FR-020).
// `Download transcript` and `Download originals` (016, decision 97) are this button with their own label, so the two
// cannot differ in how they save. Absent when there is nothing to save; Chrome's download indicator is the feedback.
import type { MeetingDownload } from '../../../core/export/meeting-download';
import { saveBlob, saveDownload, type SaveBlob } from '../save-file';

export interface DownloadButtonProps {
  /** The visible text, given by the component that names the action. */
  label: string;
  /** Whether there is anything to save; the button is absent otherwise. */
  available: boolean;
  /** Builds the download on press only; null or a rejection saves nothing. */
  load(): MeetingDownload | null | Promise<MeetingDownload | null>;
  /** Accessible name when it differs from the visible label (a list row). */
  accessibleName?: string | undefined;
  /** Injected in tests; the panel saves through a browser download. */
  save?: SaveBlob | undefined;
}

const isPromise = <T,>(value: T | Promise<T>): value is Promise<T> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

export function DownloadButton(props: DownloadButtonProps) {
  const { label, available, accessibleName, save = saveBlob } = props;
  if (!available) return null;
  // The download is built on press only, so a long transcript is not formatted on every render (007 research R5). One
  // already in hand is saved in the same task as the press.
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
      {label}
    </button>
  );
}
