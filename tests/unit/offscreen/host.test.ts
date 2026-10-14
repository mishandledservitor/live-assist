// T067: the offscreen host turns offscreen/begin|end into a MeetingRuntime and serves the `live` port.
import { describe, expect, it, vi } from 'vitest';
import { CAPTION_STORE_FLUSH_MS } from '@/core/captions/caption-log';
import type { StoredCaptionTurn } from '@/core/captions/model';
import type { LiveEvent } from '@/core/messaging/protocol';
import { createPlatformRegistry } from '@/core/platform/registry';
import type { MixedFrameSource } from '@/core/session/meeting-runtime';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';
import { createOffscreenHost, type HostDeps, type HostPort } from '@/entrypoints/offscreen/host';
import { offscreenStore, type OffscreenRepo } from '@/entrypoints/offscreen/store';
import { FakeTranscriptionProvider } from '@/providers/transcription/fake/fixture-provider';
import { FakeMeetAdapter } from '../../support/fake-meet-adapter';
import { loadFixture, type Script } from '../../support/fake-websocket';

const begin = {
  type: 'offscreen/begin',
  meetingId: 'm1',
  tabStreamId: 'stream-1',
  language: { kind: 'auto' },
  keyterms: [],
  userName: 'Alex',
  source: { url: 'https://meet.google.com/abc', title: 'Standup' },
};

function memoryStore() {
  const meetings = new Map<string, Meeting>();
  const segments: TranscriptSegment[] = [];
  const store: HostDeps['store'] = {
    markOrphanedCrashed: () => Promise.resolve([]),
    createMeeting: (m) => Promise.resolve(void meetings.set(m.id, m)),
    appendSegment: (s) => Promise.resolve(void segments.push(s)),
    updateSegment: (s) =>
      Promise.resolve(
        void segments.splice(
          segments.findIndex((x) => x.id === s.id),
          1,
          s,
        ),
      ),
    setSpeakerRename: () => Promise.resolve(),
    endMeeting: (id, endedAt, endReason) => {
      const m = meetings.get(id);
      if (m) meetings.set(id, { ...m, endedAt, endReason });
      return Promise.resolve();
    },
  };
  return { store, meetings, segments };
}

const silentSource: MixedFrameSource = () => Promise.resolve({ mic: { ok: true }, stop: () => Promise.resolve() });

function setup(source: MixedFrameSource = silentSource, scripts: () => Script[] = () => [loadFixture('happy-path')]) {
  const { store, meetings } = memoryStore();
  const renames: unknown[][] = [];
  store.setSpeakerRename = (...a) => Promise.resolve(void renames.push(a));
  const sourceFor = vi.fn((_id: string) => source);
  const notifyEnded = vi.fn((_reason: string) => undefined);
  const providers: FakeTranscriptionProvider[] = [];
  const host = createOffscreenHost({
    provider: () => {
      const p = new FakeTranscriptionProvider(scripts());
      providers.push(p);
      return p;
    },
    store,
    registry: createPlatformRegistry([]),
    sourceFor,
    now: () => 1000,
    notifyEnded,
  });
  return { host, meetings, sourceFor, notifyEnded, renames, providers };
}

function send(host: ReturnType<typeof createOffscreenHost>, message: unknown): Promise<unknown> | undefined {
  let resolve: (r: unknown) => void = () => {};
  const replied = new Promise((r) => (resolve = r));
  return host.onMessage(message, resolve) ? replied : undefined;
}

function port(name = 'live') {
  const posted: LiveEvent[] = [];
  let disconnect: () => void = () => {};
  let receive: (m: unknown) => void = () => {};
  const p: HostPort = {
    name,
    postMessage: (m: unknown) => void posted.push(m as LiveEvent),
    onDisconnect: { addListener: (l) => (disconnect = l) },
    onMessage: { addListener: (l) => (receive = l) },
  };
  return { p, posted, disconnect: () => disconnect(), fromPanel: (m: unknown) => receive(m) };
}

describe('offscreen host', () => {
  it('ignores messages that are not offscreen commands (e.g. panel → service worker commands)', () => {
    const { host } = setup();
    expect(send(host, { type: 'meeting/start', tabId: 1, language: { kind: 'auto' } })).toBeUndefined();
    expect(send(host, { type: 'offscreen/begin' })).toBeUndefined();
  });

  it('begins a meeting with one mixed source for the forwarded stream id and replies ok', async () => {
    const { host, meetings, sourceFor } = setup();
    expect(await send(host, begin)).toEqual({ ok: true });
    expect(sourceFor).toHaveBeenCalledTimes(1);
    expect(sourceFor).toHaveBeenCalledWith('stream-1');
    expect(meetings.get('m1')).toMatchObject({
      source: { url: 'https://meet.google.com/abc', title: 'Standup', platform: 'generic' },
      userName: 'Alex',
    });
  });

  it('passes clean transcript to the session: on when the message says so or says nothing, off when it is off', async () => {
    for (const [msg, expected] of [
      [begin, 'true'],
      [{ ...begin, cleanTranscript: false }, null],
    ] as const) {
      const { host, providers } = setup();
      expect(await send(host, msg)).toEqual({ ok: true });
      const url = new URL(providers.at(-1)!.sockets[0]!.url);
      expect(url.searchParams.get('no_verbatim')).toBe(expected);
      await send(host, { type: 'offscreen/end', reason: 'user-stop' });
    }
  });

  it('replies with the reason when the tab cannot be captured', async () => {
    const { host } = setup(() => Promise.reject(new Error('Requested device not found')));
    expect(await send(host, begin)).toEqual({
      ok: false,
      message: expect.stringContaining('Requested device not found') as unknown,
    });
  });

  it('refuses a second begin while a meeting runs', async () => {
    const { host } = setup();
    await send(host, begin);
    expect(await send(host, { ...begin, meetingId: 'm2' })).toEqual({
      ok: false,
      message: expect.any(String) as unknown,
    });
  });

  it('ends the meeting on offscreen/end', async () => {
    const { host, meetings } = setup();
    await send(host, begin);
    expect(await send(host, { type: 'offscreen/end', reason: 'user-stop' })).toEqual({ ok: true });
    expect(meetings.get('m1')).toMatchObject({ endedAt: 1000, endReason: 'user-stop' });
  });

  it('serves the live port: snapshot on connect, then runtime events until the port goes away', async () => {
    const { host } = setup();
    await send(host, begin);
    const a = port();
    host.onConnect(a.p);
    expect(a.posted[0]).toMatchObject({ type: 'live/snapshot', meeting: { id: 'm1' } });
    await send(host, { type: 'offscreen/end', reason: 'user-stop' });
    expect(a.posted.some((e) => e.type === 'live/status')).toBe(true);

    const count = a.posted.length;
    a.disconnect();
    const b = port();
    host.onConnect(b.p);
    expect(a.posted).toHaveLength(count);
  });

  it('sends an empty snapshot when nothing has begun, and ignores ports with other names', () => {
    const { host } = setup();
    const a = port();
    host.onConnect(a.p);
    expect(a.posted).toEqual([expect.objectContaining({ type: 'live/snapshot', meeting: null, segments: [] })]);
    const other = port('something-else');
    host.onConnect(other.p);
    expect(other.posted).toEqual([]);
  });

  it('tells the service worker when the meeting ended by itself, and accepts a new begin afterwards', async () => {
    vi.useFakeTimers();
    try {
      const { host, meetings, notifyEnded } = setup(undefined, () => [loadFixture('quota-error')]);
      const begun = send(host, begin);
      await vi.advanceTimersByTimeAsync(5);
      expect(await begun).toEqual({ ok: true });
      await vi.advanceTimersByTimeAsync(3000);
      expect(meetings.get('m1')).toMatchObject({ endReason: 'failed' });
      expect(notifyEnded).toHaveBeenCalledWith('failed');
      const again = send(host, { ...begin, meetingId: 'm2' });
      await vi.advanceTimersByTimeAsync(5);
      expect(await again).toEqual({ ok: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not notify when the service worker ended the meeting', async () => {
    const { host, notifyEnded } = setup();
    await send(host, begin);
    await send(host, { type: 'offscreen/end', reason: 'user-stop' });
    expect(notifyEnded).not.toHaveBeenCalled();
  });

  it('hands Meet page ports (platform:meet) to platform listeners, never treating them as live ports', () => {
    const { host } = setup();
    const received: HostPort[] = [];
    host.onPlatformPort((p) => void received.push(p));
    const meet = port('platform:meet');
    host.onConnect(meet.p);
    expect(received).toEqual([meet.p]);
    expect(meet.posted).toEqual([]);
    host.onConnect(port('live').p);
    expect(received).toHaveLength(1);
  });

  it('drops a Meet page port nobody listens for', () => {
    const { host } = setup();
    const meet = port('platform:meet');
    host.onConnect(meet.p);
    expect(meet.posted).toEqual([]);
  });
  // T058: label commands from the panel arrive over the live port and go to the running meeting.
  it('passes valid label commands from a panel to the runtime, which broadcasts the result to every panel', async () => {
    const { host, renames } = setup();
    await send(host, begin);
    const a = port();
    const b = port();
    host.onConnect(a.p);
    host.onConnect(b.p);
    a.fromPanel({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'self', name: ' Bob ' });
    await vi.waitFor(() => expect(b.posted.some((e) => e.type === 'live/labels')).toBe(true));
    expect(renames).toEqual([['m1', 'self', { name: 'Bob', origin: 'manual' }]]);
    a.fromPanel({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'self', name: '' });
    a.fromPanel({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'others', name: 'Bob' });
    a.fromPanel({ type: 'live/whatever' });
    a.fromPanel('nonsense');
    await new Promise((r) => setTimeout(r, 10));
    expect(renames).toHaveLength(1);
  });

  it('ignores label commands when no meeting runs', () => {
    const { host, renames } = setup();
    const a = port();
    host.onConnect(a.p);
    expect(() =>
      a.fromPanel({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'others', name: 'X' }),
    ).not.toThrow();
    expect(renames).toEqual([]);
  });

  // 013 T025 (FR-001, FR-007): the store the offscreen document runs on (`offscreenStore`, what main.ts passes) keeps
  // Meet's caption text in the repository; a meeting on any other site asks for nothing.
  describe('caption turns reach the repository', () => {
    function fakeRepo() {
      const puts: { meetingId: string; turns: StoredCaptionTurn[] }[] = [];
      const calls: string[] = [];
      const record = (name: string) => () => Promise.resolve(void calls.push(name));
      const repo: OffscreenRepo = {
        createMeeting: record('createMeeting'),
        appendSegment: record('appendSegment'),
        updateSegment: record('updateSegment'),
        setSpeakerRename: record('setSpeakerRename'),
        endMeeting: record('endMeeting'),
        markOrphanedCrashed: () => Promise.resolve([]),
        putCaptionTurns: (meetingId, turns) => {
          puts.push({ meetingId, turns: [...turns] });
          return Promise.resolve(true);
        },
      };
      return { repo, puts, calls };
    }

    function captionSetup() {
      const { repo, puts, calls } = fakeRepo();
      const adapters: FakeMeetAdapter[] = [];
      const host = createOffscreenHost({
        provider: () => new FakeTranscriptionProvider([loadFixture('happy-path')]),
        store: offscreenStore(Promise.resolve(repo)),
        registry: createPlatformRegistry([
          () => {
            const adapter = new FakeMeetAdapter({ state: 'on' });
            adapters.push(adapter);
            return adapter;
          },
        ]),
        sourceFor: () => silentSource,
        now: () => Date.now(),
        notifyEnded: () => undefined,
      });
      return { host, puts, calls, meetAdapter: () => adapters.at(-1)! };
    }

    async function beginOn(host: ReturnType<typeof createOffscreenHost>, url: string) {
      const begun = send(host, { ...begin, source: { url, title: 'Standup' } });
      await vi.advanceTimersByTimeAsync(5);
      expect(await begun).toEqual({ ok: true });
    }

    it('a Meet meeting that receives caption text writes it through putCaptionTurns', async () => {
      vi.useFakeTimers();
      try {
        const { host, puts, meetAdapter } = captionSetup();
        await beginOn(host, 'https://meet.google.com/abc-defg-hij');
        const live = port();
        host.onConnect(live.p);
        meetAdapter().emitText('pg1:1', 'Emma Jones', 'The harbour survey starts on Monday.');
        meetAdapter().emitText('pg1:2', 'You', 'I can bring the tide tables.', { self: true });
        await vi.advanceTimersByTimeAsync(CAPTION_STORE_FLUSH_MS);
        expect(puts).toHaveLength(1);
        expect(puts[0]!.meetingId).toBe('m1');
        expect(puts[0]!.turns.map(({ seq, speakerName, self, text }) => ({ seq, speakerName, self, text }))).toEqual([
          { seq: 1, speakerName: 'Emma Jones', self: false, text: 'The harbour survey starts on Monday.' },
          { seq: 2, speakerName: 'You', self: true, text: 'I can bring the tide tables.' },
        ]);
        // The panel learns that captions are kept, and nothing of what they say.
        expect(live.posted.filter((e) => e.type === 'live/captions-kept')).toEqual([
          { type: 'live/captions-kept', meetingId: 'm1' },
        ]);
        expect(JSON.stringify(live.posted)).not.toContain('harbour');
        await send(host, { type: 'offscreen/end', reason: 'user-stop' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('a meeting on another site never asks the store for caption turns', async () => {
      vi.useFakeTimers();
      try {
        const { host, puts, calls } = captionSetup();
        await beginOn(host, 'https://example.com/call');
        await vi.advanceTimersByTimeAsync(CAPTION_STORE_FLUSH_MS * 3);
        await send(host, { type: 'offscreen/end', reason: 'user-stop' });
        expect(puts).toEqual([]);
        expect(calls).toContain('createMeeting');
        expect(calls).toContain('endMeeting');
      } finally {
        vi.useRealTimers();
      }
    });

    it('the spike hooks see the meeting, its lines and its end, and never a caption turn', async () => {
      const { repo, puts } = fakeRepo();
      const seen: string[] = [];
      const store = offscreenStore(Promise.resolve(repo), {
        onCreate: (m) => void seen.push(`create ${m.id}`),
        onSegment: (s) => void seen.push(`segment ${s.id}`),
        onEnd: () => void seen.push('end'),
      });
      const meeting = { id: 'm1' } as Meeting;
      const segment = { id: 'm1:mixed:0' } as TranscriptSegment;
      await store.createMeeting(meeting);
      await store.appendSegment(segment);
      await store.updateSegment(segment);
      const turn: StoredCaptionTurn = {
        meetingId: 'm1',
        seq: 1,
        startMs: 0,
        speakerName: 'Emma Jones',
        self: false,
        text: 'The harbour survey starts on Monday.',
        schemaVersion: 1,
      };
      expect(await store.putCaptionTurns?.('m1', [turn])).toBe(true);
      await store.endMeeting('m1', 5, 'user-stop');
      expect(seen).toEqual(['create m1', 'segment m1:mixed:0', 'segment m1:mixed:0', 'end']);
      expect(puts).toEqual([{ meetingId: 'm1', turns: [turn] }]);
    });
  });
});
