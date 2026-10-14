// 013 T025 (FR-009, research R4): the two dev-only listeners on the Meet port see `meet/caption-text` messages go by
// and take nothing from them. The spike build's alignment trace holds no caption text, and the e2e bridge counters
// are what they were. Every name and sentence is invented.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBridgeStats } from '@/entrypoints/offscreen/e2e-bridge-stats';
import type { HostPort } from '@/entrypoints/offscreen/host';
import { installAlignmentTrace } from '@/entrypoints/offscreen/spike-trace';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK, expectNoMarker } from '../../support/caption-marker';

const T0 = 1_760_000_000_000;
const MEETING = '11111111-2222-4333-8444-555555555555';

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean;

/** The slice of chrome.runtime the two modules use; `ask` plays a one-shot message and returns the reply. */
function fakeChrome() {
  const listeners: Listener[] = [];
  vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: (l: Listener) => void listeners.push(l) } } });
  return {
    ask(message: unknown): unknown {
      let reply: unknown;
      for (const l of listeners) l(message, {}, (r) => (reply = r));
      return reply;
    },
  };
}

/** A Meet page port: `page(m)` delivers a message from the content script. */
function meetPort() {
  const listeners: ((m: unknown) => void)[] = [];
  const port = {
    name: 'platform:meet',
    postMessage: () => undefined,
    onDisconnect: { addListener: () => undefined },
    onMessage: { addListener: (l: (m: unknown) => void) => void listeners.push(l) },
  } satisfies HostPort;
  return { port, page: (m: unknown) => listeners.forEach((l) => l(m)) };
}

const caption = (turnKey: string, speakerName: string, observedAt: number) => ({
  type: 'meet/caption',
  turnKey,
  speakerName,
  self: null,
  observedAt,
});
const captionText = (turnKey: string, speakerName: string, keep: number, append: string) => ({
  type: 'meet/caption-text',
  turnKey,
  speakerName,
  self: null,
  firstSeenAt: T0 + 1_000,
  keep,
  append,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0 + 2_000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dev-only Meet port listeners and caption text', () => {
  it('the alignment trace of a meeting whose captions carried text holds none of it', () => {
    const chromeApi = fakeChrome();
    const meet = meetPort();
    const recorder = installAlignmentTrace((l) => l(meet.port));
    recorder.begin({ id: MEETING, startedAt: T0, userName: 'Alex' });

    meet.page(caption('pg1:1', 'Emma Jones', T0 + 1_000));
    meet.page(captionText('pg1:1', 'Emma Jones', 0, CAPTION_MARKER));
    meet.page(caption('pg1:1', 'Emma Jones', T0 + 1_500));
    meet.page(captionText('pg1:1', 'Emma Jones', CAPTION_MARKER.length, ` ${CAPTION_MARKER_GREEK}`));
    meet.page(captionText('pg1:2', 'Tom Brown', 0, CAPTION_MARKER_GREEK));

    const exported = recorder.export();
    expectNoMarker(exported);
    expectNoMarker(chromeApi.ask({ type: 'spike/alignment-trace' }));
    // The activity is all there; a turn that only ever sent text is not a trace caption.
    expect(exported.trace.captions).toEqual([
      { turnKey: 'pg1:1', speakerName: 'Participant A', self: null, observedAtMs: [1_000, 1_500] },
    ]);
  });

  it('the trace is the same with and without the text messages', () => {
    const run = (withText: boolean) => {
      fakeChrome();
      const meet = meetPort();
      const recorder = installAlignmentTrace((l) => l(meet.port));
      recorder.begin({ id: MEETING, startedAt: T0, userName: 'Alex' });
      meet.page(caption('pg1:1', 'Emma Jones', T0 + 1_000));
      if (withText) meet.page(captionText('pg1:1', 'Emma Jones', 0, CAPTION_MARKER));
      meet.page(caption('pg1:2', 'Tom Brown', T0 + 1_800));
      if (withText) meet.page(captionText('pg1:2', 'Tom Brown', 0, CAPTION_MARKER_GREEK));
      return recorder.export();
    };
    expect(run(true)).toEqual(run(false));
  });

  it('the e2e bridge counters are unchanged by text messages', () => {
    const chromeApi = fakeChrome();
    const meet = meetPort();
    installBridgeStats((l) => l(meet.port));
    meet.page({ type: 'meet/hello', meetingId: MEETING, pageId: 'pg1', inCall: true });
    const before = structuredClone(chromeApi.ask({ type: 'e2e/meet-bridge-stats' }));
    meet.page(captionText('pg1:1', 'Emma Jones', 0, CAPTION_MARKER));
    meet.page(captionText('pg1:1', 'Emma Jones', 4, CAPTION_MARKER_GREEK));
    const after = chromeApi.ask({ type: 'e2e/meet-bridge-stats' });
    expect(after).toEqual(before);
    expect(after).toEqual({ ports: 1, hellos: [{ meetingId: MEETING, inCall: true }] });
    expectNoMarker(after);
  });
});
