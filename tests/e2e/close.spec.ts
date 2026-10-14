// 014 Close transcript in the real extension (design decisions 91, 92): a meeting stopped with the panel open stays on
// the main view with `Close transcript`; closing clears the main view without deleting, and it stays clean across a
// reload; the next opening of the panel after a meeting stopped is clean by itself; a running meeting survives a
// reload; the next Start shows as always. Fixture transcription provider, no network.
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  emulateMeetCaptionsButton,
  LINE_TIMEOUT,
  line,
  openMeetingTab,
  openMeetPage,
  openPanel,
  seedAskMeeting,
  seedSettings,
} from './helpers';
import { readAllStores, rows, transcriptsButton, transcriptsScreen } from './transcripts-helpers';

const mainView = (panel: Page) => panel.locator('.main-view');
const onMain = (panel: Page, name: string) => mainView(panel).getByRole('button', { name, exact: true });

async function expectCleanMain(panel: Page): Promise<void> {
  await expect(mainView(panel).getByRole('log', { name: 'Transcript lines' })).toHaveText('No transcript yet.');
  for (const name of ['Download transcript', 'Close transcript', 'Delete transcript'])
    await expect(onMain(panel, name)).toHaveCount(0);
}

/** Starts a fixture meeting, waits for its first line, and stops it with the panel open. */
async function recordAndStop(panel: Page): Promise<void> {
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
}

test('Close clears the main view without deleting; it stays clean after a reload until the next Start', async ({
  context,
  extensionId,
}) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel);
  await recordAndStop(panel);

  // Stopped with the panel open: the transcript stays, with the three actions in order.
  await expect(line(panel, 'Hello everyone.')).toBeVisible();
  await expect(mainView(panel).locator('.transcript-actions button')).toHaveText([
    'Download transcript',
    'Close transcript',
    'Delete transcript',
  ]);
  const before = JSON.stringify(await readAllStores(panel));

  await onMain(panel, 'Close transcript').click();
  await expectCleanMain(panel);
  await expect(transcriptsButton(panel)).toBeFocused();
  // Nothing about the meeting changed.
  expect(JSON.stringify(await readAllStores(panel))).toBe(before);

  // It is on the Transcripts screen; Back is still clean.
  await transcriptsButton(panel).click();
  await expect(rows(panel)).toHaveCount(1);
  await rows(panel).nth(0).getByRole('button').first().click();
  await expect(transcriptsScreen(panel).getByText('Hello everyone.')).toBeVisible();
  await transcriptsScreen(panel).getByRole('button', { name: 'Back' }).click();
  await transcriptsScreen(panel).getByRole('button', { name: 'Back' }).click();
  await expectCleanMain(panel);

  // A reload (closing and opening the panel) keeps it clean.
  await panel.reload();
  await expect(transcriptsButton(panel)).toBeVisible();
  await expectCleanMain(panel);

  // The next Start shows on the main view while it runs and after it stops.
  await recordAndStop(panel);
  await expect(line(panel, 'Hello everyone.')).toBeVisible();
  await expect(onMain(panel, 'Close transcript')).toBeVisible();
});

test('the panel opens clean after a meeting stopped, and shows a running meeting live', async ({
  context,
  extensionId,
}) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  let panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel);

  // A running meeting survives closing and opening the panel.
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
  await panel.close();
  panel = await openPanel(context, extensionId, meetingTab);
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(line(panel, 'Hello everyone.')).toBeVisible();

  // Stopped while this panel stays open: still shown, no clear yet.
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(line(panel, 'Hello everyone.')).toBeVisible();
  expect(
    await panel.evaluate(async () => (await chrome.storage.local.get('mainViewClearedAt')).mainViewClearedAt),
  ).toBe(undefined);

  // Opened again seconds later: clean, and the meeting is on the Transcripts screen.
  await panel.close();
  panel = await openPanel(context, extensionId, meetingTab);
  await expect(transcriptsButton(panel)).toBeVisible();
  await expectCleanMain(panel);
  await transcriptsButton(panel).click();
  await expect(rows(panel)).toHaveCount(1);
});

// The seeding helper (`reloadShowingStored`) waits for the reloaded panel's opening clear before undoing it. On a slow
// machine (CI) that clear lands late; a 10x slower panel stands in for it.
test('a seeded meeting shows on the main view of a slow panel', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  const cdp = await context.newCDPSession(panel);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 10 });
  await seedAskMeeting(panel, 0);
  await expect(onMain(panel, 'Close transcript')).toBeAttached();
});

// 014 fix T040: leaving the Meet call ends the meeting by itself, and the offscreen document lingers for 30 s
// (OFFSCREEN_LINGER_MS) answering new panels with the stopped meeting. Close and the opening clear hold within it.
test.describe('after the meeting ended by itself (Meet call left)', () => {
  test.setTimeout(90_000);

  /** Starts on a fixture Meet page, waits for a line, then plays Meet after "Leave call". */
  async function recordAndLeave(context: BrowserContext, extensionId: string) {
    await emulateMeetCaptionsButton(context);
    const meet = await openMeetPage(context, extensionId, 'real-dom-captions-off');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });
    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(line(panel, 'Emma speaks first.')).toBeVisible({ timeout: 30_000 });
    await meet.page.evaluate(() => {
      document.body.innerHTML = '<div role="main"><h1>You left the meeting</h1><button>Rejoin</button></div>';
    });
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('Stopped — the call ended', { exact: true })).toBeVisible();
    return { meet, panel };
  }

  test('Close within the linger clears the main view and it stays clean', async ({ context, extensionId }) => {
    const { panel } = await recordAndLeave(context, extensionId);
    await expect(line(panel, 'Emma speaks first.')).toBeVisible();
    await onMain(panel, 'Close transcript').click();
    await expectCleanMain(panel);
    await panel.waitForTimeout(2_000);
    await expectCleanMain(panel);
  });

  test('the panel opened within the linger is clean', async ({ context, extensionId }) => {
    const { meet, panel } = await recordAndLeave(context, extensionId);
    await panel.close();
    const again = await openPanel(context, extensionId, meet.tabId);
    await expect(transcriptsButton(again)).toBeVisible();
    await expectCleanMain(again);
  });
});
