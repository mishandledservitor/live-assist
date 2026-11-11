// Fix a wrong or missing name (002 US4, research R10): a small dialog opened from a transcript label. "Rename
// everywhere" renames the speaker on all its lines, past and future (FR-018); "Just this line" overrides one line
// (FR-019). An "Others" line has no rename-everywhere (decision 35): "Others" is not one person. Names are 1–60
// characters on one line, the same rule as the user's own name. `Edit text` is the keyboard path to the line's text
// editor (020 research R3).
import { useId, useState } from 'react';
import { parseLabelName } from '../../../core/messaging/protocol';

export interface LabelEditorProps {
  /** The name the line shows now. */
  current: string;
  /** The label the line's speaker carries without a rename, named on the rename button. */
  original: string;
  hasOverride: boolean;
  /** Names already used in this meeting. */
  suggestions: readonly string[];
  /** Absent for an "Others" line, which can only be overridden on its own (decision 35). */
  onRename?: ((name: string) => void) | undefined;
  onOverride: (name: string | null) => void;
  /** 020 R3: opens the line's text editor in place of this one; absent when the text cannot be edited. */
  onEditText?: (() => void) | undefined;
  onClose: () => void;
}

const NAME_ERROR = 'Enter a name of 1–60 characters on one line.';

export function LabelEditor(props: LabelEditorProps) {
  const [value, setValue] = useState(props.current);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const withName = (act: (name: string) => void) => {
    const name = parseLabelName(value);
    if (name === null) return setError(NAME_ERROR);
    act(name);
    props.onClose();
  };

  return (
    <div
      role="dialog"
      aria-label="Edit speaker name"
      className="label-editor"
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
          withName(props.onRename ?? props.onOverride);
        }}
      >
        <label htmlFor={`${id}-name`}>Speaker name</label>{' '}
        <input
          id={`${id}-name`}
          list={`${id}-names`}
          value={value}
          autoFocus
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        <datalist id={`${id}-names`}>
          {props.suggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {error && (
          <p id={`${id}-error`} role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="label-editor-actions">
          {props.onRename ? (
            <>
              <button type="submit">Rename &ldquo;{props.original}&rdquo; everywhere</button>{' '}
              <button type="button" className="secondary" onClick={() => withName(props.onOverride)}>
                Just this line
              </button>
            </>
          ) : (
            <button type="submit">Just this line</button>
          )}{' '}
          {props.hasOverride && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                props.onOverride(null);
                props.onClose();
              }}
            >
              Reset this line
            </button>
          )}{' '}
          {props.onEditText && (
            <button type="button" className="secondary" onClick={props.onEditText}>
              Edit text
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
