// 008 T014: the service worker's notes commands (contracts/notes-messages.md) over fake-indexeddb.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_NOTES_CHARS, NEXT_MEETING_KEY } from '@/core/chat/notes';
import type { Logger } from '@/core/log';
import type { Meeting } from '@/core/transcript/model';
import { handleContextCommand, type ContextCommandDeps } from '@/entrypoints/background/context-commands';
import { ContextRepo } from '@/storage/context-repo';
import { openLiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { NOTES_SENTINEL, readNotesText } from '../../support/notes';

let n = 0;
let deps: ContextCommandDeps;
let contexts: ContextRepo;
let logger: Logger & { calls: unknown[][] };

const meeting: Meeting = {
  id: 'm1',
  startedAt: 1,
  endedAt: null,
  endReason: null,
  source: { url: 'https://meet.google.com/abc', title: 'Standup', platform: 'meet' },
  languageMode: { kind: 'auto' },
  userName: 'Alex',
  speakerRenames: {},
  schemaVersion: 2,
};

const agenda = { name: 'agenda.md', source: 'file' as const, text: readNotesText('agenda.md') };

beforeEach(async () => {
  n += 1;
  const db = await openLiveAssistDb(`context-commands-${n}`);
  contexts = new ContextRepo(db);
  const meetings = new MeetingRepo(db);
  await meetings.createMeeting(meeting);
  const calls: unknown[][] = [];
  const record =
    (level: string) =>
    (...args: unknown[]) =>
      calls.push([level, ...args]);
  logger = { info: record('info'), warn: record('warn'), error: record('error'), calls };
  deps = { contexts, meetings, now: () => 100, logger };
});

const next = { kind: 'next' } as const;
const m1 = { kind: 'meeting', meetingId: 'm1' } as const;

describe('context/set', () => {
  it('stores notes for the next meeting and replies with the version only', async () => {
    const reply = await handleContextCommand({ type: 'context/set', target: next, notes: agenda }, deps);
    expect(reply).toEqual({ ok: true, version: 1 });
    expect((await contexts.get(NEXT_MEETING_KEY))?.notes?.text).toBe(agenda.text);
  });

  it('stores and replaces a meeting’s notes', async () => {
    await handleContextCommand({ type: 'context/set', target: m1, notes: agenda }, deps);
    const reply = await handleContextCommand(
      { type: 'context/set', target: m1, notes: { name: 'Pasted notes', source: 'paste', text: 'x' } },
      deps,
    );
    expect(reply).toEqual({ ok: true, version: 2 });
  });

  it('re-validates and stores nothing on invalid notes', async () => {
    const reply = await handleContextCommand(
      { type: 'context/set', target: m1, notes: { ...agenda, text: 'a'.repeat(MAX_NOTES_CHARS + 1) } },
      deps,
    );
    expect(reply).toEqual({ ok: false, kind: 'too-long' });
    expect(await contexts.get('m1')).toBeUndefined();
  });

  it('answers unknown-meeting for a meeting that is not stored', async () => {
    const reply = await handleContextCommand(
      { type: 'context/set', target: { kind: 'meeting', meetingId: 'gone' }, notes: agenda },
      deps,
    );
    expect(reply).toEqual({ ok: false, kind: 'unknown-meeting' });
  });

  it('answers unknown-meeting when the meeting is deleted between the check and the write (012 FR-018)', async () => {
    const set = vi.fn().mockResolvedValue(null);
    const racing = {
      ...deps,
      contexts: { get: contexts.get.bind(contexts), set, remove: contexts.remove.bind(contexts) },
    };
    const reply = await handleContextCommand({ type: 'context/set', target: m1, notes: agenda }, racing);
    expect(reply).toEqual({ ok: false, kind: 'unknown-meeting' });
    expect(set).toHaveBeenCalledTimes(1);
    expect(logger.calls.some((c) => c.includes('notes set'))).toBe(false);
  });

  it('writes nothing for a meeting deleted after the handler looked it up', async () => {
    const meetings = { getMeeting: () => Promise.resolve(meeting) };
    const reply = await handleContextCommand(
      { type: 'context/set', target: { kind: 'meeting', meetingId: 'deleted' }, notes: agenda },
      { ...deps, meetings },
    );
    expect(reply).toEqual({ ok: false, kind: 'unknown-meeting' });
    expect(await contexts.get('deleted')).toBeUndefined();
  });

  it('answers save-failed when the store throws, keeping the earlier notes', async () => {
    await handleContextCommand({ type: 'context/set', target: m1, notes: agenda }, deps);
    const failing = {
      ...deps,
      contexts: {
        ...contexts,
        get: contexts.get.bind(contexts),
        set: vi.fn().mockRejectedValue(new Error('quota')),
        remove: contexts.remove.bind(contexts),
      },
    };
    const reply = await handleContextCommand(
      { type: 'context/set', target: m1, notes: { ...agenda, text: 'new' } },
      failing,
    );
    expect(reply).toEqual({ ok: false, kind: 'save-failed' });
    expect((await contexts.get('m1'))?.notes?.text).toBe(agenda.text);
  });
});

describe('context/remove', () => {
  it('removes pending and meeting notes', async () => {
    await handleContextCommand({ type: 'context/set', target: next, notes: agenda }, deps);
    await handleContextCommand({ type: 'context/set', target: m1, notes: agenda }, deps);
    expect(await handleContextCommand({ type: 'context/remove', target: next }, deps)).toEqual({ ok: true });
    expect(await handleContextCommand({ type: 'context/remove', target: m1 }, deps)).toEqual({ ok: true });
    expect(await contexts.get(NEXT_MEETING_KEY)).toBeUndefined();
    expect(await contexts.get('m1')).toMatchObject({ version: 2, notes: null });
  });

  it('answers unknown-meeting for a meeting that is not stored', async () => {
    expect(
      await handleContextCommand({ type: 'context/remove', target: { kind: 'meeting', meetingId: 'gone' } }, deps),
    ).toEqual({ ok: false, kind: 'unknown-meeting' });
  });
});

it('never puts the notes name or text in a reply or a log line', async () => {
  const replies = [
    await handleContextCommand({ type: 'context/set', target: m1, notes: agenda }, deps),
    await handleContextCommand({ type: 'context/remove', target: m1 }, deps),
  ];
  const seen = JSON.stringify([replies, logger.calls]);
  expect(seen).not.toContain(NOTES_SENTINEL);
  expect(seen).not.toContain('agenda.md');
});
