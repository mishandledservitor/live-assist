// 001 FR-004a (T121) in the real extension: a column of names copied elsewhere and pasted with the keyboard into the
// field for new key terms keeps its line breaks as separators, and Add puts every name in the list with one save.
// jsdom cannot show what Chrome does with pasted line breaks in a single-line field, so this runs a real copy and paste.
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPanel, seedSettings } from './helpers';

/** Puts `text` on the clipboard the way a user does: select it in another page and press copy. */
async function copy(context: BrowserContext, text: string): Promise<void> {
  const source = await context.newPage();
  await source.setContent('<textarea></textarea>');
  const box = source.locator('textarea');
  await box.fill(text);
  await box.press('ControlOrMeta+A');
  await box.press('ControlOrMeta+C');
  await source.close();
}

const storedKeyterms = (panel: Page) =>
  panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    return (settings as { keyterms: string[] }).keyterms;
  });

test('a pasted column of 50 names becomes 50 key terms', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await seedSettings(panel); // one saved term: Northwind
  await panel.getByRole('button', { name: 'Settings' }).click();
  const settings = panel.getByRole('region', { name: 'Settings' });
  const field = settings.getByLabel('Add terms, separated by commas');
  const add = settings.getByRole('button', { name: 'Add terms' });
  const listed = settings.getByRole('list', { name: 'Key terms', exact: true }).getByRole('listitem');
  const notUsed = settings.getByRole('list', { name: 'Key terms not used' }).getByRole('listitem');

  // 49 names, so that with the saved term the list is exactly at the limit. Windows line endings, as from a sheet.
  const names = Array.from({ length: 49 }, (_, i) => `Person ${i + 1} Name`);
  await copy(context, names.join('\r\n') + '\r\n');
  await panel.bringToFront();
  await field.focus();
  await field.press('ControlOrMeta+V');
  await expect(field).toHaveValue(names.join(', '));
  await add.click();

  await expect(listed).toHaveCount(50);
  await expect(settings.getByRole('textbox', { name: 'Key term 2', exact: true })).toHaveValue('Person 1 Name');
  await expect(settings.getByRole('textbox', { name: 'Key term 50', exact: true })).toHaveValue('Person 49 Name');
  await expect(field).toHaveValue('');
  await expect(notUsed).toHaveCount(0);
  expect(await storedKeyterms(panel)).toEqual(['Northwind', ...names]);

  // A second paste: a repeat, a term past the 50th and an over-long one. Kept, and the last two listed as not used.
  await copy(context, 'person 3 name\nOne Too Many\nAn extremely long product name');
  await panel.bringToFront();
  await field.focus();
  await field.press('ControlOrMeta+V');
  await add.click();
  await expect(listed).toHaveCount(52);
  await expect(notUsed).toHaveCount(2);
  await expect(notUsed.filter({ hasText: 'One Too Many' })).toContainText('is over the 50-term limit');
  await expect(notUsed.filter({ hasText: 'An extremely long product name' })).toContainText(
    'is longer than 20 characters',
  );
  expect(await storedKeyterms(panel)).toEqual([
    'Northwind',
    ...names,
    'One Too Many',
    'An extremely long product name',
  ]);

  // Single terms still edit and remove in the long list.
  await settings.getByRole('button', { name: 'Remove One Too Many' }).click();
  await expect(listed).toHaveCount(51);
  await expect(notUsed).toHaveCount(1);
});
