// 008 in the real extension (e2e build: fake audio, fixture transcription and chat providers, no network). US1: notes
// added beside Start move to the meeting when it starts and go with the next question as their own block.
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { LINE_TIMEOUT, line, openMeetingTab, openPanel, seedSettings, showStoredOnMain } from './helpers';

const agendaPath = fileURLToPath(new URL('../fixtures/notes/agenda.md', import.meta.url));
const SENTINEL = 'NOTES-SENTINEL-7Q';

async function seedChatKey(panel: Page): Promise<void> {
  await panel.evaluate(() => chrome.storage.local.set({ openaiCredential: 'test-openai-e2e-0001' }));
  await panel.reload();
}

async function chooseFile(panel: Page, opener: string, path: string): Promise<void> {
  await panel.getByRole('button', { name: opener }).click();
  const chooser = panel.waitForEvent('filechooser');
  await panel.getByRole('menuitem', { name: 'Choose file…' }).click();
  await (await chooser).setFiles(path);
}

/** What the fixture chat provider received last: per user turn, its notes block (or null) and transcript block. */
async function lastRequest(panel: Page): Promise<{ notes: string | null; context: string }[]> {
  return panel.evaluate(
    async () =>
      (
        await chrome.storage.local.get<{ e2eLastChatRequest: { notes: string | null; context: string }[] }>(
          'e2eLastChatRequest',
        )
      ).e2eLastChatRequest,
  );
}

async function ask(panel: Page, q: string): Promise<void> {
  await panel.getByRole('textbox', { name: 'Question' }).fill(q);
  await panel.getByRole('textbox', { name: 'Question' }).press('Enter');
  await expect(
    panel.getByRole('region', { name: 'Questions and answers' }).getByRole('article', { name: q }),
  ).toContainText('GPT-6 Luna', { timeout: LINE_TIMEOUT });
}

test('notes added before Start belong to the meeting and go with its questions', async ({ context, extensionId }) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel);
  await seedChatKey(panel);

  await chooseFile(panel, 'Add notes for the next meeting', agendaPath);
  await expect(panel.getByRole('button', { name: 'Notes for the next meeting: agenda.md' })).toBeVisible();

  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Notes: agenda.md' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /for the next meeting/ })).toHaveCount(0);

  await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
  await ask(panel, 'Which agenda items are left?');
  const [first] = await lastRequest(panel);
  expect(first!.notes).toContain('Notes from the person asking (agenda.md).');
  expect(first!.notes).toContain(SENTINEL);
  expect(first!.context).not.toContain(SENTINEL);
  expect(first!.context).toContain('Hello everyone.');
});

test('notes stay with the stopped meeting and are deleted with it', async ({ context, extensionId }) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  let panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel);
  await seedChatKey(panel);
  await chooseFile(panel, 'Add notes for the next meeting', agendaPath);
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();

  await panel.close();
  panel = await openPanel(context, extensionId, meetingTab);
  // 014: the reopened panel opens clean; the notes stayed with the meeting, which is put back on the main view.
  await showStoredOnMain(panel);
  await expect(panel.getByRole('button', { name: 'Notes: agenda.md' })).toBeVisible();
  // Nothing is pending for the next meeting: the notes went to this one.
  await expect(panel.getByRole('button', { name: 'Add notes for the next meeting' })).toBeVisible();
  await ask(panel, 'What was left on the agenda?');
  expect((await lastRequest(panel))[0]!.notes).toContain(SENTINEL);

  await panel.getByRole('button', { name: 'Delete transcript' }).click();
  await panel.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(line(panel, 'Hello everyone.')).toHaveCount(0);
  await panel.reload();
  await expect(panel.getByRole('button', { name: /^Notes: / })).toHaveCount(0);
  const stored = await panel.evaluate(
    () =>
      new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = indexedDB.open('live-assist');
        req.onsuccess = () => {
          const keys = req.result.transaction('meetingContexts').objectStore('meetingContexts').getAllKeys();
          keys.onsuccess = () => resolve(keys.result);
          keys.onerror = () => reject(new Error('read failed'));
        };
        req.onerror = () => reject(new Error('open failed'));
      }),
  );
  expect(stored).toEqual([]);
});

const greekPath = fileURLToPath(new URL('../fixtures/notes/greek.md', import.meta.url));

test('notes pasted, replaced and removed during the meeting; superseded notes are not sent again', async ({
  context,
  extensionId,
}) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel);
  await seedChatKey(panel);
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });

  // Paste.
  await panel.getByRole('button', { name: 'Add notes', exact: true }).click();
  await panel.getByRole('menuitem', { name: 'Paste text' }).click();
  const dialog = panel.getByRole('dialog', { name: 'Notes' });
  await dialog.getByRole('textbox', { name: 'Notes' }).fill(`Shared doc ${SENTINEL}`);
  await dialog.getByRole('button', { name: 'Save notes' }).click();
  await expect(panel.getByRole('button', { name: 'Notes: Pasted notes' })).toBeVisible();
  await ask(panel, 'First?');
  expect((await lastRequest(panel)).at(-1)!.notes).toContain(SENTINEL);

  // Replace with a file.
  await chooseFile(panel, 'Notes: Pasted notes', greekPath);
  await expect(panel.getByRole('button', { name: 'Notes: greek.md' })).toBeVisible();
  await ask(panel, 'Second?');
  let request = await lastRequest(panel);
  expect(JSON.stringify(request)).not.toContain(SENTINEL);
  expect(request.at(-1)!.notes).toContain('replacing their earlier notes (greek.md)');
  expect(request[0]!.context).toContain('Hello everyone.');

  // Remove.
  await panel.getByRole('button', { name: 'Remove notes' }).click();
  await expect(panel.getByRole('button', { name: 'Add notes', exact: true })).toBeVisible();
  await ask(panel, 'Third?');
  request = await lastRequest(panel);
  expect(JSON.stringify(request)).not.toContain('Προϋπολογισμός');
  expect(request.at(-1)!.notes).toBe(
    'The person asking removed their notes. Earlier notes, and anything earlier answers took from them, no longer apply.',
  );
  expect(request).toHaveLength(3);
});
