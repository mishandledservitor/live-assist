// 003 US3 in the real extension (T073): from a profile set up with OpenAI, switch to Claude in Settings, add a Claude
// key (checked by the e2e build's fixture provider, no network) and ask: the answer says Claude Sonnet 5.5 wrote it.
import { expect, test } from './fixtures';
import { openPanel, seedAskMeeting } from './helpers';

const CLAUDE_KEY = 'test-anthropic-fixture-e2e-wx12';

test('switching to Claude in Settings sends the next question to Claude', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await seedAskMeeting(panel, 0, 'openai');
  await expect(panel.locator('.main-view').getByText('GPT-6 Luna')).toBeVisible();

  await panel.getByRole('button', { name: 'Settings' }).click();
  const settings = panel.getByRole('region', { name: 'Settings' });
  await expect(settings.getByRole('heading', { name: 'Questions' })).toBeVisible();
  await settings.getByRole('radio', { name: 'Claude' }).check();
  await expect(settings.getByRole('region', { name: 'What Anthropic keeps' })).toBeVisible();
  const claudeKey = settings.getByRole('region', { name: 'Claude API key' });
  await expect(claudeKey).toContainText('No key saved.');
  await claudeKey.getByLabel('Claude API key').fill(CLAUDE_KEY);
  await claudeKey.getByRole('button', { name: 'Check and save' }).click();
  await expect(claudeKey).toContainText('Key works.');
  await expect(claudeKey).toContainText('••••wx12');
  await expect(claudeKey.getByLabel('Claude API key')).toHaveCount(0);
  await settings.getByRole('button', { name: 'Back' }).click();

  await expect(panel.locator('.main-view').getByText('Claude Sonnet 5.5')).toBeVisible();
  const box = panel.getByRole('textbox', { name: 'Question' });
  await box.fill('What was decided about pricing?');
  await box.press('Enter');
  const reply = panel
    .getByRole('region', { name: 'Questions and answers' })
    .getByRole('article', { name: 'What was decided about pricing?' });
  await expect(reply).toContainText('Pricing stays at the current tier until January');
  await expect(reply).not.toHaveAttribute('aria-busy', 'true');
  await expect(reply).toContainText('Claude Sonnet 5.5');
  await expect(panel.locator('body')).not.toContainText(CLAUDE_KEY);
});
