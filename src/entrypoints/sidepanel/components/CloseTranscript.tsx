// Close a stopped meeting's transcript (014, design decisions 91 and 92): the main view goes clean, as after a delete
// (012 decision 64), and the meeting stays on the Transcripts screen. Nothing is lost, so there is no confirmation. A
// close that cannot be remembered says so (014 FR-009) and the next press tries again.
import { useState } from 'react';

export interface CloseTranscriptProps {
  /** Clears the main view; rejects when it cannot be remembered. */
  close(): Promise<void>;
  /** The main view was cleared. */
  onClosed(): void;
}

export function CloseTranscript(props: CloseTranscriptProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const press = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await props.close();
    } catch {
      setFailed(true);
      return;
    } finally {
      setBusy(false);
    }
    props.onClosed();
  };

  return (
    <>
      <button type="button" className="secondary" onClick={() => void press()} disabled={busy}>
        Close transcript
      </button>
      {failed && <p role="alert">Couldn&apos;t close this transcript. Try again.</p>}
    </>
  );
}
