// 014 T006 (FR-008; research R3): when the meeting shown goes away (Close, or another meeting takes its place) while
// an answer for it is still arriving, that answer is stopped once, and a question waiting behind it is never sent.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useChat } from '@/entrypoints/sidepanel/hooks/useChat';
import { chatTurnView, fakeChatApi } from './fake-chat-api';

afterEach(cleanup);

interface Shown {
  id: string | null;
}

function streamingFor(meetingId: string) {
  const chat = fakeChatApi();
  const initialProps: Shown = { id: meetingId };
  const view = renderHook(({ id }: Shown) => useChat(chat.api, id), { initialProps });
  const turn = chatTurnView({ seq: 1, meetingId });
  act(() => view.result.current.ask('What was decided?'));
  act(() => chat.emit({ type: 'chat/turn', turn: { ...turn, answer: '', status: 'streaming', answeredBy: null } }));
  act(() => chat.emit({ type: 'chat/delta', turnId: turn.id, text: 'The team' }));
  return { chat, view, turn };
}

describe('useChat when the meeting shown goes away mid-answer (014)', () => {
  it('stops the answer once when the main view is cleared', () => {
    const { chat, view, turn } = streamingFor('m1');
    expect(view.result.current.streaming?.id).toBe(turn.id);
    view.rerender({ id: null });
    expect(chat.api.stop.mock.calls).toEqual([[turn.id]]);
    view.rerender({ id: null });
    expect(chat.api.stop).toHaveBeenCalledTimes(1);
  });

  it('stops it when another meeting takes its place', () => {
    const { chat, view, turn } = streamingFor('m1');
    view.rerender({ id: 'm2' });
    expect(chat.api.stop.mock.calls).toEqual([[turn.id]]);
  });

  it('drops a question waiting behind the answer', () => {
    const { chat, view, turn } = streamingFor('m1');
    act(() => view.result.current.ask('And who owns it?'));
    expect(view.result.current.waiting).toBe('And who owns it?');
    const asked = chat.api.ask.mock.calls.length;
    view.rerender({ id: null });
    act(() => chat.emit({ type: 'chat/end', turnId: turn.id, status: 'stopped', error: null }));
    act(() => chat.drop());
    expect(chat.api.ask.mock.calls.length).toBe(asked);
  });

  it('does not stop anything when no answer is arriving', () => {
    const chat = fakeChatApi();
    const initialProps: Shown = { id: 'm1' };
    const view = renderHook(({ id }: Shown) => useChat(chat.api, id), { initialProps });
    view.rerender({ id: null });
    expect(chat.api.stop).not.toHaveBeenCalled();
  });
});
