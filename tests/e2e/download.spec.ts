// 007 T017 (US1, US2; FR-003–FR-009): `Download transcript` in the real extension saves one file through Chrome's
// download manager, formatted as 004's inbox files and named `… — Transcript.txt` (013 decision 70). A stored meeting (with a question asked, so chat exists)
// and a running fixture meeting. No network.
import type { Download, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { LINE_TIMEOUT, line, openMeetingTab, openPanel, seedAskMeeting, seedSettings } from './helpers';

const STANDUP_STARTED_AT = 1791277200000;

/** The panel download's name, computed here from the local clock (the browser shares the test's time zone). */
function expectedName(startedAt: number): string {
  const d = new Date(startedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `Meeting — ${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} at ${p(d.getHours())}h${p(d.getMinutes())} — Transcript.txt`;
}

async function downloadTranscript(panel: Page): Promise<{ download: Download; body: string }> {
  const [download] = await Promise.all([
    panel.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download transcript' }).click(),
  ]);
  const path = await download.path();
  return { download, body: await readFile(path, 'utf8') };
}

test('download: a stored meeting saves the inbox-format file, transcript only', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await seedAskMeeting(panel, 0);
  await expect(line(panel, 'Thanks all, see you tomorrow.')).toBeAttached();

  // Chat exists for this meeting; none of it may reach the file (FR-008).
  await expect(panel.locator('.main-view').getByText('Claude Sonnet 5.5')).toBeVisible();
  await panel.getByRole('textbox', { name: 'Question' }).fill('What was decided about pricing?');
  await panel.getByRole('textbox', { name: 'Question' }).press('Enter');
  const reply = panel
    .getByRole('region', { name: 'Questions and answers' })
    .getByRole('article', { name: 'What was decided about pricing?' });
  await expect(reply).toContainText('Jane will send the new deck by Friday');

  const { download, body } = await downloadTranscript(panel);
  expect(download.suggestedFilename()).toBe(expectedName(STANDUP_STARTED_AT));
  expect(body.startsWith("[00:03] Alex: Morning everyone, let's start with pricing.\n\n[")).toBe(true);
  expect(body.endsWith('Thanks all, see you tomorrow.\n')).toBe(true);
  expect(body.endsWith('\n\n')).toBe(false);
  const lines = body.slice(0, -1).split('\n\n');
  expect(lines).toHaveLength(18);
  for (const l of lines) expect(l).toMatch(/^\[\d{2,}:\d{2}\] [^:\n]+: [^\n]+$/);
  expect(body).not.toContain('What was decided about pricing?');
  expect(body).not.toContain('Jane will send the new deck by Friday [');
  expect(body).not.toContain('Claude');
});

test('download: during a running meeting it saves the lines so far, and again after Stop', async ({
  context,
  extensionId,
}) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel);
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
  await expect(panel.getByRole('button', { name: 'Delete transcript' })).toHaveCount(0);

  const meetingStartedAt = await panel.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('live-assist');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(String(req.error)));
    });
    const all = await new Promise<{ startedAt: number }[]>((resolve) => {
      const req = db.transaction('meetings').objectStore('meetings').getAll();
      req.onsuccess = () => resolve(req.result as { startedAt: number }[]);
    });
    db.close();
    return Math.max(...all.map((m) => m.startedAt));
  });

  const during = await downloadTranscript(panel);
  expect(during.download.suggestedFilename()).toBe(expectedName(meetingStartedAt));
  expect(during.body).toContain('] Others: Hello everyone.\n');
  expect(during.body).not.toContain('…');
  // Transcription carries on (US2-3).
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(line(panel, 'This is me speaking.')).toBeVisible({ timeout: LINE_TIMEOUT });

  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
  const after = await downloadTranscript(panel);
  expect(after.download.suggestedFilename()).toBe(expectedName(meetingStartedAt));
  expect(after.body).toContain('] Others: Hello everyone.\n');
  expect(after.body).toContain('] Others: This is me speaking.\n');
  await expect(panel.getByRole('button', { name: 'Delete transcript' })).toBeVisible();
});
