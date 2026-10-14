// The notes control (008 contracts/notes-ui.md): beside Start for the next meeting, in the Ask area for the meeting
// shown. Position carries whose notes they are; the accessible names say it for screen readers.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { NOTES_ACCEPT, NOTES_STRINGS, notesChipName, notesErrorText } from '../../../core/chat/notes-messages';
import { useMeetingNotes } from '../hooks/useMeetingNotes';
import { NotesPasteDialog } from './NotesPasteDialog';
import type { NotesApi, NotesTarget } from '../notes-api';
import './notes.css';

export function NotesControl({
  api,
  target,
  reloadKey,
  onPresence,
}: {
  api: NotesApi;
  target: NotesTarget;
  /** Changes when the stored notes may have moved under us (a meeting started). */
  reloadKey?: unknown;
  /** Told whether the target has notes, whenever that changes (the Ask area words a too-large error by it). */
  onPresence?: (hasNotes: boolean) => void;
}) {
  const state = useMeetingNotes(api, target, reloadKey);
  const hasNotes = state.notes !== null;
  useEffect(() => onPresence?.(hasNotes), [onPresence, hasNotes]);
  const forNext = target.kind === 'next';
  const [menuOpen, setMenuOpen] = useState(false);
  const [pasting, setPasting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuOpen) menu.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
  }, [menuOpen]);

  const closeMenu = (refocus: boolean) => {
    setMenuOpen(false);
    if (refocus) opener.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  };

  const toggle = () => setMenuOpen((open) => !open);
  const notes = state.notes;

  return (
    <div className="notes-control">
      <input
        ref={fileInput}
        type="file"
        accept={NOTES_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void state.addFile(file);
        }}
      />
      {notes === null ? (
        <button
          ref={opener}
          type="button"
          className="notes-add"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={forNext ? NOTES_STRINGS.addForNext : undefined}
          disabled={state.busy}
          onClick={toggle}
        >
          {NOTES_STRINGS.add}
        </button>
      ) : (
        <span className="notes-chip">
          <button
            ref={opener}
            type="button"
            className="notes-chip-name"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={notesChipName(notes.name, forNext)}
            title={notes.name}
            disabled={state.busy}
            onClick={toggle}
          >
            {notes.name}
          </button>
          <button
            type="button"
            className="notes-chip-remove"
            aria-label={forNext ? NOTES_STRINGS.removeForNext : NOTES_STRINGS.remove}
            disabled={state.busy}
            onClick={() => void state.remove()}
          >
            ×
          </button>
        </span>
      )}
      {menuOpen && (
        <div
          ref={menu}
          role="menu"
          className="notes-menu"
          onKeyDown={onMenuKey}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) closeMenu(false);
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu(false);
              fileInput.current?.click();
            }}
          >
            {NOTES_STRINGS.chooseFile}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu(false);
              setPasting(true);
            }}
          >
            {NOTES_STRINGS.pasteText}
          </button>
          {notes !== null && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu(false);
                void state.remove();
              }}
            >
              {NOTES_STRINGS.remove}
            </button>
          )}
        </div>
      )}
      {pasting && (
        <NotesPasteDialog
          initial={notes?.source === 'paste' ? (notes.text ?? '') : ''}
          busy={state.busy}
          error={state.error?.from === 'paste' ? notesErrorText(state.error.kind, 'paste', '') : null}
          onSave={(text) =>
            void state.paste(text).then((ok) => {
              if (!ok) return;
              setPasting(false);
              opener.current?.focus();
            })
          }
          onCancel={() => {
            setPasting(false);
            opener.current?.focus();
          }}
        />
      )}
      {state.error && !(pasting && state.error.from === 'paste') && (
        <p role="alert" className="notes-error">
          {notesErrorText(state.error.kind, state.error.from, state.error.name)}
        </p>
      )}
    </div>
  );
}
