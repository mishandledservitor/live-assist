// US2 independent test: fresh install → setup → restart the browser → settings persist, key masked, Start enabled.
// The ElevenLabs token endpoint is stubbed with Playwright routing; nothing reaches the network.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, extensionIdOf, launchExtension, test } from './fixtures';

const TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';
const BAD_KEY = 'sk_test_fixture_e2e_bad_0000';
const GOOD_KEY = 'sk_test_fixture_e2e_key_e2e1';
/** 003: checked by the e2e build's fixture chat provider, never the network. */
const CHAT_KEY = 'test-openai-fixture-e2e-ab12';

async function stubTokenEndpoint(context: BrowserContext, seen: string[]): Promise<void> {
  await context.route(TOKEN_URL, async (route) => {
    const key = route.request().headers()['xi-api-key'] ?? '';
    seen.push(key);
    if (key === GOOD_KEY) await route.fulfill({ status: 200, json: { token: 'sutkn_e2e_fixture' } });
    else await route.fulfill({ status: 401, json: { detail: 'invalid api key' } });
  });
}

async function openPanel(context: BrowserContext): Promise<Page> {
  const id = await extensionIdOf(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  return page;
}

test('first-run setup persists across a browser restart, keys masked, Start and Ask ready', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'live-assist-e2e-'));
  try {
    const seen: string[] = [];
    let context = await launchExtension(profile);
    await stubTokenEndpoint(context, seen);
    let panel = await openPanel(context);

    await expect(panel.getByRole('region', { name: 'Set up live-assist' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Start' })).toHaveCount(0);
    await expect(panel.getByRole('region', { name: 'What ElevenLabs keeps' })).toContainText(
      'Improve the models for everyone',
    );

    // 003 (design decisions 39-40): OpenAI is preselected, with its disclosure after ElevenLabs'.
    await expect(panel.getByRole('radio', { name: 'OpenAI' })).toBeChecked();
    await expect(panel.getByRole('region', { name: 'What OpenAI keeps' })).toBeVisible();

    await panel.getByLabel('Your name').fill('Alex');
    await panel.getByLabel('ElevenLabs API key').fill(BAD_KEY);
    await panel.getByLabel('OpenAI API key').fill(CHAT_KEY);
    await panel.getByRole('button', { name: 'Check keys and save' }).click();
    await expect(panel.getByRole('alert')).toContainText('rejected this key');

    await panel.getByLabel('ElevenLabs API key').fill(GOOD_KEY);
    await panel.getByRole('button', { name: 'Check keys and save' }).click();
    await expect(panel.getByText('Keys saved on this computer only')).toHaveText(
      'Keys saved on this computer only: ElevenLabs ••••e2e1, OpenAI ••••ab12',
    );
    expect(seen).toEqual([BAD_KEY, GOOD_KEY]);
    await panel.getByRole('button', { name: 'Done' }).click();

    await expect(panel.getByRole('button', { name: 'Start' })).toBeEnabled();
    await expect(panel.getByRole('textbox', { name: 'Question' })).toBeEnabled();
    await expect(panel.getByText(/key in Settings to ask questions/)).toHaveCount(0);
    await expect(panel.locator('.main-view').getByText('GPT-6 Luna')).toBeVisible();
    await expect(panel.locator('body')).not.toContainText(GOOD_KEY);
    await expect(panel.locator('body')).not.toContainText(CHAT_KEY);
    await context.close();

    context = await launchExtension(profile);
    panel = await openPanel(context);
    await expect(panel.getByRole('region', { name: 'Set up live-assist' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Start' })).toBeEnabled();
    await panel.getByRole('button', { name: 'Settings' }).click();
    await expect(panel.getByRole('region', { name: 'Settings' })).toBeVisible();
    await expect(panel.getByText('••••e2e1')).toBeVisible();
    await expect(panel.getByRole('region', { name: 'OpenAI API key' })).toContainText('••••ab12');
    await expect(panel.getByLabel('Your name')).toHaveValue('Alex');
    await expect(panel.locator('body')).not.toContainText(GOOD_KEY);
    await expect(panel.locator('body')).not.toContainText(CHAT_KEY);

    // Stored only in chrome.storage.local, never sync (FR-003).
    const sync = await panel.evaluate(() => chrome.storage.sync.get(null));
    expect(sync).toEqual({});
    await context.close();
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
});

test('an install set up before 003 sees only the chat step, once', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        schemaVersion: 1,
        userName: 'Alex',
        keyterms: [],
        consentReminder: false,
        firstRunComplete: true,
        headphonesNoticeDismissed: false,
      },
      credentials: { elevenLabsApiKey: 'sk_test_fixture_e2e_tx_0001' },
    }),
  );
  await panel.reload();

  const setup = panel.getByRole('region', { name: 'Set up live-assist' });
  await expect(setup).toBeVisible();
  await expect(panel.getByLabel('Your name')).toHaveCount(0);
  await expect(panel.getByLabel('ElevenLabs API key')).toHaveCount(0);
  await panel.getByLabel('OpenAI API key').fill(CHAT_KEY);
  await panel.getByRole('button', { name: 'Check key and save' }).click();
  await expect(panel.getByText('Key saved on this computer only')).toHaveText(
    'Key saved on this computer only: ••••ab12',
  );
  await panel.getByRole('button', { name: 'Done' }).click();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeEnabled();

  await panel.reload();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeEnabled();
  await expect(setup).toHaveCount(0);
});
