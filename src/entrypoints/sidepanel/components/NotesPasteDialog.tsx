// Pasting notes (008 contracts/notes-ui.md "Paste dialog"): one box, Save and Cancel. Modal: focus starts in the box,
// stays inside the dialog, and Escape cancels.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { NOTES_STRINGS } from '../../../core/chat/notes-messages';

export function NotesPasteDialog({
  initial,
  busy,
  error,
  onSave,
  onCancel,
}: {
  initial: string;
  busy: boolean;
  /** The text of a failed save, shown in the dialog (which stays open). */
  error: string | null;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const box = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => box.current?.focus(), []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('textarea, button:not([disabled])') ?? [])];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="notes-dialog-backdrop">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={NOTES_STRINGS.dialog}
        className="notes-dialog"
        onKeyDown={onKeyDown}
      >
        <textarea ref={box} aria-label={NOTES_STRINGS.dialog} value={text} onChange={(e) => setText(e.target.value)} />
        {error !== null && (
          <p role="alert" className="notes-error">
            {error}
          </p>
        )}
        <div className="notes-dialog-actions">
          <button type="button" className="primary" disabled={busy || text.trim() === ''} onClick={() => onSave(text)}>
            {NOTES_STRINGS.save}
          </button>
          <button type="button" onClick={onCancel}>
            {NOTES_STRINGS.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
