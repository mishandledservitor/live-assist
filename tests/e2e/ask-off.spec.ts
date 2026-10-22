// 017 T012 (US1; FR-001 to FR-003, FR-006; design decision 103): in the built extension, unticking `Ask questions about
// the meeting` removes the question box, Ask, the model label and the notes controls from the main view, survives a
// reload of the panel, and ticking it again brings them back.
import { expect, test } from './fixtures';
import { openPanel, reloadShowingStored, seedAskMeeting } from './helpers';

const ASK = 'Ask questions about the meeting';

test('turning Ask off hides it on the main view, across a reload, until it is turned on again', async ({
  context,
  extensionId,
}) => {
  const panel = await openPanel(context, extensionId);
  await seedAskMeeting(panel, 0, 'openai');
  const main = panel.locator('.main-view');
  await expect(main.getByRole('textbox', { name: 'Question' })).toBeVisible();
  await expect(main.getByText('GPT-6 Luna')).toBeVisible();

  await panel.getByRole('button', { name: 'Settings' }).click();
  const settings = panel.getByRole('region', { name: 'Settings' });
  const box = settings.getByRole('checkbox', { name: ASK });
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(settings.getByRole('radiogroup', { name: 'Answers from' })).toHaveCount(0);
  await expect(settings.getByRole('region', { name: 'OpenAI API key' })).toHaveCount(0);
  await expect(settings.getByRole('region', { name: 'What OpenAI keeps' })).toHaveCount(0);
  await settings.getByRole('button', { name: 'Back' }).click();

  const expectNoAsk = async () => {
    await expect(main.getByRole('button', { name: 'Close transcript' })).toBeVisible();
    await expect(main.getByRole('textbox', { name: 'Question' })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Ask', exact: true })).toHaveCount(0);
    await expect(main.getByText('GPT-6 Luna')).toHaveCount(0);
    await expect(main.getByRole('button', { name: /notes/i })).toHaveCount(0);
  };
  await expectNoAsk();

  await reloadShowingStored(panel);
  await expectNoAsk();
  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(settings.getByRole('checkbox', { name: ASK })).not.toBeChecked();
  await settings.getByRole('checkbox', { name: ASK }).check();
  await expect(settings.getByRole('region', { name: 'OpenAI API key' })).toContainText('••••0001');
  await settings.getByRole('button', { name: 'Back' }).click();
  await expect(main.getByRole('textbox', { name: 'Question' })).toBeVisible();
  await expect(main.getByText('GPT-6 Luna')).toBeVisible();
});
