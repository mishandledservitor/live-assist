// 018 (FR-002, design decision 106, contracts/settings-ui.md "Key block"): one key on the Settings screen as one line,
// the masked key with Replace and Remove. Replace opens the field with Check and save and Cancel (Escape cancels); with
// no key saved the field shows at once. The key is checked before it is saved and never stays in the field.
import { useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { maskedKey } from '../key-messages';

export type KeyCheck = (candidate: string) => Promise<{ ok: true; hint: string } | { ok: false; text: string }>;

export interface KeyBlockProps {
  heading: string;
  hint: string | null;
  check: KeyCheck;
  /** The error for an empty field. */
  emptyText: string;
  /** The status line after a key passes the check. */
  savedText: string;
  remove: () => Promise<void>;
  /** When given, Remove asks this first (the ElevenLabs key). */
  removeConfirm?: string;
  onHint: (hint: string | null) => void;
}

export function KeyBlock({ heading, hint, check, emptyText, savedText, remove, removeConfirm, onHint }: KeyBlockProps) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<'field' | 'replace' | null>(null);
  useLayoutEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (target === 'field') fieldRef.current?.focus();
    else if (target === 'replace') replaceRef.current?.focus();
  });

  const open = hint === null || editing;

  function close() {
    setValue('');
    setEditing(false);
    focusNext.current = 'replace';
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const candidate = value.trim();
    if (candidate === '') return setMessage({ error: true, text: emptyText });
    setChecking(true);
    setMessage(null);
    try {
      const result = await check(candidate);
      if (!result.ok) return setMessage({ error: true, text: result.text });
      onHint(result.hint);
      close();
      setMessage({ error: false, text: savedText });
    } finally {
      // The key never stays on screen, whatever the result.
      setValue('');
      setChecking(false);
    }
  }

  async function removeKey() {
    await remove();
    setConfirming(false);
    setEditing(false);
    onHint(null);
    setMessage({ error: false, text: 'Key removed.' });
  }

  function onFieldKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Escape' || hint === null) return;
    e.preventDefault();
    close();
  }

  let body;
  if (confirming)
    body = (
      <p className="field-row">
        {removeConfirm}{' '}
        <button type="button" onClick={() => void removeKey()}>
          Yes, remove
        </button>{' '}
        <button type="button" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </p>
    );
  else if (open)
    body = (
      <form className="field-row" onSubmit={(e) => void save(e)} noValidate>
        {hint === null && <span>No key saved.</span>}
        <input
          ref={fieldRef}
          aria-labelledby={`${id}-heading`}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onFieldKey}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={checking}>
          {checking ? 'Checking key…' : 'Check and save'}
        </button>
        {hint !== null && (
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
        )}
      </form>
    );
  else
    body = (
      <p className="field-row key-line">
        <span>
          Saved key: <code>{maskedKey(hint)}</code>
        </span>{' '}
        <button
          type="button"
          ref={replaceRef}
          onClick={() => {
            setMessage(null);
            setEditing(true);
            focusNext.current = 'field';
          }}
        >
          Replace
        </button>{' '}
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setMessage(null);
            if (removeConfirm === undefined) void removeKey();
            else setConfirming(true);
          }}
        >
          Remove
        </button>
      </p>
    );

  return (
    <section aria-labelledby={`${id}-heading`} className="key-block">
      <h4 id={`${id}-heading`}>{heading}</h4>
      {body}
      {message && <p role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    </section>
  );
}
