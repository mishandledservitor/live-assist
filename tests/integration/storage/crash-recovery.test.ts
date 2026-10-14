// T076 crash recovery (US3-7, SC-004): a meeting left open by a crash keeps every stored line, shows in the panel,
// and is marked `crashed` when the offscreen document next starts a meeting (no runtime is live at that point).
import { describe, expect, it } from 'vitest';
import { createPlatformRegistry } from '@/core/platform/registry';
import type { MixedFrameSource } from '@/core/session/meeting-runtime';
import { segmentId, type Meeting, type TranscriptSegment } from '@/core/transcript/model';
import { createOffscreenHost } from '@/entrypoints/offscreen/host';
import { createMeetingApi } from '@/entrypoints/sidepanel/meeting-api';
import { FakeTranscriptionProvider } from '@/providers/transcription/fake/fixture-provider';
import { openLiveAssistDb } from '@/storage/db';
import { MainViewStore } from '@/storage/main-view-store';
import { MeetingRepo } from '@/storage/meeting-repo';
import { FakeStorageArea } from '../../support/fake-chrome-storage';
import { loadFixture } from '../../support/fake-websocket';

let n = 0;
async function freshRepo() {
  n += 1;
  return new MeetingRepo(await openLiveAssistDb(`crash-db-${n}`));
}

const crashed: Meeting = {
  id: 'before-crash',
  startedAt: 1_000,
  endedAt: null,
  endReason: null,
  source: { url: 'https://meet.google.com/x', title: 'Standup', platform: 'generic' },
  languageMode: { kind: 'auto' },
  userName: 'Alex',
  speakerRenames: {},
  schemaVersion: 1,
};

const line = (seq: number, text: string): TranscriptSegment => ({
  id: segmentId(crashed.id, 'mixed', seq),
  meetingId: crashed.id,
  stream: 'mixed',
  seq,
  startMs: seq * 1000,
  endMs: seq * 1000 + 500,
  text,
  language: 'en',
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

const silent: MixedFrameSource = () => Promise.resolve({ mic: { ok: true }, stop: () => Promise.resolve() });

function send(host: ReturnType<typeof createOffscreenHost>, message: unknown): Promise<unknown> {
  return new Promise((resolve) => host.onMessage(message, resolve));
}

describe('crash recovery', () => {
  it('the panel shows the stored lines of a meeting that never ended', async () => {
    const repo = await freshRepo();
    await repo.createMeeting(crashed);
    await repo.appendSegment(line(0, 'first'));
    await repo.appendSegment(line(1, 'second'));
    const mainView = new MainViewStore(new FakeStorageArea());
    const clock = crashed.startedAt + 60_000;
    const api = createMeetingApi({
      activeTabId: () => Promise.resolve(1),
      sendCommand: () => Promise.resolve(undefined),
      repo: () => Promise.resolve(repo),
      rememberSpeakerName: () => Promise.resolve(),
      connect: () => {
        throw new Error('not used');
      },
      mainView,
      now: () => clock,
    });
    const stored = await api.latestStored();
    expect(stored?.meeting.id).toBe('before-crash');
    expect(stored?.segments.map((s) => s.text)).toEqual(['first', 'second']);

    // 012 FR-026, with the real store: once the main view is cleared no stored meeting shows on it, until one that
    // started later exists.
    await api.clearMainView();
    expect(await api.latestStored()).toBeNull();
    expect((await repo.listMeetings()).map((m) => m.id)).toEqual(['before-crash']);
    await repo.createMeeting({ ...crashed, id: 'after-clear', startedAt: clock + 1 });
    expect((await api.latestStored())?.meeting.id).toBe('after-clear');
  });

  it('the next meeting start marks the orphaned meeting crashed, keeping its lines', async () => {
    const repo = await freshRepo();
    await repo.createMeeting(crashed);
    await repo.appendSegment(line(0, 'first'));
    const host = createOffscreenHost({
      provider: () => new FakeTranscriptionProvider([loadFixture('happy-path')]),
      store: repo,
      registry: createPlatformRegistry([]),
      sourceFor: () => silent,
      now: () => 50_000,
      notifyEnded: () => undefined,
    });
    const reply = await send(host, {
      type: 'offscreen/begin',
      meetingId: 'next',
      tabStreamId: 's',
      language: { kind: 'auto' },
      keyterms: [],
      userName: 'Alex',
      speakerRenames: {},
      source: { url: 'https://meet.google.com/y', title: 'Next' },
    });
    expect(reply).toEqual({ ok: true });
    expect(await repo.getMeeting('before-crash')).toMatchObject({ endReason: 'crashed', endedAt: 50_000 });
    expect((await repo.listSegments('before-crash')).map((s) => s.text)).toEqual(['first']);
    expect(await repo.getMeeting('next')).toMatchObject({ endedAt: null });
    await send(host, { type: 'offscreen/end', reason: 'user-stop' });
  });
});
