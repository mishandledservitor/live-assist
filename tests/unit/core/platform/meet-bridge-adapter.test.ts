// T027: BridgedMeetAdapter — the core side of the Meet bridge (contracts/platform-adapter.md), over a fake connector.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_APPEND_CHARS, MAX_TURN_CHARS, MEET_REASONS } from '@/core/messaging/meet-bridge';
import type {
  CaptionActivity,
  CaptionsState,
  CaptionText,
  MuteReading,
  PlatformAdapter,
} from '@/core/platform/adapter';
import {
  ATTACH_TIMEOUT_MS,
  BridgedMeetAdapter,
  NAMES_DEADLINE_MS,
  type BridgeConnector,
  type BridgePort,
} from '@/core/platform/meet-bridge-adapter';
import { platformAdapterContract } from '../../../contract/platform-adapter.contract';

const T0 = 1_760_000_000_000;
const MEETING = '0b7a1c9e-1111-4222-8333-944455556666';

function fakePort() {
  const sent: unknown[] = [];
  const messageListeners: ((m: unknown) => void)[] = [];
  const disconnectListeners: (() => void)[] = [];
  const port: BridgePort = {
    postMessage: (m) => void sent.push(m),
    onMessage: { addListener: (l) => void messageListeners.push(l) },
    onDisconnect: { addListener: (l) => void disconnectListeners.push(l) },
  };
  return {
    port,
    sent,
    page: (m: unknown) => messageListeners.forEach((l) => l(m)),
    lose: () => disconnectListeners.forEach((l) => l()),
  };
}

function fakeConnector() {
  const listeners = new Set<(p: BridgePort) => void>();
  const connect: BridgeConnector = (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return {
    connect,
    listeners,
    /** A content script opens a port and says hello. */
    open(inCall = true) {
      const p = fakePort();
      for (const l of listeners) l(p.port);
      p.page({ type: 'meet/hello', meetingId: MEETING, pageId: 'pg1', inCall });
      return p;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

function setup() {
  const connector = fakeConnector();
  const adapter = new BridgedMeetAdapter({ connect: connector.connect, now: () => Date.now() });
  const states: CaptionsState[] = [];
  const activity: CaptionActivity[] = [];
  const mutes: MuteReading[] = [];
  if (!adapter.captions.supported || !adapter.mute.supported) throw new Error('Meet supports captions and mute');
  const captions = adapter.captions;
  captions.subscribeState((s) => void states.push(s));
  captions.subscribe((a) => void activity.push(a));
  adapter.mute.subscribe((r) => void mutes.push(r));
  return { connector, adapter, captions, mute: adapter.mute, states, activity, mutes, last: () => states.at(-1) };
}

/** The connector behind each adapter the contract suite creates, so the suite can make its page show caption text. */
const connectors = new WeakMap<PlatformAdapter, ReturnType<typeof fakeConnector>>();
const pages = new WeakMap<PlatformAdapter, ReturnType<ReturnType<typeof fakeConnector>['open']>>();

platformAdapterContract(
  'BridgedMeetAdapter',
  () => {
    const connector = fakeConnector();
    const adapter = new BridgedMeetAdapter({ connect: connector.connect, now: () => Date.now() });
    connectors.set(adapter, connector);
    return adapter;
  },
  [new URL('https://meet.google.com/abc-defg-hij'), new URL('https://meet.google.com/'), new URL('https://x.test/')],
  (adapter, t) => {
    // The adapter listens for ports from its first subscription; the page connects on the first text.
    const page = pages.get(adapter) ?? connectors.get(adapter)?.open();
    if (!page) throw new Error('an adapter the suite did not create');
    pages.set(adapter, page);
    const { text, ...turn } = t;
    page.page({ type: 'meet/caption-text', ...turn, keep: 0, append: text });
  },
);

describe('BridgedMeetAdapter', () => {
  it('matches Meet call URLs only, not the landing page or other sites', () => {
    const a = new BridgedMeetAdapter({ connect: fakeConnector().connect, now: () => Date.now() });
    expect(a.id).toBe('meet');
    expect(a.matches(new URL('https://meet.google.com/abc-defg-hij'))).toBe(true);
    expect(a.matches(new URL('https://meet.google.com/abc-defg-hij?authuser=1'))).toBe(true);
    expect(a.matches(new URL('https://meet.google.com/'))).toBe(false);
    expect(a.matches(new URL('https://meet.google.com/landing'))).toBe(false);
    expect(a.matches(new URL('https://example.com/abc-defg-hij'))).toBe(false);
    a.dispose();
  });

  it('before a port: captions "Connecting to the Meet page…" and mute null', () => {
    const { last, mute } = setup();
    expect(last()).toEqual({ state: 'starting', reason: MEET_REASONS.connecting });
    expect(mute.current()).toEqual({ muted: null, observedAt: T0 });
  });

  it(`no port within ${ATTACH_TIMEOUT_MS} ms → unavailable "Couldn't connect…"`, async () => {
    const { last } = setup();
    await vi.advanceTimersByTimeAsync(ATTACH_TIMEOUT_MS - 1);
    expect(last()?.state).toBe('starting');
    await vi.advanceTimersByTimeAsync(1);
    expect(last()).toEqual({ state: 'unavailable', reason: MEET_REASONS.cantConnect });
  });

  it('a port arriving late still recovers', async () => {
    const { connector, last } = setup();
    await vi.advanceTimersByTimeAsync(ATTACH_TIMEOUT_MS);
    const p = connector.open();
    p.page({ type: 'meet/captions-state', state: 'on' });
    expect(last()).toEqual({ state: 'on' });
  });

  it('maps page messages to captions state, caption activity, mute readings and metadata', async () => {
    const { connector, adapter, states, activity, mutes, mute } = setup();
    const p = connector.open();
    p.page({ type: 'meet/captions-state', state: 'starting', reason: MEET_REASONS.lobby });
    p.page({ type: 'meet/captions-state', state: 'on' });
    p.page({ type: 'meet/caption', turnKey: 'pg1:1', speakerName: 'Emma Jones', self: null, observedAt: T0 + 5 });
    p.page({ type: 'meet/mute', muted: true, observedAt: T0 + 7 });
    p.page({ type: 'meet/metadata', title: 'Weekly sync', meetingCode: 'abc-defg-hij' });
    expect(states.slice(-2)).toEqual([{ state: 'starting', reason: MEET_REASONS.lobby }, { state: 'on' }]);
    expect(activity).toEqual([{ turnKey: 'pg1:1', speakerName: 'Emma Jones', self: null, observedAt: T0 + 5 }]);
    expect(mutes.at(-1)).toEqual({ muted: true, observedAt: T0 + 7 });
    expect(mute.current()).toEqual({ muted: true, observedAt: T0 + 7 });
    await expect(adapter.metadata()).resolves.toEqual({ title: 'Weekly sync', meetingCode: 'abc-defg-hij' });
  });

  it('T102 (FR-024): reports the page saying the call ended, once', () => {
    const { connector, adapter } = setup();
    if (!adapter.call) throw new Error('Meet reports the call ending');
    const ended: number[] = [];
    adapter.call.subscribeEnded((at) => void ended.push(at));
    const p = connector.open();
    p.page({ type: 'meet/call-ended', observedAt: T0 + 9 });
    p.page({ type: 'meet/call-ended', observedAt: T0 + 20 });
    expect(ended).toEqual([T0 + 9]);
  });

  it('drops invalid messages, including any with caption text', () => {
    const { connector, activity } = setup();
    const p = connector.open();
    p.page({ type: 'meet/caption', turnKey: 'k', speakerName: 'A', self: null, observedAt: T0, text: 'secret' });
    p.page({ type: 'meet/unknown' });
    p.page('garbage');
    expect(activity).toEqual([]);
  });

  it('enable() sends meet/enable-captions once a port exists, and on every new port', async () => {
    const { connector, captions } = setup();
    await captions.enable();
    const p1 = connector.open();
    expect(p1.sent).toContainEqual({ type: 'meet/enable-captions' });
    p1.lose();
    const p2 = connector.open();
    expect(p2.sent).toContainEqual({ type: 'meet/enable-captions' });
  });

  it('does not ask a new port to enable captions if enable() was never called', () => {
    const { connector } = setup();
    const p = connector.open();
    expect(p.sent).toEqual([]);
  });

  it(`captions neither on nor in the lobby ${NAMES_DEADLINE_MS} ms after enable() → unavailable with the latest reason`, async () => {
    const { connector, captions, last } = setup();
    await captions.enable();
    const p = connector.open();
    p.page({ type: 'meet/captions-state', state: 'starting', reason: MEET_REASONS.starting });
    await vi.advanceTimersByTimeAsync(NAMES_DEADLINE_MS);
    expect(last()).toEqual({ state: 'unavailable', reason: MEET_REASONS.cantTurnOn });
    // A later on recovers (SC-003, research R4).
    p.page({ type: 'meet/captions-state', state: 'on' });
    expect(last()).toEqual({ state: 'on' });
  });

  it('the deadline without any port says the page could not be reached', async () => {
    const { captions, last } = setup();
    await captions.enable();
    await vi.advanceTimersByTimeAsync(NAMES_DEADLINE_MS);
    expect(last()).toEqual({ state: 'unavailable', reason: MEET_REASONS.cantConnect });
  });

  it('the deadline does not fire while the user waits in the lobby, or once captions are on', async () => {
    for (const state of [{ state: 'starting', reason: MEET_REASONS.lobby }, { state: 'on' }] as const) {
      const { connector, captions, last } = setup();
      await captions.enable();
      connector.open().page({ type: 'meet/captions-state', ...state });
      await vi.advanceTimersByTimeAsync(NAMES_DEADLINE_MS * 2);
      expect(last()).toEqual(state);
    }
  });

  it('a port lost → unavailable "The Meet page reloaded…" and mute null; a new port replaces it', () => {
    const { connector, last, mute, activity } = setup();
    const p1 = connector.open();
    p1.page({ type: 'meet/captions-state', state: 'on' });
    p1.page({ type: 'meet/mute', muted: false, observedAt: T0 });
    p1.lose();
    expect(last()).toEqual({ state: 'unavailable', reason: MEET_REASONS.reloaded });
    expect(mute.current().muted).toBeNull();
    const p2 = connector.open();
    p2.page({ type: 'meet/captions-state', state: 'on' });
    expect(last()).toEqual({ state: 'on' });
    // The old port is ignored from now on.
    p1.page({ type: 'meet/caption', turnKey: 'old:1', speakerName: 'A', self: null, observedAt: T0 });
    expect(activity).toEqual([]);
  });

  it('a newer port replaces an older one that is still open', () => {
    const { connector, activity } = setup();
    const p1 = connector.open();
    connector.open();
    p1.page({ type: 'meet/caption', turnKey: 'old:1', speakerName: 'A', self: null, observedAt: T0 });
    expect(activity).toEqual([]);
  });

  it('restore() and dispose() talk to the page when connected and never throw without a port', async () => {
    const { connector, captions, adapter } = setup();
    await expect(captions.restore()).resolves.toBeUndefined();
    const p = connector.open();
    await captions.restore();
    adapter.dispose();
    expect(p.sent).toEqual([{ type: 'meet/restore-captions' }, { type: 'meet/detach' }]);
    expect(connector.listeners.size).toBe(0);
    adapter.dispose();
  });

  it('a port that throws on send does not break restore()', async () => {
    const { connector, captions } = setup();
    const p = connector.open();
    p.port.postMessage = () => {
      throw new Error('disconnected');
    };
    await expect(captions.restore()).resolves.toBeUndefined();
  });
});

// 013 T009 (contracts/captions-capture.md "Adapter contract, revision 3"): the adapter reassembles the page's
// keep/append differences and hands core the whole text of each kept turn. All text is invented.
describe('BridgedMeetAdapter: caption text (013)', () => {
  function textSetup() {
    const s = setup();
    const texts: CaptionText[] = [];
    s.captions.subscribeText((t) => void texts.push(t));
    const text = (turnKey: string, keep: number, append: string, over: Record<string, unknown> = {}) => ({
      type: 'meet/caption-text',
      turnKey,
      speakerName: 'Emma Jones',
      self: null,
      firstSeenAt: T0,
      keep,
      append,
      ...over,
    });
    return { ...s, texts, text, heard: () => texts.map((t) => t.text) };
  }

  it('keep 0, then growing keep/append: listeners get the whole text each time', () => {
    const { connector, texts, text, heard } = textSetup();
    const p = connector.open();
    p.page(text('pg1:1', 0, 'Good'));
    p.page(text('pg1:1', 4, ' morning'));
    p.page(text('pg1:1', 12, ', can everyone see the slide?'));
    expect(heard()).toEqual(['Good', 'Good morning', 'Good morning, can everyone see the slide?']);
    expect(texts[2]).toEqual({
      turnKey: 'pg1:1',
      speakerName: 'Emma Jones',
      self: null,
      firstSeenAt: T0,
      text: 'Good morning, can everyone see the slide?',
    });
  });

  it('a turn first seen hours ago still takes text: its first-seen time does not age it out', () => {
    const { connector, adapter, texts, text, heard } = textSetup();
    const p = connector.open();
    p.page(text('pg1:1', 0, 'Minute zero.'));
    vi.setSystemTime(T0 + 61 * 60_000);
    p.page(text('pg1:1', 12, ' Minute sixty-one.'));
    vi.setSystemTime(T0 + 3 * 3_600_000);
    p.page(text('pg1:1', 30, ' Hour three.'));
    expect(heard()).toEqual([
      'Minute zero.',
      'Minute zero. Minute sixty-one.',
      'Minute zero. Minute sixty-one. Hour three.',
    ]);
    expect(texts.map((t) => t.firstSeenAt)).toEqual([T0, T0, T0]);
    expect(adapter.droppedCaptionTexts()).toBe(0);
  });

  it('a rewrite of the tail (keep smaller than the current length) replaces it', () => {
    const { connector, text, heard } = textSetup();
    const p = connector.open();
    p.page(text('pg1:1', 0, 'We ship on Thursday'));
    p.page(text('pg1:1', 11, 'Tuesday, not Thursday.'));
    p.page(text('pg1:1', 0, 'Actually we ship on Tuesday.'));
    expect(heard()).toEqual([
      'We ship on Thursday',
      'We ship on Tuesday, not Thursday.',
      'Actually we ship on Tuesday.',
    ]);
  });

  it('keep beyond the current length is dropped, counted, and leaves the turn as it was; keep 0 recovers', () => {
    const { connector, adapter, text, heard } = textSetup();
    const p = connector.open();
    p.page(text('pg1:1', 0, 'Good'));
    p.page(text('pg1:1', 9, ' morning'));
    p.page(text('pg1:9', 1, 'never seen from its start'));
    expect(heard()).toEqual(['Good']);
    expect(adapter.droppedCaptionTexts()).toBe(2);
    p.page(text('pg1:1', 4, ' day'));
    expect(heard()).toEqual(['Good', 'Good day']);
    p.page(text('pg1:9', 0, 'Seen from its start.'));
    expect(heard().at(-1)).toBe('Seen from its start.');
    expect(adapter.droppedCaptionTexts()).toBe(2);
  });

  it(`text is cut at ${MAX_TURN_CHARS} characters`, () => {
    const { connector, texts, text } = textSetup();
    const p = connector.open();
    const piece = 'abcdefgh'.repeat(MAX_APPEND_CHARS / 8);
    let length = 0;
    while (length < MAX_TURN_CHARS) {
      p.page(text('pg1:1', length, piece));
      length += piece.length;
    }
    expect(texts.at(-1)?.text).toHaveLength(MAX_TURN_CHARS);
    // At the limit the turn takes no more, and a rewrite inside it still works.
    p.page(text('pg1:1', MAX_TURN_CHARS, 'more'));
    expect(texts.at(-1)?.text).toHaveLength(MAX_TURN_CHARS);
    p.page(text('pg1:1', 3, 'X'));
    expect(texts.at(-1)?.text).toBe('abcX');
  });

  it('two turns do not mix', () => {
    const { connector, texts, text } = textSetup();
    const p = connector.open();
    p.page(text('pg1:1', 0, 'First speaker'));
    p.page(text('pg1:2', 0, 'Second', { speakerName: 'You', self: true, firstSeenAt: T0 + 5 }));
    p.page(text('pg1:1', 13, ' continues.'));
    p.page(text('pg1:2', 6, ' speaker answers.', { speakerName: 'You', self: true, firstSeenAt: T0 + 5 }));
    expect(texts.slice(2)).toEqual([
      { turnKey: 'pg1:1', speakerName: 'Emma Jones', self: null, firstSeenAt: T0, text: 'First speaker continues.' },
      { turnKey: 'pg1:2', speakerName: 'You', self: true, firstSeenAt: T0 + 5, text: 'Second speaker answers.' },
    ]);
  });

  it('a second port continues the same turns', () => {
    const { connector, text, heard } = textSetup();
    const first = connector.open();
    first.page(text('pg1:1', 0, 'Before the port changed'));
    const second = connector.open();
    second.page(text('pg1:1', 23, ', and after.'));
    first.page(text('pg1:1', 0, 'From the old port.'));
    expect(heard()).toEqual(['Before the port changed', 'Before the port changed, and after.']);
    second.lose();
    const third = connector.open();
    third.page(text('pg1:1', 0, 'Sent whole again.'));
    expect(heard().at(-1)).toBe('Sent whole again.');
  });

  it('caption text never reaches activity listeners, and activity never reaches text listeners', () => {
    const { connector, activity, texts, text } = textSetup();
    const p = connector.open();
    p.page(text('pg1:1', 0, 'Only for storage.'));
    expect(activity).toEqual([]);
    p.page({ type: 'meet/caption', turnKey: 'pg1:1', speakerName: 'Emma Jones', self: null, observedAt: T0 });
    expect(activity).toHaveLength(1);
    expect(activity[0]).not.toHaveProperty('text');
    expect(texts).toHaveLength(1);
  });

  it('an invalid caption-text message changes nothing', () => {
    const { connector, text, heard } = textSetup();
    const p = connector.open();
    p.page(text('pg1:1', 0, 'Kept.'));
    p.page(text('pg1:1', 0, 'x'.repeat(MAX_APPEND_CHARS + 1)));
    p.page(text('pg1:1', 0, 'With a text field.', { text: 'no' }));
    p.page(text('pg1:1', -1, 'Negative keep.'));
    expect(heard()).toEqual(['Kept.']);
  });

  it('an unsubscribed listener hears nothing more, and a new one is never replayed to', () => {
    const { connector, captions, text } = textSetup();
    const p = connector.open();
    const seen: string[] = [];
    const off = captions.subscribeText((t) => void seen.push(t.text));
    p.page(text('pg1:1', 0, 'One.'));
    off();
    p.page(text('pg1:1', 4, ' Two.'));
    const late: string[] = [];
    captions.subscribeText((t) => void late.push(t.text));
    expect(seen).toEqual(['One.']);
    expect(late).toEqual([]);
  });

  it('dispose() drops the texts and the listeners', () => {
    const { connector, adapter, text, heard } = textSetup();
    const p = connector.open();
    p.page(text('pg1:1', 0, 'Held until the meeting ends.'));
    const held = (adapter as unknown as { texts: Map<string, string> }).texts;
    expect(held.size).toBe(1);
    adapter.dispose();
    expect(held.size).toBe(0);
    p.page(text('pg1:1', 0, 'After the end.'));
    expect(heard()).toEqual(['Held until the meeting ends.']);
    expect(held.size).toBe(0);
  });
});
