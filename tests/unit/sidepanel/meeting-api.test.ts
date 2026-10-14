import { describe, expect, it, vi } from 'vitest';
import type { StoredCaptionTurn } from '@/core/captions/model';
import type { Meeting } from '@/core/transcript/model';
import { createMeetingApi, type MeetingApiDeps } from '@/entrypoints/sidepanel/meeting-api';

const meeting = { id: 'm1', startedAt: 1_000 } as Meeting;

function setup(over: Partial<MeetingApiDeps> = {}) {
  const repo = {
    deleteMeeting: vi.fn(() => Promise.resolve()),
    latestMeeting: vi.fn(() => Promise.resolve<Meeting | undefined>(meeting)),
    listSegments: vi.fn(() => Promise.resolve([])),
    listCaptionTurns: vi.fn((_id: string) => Promise.resolve<StoredCaptionTurn[]>([])),
    setSpeakerRename: vi.fn((..._a: unknown[]) => Promise.resolve()),
    setLabelOverride: vi.fn((..._a: unknown[]) => Promise.resolve()),
  };
  const remember = vi.fn((_captionName: string, _displayName: string) => Promise.resolve());
  const listeners = { message: [] as ((m: unknown) => void)[], disconnect: [] as (() => void)[] };
  const port = {
    onMessage: { addListener: (l: (m: unknown) => void) => listeners.message.push(l) },
    onDisconnect: { addListener: (l: () => void) => listeners.disconnect.push(l) },
    disconnect: vi.fn(),
    postMessage: vi.fn((_m: unknown) => undefined),
  };
  const sendCommand = vi.fn((_c: unknown) => Promise.resolve<unknown>({ ok: true, meetingId: 'm9' }));
  const connect = vi.fn((_name: string) => port);
  const mainView = {
    clearedAt: vi.fn(() => Promise.resolve<number | null>(null)),
    clear: vi.fn((_at: number) => Promise.resolve()),
    onChange: vi.fn((_listener: () => void) => () => undefined),
  };
  const deps: MeetingApiDeps = {
    activeTabId: vi.fn(() => Promise.resolve<number | undefined>(7)),
    sendCommand,
    repo: () => Promise.resolve(repo),
    connect,
    rememberSpeakerName: remember,
    mainView,
    now: () => 5_000,
    ...over,
  };
  return { api: createMeetingApi(deps), sendCommand, connect, repo, port, listeners, remember, mainView };
}

describe('createMeetingApi', () => {
  it('starts the active tab with the chosen language', async () => {
    const { api, sendCommand } = setup();
    expect(await api.start({ kind: 'auto' })).toEqual({ ok: true, meetingId: 'm9' });
    expect(sendCommand).toHaveBeenCalledWith({ type: 'meeting/start', tabId: 7, language: { kind: 'auto' } });
  });

  it('passes start errors through, including the running tab title', async () => {
    const { api } = setup({
      sendCommand: () => Promise.resolve({ ok: false, error: 'already-running', runningTabTitle: 'Sync' }),
    });
    expect(await api.start({ kind: 'auto' })).toEqual({ ok: false, error: 'already-running', runningTabTitle: 'Sync' });
  });

  it('treats an unreadable or failed reply as offscreen-failed, and no active tab as not capturable', async () => {
    expect(await setup({ sendCommand: () => Promise.resolve('?') }).api.start({ kind: 'auto' })).toEqual({
      ok: false,
      error: 'offscreen-failed',
    });
    expect(await setup({ sendCommand: () => Promise.reject(new Error('x')) }).api.start({ kind: 'auto' })).toEqual({
      ok: false,
      error: 'offscreen-failed',
    });
    expect(await setup({ activeTabId: () => Promise.resolve(undefined) }).api.start({ kind: 'auto' })).toEqual({
      ok: false,
      error: 'tab-not-capturable',
    });
  });

  it('stop sends meeting/stop', async () => {
    const { api, sendCommand } = setup();
    expect(await api.stop()).toEqual({ ok: true });
    expect(sendCommand).toHaveBeenCalledWith({ type: 'meeting/stop' });
  });

  it('deletes through the repository and reads the latest stored meeting with its lines', async () => {
    const { api, repo } = setup();
    await api.deleteMeeting('m1');
    expect(repo.deleteMeeting).toHaveBeenCalledWith('m1');
    expect(await api.latestStored()).toEqual({ meeting, segments: [] });
    repo.latestMeeting.mockResolvedValue(undefined);
    expect(await api.latestStored()).toBeNull();
  });

  it('connects the live port and relays events and disconnects', () => {
    const { api, connect, port, listeners } = setup();
    const onEvent = vi.fn();
    const onDisconnect = vi.fn();
    const close = api.connect(onEvent, onDisconnect);
    expect(connect).toHaveBeenCalledWith('live');
    listeners.message[0]?.({ type: 'live/status' });
    listeners.disconnect[0]?.();
    expect(onEvent).toHaveBeenCalledWith({ type: 'live/status' });
    expect(onDisconnect).toHaveBeenCalled();
    close();
    expect(port.disconnect).toHaveBeenCalled();
  });

  // 012 T038 (FR-020, FR-026; research R5): the clean main view.
  describe('the clean main view (012)', () => {
    it('shows the latest meeting when the main view was never cleared, or was cleared before it started', async () => {
      const { api, mainView } = setup();
      expect(await api.latestStored()).toEqual({ meeting, segments: [] });
      mainView.clearedAt.mockResolvedValue(999);
      expect(await api.latestStored()).toEqual({ meeting, segments: [] });
    });

    it('shows nothing when the main view was cleared at or after its start, and does not read its lines', async () => {
      const { api, repo, mainView } = setup();
      mainView.clearedAt.mockResolvedValue(1_000);
      expect(await api.latestStored()).toBeNull();
      mainView.clearedAt.mockResolvedValue(2_000);
      expect(await api.latestStored()).toBeNull();
      expect(repo.listSegments).not.toHaveBeenCalled();
    });

    it('shows the latest meeting when the marker cannot be read: an error never hides a transcript', async () => {
      const { api, mainView } = setup();
      mainView.clearedAt.mockRejectedValue(new Error('storage unavailable'));
      expect(await api.latestStored()).toEqual({ meeting, segments: [] });
    });

    it('with no stored meeting the marker is not read', async () => {
      const { api, repo, mainView } = setup();
      repo.latestMeeting.mockResolvedValue(undefined);
      expect(await api.latestStored()).toBeNull();
      expect(mainView.clearedAt).not.toHaveBeenCalled();
    });

    it('clearMainView records the moment, and rejects when it cannot be written', async () => {
      const { api, mainView } = setup();
      await api.clearMainView();
      expect(mainView.clear.mock.calls).toEqual([[5_000]]);
      mainView.clear.mockRejectedValueOnce(new Error('quota'));
      await expect(api.clearMainView()).rejects.toThrow('quota');
    });

    it('onMainViewCleared passes the listener to the store and returns its unsubscriber', () => {
      const { api, mainView } = setup();
      const off = vi.fn();
      mainView.onChange.mockReturnValue(off);
      const listener = vi.fn();
      expect(api.onMainViewCleared(listener)).toBe(off);
      expect(mainView.onChange).toHaveBeenCalledWith(listener);
    });

    it('deleting a meeting does not touch the marker', async () => {
      const { api, repo, mainView } = setup();
      await api.deleteMeeting('m1');
      expect(repo.deleteMeeting).toHaveBeenCalledWith('m1');
      expect(mainView.clear).not.toHaveBeenCalled();
      expect(mainView.clearedAt).not.toHaveBeenCalled();
    });
  });

  // 014 T010 (FR-004, FR-007, FR-009; research R2; contracts/internal-api.md): the panel's first look, with no meeting
  // running, opens the main view clean instead of showing a stopped meeting.
  describe('the opening of the panel (014)', () => {
    it('clears the main view instead of showing a stopped meeting, without reading its lines', async () => {
      const { api, repo, mainView } = setup();
      expect(await api.latestStored({ opening: true })).toBeNull();
      expect(mainView.clear.mock.calls).toEqual([[5_000]]);
      expect(repo.listSegments).not.toHaveBeenCalled();
    });

    it('clears an interrupted meeting (no end time) the same way', async () => {
      const { api, repo, mainView } = setup();
      repo.latestMeeting.mockResolvedValue({ ...meeting, endedAt: null, endReason: null });
      expect(await api.latestStored({ opening: true })).toBeNull();
      expect(mainView.clear.mock.calls).toEqual([[5_000]]);
    });

    it('stays clean when the clock reads earlier than the meeting started (clock set back): the moment is its start', async () => {
      const { api, repo, mainView } = setup();
      repo.latestMeeting.mockResolvedValue({ ...meeting, startedAt: 9_000 });
      expect(await api.latestStored({ opening: true })).toBeNull();
      expect(mainView.clear.mock.calls).toEqual([[9_000]]);
    });

    it('writes nothing when there is no stored meeting', async () => {
      const { api, repo, mainView } = setup();
      repo.latestMeeting.mockResolvedValue(undefined);
      expect(await api.latestStored({ opening: true })).toBeNull();
      expect(mainView.clear).not.toHaveBeenCalled();
    });

    it('writes nothing when the main view is already clean', async () => {
      const { api, mainView } = setup();
      mainView.clearedAt.mockResolvedValue(2_000);
      expect(await api.latestStored({ opening: true })).toBeNull();
      expect(mainView.clear).not.toHaveBeenCalled();
    });

    it('shows the meeting when the clear cannot be written: a storage failure never hides a transcript', async () => {
      const { api, mainView } = setup();
      mainView.clear.mockRejectedValueOnce(new Error('quota'));
      expect(await api.latestStored({ opening: true })).toEqual({ meeting, segments: [] });
    });

    it('without the option, or with it false, shows the meeting and writes nothing, as in 012', async () => {
      const { api, mainView } = setup();
      expect(await api.latestStored()).toEqual({ meeting, segments: [] });
      expect(await api.latestStored({ opening: false })).toEqual({ meeting, segments: [] });
      expect(mainView.clear).not.toHaveBeenCalled();
    });
  });

  // T059: label edits (002 US4, contracts/live-port-and-labels.md).
  describe('label edits', () => {
    const emma = { key: 'caption:emma jones' as const, original: 'Emma Jones', captionName: 'Emma Jones' };

    it('while a meeting runs, renameSpeaker and overrideLine go over the live port', async () => {
      const { api, port, repo } = setup();
      api.connect(vi.fn(), vi.fn());
      await api.renameSpeaker({ meetingId: 'm1', live: true }, emma, 'Emma');
      await api.overrideLine({ meetingId: 'm1', live: true }, 'm1:mixed:3', 'Bob');
      await api.overrideLine({ meetingId: 'm1', live: true }, 'm1:mixed:3', null);
      expect(port.postMessage.mock.calls.map((c) => c[0])).toEqual([
        { type: 'labels/rename', meetingId: 'm1', speakerKey: 'caption:emma jones', name: 'Emma' },
        { type: 'labels/override', meetingId: 'm1', segmentId: 'm1:mixed:3', name: 'Bob' },
        { type: 'labels/override', meetingId: 'm1', segmentId: 'm1:mixed:3', name: null },
      ]);
      expect(repo.setSpeakerRename).not.toHaveBeenCalled();
      expect(repo.setLabelOverride).not.toHaveBeenCalled();
    });

    it('with no meeting running, edits are written through the repository', async () => {
      const { api, port, repo } = setup();
      await api.renameSpeaker({ meetingId: 'm1', live: false }, emma, ' Emma ');
      await api.overrideLine({ meetingId: 'm1', live: false }, 'm1:mixed:3', 'Bob');
      expect(repo.setSpeakerRename).toHaveBeenCalledWith('m1', 'caption:emma jones', {
        name: 'Emma',
        origin: 'manual',
      });
      expect(repo.setLabelOverride).toHaveBeenCalledWith('m1', 'm1:mixed:3', 'Bob');
      expect(port.postMessage).not.toHaveBeenCalled();
    });

    it('renaming back to the original label removes the rename', async () => {
      const { api, repo } = setup();
      await api.renameSpeaker({ meetingId: 'm1', live: false }, emma, 'Emma Jones');
      expect(repo.setSpeakerRename).toHaveBeenCalledWith('m1', 'caption:emma jones', null);
    });

    it('rejects an invalid name and sends nothing', async () => {
      const { api, repo, remember } = setup();
      await expect(api.renameSpeaker({ meetingId: 'm1', live: false }, emma, '  ')).rejects.toThrow();
      await expect(api.overrideLine({ meetingId: 'm1', live: false }, 's', 'x'.repeat(61))).rejects.toThrow();
      expect(repo.setSpeakerRename).not.toHaveBeenCalled();
      expect(repo.setLabelOverride).not.toHaveBeenCalled();
      expect(remember).not.toHaveBeenCalled();
    });

    it('a caption-name rename is also remembered for future meetings; self is not', async () => {
      const { api, remember } = setup();
      await api.renameSpeaker({ meetingId: 'm1', live: false }, emma, 'Emma');
      await api.renameSpeaker(
        { meetingId: 'm1', live: false },
        { key: 'self', original: 'Alex', captionName: 'You' },
        'Me',
      );
      expect(remember.mock.calls).toEqual([['Emma Jones', 'Emma']]);
    });

    // Red-team 2026-10-08 (T092, decision 35): "Others" holds the user's own lines too.
    it('refuses to rename Others everywhere: nothing sent, stored or remembered', async () => {
      const { api, repo, remember } = setup();
      const others = { key: 'others', original: 'Others', captionName: null } as unknown as Parameters<
        typeof api.renameSpeaker
      >[1];
      await expect(api.renameSpeaker({ meetingId: 'm1', live: false }, others, 'Bob')).rejects.toThrow();
      expect(repo.setSpeakerRename).not.toHaveBeenCalled();
      expect(remember).not.toHaveBeenCalled();
    });

    it('an override of an Others line changes that line only and is never remembered', async () => {
      const { api, repo, remember } = setup();
      await api.overrideLine({ meetingId: 'm1', live: false }, 'm1:mixed:1', 'Bob');
      expect(repo.setLabelOverride).toHaveBeenCalledWith('m1', 'm1:mixed:1', 'Bob');
      expect(repo.setSpeakerRename).not.toHaveBeenCalled();
      expect(remember).not.toHaveBeenCalled();
    });
  });
});

// 013 T061 (decision 79, superseding decision 71): the reminder is the same on every platform, so the panel has no
// question about the tab Start would transcribe.
describe('the tab is not asked about', () => {
  it('the api has no startPlatform', () => {
    expect('startPlatform' in setup().api).toBe(false);
  });
});

// 013 T044 (contracts/files-and-storage.md "Side panel"): the stored caption turns, read at the moment of a download.
describe('captionTurns', () => {
  const turn: StoredCaptionTurn = {
    meetingId: 'm1',
    seq: 1,
    startMs: 4_000,
    speakerName: 'Emma Jones',
    self: false,
    text: 'The harbour survey starts on Monday.',
    schemaVersion: 1,
  };

  it('returns the repository\u2019s rows for that meeting, and [] when it has none', async () => {
    const { api, repo } = setup();
    repo.listCaptionTurns.mockResolvedValueOnce([turn]);
    expect(await api.captionTurns('m1')).toEqual([turn]);
    expect(repo.listCaptionTurns).toHaveBeenCalledWith('m1');
    expect(await api.captionTurns('m2')).toEqual([]);
  });

  it('rejects when the repository rejects, or cannot be opened', async () => {
    const { api, repo } = setup();
    repo.listCaptionTurns.mockRejectedValueOnce(new Error('read failed'));
    await expect(api.captionTurns('m1')).rejects.toThrow('read failed');
    const closed = setup({ repo: () => Promise.reject(new Error('no database')) });
    await expect(closed.api.captionTurns('m1')).rejects.toThrow('no database');
  });
});
