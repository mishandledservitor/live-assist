// 008 T030: the panel's notes state for one target (data-model "Panel state").
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { NotesTarget } from '@/entrypoints/sidepanel/notes-api';
import { useMeetingNotes } from '@/entrypoints/sidepanel/hooks/useMeetingNotes';
import { fakeNotesApi } from './fake-notes-api';

afterEach(cleanup);

const file = (name: string) => ({ name, size: 1, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) });

describe('useMeetingNotes', () => {
  it('loads the notes of the target and reloads when the target changes', async () => {
    const fake = fakeNotesApi({ m1: { name: 'agenda.md', source: 'file' } });
    const { result, rerender } = renderHook<ReturnType<typeof useMeetingNotes>, { target: NotesTarget }>(
      ({ target }) => useMeetingNotes(fake.api, target),
      { initialProps: { target: { kind: 'meeting', meetingId: 'm1' } } },
    );
    await waitFor(() => expect(result.current.notes?.name).toBe('agenda.md'));
    rerender({ target: { kind: 'meeting', meetingId: 'm2' } });
    await waitFor(() => expect(result.current.notes).toBeNull());
  });

  it('reloads after each action and while busy says so', async () => {
    const fake = fakeNotesApi();
    const { result } = renderHook(() => useMeetingNotes(fake.api, { kind: 'next' }));
    await waitFor(() => expect(fake.api.get).toHaveBeenCalled());
    await act(() => result.current.addFile(file('agenda.md')));
    expect(result.current.notes).toEqual({ name: 'agenda.md', source: 'file' });
    await act(() => result.current.paste('x'));
    expect(result.current.notes?.name).toBe('Pasted notes');
    await act(() => result.current.remove());
    expect(result.current.notes).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('keeps an error until the next action, and the earlier notes stay', async () => {
    const fake = fakeNotesApi({ next: { name: 'agenda.md', source: 'file' } });
    const { result } = renderHook(() => useMeetingNotes(fake.api, { kind: 'next' }));
    await waitFor(() => expect(result.current.notes).not.toBeNull());
    fake.failNext({ ok: false, kind: 'not-text' });
    await act(() => result.current.addFile(file('bad.txt')));
    expect(result.current.error).toEqual({ kind: 'not-text', name: 'bad.txt', from: 'file' });
    expect(result.current.notes?.name).toBe('agenda.md');
    await act(() => result.current.paste('ok'));
    expect(result.current.error).toBeNull();
  });

  it('reloads when the reload key changes (Start moved the pending notes)', async () => {
    const fake = fakeNotesApi({ next: { name: 'agenda.md', source: 'file' } });
    const { result, rerender } = renderHook<ReturnType<typeof useMeetingNotes>, { key: string | null }>(
      ({ key }) => useMeetingNotes(fake.api, { kind: 'next' }, key),
      { initialProps: { key: null } },
    );
    await waitFor(() => expect(result.current.notes).not.toBeNull());
    delete fake.store.next;
    rerender({ key: 'm2' });
    await waitFor(() => expect(result.current.notes).toBeNull());
  });
});
