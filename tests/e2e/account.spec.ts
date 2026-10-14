// 005: the ElevenLabs account line in the real extension. The service worker's request to the subscription endpoint
// is answered by Playwright routing with the recorded fixtures; nothing reaches the network and no real key is used.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPanel } from './helpers';

const SUBSCRIPTION_URL = 'https://api.elevenlabs.io/v1/user/subscription';
const TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';
const KEY = 'sk_test_fixture_e2e_account_ac01';

interface Recorded {
  status: number;
  body: unknown;
}
const recorded = (name: string): Recorded =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../fixtures/elevenlabs/subscription/${name}.json`, import.meta.url)), 'utf8'),
  ) as Recorded;

/** Answers the subscription endpoint with the current fixture; returns a setter and the keys seen. */
async function stubElevenLabs(context: BrowserContext) {
  let answer = recorded('success');
  const seen: string[] = [];
  await context.route(TOKEN_URL, (route) => route.fulfill({ status: 200, json: { token: 'sutkn_e2e_fixture' } }));
  await context.route(SUBSCRIPTION_URL, async (route) => {
    seen.push(route.request().headers()['xi-api-key'] ?? '');
    await route.fulfill({ status: answer.status, json: answer.body });
  });
  return { use: (name: string) => (answer = recorded(name)), seen };
}

test('credits badge and account details: share left, then a permission failure on refresh; Start unaffected', async ({
  context,
  extensionId,
}) => {
  const stub = await stubElevenLabs(context);
  const panel = await openPanel(context, extensionId);

  await panel.getByLabel('Your name').fill('Alex');
  await panel.getByLabel('ElevenLabs API key').fill(KEY);
  await panel.getByLabel('OpenAI API key').fill('test-openai-fixture-e2e-ac02'); // 003: fixture-checked
  await panel.getByRole('button', { name: 'Check keys and save' }).click();
  await panel.getByRole('button', { name: 'Done' }).click();

  // 006 US4: the header badge shows the share left, named with the full account line.
  const header = panel.locator('header.panel-header');
  const LINE = /^Creator plan · 84% of credits left · renews (in \d+ days?|today) \(Oct (19|20)\)/;
  const badge = header.getByRole('button', { name: LINE });
  await expect(badge).toHaveText('84%');
  await expect(panel.getByRole('button', { name: 'Start' })).toBeEnabled();

  // Activating it opens Settings at the account section, with the exact numbers shown directly.
  await badge.click();
  const account = panel.getByRole('region', { name: 'ElevenLabs account' });
  await expect(panel.getByRole('heading', { name: 'ElevenLabs account' })).toBeFocused();
  await expect(account.getByText(LINE)).toBeVisible();
  await expect(account).toContainText('19,360 of 121,000 credits used · 101,640 left');

  stub.use('user-read-error');
  await panel.getByRole('button', { name: 'Refresh account status' }).click();
  const PERMISSION = "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io";
  await expect(account).toContainText(PERMISSION);
  await panel.getByRole('button', { name: 'Back' }).click();
  const problem = header.getByRole('button', { name: PERMISSION });
  await expect(problem).toHaveText('!');
  await expect(problem).toHaveAttribute('title', PERMISSION);
  await expect(panel.getByRole('button', { name: 'Start' })).toBeEnabled();

  expect(stub.seen.length).toBeGreaterThanOrEqual(2);
  expect(stub.seen.every((k) => k === KEY)).toBe(true);
  await expect(panel.locator('body')).not.toContainText(KEY);
});
