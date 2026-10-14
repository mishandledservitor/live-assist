// Shared side-panel helpers for e2e specs (built in e2e mode: fake audio devices, fixture-replaying provider).
import type { BrowserContext, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LINE_TIMEOUT = 15_000;

/**
 * The real panel lives beside the meeting tab; here it is an ordinary tab, so it is told which tab is the meeting
 * (e2e builds only) — otherwise closing the panel tab would count as closing the captured tab (FR-023).
 */
export async function openPanel(context: BrowserContext, extensionId: string, meetingTabId?: number): Promise<Page> {
  const page = await context.newPage();
  const query = meetingTabId === undefined ? '' : `?e2eTabId=${meetingTabId}`;
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html${query}`);
  return page;
}

/** The id of the newest tab other than the probe (the context also starts with a blank page). */
async function newestTabId(context: BrowserContext, extensionId: string): Promise<number> {
  const probe = await openPanel(context, extensionId);
  // Without the `tabs` permission tab URLs are hidden, so the tab is found by being the newest.
  const id = await probe.evaluate(async () => {
    const self = await chrome.tabs.getCurrent();
    const tabs = await chrome.tabs.query({});
    return tabs
      .filter((t) => t.id !== self?.id)
      .map((t) => t.id)
      .sort((a, b) => (b ?? 0) - (a ?? 0))[0];
  });
  await probe.close();
  if (id === undefined) throw new Error('meeting tab not found');
  return id;
}

/** Opens a stand-in meeting tab and returns its tab id. */
export async function openMeetingTab(context: BrowserContext, extensionId: string): Promise<number> {
  const meeting = await context.newPage();
  await meeting.goto('about:blank');
  return newestTabId(context, extensionId);
}

export const MEET_CALL_URL = 'https://meet.google.com/abc-defg-hij';

/**
 * Opens a Meet call tab whose page is a saved snapshot from tests/fixtures/meet/ (routed, never fetched), so the Meet
 * content script runs on it. Returns its tab id.
 */
export async function openMeetTab(context: BrowserContext, extensionId: string, snapshot: string): Promise<number> {
  return (await openMeetPage(context, extensionId, snapshot)).tabId;
}

export const meetSnapshotPath = (snapshot: string) =>
  fileURLToPath(new URL(`../fixtures/meet/${snapshot}.html`, import.meta.url));

/** As openMeetTab, also returning the page so a test can play Meet's part on it. */
export async function openMeetPage(
  context: BrowserContext,
  extensionId: string,
  snapshot: string,
): Promise<{ tabId: number; page: Page }> {
  const path = meetSnapshotPath(snapshot);
  await context.route('https://meet.google.com/**', (route) =>
    route.fulfill({ path, contentType: 'text/html; charset=utf-8' }),
  );
  const page = await context.newPage();
  await page.goto(MEET_CALL_URL);
  return { tabId: await newestTabId(context, extensionId), page };
}

/**
 * The saved snapshots have no Meet code, so this plays Meet's part on every page load: a click on the captions
 * button flips it (after 100 ms, like Meet) and shows or hides the captions band.
 */
export async function emulateMeetCaptionsButton(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    document.addEventListener(
      'click',
      (e) => {
        const button = (e.target as Element | null)?.closest?.('button');
        const icon = button?.querySelector('.google-symbols');
        const name = icon?.textContent?.trim();
        if (!button || !icon || (name !== 'closed_caption' && name !== 'closed_caption_off')) return;
        // The real page (real-dom-* fixtures, research R13) has no aria-pressed and keeps its icon: only the label flips.
        const pressable = button.hasAttribute('aria-pressed');
        const on = pressable
          ? button.getAttribute('aria-pressed') !== 'true'
          : !/^turn off captions/i.test(button.getAttribute('aria-label') ?? '');
        setTimeout(() => {
          if (pressable) {
            button.setAttribute('aria-pressed', String(on));
            icon.textContent = on ? 'closed_caption' : 'closed_caption_off';
          }
          button.setAttribute('aria-label', on ? 'Turn off captions (c)' : 'Turn on captions (c)');
          const band = document.querySelector<HTMLElement>('[jsname="dsyhDe"]');
          if (band) band.style.display = on ? '' : 'none';
        }, 100);
      },
      true,
    );
  });
}

/**
 * Meet captioning `name` for `ms`: a new caption turn whose text grows every 300 ms. Resolves when the turn ends.
 * The text is filler: live-assist never reads it.
 */
export async function speakInMeet(page: Page, name: string, ms: number): Promise<void> {
  await page.evaluate(
    async ({ name, ms }) => {
      const region = document.querySelector('[role="region"][aria-label="Captions"]');
      if (!region) throw new Error('no captions region');
      const item = document.createElement('div');
      item.className = 'nMcdL bj4p3b';
      item.innerHTML =
        '<div class="adE6rb"><img class="Z6byG r6DyN" data-iml="9" src="https://lh3.googleusercontent.com/a/x=s48" alt="" />' +
        '<div class="KcIKyf jxFHg"><span class="NWpY1d"></span></div></div><div class="ygicle VbkSUe"></div>';
      item.querySelector('span')!.textContent = name;
      const last = [...region.querySelectorAll(':scope > .nMcdL')].at(-1);
      if (last) last.after(item);
      else region.prepend(item);
      const text = item.querySelector('.ygicle')!;
      const end = Date.now() + ms;
      while (Date.now() < end) {
        text.append(' word');
        await new Promise((r) => setTimeout(r, 300));
      }
    },
    { name, ms },
  );
}

/**
 * Seeds complete settings. `scenario` scripts the first transcription session for the next meetings (e2e builds only,
 * `src/entrypoints/offscreen/e2e-provider.ts`): 'drop', 'time-limit' or 'auth-error'; omitted = happy path.
 */
export async function seedSettings(
  panel: Page,
  over: { consentReminder?: boolean; scenario?: string; showMeetCaptions?: boolean } = {},
): Promise<void> {
  await panel.evaluate(
    ({ consentReminder, scenario, showMeetCaptions }) =>
      chrome.storage.local.set({
        e2eScenario: scenario,
        settings: {
          schemaVersion: 1,
          userName: 'Alex',
          keyterms: ['Northwind'],
          consentReminder,
          firstRunComplete: true,
          headphonesNoticeDismissed: false,
          // 002 FR-028: Settings → Show Meet captions (off unless a test turns it on).
          showMeetCaptions,
          // 003: the chat step of setup is done (no chat key is needed to transcribe).
          chat: {
            provider: 'openai',
            models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
            setupComplete: true,
          },
        },
        credentials: { elevenLabsApiKey: 'sk_test_fixture_e2e_tx_0001' },
      }),
    {
      consentReminder: over.consentReminder ?? false,
      scenario: over.scenario ?? '',
      showMeetCaptions: over.showMeetCaptions ?? false,
    },
  );
  await panel.reload();
}

export const line = (panel: Page, text: string) =>
  panel.getByRole('region', { name: 'Transcript', exact: true }).getByRole('listitem').filter({ hasText: text });

/** 006: a status dot, found by its label; its `title` is "{label}: {state text}" (copy-review K21). */
export const statusDot = (panel: Page, label: string) =>
  panel.getByRole('region', { name: 'Status' }).locator(`.status-dot[title^="${label}: "]`);

/** 006: the expanded status problems (none while everything is fine). */
export const statusProblems = (panel: Page) => panel.getByRole('region', { name: 'Status' }).locator('.status-problem');

const standup = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/chat/meetings/standup-en.json', import.meta.url)), 'utf8'),
) as { meeting: Record<string, unknown>; segments: Record<string, unknown>[] };

/**
 * 003: settings with `provider` selected and its key seeded (the e2e chat source only checks it exists), plus the
 * stored `standup-en` meeting. Answers come from the fixture chat provider, paced by `delayMs` per delta.
 */
export async function seedAskMeeting(
  panel: Page,
  delayMs: number,
  provider: 'anthropic' | 'openai' = 'anthropic',
): Promise<void> {
  await panel.evaluate(
    async ({ delayMs, fixture, provider }) => {
      await chrome.storage.local.set({
        e2eScenario: 'complete',
        e2eChatDelayMs: delayMs,
        settings: {
          schemaVersion: 1,
          userName: 'Alex',
          keyterms: [],
          consentReminder: false,
          firstRunComplete: true,
          headphonesNoticeDismissed: false,
          chat: {
            provider,
            models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
            setupComplete: true,
          },
        },
        credentials: { elevenLabsApiKey: 'sk_test_fixture_e2e_tx_0001' },
        [`${provider}Credential`]: `test-${provider}-e2e-0001`,
      });
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        // Same version and upgrade as src/storage/db.ts.
        const req = indexedDB.open('live-assist', 4);
        req.onupgradeneeded = (event) => {
          if (event.oldVersion < 1) {
            const meetings = req.result.createObjectStore('meetings', { keyPath: 'id' });
            meetings.createIndex('startedAt', 'startedAt');
            const segments = req.result.createObjectStore('segments', { keyPath: 'id' });
            segments.createIndex('meetingId', 'meetingId');
            segments.createIndex('meetingStart', ['meetingId', 'startMs']);
          }
          if (event.oldVersion < 2) {
            const chatTurns = req.result.createObjectStore('chatTurns', { keyPath: 'id' });
            chatTurns.createIndex('meetingId', 'meetingId');
            chatTurns.createIndex('meetingSeq', ['meetingId', 'seq']);
          }
          // 008: meeting notes.
          if (event.oldVersion < 3) req.result.createObjectStore('meetingContexts', { keyPath: 'meetingId' });
          // 013: Meet's captions.
          if (event.oldVersion < 4) req.result.createObjectStore('captionTurns', { keyPath: ['meetingId', 'seq'] });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error(String(req.error)));
      });
      const tx = db.transaction(['meetings', 'segments'], 'readwrite');
      tx.objectStore('meetings').put(fixture.meeting);
      for (const s of fixture.segments) tx.objectStore('segments').put(s);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error(String(tx.error)));
      });
      db.close();
    },
    { delayMs, fixture: standup, provider },
  );
  await panel.reload();
}
