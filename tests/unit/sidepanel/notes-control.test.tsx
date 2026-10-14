// 008 T032 (and T046): the notes control per contracts/notes-ui.md "Controls" — add menu, file pick, chip, remove,
// errors and the accessible names that say whose notes they are.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NotesControl } from '@/entrypoints/sidepanel/components/NotesControl';
import type { NotesTarget } from '@/entrypoints/sidepanel/notes-api';
import { fakeNotesApi } from './fake-notes-api';

afterEach(cleanup);

const m1: NotesTarget = { kind: 'meeting', meetingId: 'm1' };
const next: NotesTarget = { kind: 'next' };

async function pickAsync(name: string) {
  pick(name);
  await Promise.resolve();
}

async function clickAsync(el: HTMLElement) {
  fireEvent.click(el);
  await Promise.resolve();
}

function pick(name: string) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  const file = new File(['x'], name, { type: 'text/plain' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('NotesControl — no notes yet', () => {
  it('Add notes opens a menu with Choose file… and Paste text', async () => {
    const fake = fakeNotesApi();
    render(<NotesControl api={fake.api} target={m1} />);
    const add = await screen.findByRole('button', { name: 'Add notes' });
    expect(add.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(add);
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Choose file…', 'Paste text']);
  });

  it('the file input accepts .txt and .md', () => {
    render(<NotesControl api={fakeNotesApi().api} target={m1} />);
    expect(document.querySelector('input[type=file]')!.getAttribute('accept')).toBe(
      '.txt,.md,text/plain,text/markdown',
    );
  });

  it('picking a file adds it and shows the chip', async () => {
    const fake = fakeNotesApi();
    render(<NotesControl api={fake.api} target={m1} />);
    await act(() => pickAsync('agenda.md'));
    expect(fake.api.addFile).toHaveBeenCalledWith(m1, expect.objectContaining({ name: 'agenda.md' }));
    expect((await screen.findByRole('button', { name: 'Notes: agenda.md' })).textContent).toContain('agenda.md');
  });
});

describe('NotesControl — with notes', () => {
  it('shows the chip with the name, opening a menu that can remove them; × removes too', async () => {
    const fake = fakeNotesApi({ m1: { name: 'agenda.md', source: 'file' } });
    render(<NotesControl api={fake.api} target={m1} />);
    const chip = await screen.findByRole('button', { name: 'Notes: agenda.md' });
    expect(chip.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(chip);
    expect(
      within(screen.getByRole('menu'))
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Choose file…', 'Paste text', 'Remove notes']);
    const x = screen.getByRole('button', { name: 'Remove notes' });
    await act(() => clickAsync(x));
    expect(fake.api.remove).toHaveBeenCalledWith(m1);
    expect(await screen.findByRole('button', { name: 'Add notes' })).toBeTruthy();
  });

  it('pasted notes show as Pasted notes', async () => {
    render(
      <NotesControl api={fakeNotesApi({ m1: { name: 'Pasted notes', source: 'paste', text: 'x' } }).api} target={m1} />,
    );
    expect((await screen.findByRole('button', { name: 'Notes: Pasted notes' })).textContent).toContain('Pasted notes');
  });
});

describe('NotesControl — for the next meeting', () => {
  it('names say "for the next meeting" while the visible text does not', async () => {
    const fake = fakeNotesApi();
    const { container } = render(<NotesControl api={fake.api} target={next} />);
    expect((await screen.findByRole('button', { name: 'Add notes for the next meeting' })).textContent).toBe(
      'Add notes',
    );
    await act(() => pickAsync('agenda.md'));
    expect(await screen.findByRole('button', { name: 'Notes for the next meeting: agenda.md' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove notes for the next meeting' })).toBeTruthy();
    expect(container.textContent).not.toContain('next meeting');
  });
});

describe('NotesControl — errors', () => {
  it.each([
    ['empty', 'bad.txt is empty.'],
    ['too-long', 'bad.txt has more than 100,000 characters. Shorten it and add it again.'],
    ['not-text', "bad.txt isn't UTF-8 text. Save it as UTF-8 and add it again."],
    ['wrong-type', 'Only .txt and .md files can be added.'],
    ['unreadable', "Couldn't read bad.txt. Try again."],
    ['save-failed', "Couldn't save the notes. Try again."],
  ] as const)('%s shows its text in an alert', async (kind, text) => {
    const fake = fakeNotesApi();
    fake.failNext({ ok: false, kind });
    render(<NotesControl api={fake.api} target={m1} />);
    await act(() => pickAsync('bad.txt'));
    expect((await screen.findByRole('alert')).textContent).toContain(text);
  });

  it('a rejected file keeps the earlier notes', async () => {
    const fake = fakeNotesApi({ m1: { name: 'agenda.md', source: 'file' } });
    fake.failNext({ ok: false, kind: 'not-text' });
    render(<NotesControl api={fake.api} target={m1} />);
    await screen.findByRole('button', { name: 'Notes: agenda.md' });
    await act(() => pickAsync('bad.txt'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Notes: agenda.md' })).toBeTruthy();
  });

  it('choosing another file replaces the notes', async () => {
    const fake = fakeNotesApi({ m1: { name: 'agenda.md', source: 'file' } });
    render(<NotesControl api={fake.api} target={m1} />);
    await screen.findByRole('button', { name: 'Notes: agenda.md' });
    await act(() => pickAsync('minutes.md'));
    expect(await screen.findByRole('button', { name: 'Notes: minutes.md' })).toBeTruthy();
  });
});
