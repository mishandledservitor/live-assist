// 003 T034: the side panel's chat api (contracts/chat-messages.md): validated port messages both ways, stored turns
// read from IndexedDB without the prompt text, key hints from the service worker, and a lazily reopened port.
import { describe, expect, it, vi } from 'vitest';
import { turnId, type ChatTurn } from '@/core/chat/turn';
import type { ChatPortOut } from '@/core/messaging/protocol';
import { createChatApi } from '@/entrypoints/sidepanel/chat-api';
import type { LivePort } from '@/entrypoints/sidepanel/meeting-api';

function fakePorts() {
  const opened: (LivePort & {
    emit(m: unknown): void;
    drop(): void;
    posted: unknown[];
    disconnected: ReturnType<typeof vi.fn>;
  })[] = [];
  const connect = vi.fn((_name: string) => {
    const messageListeners: ((m: unknown) => void)[] = [];
    const disconnectListeners: (() => void)[] = [];
    const disconnected = vi.fn();
    const port = {
      posted: [] as unknown[],
      disconnected,
      onMessage: { addListener: (l: (m: unknown) => void) => messageListeners.push(l) },
      onDisconnect: { addListener: (l: () => void) => disconnectListeners.push(l) },
      postMessage: (m: unknown) => port.posted.push(m),
      disconnect: disconnected,
      emit: (m: unknown) => messageListeners.forEach((l) => l(m)),
      drop: () => disconnectListeners.forEach((l) => l()),
    };
    opened.push(port);
    return port;
  });
  return { connect, opened };
}

const turn = (seq: number): ChatTurn => ({
  id: turnId('m1', seq),
  meetingId: 'm1',
  seq,
  question: 'Q?',
  askedAt: 1,
  contextBlock: 'Transcript of the meeting so far.',
  sentLines: { a: '[00:12] Jane: x' },
  transcriptUntilMs: 1,
  provider: 'anthropic',
  requestedModel: 'claude-sonnet-5-5',
  answeredBy: 'claude-sonnet-5-5',
  answer: 'A [00:12]',
  status: 'complete',
  error: null,
  updatedAt: 1,
  schemaVersion: 1,
});

function setup() {
  const ports = fakePorts();
  const listTurns = vi.fn((_id: string) => Promise.resolve([turn(0), turn(1)]));
  const api = createChatApi({ connect: ports.connect, repo: () => Promise.resolve({ listTurns }) });
  return { ...ports, listTurns, api };
}

describe('createChatApi', () => {
  it('opens the `chat` port lazily, on the first ask', () => {
    const { api, connect, opened } = setup();
    expect(connect).not.toHaveBeenCalled();
    api.ask('m1', 'What about pricing?');
    expect(connect).toHaveBeenCalledWith('chat');
    expect(opened[0]!.posted).toEqual([{ type: 'chat/ask', meetingId: 'm1', question: 'What about pricing?' }]);
  });

  it('stop posts chat/stop for the turn', () => {
    const { api, opened } = setup();
    api.ask('m1', 'Q?');
    api.stop('m1:chat:0');
    expect(opened[0]!.posted.at(-1)).toEqual({ type: 'chat/stop', turnId: 'm1:chat:0' });
  });

  it('does not post an invalid ask', () => {
    const { api, connect } = setup();
    api.ask('m1', '   ');
    api.ask('m1', 'x'.repeat(2001));
    expect(connect).not.toHaveBeenCalled();
  });

  it('passes on valid service-worker messages and drops invalid ones', () => {
    const { api, opened } = setup();
    const seen: ChatPortOut[] = [];
    api.subscribe((m) => seen.push(m));
    api.ask('m1', 'Q?');
    opened[0]!.emit({ type: 'chat/delta', turnId: 'm1:chat:0', text: 'Pricing' });
    opened[0]!.emit({ type: 'chat/delta', turnId: 'm1:chat:0' });
    opened[0]!.emit({ type: 'chat/turn', turn: { ...turn(0), status: 'streaming' } });
    expect(seen).toEqual([{ type: 'chat/delta', turnId: 'm1:chat:0', text: 'Pricing' }]);
  });

  it('tells subscribers when the port drops, and reopens it on the next ask', () => {
    const { api, connect, opened } = setup();
    const dropped = vi.fn();
    api.subscribe(() => undefined, dropped);
    api.ask('m1', 'Q?');
    opened[0]!.drop();
    expect(dropped).toHaveBeenCalledTimes(1);
    api.ask('m1', 'Again?');
    expect(connect).toHaveBeenCalledTimes(2);
    expect(opened[1]!.posted).toEqual([{ type: 'chat/ask', meetingId: 'm1', question: 'Again?' }]);
  });

  it('gives each question its own port and lets it go once the answer ends or the question is turned away', () => {
    // A port the service worker stopped holding (it is restarted when idle) could stay open through the offscreen
    // document, which also receives it; a port per question never outlives its answer.
    const { api, connect, opened } = setup();
    api.ask('m1', 'First?');
    opened[0]!.emit({ type: 'chat/end', turnId: 'm1:chat:0', status: 'complete', error: null });
    expect(opened[0]!.disconnected).toHaveBeenCalled();
    api.ask('m1', 'Second?');
    expect(connect).toHaveBeenCalledTimes(2);
    expect(opened[1]!.posted).toEqual([{ type: 'chat/ask', meetingId: 'm1', question: 'Second?' }]);
    opened[1]!.emit({ type: 'chat/rejected', kind: 'empty-transcript' });
    expect(opened[1]!.disconnected).toHaveBeenCalled();
  });

  it('listTurns reads the meeting turns through the repo, without the prompt text', async () => {
    const { api, listTurns } = setup();
    const turns = await api.listTurns('m1');
    expect(listTurns).toHaveBeenCalledWith('m1');
    expect(turns.map((t) => t.seq)).toEqual([0, 1]);
    for (const t of turns) {
      expect(t).not.toHaveProperty('contextBlock');
      expect(t).not.toHaveProperty('sentLines');
    }
  });
});
