// 003 T036: the panel's chat state (data-model "Panel chat state"): stored turns for the meeting shown, patched by
// the service worker's messages; one waiting question while an answer streams (FR-009, research R15).
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChat, type ChatState } from '@/entrypoints/sidepanel/hooks/useChat';
import { chatTurnView, fakeChatApi } from './fake-chat-api';

afterEach(cleanup);

describe('useChat', () => {
  it('loads the turns of the meeting shown, and clears them when there is none', async () => {
    const fake = fakeChatApi({ m1: [chatTurnView({ seq: 0 })], m2: [] });
    const { result, rerender } = renderHook<ChatState, { id: string | null }>(({ id }) => useChat(fake.api, id), {
      initialProps: { id: 'm1' },
    });
    await waitFor(() => expect(result.current.turns).toHaveLength(1));
    expect(fake.api.listTurns).toHaveBeenCalledWith('m1');
    rerender({ id: 'm2' });
    await waitFor(() => expect(result.current.turns).toEqual([]));
    rerender({ id: null });
    expect(result.current.turns).toEqual([]);
  });

  it('asks, then applies turn, model, deltas and end', async () => {
    const fake = fakeChatApi();
    const { result } = renderHook(() => useChat(fake.api, 'm1'));
    await waitFor(() => expect(fake.api.listTurns).toHaveBeenCalled());
    act(() => result.current.ask('What about pricing?'));
    expect(fake.api.ask).toHaveBeenCalledWith('m1', 'What about pricing?');

    const turn = chatTurnView({ seq: 0, question: 'What about pricing?' });
    act(() => {
      fake.emit({ type: 'chat/turn', turn: { ...turn, answer: '', status: 'streaming', answeredBy: null } });
      fake.emit({ type: 'chat/model', turnId: turn.id, model: 'claude-sonnet-5' });
      fake.emit({ type: 'chat/delta', turnId: turn.id, text: 'Pricing ' });
      fake.emit({ type: 'chat/delta', turnId: turn.id, text: 'stays [00:12].' });
    });
    expect(result.current.streaming?.id).toBe(turn.id);
    expect(result.current.turns[0]).toMatchObject({ answer: 'Pricing stays [00:12].', answeredBy: 'claude-sonnet-5' });
    act(() => fake.emit({ type: 'chat/end', turnId: turn.id, status: 'complete', error: null }));
    expect(result.current.turns[0]!.status).toBe('complete');
    expect(result.current.streaming).toBeNull();
  });

  it('ignores turns of another meeting', async () => {
    const fake = fakeChatApi();
    const { result } = renderHook(() => useChat(fake.api, 'm1'));
    await waitFor(() => expect(fake.api.listTurns).toHaveBeenCalled());
    act(() => fake.emit({ type: 'chat/turn', turn: chatTurnView({ seq: 0, meetingId: 'other' }) }));
    expect(result.current.turns).toEqual([]);
  });

  it('a rejection sets the notice and hands the question back', async () => {
    const fake = fakeChatApi();
    const onReturn = vi.fn();
    const { result } = renderHook(() => useChat(fake.api, 'm1', { onReturn }));
    await waitFor(() => expect(fake.api.listTurns).toHaveBeenCalled());
    act(() => result.current.ask('Anything yet?'));
    act(() => fake.emit({ type: 'chat/rejected', kind: 'empty-transcript' }));
    expect(result.current.notice).toBe('empty-transcript');
    expect(onReturn).toHaveBeenCalledWith('Anything yet?');
    act(() => result.current.ask('Again?'));
    expect(result.current.notice).toBeNull();
  });

  describe('a question that got no answer (FR-018a, design decision 80)', () => {
    const waitingTurn = (seq: number, question: string) => ({
      ...chatTurnView({ seq, question }),
      status: 'streaming' as const,
      answer: '',
      answeredBy: null,
    });

    it('is handed back, through the same path as a question turned away', async () => {
      const fake = fakeChatApi();
      const onReturn = vi.fn();
      const { result } = renderHook(() => useChat(fake.api, 'm1', { onReturn }));
      await waitFor(() => expect(fake.api.listTurns).toHaveBeenCalled());
      act(() => result.current.ask('Who am I?'));
      const turn = waitingTurn(0, 'Who am I?');
      act(() => fake.emit({ type: 'chat/turn', turn }));
      expect(onReturn).not.toHaveBeenCalled();
      act(() => fake.emit({ type: 'chat/end', turnId: turn.id, status: 'failed', error: 'no-answer' }));
      expect(onReturn).toHaveBeenCalledTimes(1);
      expect(onReturn).toHaveBeenCalledWith('Who am I?');
      expect(result.current.turns[0]).toMatchObject({ status: 'failed', error: 'no-answer', answer: '' });
      expect(result.current.streaming).toBeNull();
      expect(result.current.notice).toBeNull();
    });

    it.each([
      ['failed', 'network'],
      ['failed', 'declined'],
      ['stopped', null],
      ['complete', null],
    ] as const)('a turn that ends %s (%s) is not handed back', async (status, error) => {
      const fake = fakeChatApi();
      const onReturn = vi.fn();
      const { result } = renderHook(() => useChat(fake.api, 'm1', { onReturn }));
      await waitFor(() => expect(fake.api.listTurns).toHaveBeenCalled());
      act(() => result.current.ask('Who am I?'));
      const turn = waitingTurn(0, 'Who am I?');
      act(() => fake.emit({ type: 'chat/turn', turn }));
      act(() => fake.emit({ type: 'chat/end', turnId: turn.id, status, error }));
      expect(onReturn).not.toHaveBeenCalled();
    });

    it('a question queued behind it is sent when it ends, and the unanswered one is the one handed back', async () => {
      const fake = fakeChatApi();
      const onReturn = vi.fn();
      const { result } = renderHook(() => useChat(fake.api, 'm1', { onReturn }));
      await waitFor(() => expect(fake.api.listTurns).toHaveBeenCalled());
      act(() => result.current.ask('Who am I?'));
      const turn = waitingTurn(0, 'Who am I?');
      act(() => fake.emit({ type: 'chat/turn', turn }));
      act(() => result.current.ask('And who disagreed?'));
      expect(result.current.waiting).toBe('And who disagreed?');
      expect(fake.api.ask).toHaveBeenCalledTimes(1);

      act(() => fake.emit({ type: 'chat/end', turnId: turn.id, status: 'failed', error: 'no-answer' }));
      expect(fake.api.ask).toHaveBeenLastCalledWith('m1', 'And who disagreed?');
      expect(result.current.waiting).toBeNull();
      expect(onReturn).toHaveBeenCalledTimes(1);
      expect(onReturn).toHaveBeenCalledWith('Who am I?');

      // The queued question's own end hands nothing back.
      const next = waitingTurn(1, 'And who disagreed?');
      act(() => fake.emit({ type: 'chat/turn', turn: next }));
      act(() => fake.emit({ type: 'chat/end', turnId: next.id, status: 'complete', error: null }));
      expect(onReturn).toHaveBeenCalledTimes(1);
    });
  });

  it('asking while an answer streams waits, and sends when that answer ends (R15)', async () => {
    const fake = fakeChatApi();
    const { result } = renderHook(() => useChat(fake.api, 'm1'));
    await waitFor(() => expect(fake.api.listTurns).toHaveBeenCalled());
    const turn = chatTurnView({ seq: 0 });
    act(() => fake.emit({ type: 'chat/turn', turn: { ...turn, status: 'streaming', answer: '' } }));
    act(() => result.current.ask('And who disagreed?'));
    expect(result.current.waiting).toBe('And who disagreed?');
    expect(fake.api.ask).not.toHaveBeenCalled();
    act(() => fake.emit({ type: 'chat/end', turnId: turn.id, status: 'stopped', error: null }));
    expect(fake.api.ask).toHaveBeenCalledWith('m1', 'And who disagreed?');
    expect(result.current.waiting).toBeNull();
  });

  it('stop sends chat/stop for the streaming turn', async () => {
    const fake = fakeChatApi();
    const { result } = renderHook(() => useChat(fake.api, 'm1'));
    await waitFor(() => expect(fake.api.listTurns).toHaveBeenCalled());
    const turn = chatTurnView({ seq: 0 });
    act(() => fake.emit({ type: 'chat/turn', turn: { ...turn, status: 'streaming', answer: '' } }));
    act(() => result.current.stop());
    expect(fake.api.stop).toHaveBeenCalledWith(turn.id);
  });

  it('a dropped port leaves a streaming answer stopped', async () => {
    const fake = fakeChatApi();
    const { result } = renderHook(() => useChat(fake.api, 'm1'));
    await waitFor(() => expect(fake.api.listTurns).toHaveBeenCalled());
    const turn = chatTurnView({ seq: 0 });
    act(() => fake.emit({ type: 'chat/turn', turn: { ...turn, status: 'streaming', answer: 'Part' } }));
    act(() => fake.drop());
    expect(result.current.turns[0]).toMatchObject({ status: 'stopped', answer: 'Part' });
    expect(result.current.streaming).toBeNull();
  });
});
