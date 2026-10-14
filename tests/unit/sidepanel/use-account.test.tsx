// 006 T022 (research R4; 005 FR-008, FR-013): one account fetch per trigger, shared by the header badge and the
// Settings section — on open, when a running meeting stops, on refresh; never on a timer, never twice in flight.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountUsageReply } from '@/core/account/usage';
import { useAccount } from '@/entrypoints/sidepanel/hooks/useAccount';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const usage = { tier: 'creator', creditsUsed: 19_360, creditsLimit: 121_000, resetAt: null };
const ok: AccountUsageReply = { ok: true, usage };

describe('useAccount', () => {
  it('fetches once on mount and exposes the reply', async () => {
    const api = { usage: vi.fn(() => Promise.resolve(ok)) };
    const { result } = renderHook(() => useAccount(api, false));
    expect(result.current?.reply).toBeNull();
    expect(result.current?.busy).toBe(true);
    await waitFor(() => expect(result.current?.reply).toEqual(ok));
    expect(result.current?.busy).toBe(false);
    expect(api.usage).toHaveBeenCalledTimes(1);
  });

  it('fetches once more on the falling edge of meetingRunning, and not otherwise', async () => {
    const api = { usage: vi.fn(() => Promise.resolve(ok)) };
    const { rerender, result } = renderHook(({ running }) => useAccount(api, running), {
      initialProps: { running: false },
    });
    await waitFor(() => expect(result.current?.reply).toEqual(ok));
    rerender({ running: true });
    rerender({ running: true });
    expect(api.usage).toHaveBeenCalledTimes(1);
    rerender({ running: false });
    await waitFor(() => expect(api.usage).toHaveBeenCalledTimes(2));
    rerender({ running: false });
    expect(api.usage).toHaveBeenCalledTimes(2);
  });

  it('refresh() fetches again and is ignored while one is in flight', async () => {
    let finish: (r: AccountUsageReply) => void = () => undefined;
    const api = {
      usage: vi
        .fn<() => Promise<AccountUsageReply>>()
        .mockResolvedValueOnce(ok)
        .mockImplementationOnce(() => new Promise((r) => (finish = r))),
    };
    const { result } = renderHook(() => useAccount(api, false));
    await waitFor(() => expect(result.current?.reply).toEqual(ok));
    act(() => result.current!.refresh());
    act(() => result.current!.refresh());
    expect(api.usage).toHaveBeenCalledTimes(2);
    expect(result.current?.busy).toBe(true);
    expect(result.current?.reply).toEqual(ok);
    act(() => finish({ ok: false, kind: 'network' }));
    await waitFor(() => expect(result.current?.reply).toEqual({ ok: false, kind: 'network' }));
  });

  it('never fetches on a timer', async () => {
    vi.useFakeTimers();
    const api = { usage: vi.fn(() => Promise.resolve(ok)) };
    renderHook(() => useAccount(api, false));
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(api.usage).toHaveBeenCalledTimes(1);
  });

  it('is null without an account API', () => {
    const { result } = renderHook(() => useAccount(undefined, false));
    expect(result.current).toBeNull();
  });
});
