// A NotesApi fake for 008's panel tests: an in-memory store keyed like the real one.
import { vi, type Mock } from 'vitest';
import { PASTED_NOTES_NAME } from '@/core/chat/notes';
import {
  notesKey,
  type NotesActionResult,
  type NotesApi,
  type NotesFile,
  type NotesTarget,
  type NotesView,
} from '@/entrypoints/sidepanel/notes-api';

export interface FakeNotesApi {
  get: Mock<(target: NotesTarget) => Promise<NotesView | null>>;
  addFile: Mock<(target: NotesTarget, file: NotesFile) => Promise<NotesActionResult>>;
  paste: Mock<(target: NotesTarget, text: string) => Promise<NotesActionResult>>;
  remove: Mock<(target: NotesTarget) => Promise<NotesActionResult>>;
}

export function fakeNotesApi(initial: Record<string, NotesView> = {}) {
  const store: Record<string, NotesView> = { ...initial };
  let nextResult: NotesActionResult | null = null;
  const result = (): NotesActionResult => {
    const r = nextResult ?? { ok: true };
    nextResult = null;
    return r;
  };
  const api = {
    get: vi.fn((target: NotesTarget) => Promise.resolve(store[notesKey(target)] ?? null)),
    addFile: vi.fn((target: NotesTarget, file: NotesFile) => {
      const r = result();
      if (r.ok) store[notesKey(target)] = { name: file.name, source: 'file' };
      return Promise.resolve(r);
    }),
    paste: vi.fn((target: NotesTarget, text: string) => {
      const r = result();
      if (r.ok) store[notesKey(target)] = { name: PASTED_NOTES_NAME, source: 'paste', text };
      return Promise.resolve(r);
    }),
    remove: vi.fn((target: NotesTarget) => {
      const r = result();
      if (r.ok) delete store[notesKey(target)];
      return Promise.resolve(r);
    }),
  } satisfies FakeNotesApi & NotesApi;
  return {
    api,
    store,
    /** The next add, paste or remove answers this instead of succeeding. */
    failNext(r: NotesActionResult) {
      nextResult = r;
    },
  };
}
