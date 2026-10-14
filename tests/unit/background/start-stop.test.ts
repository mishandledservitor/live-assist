// T061: meeting/start and meeting/stop in the service worker, against chrome API fakes
// (contracts/extension-messages.md; research R5 as revised after T012).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFSCREEN_LINGER_MS } from '@/entrypoints/background/meeting-control';
import { CREDENTIALS_KEY, SETTINGS_KEY } from '@/storage/settings-store';
import { FakeStorageArea } from '../../support/fake-chrome-storage';

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined;
type TabListener<A extends unknown[]> = (...args: A) => void;

const NOT_INVOKED =
  'Extension has not been invoked for the current page (see activeTab permission). Chrome pages cannot be captured.';

let onMessage: Listener | null;
let onConnect: ((port: unknown) => void) | null;
let onRemoved: TabListener<[number]> | null;
let onUpdated: TabListener<[number, { url?: string }]> | null;
type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;
let onStorageChanged: ((changes: StorageChanges, area: string) => void) | null;
let local: FakeStorageArea;
let session: FakeStorageArea;
let offscreenOpen: boolean;
let sent: unknown[];
let offscreenReply: unknown;
let tabs: Record<number, { id: number; url?: string; title?: string }>;
let getMediaStreamId: ReturnType<typeof vi.fn>;
let createDocument: ReturnType<typeof vi.fn>;
let closeDocument: ReturnType<typeof vi.fn>;
let tabSendFails: boolean;

const ready = () => {
  local.data.set(SETTINGS_KEY, {
    schemaVersion: 1,
    userName: 'Alex',
    keyterms: ['Northwind', 'a-term-that-is-far-too-long-to-send'],
    consentReminder: true,
    firstRunComplete: true,
    headphonesNoticeDismissed: false,
  });
  local.data.set(CREDENTIALS_KEY, { elevenLabsApiKey: 'sk_test_fixture_bg_key_b4c1' });
};

beforeEach(async () => {
  vi.resetModules();
  onMessage = onRemoved = onUpdated = onConnect = null;
  onStorageChanged = null;
  local = new FakeStorageArea();
  session = new FakeStorageArea();
  offscreenOpen = false;
  sent = [];
  offscreenReply = { ok: true };
  tabs = {
    7: { id: 7, url: 'https://meet.google.com/abc-defg-hij', title: 'Standup' },
    8: { id: 8, url: 'chrome://settings', title: 'Settings' },
    9: { id: 9, url: 'https://chromewebstore.google.com/detail/x', title: 'Web Store' },
    10: { id: 10, url: 'https://example.com/call', title: 'Other site' },
    11: { id: 11, url: 'https://meet.google.com/landing', title: 'Meet home' },
  };
  tabSendFails = false;
  getMediaStreamId = vi.fn(() => Promise.resolve('stream-xyz'));
  createDocument = vi.fn(() => {
    offscreenOpen = true;
    return Promise.resolve();
  });
  closeDocument = vi.fn(() => {
    offscreenOpen = false;
    return Promise.resolve();
  });
  vi.stubGlobal('chrome', {
    storage: {
      local,
      sync: new FakeStorageArea(),
      session,
      onChanged: { addListener: (l: (changes: StorageChanges, area: string) => void) => (onStorageChanged = l) },
    },
    sidePanel: { setPanelBehavior: vi.fn(() => Promise.resolve()), open: vi.fn(() => Promise.resolve()) },
    action: { onClicked: { addListener: vi.fn() } },
    tabCapture: { getMediaStreamId },
    offscreen: { createDocument, closeDocument, Reason: { USER_MEDIA: 'USER_MEDIA' } },
    tabs: {
      get: vi.fn((id: number) => (tabs[id] ? Promise.resolve(tabs[id]) : Promise.reject(new Error('No tab')))),
      // Messages to a tab's content script are logged in `sent` with the tab id, so their order is visible.
      sendMessage: vi.fn((toTab: number, m: object) => {
        sent.push({ toTab, ...m });
        return tabSendFails
          ? Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'))
          : Promise.resolve({ ok: true });
      }),
      onRemoved: { addListener: (l: TabListener<[number]>) => (onRemoved = l) },
      onUpdated: { addListener: (l: TabListener<[number, { url?: string }]>) => (onUpdated = l) },
    },
    runtime: {
      // 003: the service worker also listens for the side panel's `chat` port.
      onConnect: { addListener: (l: (port: unknown) => void) => (onConnect = l) },
      id: 'ext',
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      getURL: (p: string) => `chrome-extension://ext/${p}`,
      getContexts: vi.fn(() => Promise.resolve(offscreenOpen ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : [])),
      sendMessage: vi.fn((m: unknown) => {
        sent.push(m);
        return Promise.resolve((m as { type: string }).type === 'offscreen/begin' ? offscreenReply : { ok: true });
      }),
      onMessage: { addListener: (l: Listener) => (onMessage = l) },
    },
  });
  const background = (await import('@/entrypoints/background')).default as { main: () => void };
  background.main();
});

afterEach(() => vi.unstubAllGlobals());

async function send(message: unknown): Promise<unknown> {
  let resolve: (r: unknown) => void = () => {};
  const replied = new Promise((r) => (resolve = r));
  const handled = onMessage!(message, { id: 'ext' }, resolve);
  expect(handled).toBe(true);
  return replied;
}

const start = (tabId = 7) => send({ type: 'meeting/start', tabId, language: { kind: 'auto' } });
const ofType = (type: string) => sent.filter((m) => (m as { type: string }).type === type);

describe('meeting/start', () => {
  it('refuses when settings are incomplete, without touching capture', async () => {
    expect(await start()).toEqual({ ok: false, error: 'settings-incomplete' });
    expect(getMediaStreamId).not.toHaveBeenCalled();
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('gets a stream id for the tab, creates the offscreen document and forwards the id with the meeting setup', async () => {
    ready();
    const result = (await start()) as { ok: boolean; meetingId: string };
    expect(result.ok).toBe(true);
    expect(result.meetingId).toMatch(/^[0-9a-f-]{36}$/);
    expect(getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 7 });
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'offscreen.html', reasons: ['USER_MEDIA'] }),
    );
    expect(ofType('offscreen/begin')).toEqual([
      {
        type: 'offscreen/begin',
        meetingId: result.meetingId,
        tabStreamId: 'stream-xyz',
        language: { kind: 'auto' },
        keyterms: ['Northwind'],
        userName: 'Alex',
        source: { url: 'https://meet.google.com/abc-defg-hij', title: 'Standup' },
        speakerNameMappings: [],
        cleanTranscript: true,
      },
    ]);
  });

  // Design decision 41 (001 FR-011b): the clean-transcript setting travels with offscreen/begin.
  it('sends Settings → clean transcript off when the user turned it off', async () => {
    ready();
    local.data.set(SETTINGS_KEY, { ...(local.data.get(SETTINGS_KEY) as object), cleanTranscript: false });
    await start();
    expect(ofType('offscreen/begin')[0]).toMatchObject({ cleanTranscript: false });
  });

  // 002 T056: the offscreen document cannot read chrome.storage, so remembered names travel in offscreen/begin.
  it('sends Settings → Remembered names with offscreen/begin', async () => {
    ready();
    const mapping = { captionName: 'Emma Jones', displayName: 'Emma', updatedAt: 5 };
    local.data.set(SETTINGS_KEY, { ...(local.data.get(SETTINGS_KEY) as object), speakerNameMappings: [mapping] });
    await start();
    expect(ofType('offscreen/begin')[0]).toMatchObject({ speakerNameMappings: [mapping] });
  });

  it('maps "not been invoked" to not-invoked (the user must click the toolbar icon on that tab)', async () => {
    ready();
    getMediaStreamId.mockRejectedValue(new Error(NOT_INVOKED));
    expect(await start()).toEqual({ ok: false, error: 'not-invoked' });
    expect(createDocument).not.toHaveBeenCalled();
  });

  it.each([8, 9])('refuses restricted pages (tab %i) as tab-not-capturable', async (tabId) => {
    ready();
    expect(await start(tabId)).toEqual({ ok: false, error: 'tab-not-capturable' });
    expect(getMediaStreamId).not.toHaveBeenCalled();
  });

  it('maps other capture failures to tab-not-capturable', async () => {
    ready();
    getMediaStreamId.mockRejectedValue(new Error('Cannot capture a tab with an active stream.'));
    expect(await start()).toEqual({ ok: false, error: 'tab-not-capturable' });
  });

  it('refuses a second meeting and names the tab being transcribed', async () => {
    ready();
    await start();
    expect(await start(7)).toEqual({ ok: false, error: 'already-running', runningTabTitle: 'Standup' });
    expect(ofType('offscreen/begin')).toHaveLength(1);
  });

  it('reports offscreen-failed and closes the document when the offscreen host cannot begin', async () => {
    ready();
    offscreenReply = { ok: false, message: 'getUserMedia failed' };
    expect(await start()).toEqual({ ok: false, error: 'offscreen-failed' });
    expect(closeDocument).toHaveBeenCalled();
    // A failed start leaves nothing running, so the next Start is not refused as already-running.
    offscreenReply = { ok: true };
    expect(await start()).toMatchObject({ ok: true });
  });
});

/** A port opened by the side panel; the service worker receives it too (003). */
function panelPort(name: string) {
  const port = {
    name,
    sender: { id: 'ext', url: 'chrome-extension://ext/sidepanel.html' },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
  };
  onConnect!(port);
  return port;
}

describe('ports meant for the offscreen document (003)', () => {
  it('lets go of the panel live port at once when no meeting runs, so the panel shows the stored one', async () => {
    const port = panelPort('live');
    await vi.waitFor(() => expect(port.disconnect).toHaveBeenCalled());
  });

  it('holds it while the offscreen document is open, and lets go once Stop has closed the document', async () => {
    ready();
    await start();
    const port = panelPort('live');
    await new Promise((r) => setTimeout(r, 0));
    expect(port.disconnect).not.toHaveBeenCalled();
    await send({ type: 'meeting/stop' });
    expect(closeDocument).toHaveBeenCalled();
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('meeting/stop', () => {
  it('sends offscreen/end with user-stop, then closes the document', async () => {
    ready();
    await start();
    expect(await send({ type: 'meeting/stop' })).toEqual({ ok: true });
    expect(ofType('offscreen/end')).toEqual([{ type: 'offscreen/end', reason: 'user-stop' }]);
    expect(closeDocument).toHaveBeenCalledTimes(1);
    const endIndex = sent.findIndex((m) => (m as { type: string }).type === 'offscreen/end');
    expect(endIndex).toBeGreaterThanOrEqual(0);
    expect(await start()).toMatchObject({ ok: true });
  });

  it('is a harmless no-op when nothing is running', async () => {
    expect(await send({ type: 'meeting/stop' })).toEqual({ ok: true });
    expect(ofType('offscreen/end')).toEqual([]);
  });
});

describe('captured tab closes or navigates away (FR-023)', () => {
  it('ends with tab-closed when the captured tab is closed', async () => {
    ready();
    await start();
    onRemoved?.(99);
    await vi.waitFor(() => expect(ofType('offscreen/end')).toEqual([]));
    onRemoved?.(7);
    await vi.waitFor(() => expect(ofType('offscreen/end')).toEqual([{ type: 'offscreen/end', reason: 'tab-closed' }]));
    await vi.waitFor(() => expect(closeDocument).toHaveBeenCalled());
  });

  it('ends with tab-navigated when the captured tab moves to another origin, not within the same origin', async () => {
    ready();
    await start();
    onUpdated?.(7, { url: 'https://meet.google.com/other-room' });
    onUpdated?.(7, {});
    await new Promise((r) => setTimeout(r, 0));
    expect(ofType('offscreen/end')).toEqual([]);
    onUpdated?.(7, { url: 'https://example.com/' });
    await vi.waitFor(() =>
      expect(ofType('offscreen/end')).toEqual([{ type: 'offscreen/end', reason: 'tab-navigated' }]),
    );
  });
});

describe('the offscreen document ended the meeting itself (transcription failed for good)', () => {
  const OFFSCREEN = { id: 'ext', url: 'chrome-extension://ext/offscreen.html' };

  const notifyEnded = async () => {
    let resolve: (r: unknown) => void = () => {};
    const replied = new Promise((r) => (resolve = r));
    expect(onMessage!({ type: 'offscreen/ended', reason: 'failed' }, OFFSCREEN, resolve)).toBe(true);
    expect(await replied).toEqual({ ok: true });
  };

  it('forgets the meeting at once, so the next Start works and reuses the document', async () => {
    ready();
    await start();
    await notifyEnded();
    expect(ofType('offscreen/end')).toEqual([]);
    expect(await start()).toMatchObject({ ok: true });
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(ofType('offscreen/begin')).toHaveLength(2);
  });

  it('keeps the document a little while so a panel can still read why it ended, then closes it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      ready();
      await start();
      await notifyEnded();
      expect(closeDocument).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(OFFSCREEN_LINGER_MS);
      expect(closeDocument).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not close the document under a meeting started meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      ready();
      await start();
      await notifyEnded();
      expect(await start()).toMatchObject({ ok: true });
      await vi.advanceTimersByTimeAsync(OFFSCREEN_LINGER_MS * 2);
      expect(closeDocument).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores the notice from anything but the offscreen document', async () => {
    ready();
    await start();
    const handled = onMessage!(
      { type: 'offscreen/ended', reason: 'failed' },
      { id: 'ext', url: 'https://evil.example/' },
      () => {},
    );
    expect(handled).toBe(false);
    expect(closeDocument).not.toHaveBeenCalled();
  });
});

describe('Meet bridge attach and detach (002 contracts/meet-bridge.md)', () => {
  const MEET_PAGE = (tabId: number) => ({ id: 'ext', tab: { id: tabId }, url: tabs[tabId]?.url });
  const ready_ = (tabId: number) => {
    let resolve: (r: unknown) => void = () => {};
    const replied = new Promise((r) => (resolve = r));
    expect(onMessage!({ type: 'meet/ready' }, MEET_PAGE(tabId), resolve)).toBe(true);
    return replied;
  };
  const indexOf = (type: string) => sent.findIndex((m) => (m as { type: string }).type === type);

  it('sends meet/attach to a Meet call tab only after offscreen/begin succeeded', async () => {
    ready();
    const result = (await start()) as { meetingId: string };
    expect(ofType('meet/attach')).toEqual([
      { toTab: 7, type: 'meet/attach', meetingId: result.meetingId, showCaptions: false },
    ]);
    expect(indexOf('meet/attach')).toBeGreaterThan(indexOf('offscreen/begin'));
  });

  it('sends no meet/attach when the offscreen document could not begin', async () => {
    ready();
    offscreenReply = { ok: false, message: 'getUserMedia failed' };
    await start();
    expect(ofType('meet/attach')).toEqual([]);
  });

  it.each([10, 11])('sends no meet/attach for a tab that is not a Meet call (tab %i)', async (tabId) => {
    ready();
    expect(await start(tabId)).toMatchObject({ ok: true });
    expect(ofType('meet/attach')).toEqual([]);
  });

  it('still starts when the Meet page has no content script to receive meet/attach', async () => {
    ready();
    tabSendFails = true;
    expect(await start()).toMatchObject({ ok: true });
  });

  it('answers meet/ready with attach: true only for the running meeting tab', async () => {
    expect(await ready_(7)).toEqual({ attach: false });
    ready();
    const { meetingId } = (await start()) as { meetingId: string };
    expect(await ready_(7)).toEqual({ attach: true, meetingId, showCaptions: false });
    expect(await ready_(11)).toEqual({ attach: false });
    await send({ type: 'meeting/stop' });
    expect(await ready_(7)).toEqual({ attach: false });
  });

  it('ignores meet/ready that does not come from a tab', () => {
    expect(onMessage!({ type: 'meet/ready' }, { id: 'ext' }, () => {})).toBe(false);
  });

  it('sends meet/detach to the tab after offscreen/end on Stop', async () => {
    ready();
    await start();
    await send({ type: 'meeting/stop' });
    expect(ofType('meet/detach')).toEqual([{ toTab: 7, type: 'meet/detach' }]);
    expect(indexOf('meet/detach')).toBeGreaterThan(indexOf('offscreen/end'));
  });

  it('sends meet/detach when the tab navigates away, and swallows a send failure when it was closed', async () => {
    ready();
    await start();
    onUpdated?.(7, { url: 'https://example.com/' });
    await vi.waitFor(() => expect(ofType('meet/detach')).toHaveLength(1));
    expect(indexOf('meet/detach')).toBeGreaterThan(indexOf('offscreen/end'));

    sent = [];
    await start();
    tabSendFails = true;
    onRemoved?.(7);
    await vi.waitFor(() => expect(closeDocument).toHaveBeenCalledTimes(2));
    expect(ofType('meet/detach')).toEqual([{ toTab: 7, type: 'meet/detach' }]);
    tabSendFails = false;
    expect(await start()).toMatchObject({ ok: true });
  });

  it('sends meet/detach when the offscreen document ended the meeting itself', async () => {
    ready();
    await start();
    let resolve: (r: unknown) => void = () => {};
    const replied = new Promise((r) => (resolve = r));
    onMessage!(
      { type: 'offscreen/ended', reason: 'failed' },
      { id: 'ext', url: 'chrome-extension://ext/offscreen.html' },
      resolve,
    );
    await replied;
    expect(ofType('meet/detach')).toEqual([{ toTab: 7, type: 'meet/detach' }]);
  });

  it('sends no meet/detach for a meeting on another site', async () => {
    ready();
    await start(10);
    await send({ type: 'meeting/stop' });
    expect(ofType('meet/detach')).toEqual([]);
  });
});

// T136 (002 FR-028–FR-030, design decision 61): Settings → Show Meet captions reaches the Meet page from here.
describe('Show Meet captions (002 contracts/meet-bridge.md)', () => {
  const MEET_PAGE = (tabId: number) => ({ id: 'ext', tab: { id: tabId }, url: tabs[tabId]?.url });
  const askReady = (tabId: number) => {
    let resolve: (r: unknown) => void = () => {};
    const replied = new Promise((r) => (resolve = r));
    expect(onMessage!({ type: 'meet/ready' }, MEET_PAGE(tabId), resolve)).toBe(true);
    return replied;
  };
  /** Stores the patched settings and fires chrome.storage.onChanged as Chrome does. */
  const saveSettings = (patch: Record<string, unknown>, area = 'local') => {
    const oldValue = local.data.get(SETTINGS_KEY);
    const newValue = { ...(oldValue as object), ...patch };
    local.data.set(SETTINGS_KEY, newValue);
    onStorageChanged!({ [SETTINGS_KEY]: { oldValue, newValue } }, area);
  };
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('meet/attach and the meet/ready reply carry the stored setting', async () => {
    ready();
    local.data.set(SETTINGS_KEY, { ...(local.data.get(SETTINGS_KEY) as object), showMeetCaptions: true });
    const { meetingId } = (await start()) as { meetingId: string };
    expect(ofType('meet/attach')).toEqual([{ toTab: 7, type: 'meet/attach', meetingId, showCaptions: true }]);
    expect(await askReady(7)).toEqual({ attach: true, meetingId, showCaptions: true });
  });

  it('a reloaded Meet page is told the value as it is now, not as it was at Start', async () => {
    ready();
    const { meetingId } = (await start()) as { meetingId: string };
    saveSettings({ showMeetCaptions: true });
    expect(await askReady(7)).toEqual({ attach: true, meetingId, showCaptions: true });
  });

  it('a change during a Meet meeting is sent to its tab, in both directions, without restarting anything', async () => {
    ready();
    await start();
    saveSettings({ showMeetCaptions: true });
    await vi.waitFor(() =>
      expect(ofType('meet/show-captions')).toEqual([{ toTab: 7, type: 'meet/show-captions', show: true }]),
    );
    saveSettings({ showMeetCaptions: false });
    await vi.waitFor(() =>
      expect(ofType('meet/show-captions')).toEqual([
        { toTab: 7, type: 'meet/show-captions', show: true },
        { toTab: 7, type: 'meet/show-captions', show: false },
      ]),
    );
    expect(ofType('offscreen/begin')).toHaveLength(1);
    expect(ofType('offscreen/begin')[0]).not.toHaveProperty('showMeetCaptions');
    expect(ofType('offscreen/end')).toEqual([]);
    expect(ofType('meet/attach')).toHaveLength(1);
    expect(ofType('meet/detach')).toEqual([]);
  });

  it('sends nothing when another setting changes, or the same value is stored again', async () => {
    ready();
    await start();
    saveSettings({ userName: 'Alex S' });
    saveSettings({ showMeetCaptions: false });
    saveSettings({ cleanTranscript: false });
    await settle();
    expect(ofType('meet/show-captions')).toEqual([]);
  });

  it('sends nothing for another storage area or another key', async () => {
    ready();
    await start();
    saveSettings({ showMeetCaptions: true }, 'sync');
    onStorageChanged!({ credentials: { oldValue: {}, newValue: { showMeetCaptions: true } } }, 'local');
    await settle();
    expect(ofType('meet/show-captions')).toEqual([]);
  });

  it('sends nothing without a running meeting, after Stop, or for a meeting on another site', async () => {
    ready();
    saveSettings({ showMeetCaptions: true });
    await settle();
    await start(10);
    saveSettings({ showMeetCaptions: false });
    await settle();
    await send({ type: 'meeting/stop' });
    await start();
    await send({ type: 'meeting/stop' });
    saveSettings({ showMeetCaptions: true });
    await settle();
    expect(ofType('meet/show-captions')).toEqual([]);
  });

  it('a Meet tab that cannot be reached is not an error; the page asks again when it loads', async () => {
    ready();
    const { meetingId } = (await start()) as { meetingId: string };
    tabSendFails = true;
    saveSettings({ showMeetCaptions: true });
    await vi.waitFor(() => expect(ofType('meet/show-captions')).toHaveLength(1));
    await settle();
    tabSendFails = false;
    expect(await askReady(7)).toEqual({ attach: true, meetingId, showCaptions: true });
  });
});
