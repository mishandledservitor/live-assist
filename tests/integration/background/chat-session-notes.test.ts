// 008 T022 (and T042, T050 cases): the chat session with notes (contracts/notes-messages.md "Chat session"), over
// fake-indexeddb with the scripted fixture provider recording each request.
import { beforeEach, describe, expect, it } from 'vitest';
import { NEXT_MEETING_KEY, notesBlock } from '@/core/chat/notes';
import type { ChatCredentialSource, ChatRequest } from '@/core/chat/provider';
import { createLogger } from '@/core/log';
import type { ChatPortOut } from '@/core/messaging/protocol';
import { DEFAULT_CHAT_SETTINGS } from '@/core/settings/schema';
import { createChatSession, type ChatSessionDeps } from '@/entrypoints/background/chat-session';
import { createFixtureChatProvider } from '@/providers/chat/fixture-provider';
import { ChatRepo } from '@/storage/chat-repo';
import { ContextRepo } from '@/storage/context-repo';
import { openLiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { NOTES_SENTINEL, notesStandup } from '../../support/notes';

const fixture = notesStandup();
const MEETING = fixture.meeting.id;

let n = 0;
let chats: ChatRepo;
let contexts: ContextRepo;
let meetings: MeetingRepo;
let requests: ChatRequest[];
let posts: ChatPortOut[];
let logs: unknown[][];
let deps: ChatSessionDeps;

beforeEach(async () => {
  n += 1;
  const db = await openLiveAssistDb(`chat-session-notes-${n}`);
  meetings = new MeetingRepo(db);
  chats = new ChatRepo(db);
  contexts = new ContextRepo(db);
  await meetings.createMeeting(fixture.meeting);
  for (const s of fixture.segments) await meetings.appendSegment(s);
  requests = [];
  posts = [];
  logs = [];
  const credentials: ChatCredentialSource = {
    id: 'local-key',
    status: () => Promise.resolve({ configured: true, hint: '1234' }),
    providerFor: (p) =>
      Promise.resolve(createFixtureChatProvider({ id: p, scenario: 'complete', onRequest: (r) => requests.push(r) })),
  };
  const sink = {
    error: (...a: unknown[]) => logs.push(a),
    warn: (...a: unknown[]) => logs.push(a),
    info: (...a: unknown[]) => logs.push(a),
  };
  deps = {
    meetings,
    chats,
    contexts,
    chatSettings: () => Promise.resolve({ ...DEFAULT_CHAT_SETTINGS, setupComplete: true }),
    credentials,
    now: () => 1_000_000,
    logger: createLogger('chat', sink),
    post: (m) => posts.push(m),
  };
});

const ask = (question: string) => createChatSession(deps).handle({ type: 'chat/ask', meetingId: MEETING, question });
const userTurns = (r: ChatRequest) => r.turns.filter((t) => t.role === 'user');
const logged = () => logs.filter((l) => l[0] === '[chat]' || JSON.stringify(l).includes('chat answer'));

describe('asking with notes', () => {
  it('sends an "added" block on the first question and stores only a reference', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    await ask('Which agenda items are left?');
    const [request] = requests;
    expect(userTurns(request!)[0]!.notes).toBe(notesBlock('added', { ...fixture.notes }));
    const [turn] = await chats.listTurns(MEETING);
    expect(turn!.notesSent).toEqual({ version: 1, kind: 'added' });
    expect(JSON.stringify(turn)).not.toContain(NOTES_SENTINEL);
    expect(JSON.stringify(posts)).not.toContain(NOTES_SENTINEL);
  });

  it('replays the block with the earlier turn and sends none with the next question', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    await ask('First?');
    await ask('Second?');
    const second = userTurns(requests[1]!);
    expect(second[0]!.notes).toBe(notesBlock('added', { ...fixture.notes }));
    expect(second[1]).not.toHaveProperty('notes');
    expect((await chats.listTurns(MEETING))[1]!.notesSent).toBeNull();
  });

  it('logs what the request did with the notes, never their name or text', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    await ask('First?');
    await ask('Second?');
    const lines = JSON.stringify(logged());
    expect(lines).toContain('"notes":"added"');
    expect(lines).toContain('"notes":"kept"');
    expect(JSON.stringify(logs)).not.toContain(NOTES_SENTINEL);
    expect(JSON.stringify(logs)).not.toContain('agenda.md');
  });

  it('a meeting without notes sends no notes key and logs notes: none', async () => {
    await ask('First?');
    for (const t of userTurns(requests[0]!)) expect(t).not.toHaveProperty('notes');
    expect(JSON.stringify(logged())).toContain('"notes":"none"');
  });

  it('pending notes are not this meeting’s notes', async () => {
    await contexts.set(NEXT_MEETING_KEY, fixture.notes, 1);
    await ask('First?');
    expect(userTurns(requests[0]!)[0]).not.toHaveProperty('notes');
  });
});

describe('changing the notes (008 T042)', () => {
  const minutes = { name: 'minutes.md', source: 'file' as const, text: 'Minutes text' };

  it('replace: the old text is sent no more, the earlier turn keeps its transcript, question and answer', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    await ask('First?');
    await contexts.set(MEETING, minutes, 2);
    await ask('Second?');
    const second = requests[1]!;
    expect(JSON.stringify(second)).not.toContain(NOTES_SENTINEL);
    const users = userTurns(second);
    expect(users[0]).not.toHaveProperty('notes');
    expect(users[0]!.context).toBe(userTurns(requests[0]!)[0]!.context);
    expect(second.turns[1]).toEqual(
      requests[0] && { role: 'assistant', text: (await chats.listTurns(MEETING))[0]!.answer },
    );
    expect(users[1]!.notes).toBe(notesBlock('replaced', minutes));
    expect(JSON.stringify(logged())).toContain('"notes":"replaced"');
  });

  it('remove: no notes text in the next request, which says they were removed', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    await ask('First?');
    await contexts.remove(MEETING, 2);
    await ask('Second?');
    const second = requests[1]!;
    expect(JSON.stringify(second)).not.toContain(NOTES_SENTINEL);
    expect(userTurns(second)[1]!.notes).toBe(notesBlock('removed', null));
    expect(JSON.stringify(logged())).toContain('"notes":"removed"');
  });

  it('a change while an answer streams applies from the next question', async () => {
    await contexts.set(MEETING, fixture.notes, 1);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    deps.credentials = {
      ...deps.credentials,
      providerFor: (p) =>
        Promise.resolve({
          id: p,
          checkKey: () => Promise.resolve({ ok: true }),
          async *stream(request) {
            requests.push(request);
            yield { type: 'model', model: 'gpt-6-luna' };
            await gate;
            yield { type: 'text', text: 'Answer.' };
            yield { type: 'done', finish: 'complete', usage: null };
          },
        }),
    };
    const first = ask('First?');
    await new Promise((r) => setTimeout(r, 20));
    await contexts.set(MEETING, minutes, 2);
    release();
    await first;
    expect(userTurns(requests[0]!)[0]!.notes).toContain(NOTES_SENTINEL);
    expect((await chats.listTurns(MEETING))[0]!.notesSent).toEqual({ version: 1, kind: 'added' });
    await ask('Second?');
    expect(userTurns(requests[1]!)[1]!.notes).toBe(notesBlock('replaced', minutes));
  });
});
