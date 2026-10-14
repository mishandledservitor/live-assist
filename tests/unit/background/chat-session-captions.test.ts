// 013 T050 (decision 72, FR-008): a pinning test, expected green. The chat session answers a question about a meeting
// whose caption store holds the marker sentence, and sends none of it to the provider: it reads the meeting and its
// transcript lines, and has no way to read caption turns.
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ChatRequest } from '@/core/chat/provider';
import type { ChatTurn } from '@/core/chat/turn';
import { createLogger } from '@/core/log';
import type { ChatPortOut } from '@/core/messaging/protocol';
import { DEFAULT_CHAT_SETTINGS } from '@/core/settings/schema';
import { createChatSession, type ChatSessionDeps } from '@/entrypoints/background/chat-session';
import { createFixtureChatProvider } from '@/providers/chat/fixture-provider';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK, expectNoMarker, holdsMarker } from '../../support/caption-marker';
import { meetingWithCaptions, spokenBy, storedCaptionTurn, storedSegment } from '../../support/stored-meetings';

const meeting = meetingWithCaptions({ id: 'm1' });
const segments = [storedSegment('m1', 0, { ...spokenBy('Sarah Brown'), text: 'Pricing stays.' })];
const captionTurns = [
  storedCaptionTurn('m1', 1, { text: CAPTION_MARKER }),
  storedCaptionTurn('m1', 2, { speakerName: 'You', self: true, text: CAPTION_MARKER_GREEK }),
];

function harness() {
  const requests: ChatRequest[] = [];
  const posts: ChatPortOut[] = [];
  const stored: ChatTurn[] = [];
  const logs: unknown[][] = [];
  const sink = {
    error: (...a: unknown[]) => void logs.push(a),
    warn: (...a: unknown[]) => void logs.push(a),
    info: (...a: unknown[]) => void logs.push(a),
  };
  /** A whole meeting repository as far as reading goes, caption turns included, the way the service worker has one. */
  const repo = {
    getMeeting: vi.fn(() => Promise.resolve(meeting)),
    listSegments: vi.fn(() => Promise.resolve(segments)),
    listCaptionTurns: vi.fn(() => Promise.resolve(captionTurns)),
  };
  const deps: ChatSessionDeps = {
    meetings: repo,
    chats: {
      listTurns: () => Promise.resolve([...stored]),
      nextSeq: () => Promise.resolve(stored.length),
      markStaleStreaming: () => Promise.resolve([]),
      putTurn: (turn) => {
        const i = stored.findIndex((t) => t.id === turn.id);
        if (i >= 0) stored[i] = turn;
        else stored.push(turn);
        return Promise.resolve(true);
      },
    },
    chatSettings: () => Promise.resolve({ ...DEFAULT_CHAT_SETTINGS, setupComplete: true }),
    credentials: {
      id: 'local-key',
      status: () => Promise.resolve({ configured: true, hint: '1234' }),
      providerFor: (p) =>
        Promise.resolve(createFixtureChatProvider({ id: p, scenario: 'complete', onRequest: (r) => requests.push(r) })),
    },
    now: () => 1_000_000,
    logger: createLogger('chat', sink),
    post: (m) => void posts.push(m),
  };
  return { deps, repo, requests, posts, stored, logs };
}

describe("the chat session and Meet's kept captions", () => {
  it('sends the provider nothing of them, across two questions', async () => {
    const h = harness();
    expect(holdsMarker(captionTurns)).toBe(true);
    const session = createChatSession(h.deps);
    await session.handle({ type: 'chat/ask', meetingId: 'm1', question: 'What was decided about pricing?' });
    await session.handle({ type: 'chat/ask', meetingId: 'm1', question: 'Anything else?' });

    expect(h.requests).toHaveLength(2);
    expect(JSON.stringify(h.requests[0])).toContain('Pricing stays.');
    for (const request of h.requests) expectNoMarker(request);
    expectNoMarker(h.posts);
    expectNoMarker(h.stored);
    expectNoMarker(h.logs);
    expect(h.repo.listCaptionTurns).not.toHaveBeenCalled();
  });

  it('cannot read caption turns: what it is given of the meeting store has no such method', () => {
    expectTypeOf<ChatSessionDeps['meetings']>().not.toHaveProperty('listCaptionTurns');
    expectTypeOf<keyof ChatSessionDeps['meetings']>().toEqualTypeOf<'getMeeting' | 'listSegments'>();
  });
});
