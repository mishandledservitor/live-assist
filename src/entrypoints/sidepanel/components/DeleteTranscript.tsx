// Delete a stopped meeting's transcript (001 FR-029, constitution I: deletion is real), shown after its last line on
// the main view (006 FR-013) and, from 012, in a Transcripts row and with a past transcript (FR-017). It asks first;
// Cancel and Escape return focus to the button (T092); a failed deletion says so and leaves the confirmation open
// (012 FR-021).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface DeleteTranscriptProps {
  /** Real deletion of the meeting this button stands for. */
  remove(): Promise<void>;
  /** The transcript was deleted. */
  onDeleted(): void;
  /** Default: K6's text. */
  prompt?: string;
  /** Accessible name when it differs from the visible `Delete transcript` (a list row). */
  accessibleName?: string;
  /** Controlled confirmation, for a list that allows one at a time; uncontrolled when absent. */
  confirming?: boolean;
  onConfirmingChange?(open: boolean): void;
}

const DEFAULT_PROMPT = 'Delete this transcript permanently? It cannot be recovered.';
/** 013 (decision 74): the main view's question for a meeting with kept captions, which are nowhere on screen. */
export const CAPTIONS_PROMPT =
  "Delete this transcript permanently? Meet's captions of this meeting are deleted too. It cannot be recovered.";

export function DeleteTranscript(props: DeleteTranscriptProps) {
  // The callbacks are called on `props` (they are declared as methods in contracts/internal-api.md).
  const { prompt = DEFAULT_PROMPT, accessibleName, confirming } = props;
  const [ownConfirm, setOwnConfirm] = useState(false);
  const confirm = confirming ?? ownConfirm;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  // Set by Cancel and Escape only: a confirmation closed from outside (another row opened its own) leaves focus alone.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current || confirm) return;
    refocus.current = false;
    button.current?.focus();
  });
  // The confirming button was disabled while the deletion ran; trying again is one key press away.
  useEffect(() => {
    if (failed) confirmButton.current?.focus();
  }, [failed]);

  const setConfirm = (open: boolean) => {
    setOwnConfirm(open);
    props.onConfirmingChange?.(open);
  };

  const cancel = () => {
    setFailed(false);
    refocus.current = true;
    setConfirm(false);
  };

  const confirmed = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await props.remove();
    } catch {
      setFailed(true);
      return;
    } finally {
      setBusy(false);
    }
    setConfirm(false);
    props.onDeleted();
  };

  // Escape closes the confirmation only; the screen around it (Back on Escape) does not see the key.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (!busy) cancel();
  };

  if (!confirm)
    return (
      <button
        type="button"
        className="secondary"
        ref={button}
        aria-label={accessibleName}
        onClick={() => setConfirm(true)}
        disabled={busy}
      >
        Delete transcript
      </button>
    );
  return (
    <div className="notice" role="group" aria-label="Confirm delete" onKeyDown={onKeyDown}>
      <p>{prompt}</p>
      {failed && <p role="alert">Couldn&apos;t delete this transcript. Try again.</p>}
      <button type="button" ref={confirmButton} onClick={() => void confirmed()} disabled={busy} autoFocus>
        Delete permanently
      </button>{' '}
      <button type="button" className="secondary" onClick={cancel} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}
