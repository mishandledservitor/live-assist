// The panel's notes for one target (008 data-model "Panel state"): the next meeting, or the meeting shown. Loaded
// from storage when the target (or the reload key) changes and after every action; an error stays until the next
// action and belongs to the target it happened on.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NotesErrorKind } from '../../../core/chat/notes';
import { notesKey, type NotesApi, type NotesFile, type NotesTarget, type NotesView } from '../notes-api';

export interface NotesError {
  kind: NotesErrorKind;
  /** The file's name, for the message (empty for pasted text and removals). */
  name: string;
  from: 'file' | 'paste' | 'remove';
}

export interface MeetingNotesState {
  notes: NotesView | null;
  busy: boolean;
  error: NotesError | null;
  addFile(file: NotesFile): Promise<void>;
  paste(text: string): Promise<boolean>;
  remove(): Promise<void>;
}

export function useMeetingNotes(api: NotesApi, target: NotesTarget, reloadKey?: unknown): MeetingNotesState {
  const key = notesKey(target);
  const [loaded, setLoaded] = useState<{ key: string; notes: NotesView | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<(NotesError & { key: string }) | null>(null);
  // The target object changes identity on every render; its key does not.
  const stable = useMemo<NotesTarget>(
    () => (target.kind === 'next' ? { kind: 'next' } : { kind: 'meeting', meetingId: key }),
    [target.kind, key],
  );

  const load = useCallback(
    async (forKey: string) => {
      let notes: NotesView | null;
      try {
        notes = await api.get(stable);
      } catch {
        notes = null;
      }
      setLoaded({ key: forKey, notes });
    },
    [api, stable],
  );

  useEffect(() => {
    let live = true;
    void api.get(stable).then(
      (notes) => live && setLoaded({ key, notes }),
      () => live && setLoaded({ key, notes: null }),
    );
    return () => {
      live = false;
    };
  }, [api, stable, key, reloadKey]);

  const run = async (from: NotesError['from'], name: string, action: () => ReturnType<NotesApi['remove']>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError({ kind: result.kind, name, from, key });
      await load(key);
      return result.ok;
    } finally {
      setBusy(false);
    }
  };

  return {
    notes: loaded?.key === key ? loaded.notes : null,
    busy,
    error: error?.key === key ? { kind: error.kind, name: error.name, from: error.from } : null,
    addFile: async (file) => {
      await run('file', file.name, () => api.addFile(stable, file));
    },
    paste: (text) => run('paste', '', () => api.paste(stable, text)),
    remove: async () => {
      await run('remove', '', () => api.remove(stable));
    },
  };
}
