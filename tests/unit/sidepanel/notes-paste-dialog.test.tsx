// 008 T044: the paste dialog (contracts/notes-ui.md "Paste dialog"), opened from Paste text in the notes menu.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_NOTES_CHARS } from '@/core/chat/notes';
import { NotesControl } from '@/entrypoints/sidepanel/components/NotesControl';
import type { NotesTarget } from '@/entrypoints/sidepanel/notes-api';
import { fakeNotesApi } from './fake-notes-api';

afterEach(cleanup);

const m1: NotesTarget = { kind: 'meeting', meetingId: 'm1' };

async function openPaste(opener = 'Add notes') {
  fireEvent.click(await screen.findByRole('button', { name: opener }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Paste text' }));
  return screen.getByRole('dialog', { name: 'Notes' });
}

const box = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Notes' });
const save = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Save notes' });

describe('paste dialog', () => {
  it('is a modal dialog named Notes with an empty box, Save disabled while blank', async () => {
    render(<NotesControl api={fakeNotesApi().api} target={m1} />);
    const dialog = await openPaste();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(box().value).toBe('');
    expect(document.activeElement).toBe(box());
    expect(save().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: '  \n ' } });
    expect(save().disabled).toBe(true);
  });

  it('saves the pasted text and closes, showing the Pasted notes chip', async () => {
    const fake = fakeNotesApi();
    render(<NotesControl api={fake.api} target={m1} />);
    await openPaste();
    fireEvent.change(box(), { target: { value: 'Shared doc text' } });
    await act(async () => {
      fireEvent.click(save());
      await Promise.resolve();
    });
    expect(fake.api.paste).toHaveBeenCalledWith(m1, 'Shared doc text');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('button', { name: 'Notes: Pasted notes' })).toBeTruthy();
  });

  it('prefills the box with the current notes when they were pasted', async () => {
    render(
      <NotesControl
        api={fakeNotesApi({ m1: { name: 'Pasted notes', source: 'paste', text: 'Old' } }).api}
        target={m1}
      />,
    );
    await openPaste('Notes: Pasted notes');
    expect(box().value).toBe('Old');
  });

  it('does not prefill file notes', async () => {
    render(<NotesControl api={fakeNotesApi({ m1: { name: 'agenda.md', source: 'file' } }).api} target={m1} />);
    await openPaste('Notes: agenda.md');
    expect(box().value).toBe('');
  });

  it('Escape and Cancel close without saving, returning focus to the control', async () => {
    const fake = fakeNotesApi();
    render(<NotesControl api={fake.api} target={m1} />);
    const dialog = await openPaste();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add notes' }));
    await openPaste();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.api.paste).not.toHaveBeenCalled();
  });

  it('an over-long paste shows the paste text and keeps the dialog open', async () => {
    const fake = fakeNotesApi();
    fake.failNext({ ok: false, kind: 'too-long' });
    render(<NotesControl api={fake.api} target={m1} />);
    await openPaste();
    fireEvent.change(box(), { target: { value: 'a'.repeat(MAX_NOTES_CHARS + 1) } });
    await act(async () => {
      fireEvent.click(save());
      await Promise.resolve();
    });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'These notes have more than 100,000 characters. Shorten them and save again.',
    );
    expect(screen.getByRole('dialog', { name: 'Notes' })).toBeTruthy();
  });
});
