// Correct a line's text (020 US1, research R4): an inline form in the line. Enter or Save stores the text, Escape or
// Cancel closes, Restore original (only on a corrected line) goes back to what was transcribed. The text is one line
// of 1–2,000 characters after line breaks and white-space runs become one space (FR-007). A refused save keeps the
// editor open with the typed text (FR-015).
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { MAX_LINE_TEXT_LENGTH } from '../../../core/messaging/protocol';
import { normaliseLineText } from '../../../core/transcript/labels';

export interface TextSelection {
  start: number;
  end: number;
}

export interface TextEditorProps {
  /** The text the line shows now. */
  current: string;
  /** The range to select when the editor opens; null selects all the text. */
  selection: TextSelection | null;
  /** The line has a correction, so it can be restored. */
  corrected: boolean;
  /** Stores the text, or null to restore the original; rejects when nothing could take the write. */
  onSave: (text: string | null) => Promise<void>;
  onClose: () => void;
}

const EMPTY_ERROR = "Enter the line's text.";
const LONG_ERROR = 'Keep the line under 2,000 characters.';
const SAVE_ERROR = "Couldn't save this line. Try again.";

export function TextEditor(props: TextEditorProps) {
  const [value, setValue] = useState(props.current);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const [selection] = useState(props.selection);

  // Once, on opening: the typed text and caret then belong to the field, whatever the line does meanwhile (FR-010).
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus();
    const { start, end } = selection ?? { start: 0, end: el.value.length };
    el.setSelectionRange(start, end);
  }, [selection]);

  const save = async (text: string | null) => {
    if (saving.current) return;
    saving.current = true;
    try {
      await props.onSave(text);
    } catch {
      saving.current = false;
      setError(SAVE_ERROR);
      return;
    }
    props.onClose();
  };

  const submit = () => {
    const text = normaliseLineText(value);
    if (text === '') return setError(EMPTY_ERROR);
    if (text.length > MAX_LINE_TEXT_LENGTH) return setError(LONG_ERROR);
    void save(text);
  };

  return (
    <div
      role="group"
      aria-label="Edit line text"
      className="text-editor"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          props.onClose();
        }
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={field}
          aria-label="Line text"
          rows={1}
          value={value}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="text-editor-actions">
          <button type="submit">Save</button>{' '}
          {props.corrected && (
            <button type="button" className="secondary" onClick={() => void save(null)}>
              Restore original
            </button>
          )}{' '}
          <button type="button" className="secondary" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
