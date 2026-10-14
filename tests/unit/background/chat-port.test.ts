// 003 T032: only the extension's own side panel may open the `chat` port (contracts/chat-messages.md); other ports
// (the offscreen document's `live`, Meet's) are left alone, and every incoming message is validated.
import { describe, expect, it, vi } from 'vitest';
import { acceptChatPort, type ChatPortLike } from '@/entrypoints/background/chat-session';

const PANEL = 'chrome-extension://ext-id/sidepanel.html';

function fakePort(name: string, sender: { id?: string; url?: string }) {
  const messageListeners: ((m: unknown) => void)[] = [];
  const disconnectListeners: (() => void)[] = [];
  const postMessage = vi.fn();
  const disconnect = vi.fn();
  const port: ChatPortLike & {
    emit(m: unknown): void;
    drop(): void;
    spies: { postMessage: typeof postMessage; disconnect: typeof disconnect };
  } = {
    name,
    sender,
    postMessage,
    disconnect,
    spies: { postMessage, disconnect },
    onMessage: { addListener: (l) => messageListeners.push(l) },
    onDisconnect: { addListener: (l) => disconnectListeners.push(l) },
    emit: (m) => messageListeners.forEach((l) => l(m)),
    drop: () => disconnectListeners.forEach((l) => l()),
  };
  return port;
}

function deps() {
  const session = { handle: vi.fn(() => Promise.resolve()), disconnect: vi.fn() };
  const createSession = vi.fn((_post: (m: unknown) => void) => session);
  const foreign = vi.fn();
  return { session, createSession, foreign, d: { runtimeId: 'ext-id', sidePanelUrl: PANEL, createSession, foreign } };
}

describe('acceptChatPort', () => {
  it('accepts a `chat` port from the side panel and wires it to a session', () => {
    const { d, session, createSession } = deps();
    const port = fakePort('chat', { id: 'ext-id', url: PANEL });
    expect(acceptChatPort(port, d)).toBe(true);
    expect(createSession).toHaveBeenCalledTimes(1);
    port.emit({ type: 'chat/ask', meetingId: 'm1', question: '  Pricing?  ' });
    expect(session.handle).toHaveBeenCalledWith({ type: 'chat/ask', meetingId: 'm1', question: 'Pricing?' });
    createSession.mock.calls[0]![0]({ type: 'chat/rejected', kind: 'busy' });
    expect(port.spies.postMessage).toHaveBeenCalledWith({ type: 'chat/rejected', kind: 'busy' });
    port.drop();
    expect(session.disconnect).toHaveBeenCalled();
  });

  it('accepts the side panel opened with a query (e2e builds)', () => {
    const { d } = deps();
    expect(acceptChatPort(fakePort('chat', { id: 'ext-id', url: `${PANEL}?e2eTabId=3` }), d)).toBe(true);
  });

  it('drops invalid messages', () => {
    const { d, session } = deps();
    const port = fakePort('chat', { id: 'ext-id', url: PANEL });
    acceptChatPort(port, d);
    port.emit({ type: 'chat/ask', meetingId: 'm1', question: '' });
    port.emit({ type: 'chat/delete', meetingId: 'm1' });
    port.emit('chat/ask');
    expect(session.handle).not.toHaveBeenCalled();
  });

  it('disconnects a `chat` port from another page or extension', () => {
    for (const sender of [
      { id: 'ext-id', url: 'chrome-extension://ext-id/offscreen.html' },
      { id: 'other-ext', url: 'chrome-extension://other-ext/sidepanel.html' },
      { id: 'ext-id', url: 'https://meet.google.com/abc' },
      {},
    ]) {
      const { d, createSession } = deps();
      const port = fakePort('chat', sender);
      expect(acceptChatPort(port, d)).toBe(false);
      expect(port.spies.disconnect).toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    }
  });

  it('hands ports with other names to the foreign-port holder and never disconnects them itself', () => {
    // A port reaches every onConnect listener, and disconnecting any receiving end closes it for its opener: the
    // panel's `live` port must stay open while the offscreen document holds it (foreign-ports.ts).
    const { d, createSession, foreign } = deps();
    const port = fakePort('live', { id: 'ext-id', url: PANEL });
    expect(acceptChatPort(port, d)).toBe(false);
    expect(foreign).toHaveBeenCalledWith(port);
    expect(port.spies.disconnect).not.toHaveBeenCalled();
    expect(port.spies.postMessage).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});
