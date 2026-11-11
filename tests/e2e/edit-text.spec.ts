// 020 T014 (US1–US3; FR-001, FR-004, FR-006, FR-008–FR-011, FR-014): correct a line's text in the real extension with
// the fixture provider. The `names` script gives one line ("Emma speaks first.") and ten seconds later another, so a
// line arrives while the editor is open. No network.
import type { Download, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { LINE_TIMEOUT, line, openMeetingTab, openPanel, reloadShowingStored, seedSettings } from './helpers';

const ORIGINAL = 'Emma speaks first.';

const editor = (panel: Page) => panel.getByRole('group', { name: 'Edit line text' });
const field = (panel: Page) => editor(panel).getByRole('textbox', { name: 'Line text' });
const textOf = (panel: Page, text: string) => line(panel, text).locator('[data-text]');
const labelButton = (panel: Page, text: string) => line(panel, text).locator('.label-button');

async function downloadTranscript(panel: Page): Promise<{ download: Download; body: string }> {
  const [download] = await Promise.all([
    panel.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download transcript' }).click(),
  ]);
  return { download, body: await readFile(await download.path(), 'utf8') };
}

/** The field's selected text, and whether it has focus. */
const fieldState = (panel: Page) =>
  field(panel).evaluate((el: HTMLTextAreaElement) => ({
    value: el.value,
    selected: el.value.slice(el.selectionStart, el.selectionEnd),
    caret: [el.selectionStart, el.selectionEnd],
    focused: document.activeElement === el,
  }));

const focusedIs = (panel: Page, text: string) =>
  labelButton(panel, text).evaluate((el) => document.activeElement === el);

test('edit a line: double-click during a meeting, kept through new lines, downloaded, reloaded and restored', async ({
  context,
  extensionId,
}) => {
  test.setTimeout(120_000);
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel, { scenario: 'names' });
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(line(panel, ORIGINAL)).toBeVisible({ timeout: LINE_TIMEOUT });
  await expect(line(panel, 'This is me speaking.')).toHaveCount(0);

  // US1-1: the double-clicked word is selected in the field, so typing replaces it.
  await textOf(panel, ORIGINAL).dblclick();
  await expect(editor(panel)).toBeVisible();
  const opened = await fieldState(panel);
  expect(opened.value).toBe(ORIGINAL);
  expect(opened.focused).toBe(true);
  expect(['Emma', 'speaks', 'first']).toContain(opened.selected);
  await panel.keyboard.type('Ana');
  const typed = ORIGINAL.replace(opened.selected, 'Ana');
  await expect(field(panel)).toHaveValue(typed);

  // US1-4, FR-010: the next line arrives with the editor open; the typed text, the caret and the focus are kept.
  const caret = (await fieldState(panel)).caret;
  await expect(line(panel, 'This is me speaking.')).toBeVisible({ timeout: 30_000 });
  await expect(editor(panel)).toBeVisible();
  expect(await fieldState(panel)).toMatchObject({ value: typed, caret, focused: true });

  // US1-2: Enter saves; the line shows the new text and the mark, focus is on its label button.
  await panel.keyboard.press('Enter');
  await expect(editor(panel)).toHaveCount(0);
  await expect(textOf(panel, typed)).toHaveText(typed);
  await expect(line(panel, typed).locator('.line-edited')).toHaveText('edited');
  expect(await focusedIs(panel, typed)).toBe(true);
  await expect(line(panel, 'This is me speaking.').locator('.line-edited')).toHaveCount(0);

  // US2: after Stop the downloaded transcript carries the correction.
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
  const { body } = await downloadTranscript(panel);
  expect(body).toContain(`: ${typed}\n`);
  expect(body).not.toContain(ORIGINAL);
  expect(body).not.toContain('edited');

  // US2-3: a reload shows the corrected line with its mark.
  await reloadShowingStored(panel);
  await expect(textOf(panel, typed)).toHaveText(typed);
  await expect(line(panel, typed).locator('.line-edited')).toHaveText('edited');

  // FR-014, R3: the keyboard path, from the label button through the label editor's Edit text, all text selected.
  await labelButton(panel, typed).focus();
  await panel.keyboard.press('Enter');
  const labelEditor = panel.getByRole('dialog', { name: 'Edit speaker name' });
  await labelEditor.getByRole('button', { name: 'Edit text' }).focus();
  await panel.keyboard.press('Enter');
  await expect(labelEditor).toHaveCount(0);
  expect(await fieldState(panel)).toMatchObject({ value: typed, selected: typed, focused: true });
  await panel.keyboard.type('Emma speaks last.');
  await panel.keyboard.press('Enter');
  await expect(textOf(panel, 'Emma speaks last.')).toHaveText('Emma speaks last.');
  expect(await focusedIs(panel, 'Emma speaks last.')).toBe(true);

  // US3-2: Restore original brings back what was transcribed, without the mark; the download follows.
  await textOf(panel, 'Emma speaks last.').dblclick();
  await editor(panel).getByRole('button', { name: 'Restore original' }).click();
  await expect(editor(panel)).toHaveCount(0);
  await expect(textOf(panel, ORIGINAL)).toHaveText(ORIGINAL);
  await expect(line(panel, ORIGINAL).locator('.line-edited')).toHaveCount(0);
  expect(await focusedIs(panel, ORIGINAL)).toBe(true);
  const restored = await downloadTranscript(panel);
  expect(restored.body).toContain(`: ${ORIGINAL}\n`);
  expect(restored.body).not.toContain('Emma speaks last.');
});

test('edit a line: Escape cancels, an empty line is refused, a single click opens nothing', async ({
  context,
  extensionId,
}) => {
  test.setTimeout(90_000);
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel, { scenario: 'names' });
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(line(panel, ORIGINAL)).toBeVisible({ timeout: LINE_TIMEOUT });

  await textOf(panel, ORIGINAL).click();
  await expect(editor(panel)).toHaveCount(0);

  await textOf(panel, ORIGINAL).dblclick();
  await field(panel).fill('   ');
  await panel.keyboard.press('Enter');
  await expect(editor(panel).getByRole('alert')).toHaveText("Enter the line's text.");
  await panel.keyboard.press('Escape');
  await expect(editor(panel)).toHaveCount(0);
  await expect(textOf(panel, ORIGINAL)).toHaveText(ORIGINAL);
  expect(await focusedIs(panel, ORIGINAL)).toBe(true);
  await panel.getByRole('button', { name: 'Stop' }).click();
});
