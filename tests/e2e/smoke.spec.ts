import { expect, test } from './fixtures';

test('side panel page loads from the built extension', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByRole('heading', { name: 'live-assist', exact: true })).toBeVisible();
});
