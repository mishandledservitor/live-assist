// In-memory MeetingApi + LiveApi for side panel component tests: no runtime answers, so the panel shows stored data.
import { vi } from 'vitest';
import type { StoredCaptionTurn } from '@/core/captions/model';
import type { StartResult } from '@/core/messaging/protocol';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';
import type { LiveApi } from '@/entrypoints/sidepanel/hooks/useLive';
import type { MeetingApi } from '@/entrypoints/sidepanel/meeting-api';

export function fakeMeetingApi(
  stored: { meeting: Meeting; segments: TranscriptSegment[]; captionTurns?: StoredCaptionTurn[] } | null = null,
) {
  let startResult: StartResult = { ok: true, meetingId: 'm-new' };
  // 012: the main view was cleared, so no stored meeting shows on it until the next Start.
  let cleared = false;
  const clearedListeners = new Set<() => void>();
  const api = {
    start: vi.fn((_language: unknown) => Promise.resolve(startResult)),
    stop: vi.fn(() => Promise.resolve({ ok: true as const })),
    deleteMeeting: vi.fn((_id: string) => Promise.resolve()),
    // 013: the stored meeting's kept caption turns, read at a download.
    captionTurns: vi.fn((id: string) =>
      Promise.resolve(stored?.meeting.id === id ? [...(stored.captionTurns ?? [])] : []),
    ),
    renameSpeaker: vi.fn((..._a: unknown[]) => Promise.resolve()),
    overrideLine: vi.fn((..._a: unknown[]) => Promise.resolve()),
    connect: vi.fn((_onEvent: (e: unknown) => void, onDisconnect: () => void) => {
      queueMicrotask(onDisconnect);
      return () => undefined;
    }),
    latestStored: vi.fn(() =>
      Promise.resolve(cleared || !stored ? null : { meeting: stored.meeting, segments: stored.segments }),
    ),
    clearMainView: vi.fn(() => {
      cleared = true;
      return Promise.resolve();
    }),
    onMainViewCleared: vi.fn((listener: () => void) => {
      clearedListeners.add(listener);
      return () => void clearedListeners.delete(listener);
    }),
  } satisfies MeetingApi & LiveApi;
  return {
    api,
    failNextStart(result: StartResult) {
      startResult = result;
    },
    /** 012: what `latestStored` hides (true) or shows (false) from now on, without telling the panel. */
    setCleared(value: boolean) {
      cleared = value;
    },
    /** 012: the main view was cleared in another window's panel. */
    clearedElsewhere() {
      cleared = true;
      for (const listener of clearedListeners) listener();
    },
    clearedListenerCount: () => clearedListeners.size,
  };
}
