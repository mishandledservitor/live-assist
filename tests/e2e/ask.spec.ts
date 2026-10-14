// 003 US1 in the real extension (T048): ask about a stored meeting, the answer streams from the service worker's
// fixture chat provider (e2e build, no network), a citation brings its line into view highlighted, and Stop or closing
// the panel leaves the partial answer marked Stopped. T108 (FR-003a, FR-018a, design decision 80): a turn shows that it
// is waiting until its first word, and a question that gets no answer says so and comes back into the box.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { line, openPanel, seedAskMeeting } from './helpers';

const question = (panel: Page) => panel.getByRole('textbox', { name: 'Question' });
const answer = (panel: Page, q: string) =>
  panel.getByRole('region', { name: 'Questions and answers' }).getByRole('article', { name: q });

async function ask(panel: Page, q: string): Promise<void> {
  await expect(panel.locator('.main-view').getByText('Claude Sonnet 5.5')).toBeVisible();
  await question(panel).fill(q);
  await question(panel).press('Enter');
}

test('ask: the answer streams in and a citation highlights its line', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await panel.setViewportSize({ width: 360, height: 700 });
  await seedAskMeeting(panel, 20);
  await expect(line(panel, 'Thanks all, see you tomorrow.')).toBeAttached();

  await ask(panel, 'What was decided about pricing?');
  const reply = answer(panel, 'What was decided about pricing?');
  await expect(reply).toContainText('Pricing stays at the current tier until January');
  await expect(reply).toContainText('Jane will send the new deck by Friday [03:45] [04:02].');
  await expect(reply).not.toHaveAttribute('aria-busy', 'true');
  await expect(reply).toContainText('Claude Sonnet 5.5');

  await reply.getByRole('button', { name: 'Go to 00:12 in the transcript' }).click();
  const cited = line(panel, 'Pricing stays at the current tier until January.');
  await expect(cited).toHaveAttribute('aria-current', 'true');
  await expect(cited).toBeInViewport();
  await expect(reply).toBeVisible();
});

test('ask: Stop mid-answer keeps the partial answer as Stopped', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await seedAskMeeting(panel, 400);
  await ask(panel, 'Summarise the pricing talk');
  const reply = answer(panel, 'Summarise the pricing talk');
  await expect(reply).toContainText('Pricing');
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(reply).toContainText('Stopped');
  await expect(panel.getByRole('button', { name: 'Ask' })).toBeVisible();
});

test('ask: closing the panel mid-answer leaves it Stopped on the next open', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await seedAskMeeting(panel, 400);
  await ask(panel, 'What happens next?');
  await expect(answer(panel, 'What happens next?')).toContainText('Pricing');
  await panel.close();

  const again = await openPanel(context, extensionId);
  const reply = answer(again, 'What happens next?');
  await expect(reply).toContainText('Stopped');
  await expect(reply).not.toContainText('Jane will send the new deck');
});

const waitingMark = (panel: Page) => panel.getByRole('img', { name: 'Waiting for the answer' });
const turnHeight = (panel: Page) =>
  panel
    .locator('.chat-turn')
    .last()
    .evaluate((el) => el.getBoundingClientRect().height);

test('ask: the turn shows it is waiting until the first word, which takes its place without moving anything', async ({
  context,
  extensionId,
}) => {
  const panel = await openPanel(context, extensionId);
  await panel.setViewportSize({ width: 360, height: 700 });
  // The fixture provider pauses this long before each word, the first included.
  await seedAskMeeting(panel, 2_000);
  await ask(panel, 'What was decided about pricing?');
  const reply = answer(panel, 'What was decided about pricing?');

  const mark = reply.getByRole('img', { name: 'Waiting for the answer' });
  await expect(mark).toBeVisible();
  await expect(reply).toHaveAttribute('aria-busy', 'true');
  await expect(reply).toHaveText('');
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  // Heard once: a status outside the strip (the answer is aria-busy) says it while the turn waits.
  const status = panel.locator('.ask-area > [role="status"]');
  await expect(status).toHaveText('Waiting for the answer');
  const dot = mark.locator('span').first();
  expect(await dot.evaluate((el) => getComputedStyle(el).animationName)).toBe('chat-pending');
  await panel.emulateMedia({ reducedMotion: 'reduce' });
  expect(await dot.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await expect(mark).toBeVisible();
  const waitingHeight = await turnHeight(panel);

  await expect(reply).toContainText('Pricing');
  await expect(waitingMark(panel)).toHaveCount(0);
  await expect(status).toHaveText('');
  expect(Math.abs((await turnHeight(panel)) - waitingHeight)).toBeLessThan(0.5);
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(reply).toContainText('Stopped');
});

test('ask: a question that gets no answer says so and is back in the box to resend', async ({
  context,
  extensionId,
}) => {
  const panel = await openPanel(context, extensionId);
  await panel.setViewportSize({ width: 360, height: 700 });
  await seedAskMeeting(panel, 0);
  // The provider names its model and then sends nothing; the 45 s limit is 1.5 s for this test (e2e builds only).
  await panel.evaluate(() => chrome.storage.local.set({ e2eScenario: 'silent', e2eChatFirstTextMs: 1_500 }));

  await ask(panel, 'Who am I?');
  const reply = answer(panel, 'Who am I?');
  await expect(reply.getByRole('img', { name: 'Waiting for the answer' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(question(panel)).toHaveValue('');

  const alert = reply.getByRole('alert');
  await expect(alert).toContainText('No answer came back. Ask again.', { timeout: 10_000 });
  await expect(waitingMark(panel)).toHaveCount(0);
  await expect(reply).not.toHaveAttribute('aria-busy', 'true');
  await expect(reply).not.toContainText('Stopped');
  await expect(question(panel)).toHaveValue('Who am I?');
  await expect(panel.getByRole('button', { name: 'Ask' })).toBeEnabled();
  // 006 FR-023: the hidden status adds nothing to the page; only the transcript and the strip scroll.
  expect(
    await panel.evaluate(() => {
      const el = document.scrollingElement!;
      return { overflow: el.scrollHeight - el.clientHeight, scrollTop: el.scrollTop };
    }),
  ).toEqual({ overflow: 0, scrollTop: 0 });

  // Resending is one press, and the failed turn stays in the conversation.
  await panel.evaluate(() => chrome.storage.local.set({ e2eScenario: 'complete' }));
  await panel.getByRole('button', { name: 'Ask' }).click();
  const turns = panel
    .getByRole('region', { name: 'Questions and answers' })
    .getByRole('article', { name: 'Who am I?' });
  await expect(turns).toHaveCount(2);
  await expect(turns.last()).toContainText('Jane will send the new deck by Friday');
  await expect(turns.first()).toContainText('No answer came back. Ask again.');

  // The failed turn was stored as failed: it reads the same after the panel is reopened.
  await panel.close();
  const again = await openPanel(context, extensionId);
  await expect(answer(again, 'Who am I?').first()).toContainText('No answer came back. Ask again.');
});
