// 008 T026: Start applies pending notes to the new meeting (contracts/notes-messages.md "Service worker at Start"),
// only after the offscreen document began, never failing Start, and never sending notes to the offscreen document.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEXT_MEETING_KEY } from '@/core/chat/notes';
import { createMeetingControl } from '@/entrypoints/background/meeting-control';
import { ContextRepo } from '@/storage/context-repo';
import { openLiveAssistDb } from '@/storage/db';
import { CREDENTIALS_KEY, SETTINGS_KEY } from '@/storage/settings-store';
import { FakeStorageArea } from '../../support/fake-chrome-storage';
import { NOTES_SENTINEL, readNotesText } from '../../support/notes';

let sent: unknown[];
let offscreenReply: unknown;
let offscreenOpen: boolean;
let contexts: ContextRepo;
let n = 0;

beforeEach(async () => {
  n += 1;
  contexts = new ContextRepo(await openLiveAssistDb(`meeting-control-notes-${n}`));
  await contexts.set(NEXT_MEETING_KEY, { name: 'agenda.md', source: 'file', text: readNotesText('agenda.md') }, 1);
  sent = [];
  offscreenReply = { ok: true };
  offscreenOpen = false;
  const local = new FakeStorageArea();
  local.data.set(SETTINGS_KEY, {
    schemaVersion: 1,
    userName: 'Alex',
    keyterms: [],
    consentReminder: true,
    firstRunComplete: true,
    headphonesNoticeDismissed: false,
  });
  local.data.set(CREDENTIALS_KEY, { elevenLabsApiKey: 'sk_test_fixture_bg_key_b4c1' });
  vi.stubGlobal('chrome', {
    storage: {
      local,
      sync: new FakeStorageArea(),
      session: new FakeStorageArea(),
      onChanged: { addListener: vi.fn() },
    },
    offscreen: {
      createDocument: vi.fn(() => {
        offscreenOpen = true;
        return Promise.resolve();
      }),
      closeDocument: vi.fn(() => {
        offscreenOpen = false;
        return Promise.resolve();
      }),
      Reason: { USER_MEDIA: 'USER_MEDIA' },
    },
    tabs: {
      get: vi.fn(() => Promise.resolve({ id: 10, url: 'https://example.com/call', title: 'Call' })),
      sendMessage: vi.fn(() => Promise.resolve({ ok: true })),
    },
    runtime: {
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      getURL: (p: string) => `chrome-extension://ext/${p}`,
      getContexts: vi.fn(() => Promise.resolve(offscreenOpen ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : [])),
      sendMessage: vi.fn((m: unknown) => {
        sent.push(m);
        return Promise.resolve((m as { type: string }).type === 'offscreen/begin' ? offscreenReply : { ok: true });
      }),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

const capture = { streamIdFor: () => Promise.resolve('stream-xyz') };

describe('Start with pending notes', () => {
  it('moves the pending notes to the new meeting after the offscreen document began', async () => {
    const control = createMeetingControl(capture, undefined, {
      afterStart: (id) => contexts.applyPending(id, 5).then(() => undefined),
    });
    const result = await control.start(10, { kind: 'auto' });
    expect(result.ok).toBe(true);
    const meetingId = (result as { meetingId: string }).meetingId;
    expect((await contexts.get(meetingId))?.notes?.name).toBe('agenda.md');
    expect(await contexts.get(NEXT_MEETING_KEY)).toBeUndefined();
  });

  it('leaves the notes pending when Start fails', async () => {
    offscreenReply = { ok: false };
    const afterStart = vi.fn(() => Promise.resolve());
    const control = createMeetingControl(capture, undefined, { afterStart });
    expect((await control.start(10, { kind: 'auto' })).ok).toBe(false);
    expect(afterStart).not.toHaveBeenCalled();
    expect(await contexts.get(NEXT_MEETING_KEY)).toBeDefined();
  });

  it('still starts when applying the notes fails', async () => {
    const control = createMeetingControl(capture, undefined, { afterStart: () => Promise.reject(new Error('db')) });
    expect((await control.start(10, { kind: 'auto' })).ok).toBe(true);
  });

  it('never sends the notes to the offscreen document', async () => {
    const control = createMeetingControl(capture, undefined, {
      afterStart: (id) => contexts.applyPending(id, 5).then(() => undefined),
    });
    await control.start(10, { kind: 'auto' });
    expect(JSON.stringify(sent)).not.toContain(NOTES_SENTINEL);
    expect(JSON.stringify(sent)).toContain('offscreen/begin');
  });
});
