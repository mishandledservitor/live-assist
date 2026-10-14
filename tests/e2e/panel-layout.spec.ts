// 006 side-panel redesign in the real extension: the transcript gets the panel (US1, SC-001), the status line stays one
// line until something is wrong (US2, SC-002), Settings round trip during a meeting (US3, SC-005) and the built output
// carries none of the copy review's deleted strings (US5, SC-004).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { loadCopyFixture } from '../support/copy-scan';
import { expect, extensionPath, test } from './fixtures';
import {
  emulateMeetCaptionsButton,
  line,
  openMeetingTab,
  openMeetPage,
  openPanel,
  reloadShowingStored,
  seedAskMeeting,
  seedSettings,
  statusDot,
  statusProblems,
} from './helpers';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function builtFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? builtFiles(path) : [path];
  });
}

/** Writes a stopped meeting of `n` lines straight into the panel's IndexedDB, then reloads the panel. */
async function seedStoredMeeting(panel: Page, n: number): Promise<void> {
  await panel.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // Same version and upgrade as src/storage/db.ts (v4 since 013), so the panel opens it without a VersionError.
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
        if (event.oldVersion < 3) req.result.createObjectStore('meetingContexts', { keyPath: 'meetingId' });
        if (event.oldVersion < 4) req.result.createObjectStore('captionTurns', { keyPath: ['meetingId', 'seq'] });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(String(req.error)));
    });
    const tx = db.transaction(['meetings', 'segments'], 'readwrite');
    tx.objectStore('meetings').put({
      id: 'seeded',
      startedAt: Date.now() - 3_600_000,
      endedAt: Date.now() - 600_000,
      endReason: 'user-stop',
      source: { url: 'https://meet.google.com/abc-defg-hij', title: 'Weekly sync', platform: 'meet' },
      languageMode: { kind: 'auto' },
      userName: 'Alex',
      speakerRenames: {},
      schemaVersion: 1,
    });
    for (let i = 0; i < count; i += 1) {
      tx.objectStore('segments').put({
        id: `seeded:mixed:${i}`,
        meetingId: 'seeded',
        stream: 'mixed',
        seq: i,
        startMs: i * 4000,
        endMs: i * 4000 + 3000,
        text: `Seeded line number ${i} about the quarterly plan and what comes next.`,
        language: 'en',
        speakerLabel: i % 3 === 0 ? 'Alex' : 'Others',
        labelSource: i % 3 === 0 ? 'self' : 'fallback',
        captionName: null,
        captionSelf: i % 3 === 0,
        labelOverride: null,
        words: [],
        timing: 'words',
        sessionId: 's1',
        createdAt: 0,
        schemaVersion: 2,
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(String(tx.error)));
    });
    db.close();
  }, n);
  await reloadShowingStored(panel);
}

test('transcript fills the panel', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await panel.setViewportSize({ width: 360, height: 700 });
  await seedSettings(panel);
  await seedStoredMeeting(panel, 50);
  await expect(panel.getByText('Seeded line number 49', { exact: false })).toBeAttached();

  // 003 (design decision 38) pins the question box under the transcript; the transcript keeps the rest.
  const transcript = await panel.getByRole('region', { name: 'Transcript', exact: true }).boundingBox();
  expect(transcript!.height).toBeGreaterThanOrEqual(0.7 * 700);

  // No settings control on the main view: the only text box is the question box.
  await expect(panel.getByRole('textbox')).toHaveCount(1);
  await expect(panel.getByRole('textbox', { name: 'Question' })).toBeVisible();
  await expect(panel.getByRole('checkbox')).toHaveCount(0);

  // At Chrome's narrowest side panel the header controls still share one row.
  await panel.setViewportSize({ width: 320, height: 700 });
  const header = panel.locator('header.panel-header');
  const tops = await Promise.all(
    [
      header.getByRole('button', { name: 'Start' }),
      header.getByRole('combobox', { name: 'Language' }),
      header.getByRole('button', { name: 'Settings' }),
    ].map(async (l) => Math.round((await l.boundingBox())!.y + (await l.boundingBox())!.height / 2)),
  );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
  const box = await header.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(await panel.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

/** Appends `n` lines to the stored `standup-en` meeting (after its own 18), then reloads the panel. */
async function appendStandupLines(panel: Page, n: number): Promise<void> {
  await panel.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('live-assist');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(String(req.error)));
    });
    const tx = db.transaction('segments', 'readwrite');
    for (let i = 0; i < count; i += 1) {
      const seq = 18 + i;
      tx.objectStore('segments').put({
        id: `mtg-standup-en:mixed:${seq}`,
        meetingId: 'mtg-standup-en',
        stream: 'mixed',
        seq,
        startMs: 1_180_000 + i * 4000,
        endMs: 1_183_000 + i * 4000,
        text: `Appended line number ${i} about the quarterly plan and what comes next.`,
        language: 'en',
        speakerLabel: i % 3 === 0 ? 'Alex' : 'Others',
        labelSource: i % 3 === 0 ? 'self' : 'fallback',
        captionName: null,
        captionSelf: i % 3 === 0,
        labelOverride: null,
        words: [],
        timing: 'estimated',
        sessionId: 'sess-fixture-1',
        createdAt: 0,
        schemaVersion: 2,
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(String(tx.error)));
    });
    db.close();
  }, n);
  await reloadShowingStored(panel);
}

// FR-023, SC-007 (real call 2026-10-12): only the transcript and the answers strip scroll; the page never does.
test('the panel page never scrolls with a long transcript', async ({ context, extensionId }) => {
  test.setTimeout(90_000);
  const panel = await openPanel(context, extensionId);
  await panel.setViewportSize({ width: 400, height: 870 });
  await seedAskMeeting(panel, 0);
  await appendStandupLines(panel, 1500);
  await expect(panel.getByText('Appended line number 1499', { exact: false })).toBeAttached();

  const page = () =>
    panel.evaluate(() => {
      const el = document.scrollingElement!;
      return { overflow: el.scrollHeight - el.clientHeight, scrollTop: el.scrollTop };
    });
  const start = panel.locator('header.panel-header').getByRole('button', { name: 'Start' });
  expect(await page()).toEqual({ overflow: 0, scrollTop: 0 });
  await expect(start).toBeInViewport({ ratio: 1 });

  const answers = panel.getByRole('region', { name: 'Questions and answers' });
  for (const q of ['What was decided about pricing?', 'And what happens next?']) {
    await panel.getByRole('textbox', { name: 'Question' }).fill(q);
    await panel.getByRole('textbox', { name: 'Question' }).press('Enter');
    await expect(answers.getByRole('article', { name: q })).toContainText('Jane will send the new deck by Friday');
    await expect(answers.getByRole('article', { name: q })).not.toHaveAttribute('aria-busy', 'true');
  }
  expect(await page()).toEqual({ overflow: 0, scrollTop: 0 });

  await answers
    .getByRole('article', { name: 'What was decided about pricing?' })
    .getByRole('button', { name: 'Go to 00:12 in the transcript' })
    .click();
  const cited = line(panel, 'Pricing stays at the current tier until January.');
  await expect(cited).toHaveAttribute('aria-current', 'true');
  await expect(cited).toBeInViewport();
  expect(await page()).toEqual({ overflow: 0, scrollTop: 0 });
  await expect(start).toBeInViewport({ ratio: 1 });
});

test('status line: one line in a healthy Meet meeting', async ({ context, extensionId }) => {
  test.setTimeout(90_000);
  await emulateMeetCaptionsButton(context);
  const meet = await openMeetPage(context, extensionId, 'in-call-captions-off');
  const panel = await openPanel(context, extensionId, meet.tabId);
  await seedSettings(panel, { scenario: 'names' });
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On', { timeout: 15_000 });
  await expect(statusDot(panel, 'Microphone')).toHaveAttribute('title', 'Microphone: Live', { timeout: 10_000 });
  await expect(statusDot(panel, 'Transcription')).toHaveAttribute('title', 'Transcription: Transcribing');
  await expect(statusProblems(panel)).toHaveCount(0);
  const { height, lineHeight } = await panel.getByRole('region', { name: 'Status' }).evaluate((el) => {
    const list = el.querySelector('.status-dots')!;
    return { height: list.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(list).lineHeight) };
  });
  expect(height).toBeLessThanOrEqual(1.5 * lineHeight);
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
});

test('status line: a meeting on a site other than Meet says why names are missing', async ({
  context,
  extensionId,
}) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel);
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(statusProblems(panel)).toHaveText([
    'Speaker names Not available — Speaker names work on Google Meet only.',
  ]);
  await panel.getByRole('button', { name: 'Stop' }).click();
});

test('settings round trip during a meeting loses no line and keeps capturing', async ({ context, extensionId }) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel);
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();

  // The fixture session commits its three lines 3–5 s after Start; all of them arrive while Settings is open.
  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(panel.getByRole('heading', { level: 2, name: 'Settings' })).toBeFocused();
  await panel.waitForTimeout(7000);
  await panel.getByRole('button', { name: 'Back' }).click();

  await expect(panel.getByRole('button', { name: 'Settings' })).toBeFocused();
  for (const text of ['Hello everyone.', 'This is me speaking.', 'Καλημέρα σε όλους.'])
    await expect(line(panel, text)).toBeVisible();
  await expect(statusDot(panel, 'Capture')).toHaveAttribute('title', 'Capture: Capturing the meeting tab');
  await panel.getByRole('button', { name: 'Stop' }).click();
});

test('built output has no deleted copy', () => {
  const { entries } = loadCopyFixture(ROOT);
  const files = builtFiles(extensionPath).filter((f) => /\.(js|html)$/.test(f) || f.endsWith('manifest.json'));
  expect(files.length).toBeGreaterThan(3);
  const text = files.map((f) => ({ f, body: readFileSync(f, 'utf8') }));
  const found = entries
    .filter((e) => e.enabled && !e.dom)
    .flatMap((e) =>
      e.absent.flatMap((fragment) =>
        text
          .filter(({ body }) => body.includes(fragment) || body.includes(JSON.stringify(fragment).slice(1, -1)))
          .map(({ f }) => `${e.id}: "${fragment}" in ${relative(extensionPath, f)}`),
      ),
    );
  expect(found).toEqual([]);
  expect(entries.every((e) => e.enabled)).toBe(true);

  const manifest = JSON.parse(readFileSync(join(extensionPath, 'manifest.json'), 'utf8')) as { description: string };
  expect(manifest.description).toBe('Transcribes your meeting live and names speakers from Google Meet captions.');
});
