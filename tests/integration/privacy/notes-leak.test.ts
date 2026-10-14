// 008 T050 (SC-005, SC-006, FR-017, FR-018): the notes go to the chat request only. They never reach the transcript,
// the downloaded transcript (007), a stored chat turn, or any store once removed or once the meeting is deleted; a
// stopped meeting is still answered with them.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatRequest } from '@/core/chat/provider';
import { createLogger } from '@/core/log';
import { transcriptFile } from '@/core/export/transcript-file';
import { DEFAULT_CHAT_SETTINGS } from '@/core/settings/schema';
import { createChatSession, type ChatSessionDeps } from '@/entrypoints/background/chat-session';
import { createFixtureChatProvider } from '@/providers/chat/fixture-provider';
import { ChatRepo } from '@/storage/chat-repo';
import { ContextRepo } from '@/storage/context-repo';
import { openLiveAssistDb, type LiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { NOTES_SENTINEL, notesStandup } from '../../support/notes';

const fixture = notesStandup();
const MEETING = fixture.meeting.id;

let n = 0;
let db: LiveAssistDb;
let meetings: MeetingRepo;
let contexts: ContextRepo;
let requests: ChatRequest[];
let logs: unknown[][];
let deps: ChatSessionDeps;

beforeEach(async () => {
  n += 1;
  db = await openLiveAssistDb(`notes-leak-${n}`);
  meetings = new MeetingRepo(db);
  contexts = new ContextRepo(db);
  await meetings.createMeeting(fixture.meeting);
  for (const s of fixture.segments) await meetings.appendSegment(s);
  requests = [];
  logs = [];
  const sink = {
    error: (...a: unknown[]) => logs.push(a),
    warn: (...a: unknown[]) => logs.push(a),
    info: (...a: unknown[]) => logs.push(a),
  };
  deps = {
    meetings,
    chats: new ChatRepo(db),
    contexts,
    chatSettings: () => Promise.resolve({ ...DEFAULT_CHAT_SETTINGS, setupComplete: true }),
    credentials: {
      id: 'local-key',
      status: () => Promise.resolve({ configured: true, hint: '1234' }),
      providerFor: (p) =>
        Promise.resolve(createFixtureChatProvider({ id: p, scenario: 'complete', onRequest: (r) => requests.push(r) })),
    },
    now: () => 1_000_000,
    logger: createLogger('chat', sink),
    post: () => undefined,
  };
});

const ask = (q: string) => createChatSession(deps).handle({ type: 'chat/ask', meetingId: MEETING, question: q });

/** Every value in every store, as one string. */
async function everything(): Promise<string> {
  const all: unknown[] = [];
  for (const store of db.objectStoreNames) all.push(await db.getAll(store));
  return JSON.stringify(all);
}

describe('where the notes never go', () => {
  it('a question carries them, but no stored segment, turn or meeting, nor the logs', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    await ask('What is on the agenda?');
    expect(JSON.stringify(requests)).toContain(NOTES_SENTINEL);
    expect(JSON.stringify(await meetings.listSegments(MEETING))).not.toContain(NOTES_SENTINEL);
    expect(JSON.stringify(await meetings.getMeeting(MEETING))).not.toContain(NOTES_SENTINEL);
    expect(JSON.stringify(await deps.chats.listTurns(MEETING))).not.toContain(NOTES_SENTINEL);
    expect(JSON.stringify(logs)).not.toContain(NOTES_SENTINEL);
  });

  it('the downloaded transcript (007) holds only what was said', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    const file = transcriptFile(fixture.meeting, await meetings.listSegments(MEETING));
    expect(file.body).not.toContain(NOTES_SENTINEL);
    expect(file.body).toContain('Pricing stays at the current tier until January.');
  });

  it('after a remove, no store holds the notes text, and later questions do not carry it', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    await ask('First?');
    await contexts.remove(MEETING, 2);
    expect(await everything()).not.toContain(NOTES_SENTINEL);
    await ask('Second?');
    expect(JSON.stringify(requests.at(-1))).not.toContain(NOTES_SENTINEL);
  });

  it('after deleting the meeting, no store holds the notes or their record', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    await ask('First?');
    await meetings.deleteMeeting(MEETING);
    expect(await everything()).not.toContain(NOTES_SENTINEL);
    expect(await contexts.get(MEETING)).toBeUndefined();
  });
});

describe('after the meeting', () => {
  it('a stopped meeting is answered with its notes', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    await meetings.endMeeting(MEETING, 2_000_000, 'user-stop');
    await ask('What was left on the agenda?');
    expect(JSON.stringify(requests[0])).toContain(NOTES_SENTINEL);
  });
});
