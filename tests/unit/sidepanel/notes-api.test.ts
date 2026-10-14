// 008 T028: the panel's notes API (data-model "Panel state", contracts/notes-messages.md): reads IndexedDB, writes
// through the service worker, decodes files before anything is sent.
import { describe, expect, it, vi } from 'vitest';
import { MAX_NOTES_FILE_BYTES, NEXT_MEETING_KEY, type MeetingContextRecord } from '@/core/chat/notes';
import { createNotesApi, type NotesFile } from '@/entrypoints/sidepanel/notes-api';
import { readNotesBytes, readNotesText } from '../../support/notes';

const record = (over: Partial<MeetingContextRecord> = {}): MeetingContextRecord => ({
  meetingId: 'm1',
  version: 1,
  notes: { name: 'agenda.md', source: 'file', text: 'secret text', addedAt: 1 },
  updatedAt: 1,
  schemaVersion: 1,
  ...over,
});

function file(name: string, bytes: Uint8Array): NotesFile & { read: ReturnType<typeof vi.fn> } {
  const read = vi.fn(() => Promise.resolve(bytes.slice().buffer));
  return { name, size: bytes.byteLength, arrayBuffer: read, read };
}

function setup(stored: Record<string, MeetingContextRecord> = {}, reply: unknown = { ok: true, version: 1 }) {
  const sendCommand = vi.fn((_c: unknown) => Promise.resolve(reply));
  const get = vi.fn((key: string) => Promise.resolve(stored[key]));
  const api = createNotesApi({ sendCommand, repo: () => Promise.resolve({ get }) });
  return { api, sendCommand, get };
}

const m1 = { kind: 'meeting', meetingId: 'm1' } as const;
const next = { kind: 'next' } as const;

describe('get', () => {
  it('reads the meeting’s or the pending record; file notes come without their text', async () => {
    const { api, get } = setup({ m1: record(), [NEXT_MEETING_KEY]: record({ meetingId: NEXT_MEETING_KEY }) });
    expect(await api.get(m1)).toEqual({ name: 'agenda.md', source: 'file' });
    expect(await api.get(next)).toEqual({ name: 'agenda.md', source: 'file' });
    expect(get).toHaveBeenCalledWith(NEXT_MEETING_KEY);
  });

  it('pasted notes come with their text (to prefill the paste box)', async () => {
    const { api } = setup({ m1: record({ notes: { name: 'Pasted notes', source: 'paste', text: 'x', addedAt: 1 } }) });
    expect(await api.get(m1)).toEqual({ name: 'Pasted notes', source: 'paste', text: 'x' });
  });

  it('no record or a removed one reads as no notes', async () => {
    const { api } = setup({ m1: record({ notes: null, version: 2 }) });
    expect(await api.get(m1)).toBeNull();
    expect(await api.get({ kind: 'meeting', meetingId: 'other' })).toBeNull();
  });
});

describe('addFile', () => {
  it('decodes the file and sends context/set with the normalised notes', async () => {
    const { api, sendCommand } = setup();
    expect(await api.addFile(m1, file('agenda.md', readNotesBytes('agenda.md')))).toEqual({ ok: true });
    expect(sendCommand).toHaveBeenCalledWith({
      type: 'context/set',
      target: m1,
      notes: { name: 'agenda.md', source: 'file', text: readNotesText('agenda.md') },
    });
  });

  it('sends nothing for a rejected file', async () => {
    const { api, sendCommand } = setup();
    expect(await api.addFile(m1, file('windows-1253.txt', readNotesBytes('windows-1253.txt')))).toEqual({
      ok: false,
      kind: 'not-text',
    });
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('refuses an oversized file without reading it', async () => {
    const { api } = setup();
    const big = { name: 'big.txt', size: MAX_NOTES_FILE_BYTES + 1, arrayBuffer: vi.fn() };
    expect(await api.addFile(next, big)).toEqual({ ok: false, kind: 'too-long' });
    expect(big.arrayBuffer).not.toHaveBeenCalled();
  });

  it('a file the browser cannot read is unreadable', async () => {
    const { api } = setup();
    const broken = { name: 'a.md', size: 3, arrayBuffer: () => Promise.reject(new Error('NotReadableError')) };
    expect(await api.addFile(next, broken)).toEqual({ ok: false, kind: 'unreadable' });
  });

  it('maps a failed reply, unknown-meeting or a malformed one to save-failed', async () => {
    for (const reply of [{ ok: false, kind: 'unknown-meeting' }, { ok: false, kind: 'save-failed' }, null]) {
      const { api } = setup({}, reply);
      expect(await api.addFile(m1, file('a.md', new TextEncoder().encode('x')))).toEqual({
        ok: false,
        kind: 'save-failed',
      });
    }
    const { api } = setup({}, { ok: false, kind: 'too-long' });
    expect(await api.addFile(m1, file('a.md', new TextEncoder().encode('x')))).toEqual({ ok: false, kind: 'too-long' });
  });

  it('a sendCommand that throws is save-failed', async () => {
    const api = createNotesApi({
      sendCommand: () => Promise.reject(new Error('no receiver')),
      repo: () => Promise.resolve({ get: () => Promise.resolve(undefined) }),
    });
    expect(await api.paste(m1, 'x')).toEqual({ ok: false, kind: 'save-failed' });
  });
});

describe('paste and remove', () => {
  it('paste sends the text as Pasted notes; whitespace sends nothing', async () => {
    const { api, sendCommand } = setup();
    expect(await api.paste(m1, 'a\r\nb')).toEqual({ ok: true });
    expect(sendCommand).toHaveBeenCalledWith({
      type: 'context/set',
      target: m1,
      notes: { name: 'Pasted notes', source: 'paste', text: 'a\nb' },
    });
    sendCommand.mockClear();
    expect(await api.paste(m1, '  ')).toEqual({ ok: false, kind: 'empty' });
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('remove sends context/remove', async () => {
    const { api, sendCommand } = setup({}, { ok: true });
    expect(await api.remove(next)).toEqual({ ok: true });
    expect(sendCommand).toHaveBeenCalledWith({ type: 'context/remove', target: next });
  });
});
