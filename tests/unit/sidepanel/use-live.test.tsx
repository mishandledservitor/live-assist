import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialStatus, reduceStatus } from '@/core/status/status';
import { segmentId, type Meeting, type TranscriptSegment } from '@/core/transcript/model';
import { useLive, type LiveApi } from '@/entrypoints/sidepanel/hooks/useLive';

afterEach(cleanup);

const meeting: Meeting = {
  id: 'm1',
  startedAt: 1,
  endedAt: null,
  endReason: null,
  source: { url: 'https://meet.google.com/x', title: 'Standup', platform: 'generic' },
  languageMode: { kind: 'auto' },
  userName: 'Alex',
  speakerRenames: {},
  schemaVersion: 1,
};

const seg = (seq: number, text: string): TranscriptSegment => ({
  id: segmentId('m1', 'mixed', seq),
  meetingId: 'm1',
  stream: 'mixed',
  seq,
  startMs: seq * 1000,
  endMs: seq * 1000 + 500,
  text,
  language: null,
  speakerLabel: 'Others',
  labelSource: 'fallback',
  captionName: null,
  captionSelf: false,
  labelOverride: null,
  schemaVersion: 2,
  words: [],
  timing: 'words',
  sessionId: 's',
  createdAt: 0,
});

function fakeApi(stored: { meeting: Meeting; segments: TranscriptSegment[] } | null = null) {
  const ports: { emit: (e: unknown) => void; disconnect: () => void; closed: boolean }[] = [];
  const latestStored = vi.fn(() => Promise.resolve(stored));
  const api: LiveApi = {
    connect: vi.fn((onEvent: (e: unknown) => void, onDisconnect: () => void) => {
      const port = { emit: onEvent, disconnect: onDisconnect, closed: false };
      ports.push(port);
      return () => {
        port.closed = true;
      };
    }),
    latestStored,
  };
  return { api, ports, latestStored };
}

const running = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });

describe('useLive', () => {
  it('takes the snapshot from a running meeting and follows segment, partial and status events', () => {
    const { api, ports } = fakeApi();
    const { result } = renderHook(() => useLive(api));
    act(() =>
      ports[0]!.emit({ type: 'live/snapshot', meeting, segments: [seg(0, 'a')], partials: [], status: running }),
    );
    expect(result.current.connected).toBe(true);
    expect(result.current.meeting?.id).toBe('m1');
    act(() => ports[0]!.emit({ type: 'live/segment', segment: seg(1, 'b') }));
    act(() => ports[0]!.emit({ type: 'live/segment', segment: seg(1, 'b') })); // duplicate ignored
    act(() => ports[0]!.emit({ type: 'live/partial', stream: 'mixed', text: 'hel' }));
    const active = reduceStatus(running, { type: 'capture', state: 'active' });
    act(() => ports[0]!.emit({ type: 'live/status', status: active }));
    expect(result.current.segments.map((s) => s.text)).toEqual(['a', 'b']);
    expect(result.current.partials).toEqual([{ stream: 'mixed', text: 'hel' }]);
    expect(result.current.status.capture.state).toBe('active');
  });

  it('keeps the last status (e.g. why the meeting failed) when the meeting it showed ends and disconnects', async () => {
    const ended = { ...meeting, endedAt: 9, endReason: 'failed' as const };
    const { api, ports } = fakeApi({ meeting: ended, segments: [seg(0, 'a')] });
    const { result } = renderHook(() => useLive(api));
    const failed = reduceStatus(running, { type: 'capture', state: 'failed', reason: 'Quota used up.' });
    act(() =>
      ports[0]!.emit({ type: 'live/snapshot', meeting, segments: [seg(0, 'a')], partials: [], status: failed }),
    );
    act(() => ports[0]!.disconnect());
    await waitFor(() => expect(result.current.meeting?.endReason).toBe('failed'));
    expect(result.current.connected).toBe(false);
    expect(result.current.status.capture).toEqual({ state: 'failed', reason: 'Quota used up.' });
  });

  it('live/segment-updated replaces that line in place and keeps every other line object (002 T038)', () => {
    const { api, ports } = fakeApi();
    const { result } = renderHook(() => useLive(api));
    act(() =>
      ports[0]!.emit({
        type: 'live/snapshot',
        meeting,
        segments: [seg(0, 'a'), seg(1, 'b'), seg(2, 'c')],
        partials: [],
        status: running,
      }),
    );
    const before = result.current.segments;
    const named = {
      ...seg(1, 'b'),
      speakerLabel: 'Emma Jones',
      labelSource: 'caption' as const,
      captionName: 'Emma Jones',
    };
    act(() => ports[0]!.emit({ type: 'live/segment-updated', segment: named }));
    const after = result.current.segments;
    expect(after.map((s) => s.speakerLabel)).toEqual(['Others', 'Emma Jones', 'Others']);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
  });

  it('live/segment-updated for a line the panel does not have is ignored', () => {
    const { api, ports } = fakeApi();
    const { result } = renderHook(() => useLive(api));
    act(() =>
      ports[0]!.emit({ type: 'live/snapshot', meeting, segments: [seg(0, 'a')], partials: [], status: running }),
    );
    act(() => ports[0]!.emit({ type: 'live/segment-updated', segment: seg(7, 'x') }));
    expect(result.current.segments.map((s) => s.text)).toEqual(['a']);
  });

  it("live/labels replaces the meeting's renames", () => {
    const { api, ports } = fakeApi();
    const { result } = renderHook(() => useLive(api));
    act(() => ports[0]!.emit({ type: 'live/snapshot', meeting, segments: [], partials: [], status: running }));
    const speakerRenames = { 'caption:emma jones': { name: 'Emma', origin: 'remembered' as const } };
    act(() => ports[0]!.emit({ type: 'live/labels', meetingId: 'm1', speakerRenames }));
    expect(result.current.meeting?.speakerRenames).toEqual(speakerRenames);
    // Renames for another meeting are not applied.
    act(() => ports[0]!.emit({ type: 'live/labels', meetingId: 'other', speakerRenames: {} }));
    expect(result.current.meeting?.speakerRenames).toEqual(speakerRenames);
  });

  // 013 T031 (FR-018, FR-022): the panel learns that the running meeting has kept captions, never what they say.
  it('live/captions-kept marks the meeting shown as having captions, once, and changes nothing else', () => {
    const { api, ports } = fakeApi();
    const { result } = renderHook(() => useLive(api));
    act(() =>
      ports[0]!.emit({ type: 'live/snapshot', meeting, segments: [seg(0, 'a')], partials: [], status: running }),
    );
    expect(result.current.meeting).not.toHaveProperty('hasCaptions');
    const before = result.current;
    act(() => ports[0]!.emit({ type: 'live/captions-kept', meetingId: 'm1' }));
    expect(result.current.meeting).toEqual({ ...meeting, hasCaptions: true });
    expect(result.current.segments).toBe(before.segments);
    expect(result.current.status).toBe(before.status);
    // A repeat is not a change: the same meeting object, so nothing re-renders.
    const marked = result.current.meeting;
    act(() => ports[0]!.emit({ type: 'live/captions-kept', meetingId: 'm1' }));
    expect(result.current.meeting).toBe(marked);
  });

  it('live/captions-kept for another meeting, or before any meeting, changes nothing', () => {
    const { api, ports } = fakeApi();
    const { result } = renderHook(() => useLive(api));
    act(() => ports[0]!.emit({ type: 'live/captions-kept', meetingId: 'm1' }));
    expect(result.current.meeting).toBeNull();
    act(() => ports[0]!.emit({ type: 'live/snapshot', meeting, segments: [], partials: [], status: running }));
    const shown = result.current.meeting;
    act(() => ports[0]!.emit({ type: 'live/captions-kept', meetingId: 'other' }));
    expect(result.current.meeting).toBe(shown);
    expect(result.current.meeting).not.toHaveProperty('hasCaptions');
  });

  it('a snapshot of a meeting that already has captions carries the mark', () => {
    const { api, ports } = fakeApi();
    const { result } = renderHook(() => useLive(api));
    act(() =>
      ports[0]!.emit({
        type: 'live/snapshot',
        meeting: { ...meeting, hasCaptions: true },
        segments: [],
        partials: [],
        status: running,
      }),
    );
    expect(result.current.meeting?.hasCaptions).toBe(true);
  });

  it('ignores malformed events', () => {
    const { api, ports } = fakeApi();
    const { result } = renderHook(() => useLive(api));
    act(() => ports[0]!.emit({ type: 'live/segment', segment: { text: 1 } }));
    act(() => ports[0]!.emit('nonsense'));
    expect(result.current.segments).toEqual([]);
  });

  it('falls back to the most recent stored meeting when no runtime answers', async () => {
    const stored = { meeting: { ...meeting, endedAt: 9, endReason: 'user-stop' as const }, segments: [seg(0, 'kept')] };
    const { api, ports } = fakeApi(stored);
    const { result } = renderHook(() => useLive(api));
    act(() => ports[0]!.disconnect());
    await waitFor(() => expect(result.current.segments.map((s) => s.text)).toEqual(['kept']));
    expect(result.current.connected).toBe(false);
    expect(result.current.meeting?.endReason).toBe('user-stop');
    expect(result.current.status.capture.state).toBe('idle');
  });

  it('refresh() reconnects (after Start) and reloads stored data when nothing is running (after Delete)', async () => {
    const { api, ports, latestStored } = fakeApi(null);
    const { result } = renderHook(() => useLive(api));
    act(() => result.current.refresh());
    expect(ports[0]!.closed).toBe(true);
    expect(ports).toHaveLength(2);
    act(() => ports[1]!.disconnect());
    await waitFor(() => expect(latestStored).toHaveBeenCalled());
    expect(result.current.meeting).toBeNull();
  });

  it('closes the port on unmount', () => {
    const { api, ports } = fakeApi();
    const { unmount } = renderHook(() => useLive(api));
    unmount();
    expect(ports[0]!.closed).toBe(true);
  });
});
