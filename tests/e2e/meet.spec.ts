// 002 end to end on a routed fixture Meet page (no real Meet, no network): the real content script, bridge, offscreen
// runtime and panel. The page plays Meet's part: the captions button flips when clicked, and caption turns appear.
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import {
  emulateMeetCaptionsButton,
  line,
  meetSnapshotPath,
  openMeetPage,
  openPanel,
  seedSettings,
  speakInMeet,
  statusDot,
  statusProblems,
} from './helpers';

const NAMES_TIMEOUT = 30_000;

const captionsButton = (meet: Page) => meet.locator('button[jsname="r8qRAd"]');
const label = (panel: Page, text: string) => line(panel, text).locator('[data-label-source]');

test.describe('Meet speaker names (US1)', () => {
  test.setTimeout(90_000);

  test('captions are turned on and hidden, lines are named, and Stop restores captions', async ({
    context,
    extensionId,
  }) => {
    await emulateMeetCaptionsButton(context);
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-off');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();

    // Captions on, and their band invisible to the user (but still rendered so Meet keeps updating it).
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    const hidden = meet.page.locator('[data-live-assist-hidden]');
    await expect(hidden).toHaveCount(1);
    await expect(hidden).toHaveCSS('opacity', '0');
    await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On');

    // The fixture session says "Emma speaks first." at 1.5–3.5 s and "This is me speaking." at 11.5–13.5 s.
    await speakInMeet(meet.page, 'Emma Jones', 7000);
    await speakInMeet(meet.page, 'You', 10_000);

    await expect(label(panel, 'Emma speaks first.')).toHaveAttribute('data-label-source', 'caption', {
      timeout: NAMES_TIMEOUT,
    });
    await expect(label(panel, 'Emma speaks first.')).toContainText('Emma Jones');
    await expect(label(panel, 'This is me speaking.')).toHaveAttribute('data-label-source', 'caption', {
      timeout: NAMES_TIMEOUT,
    });
    // The user's own lines carry the settings name, not Meet's "You".
    await expect(label(panel, 'This is me speaking.')).toContainText('Alex');

    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
    await expect(meet.page.locator('[data-live-assist-hidden]')).toHaveCount(0);
    await expect(meet.page.locator('#live-assist-captions-hide')).toHaveCount(0);
  });
});

// T140 (FR-028–FR-030, SC-007, design decision 61): Settings → Show Meet captions.
test.describe('Show Meet captions (US5)', () => {
  test.setTimeout(90_000);

  const hidden = (meet: Page) => meet.locator('[data-live-assist-hidden]');
  const captions = (meet: Page) => meet.getByRole('region', { name: 'Captions', exact: true });
  /** Counts clicks on Meet's captions button from now on. */
  const countCaptionClicks = (meet: Page) =>
    meet.evaluate(() => {
      const w = window as unknown as { captionClicks: number };
      w.captionClicks = 0;
      document.querySelector('button[jsname="r8qRAd"]')!.addEventListener('click', () => (w.captionClicks += 1));
    });
  const captionClicks = (meet: Page) =>
    meet.evaluate(() => (window as unknown as { captionClicks: number }).captionClicks);

  test('with the setting on, captions are turned on and stay visible, lines are named, and Stop turns them off', async ({
    context,
    extensionId,
  }) => {
    await emulateMeetCaptionsButton(context);
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-off');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names', showMeetCaptions: true });

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On');
    await expect(hidden(meet.page)).toHaveCount(0);
    await expect(meet.page.locator('#live-assist-captions-hide')).toHaveCount(0);
    await expect(captions(meet.page)).toHaveCSS('opacity', '1');

    await speakInMeet(meet.page, 'Emma Jones', 7000);
    await speakInMeet(meet.page, 'You', 10_000);
    await expect(label(panel, 'Emma speaks first.')).toContainText('Emma Jones', { timeout: NAMES_TIMEOUT });
    await expect(label(panel, 'This is me speaking.')).toContainText('Alex', { timeout: NAMES_TIMEOUT });
    await expect(hidden(meet.page)).toHaveCount(0); // still visible after many checks of the page

    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
    await expect(hidden(meet.page)).toHaveCount(0);
  });

  test('switching the setting during a meeting shows and hides the captions at once; names keep arriving', async ({
    context,
    extensionId,
  }) => {
    await emulateMeetCaptionsButton(context);
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-off');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });
    await countCaptionClicks(meet.page);

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect(hidden(meet.page)).toHaveCount(1);
    await expect(captions(meet.page)).toHaveCSS('opacity', '0');

    // Emma is being captioned while the user switches the setting three times.
    const emma = speakInMeet(meet.page, 'Emma Jones', 7000);
    await panel.getByRole('button', { name: 'Settings' }).click();
    const box = panel.getByRole('checkbox', { name: 'Show Meet captions' });
    await expect(box).not.toBeChecked();

    await box.check();
    await expect(hidden(meet.page)).toHaveCount(0, { timeout: 1000 });
    await expect(captions(meet.page)).toHaveCSS('opacity', '1');
    await expect(meet.page.locator('#live-assist-captions-hide')).toHaveCount(0);

    await box.uncheck();
    await expect(hidden(meet.page)).toHaveCount(1, { timeout: 1000 });
    await expect(hidden(meet.page)).toHaveAttribute('aria-label', 'Captions');
    await expect(captions(meet.page)).toHaveCSS('opacity', '0');

    await box.check();
    await expect(hidden(meet.page)).toHaveCount(0, { timeout: 1000 });
    await panel.getByRole('button', { name: 'Back' }).click();
    await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On');
    await expect(statusProblems(panel)).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible(); // the same meeting, never restarted

    await emma;
    await speakInMeet(meet.page, 'You', 10_000);
    await expect(label(panel, 'Emma speaks first.')).toContainText('Emma Jones', { timeout: NAMES_TIMEOUT });
    await expect(label(panel, 'This is me speaking.')).toContainText('Alex', { timeout: NAMES_TIMEOUT });
    // Only Start clicked Meet's captions button; the switches did not.
    expect(await captionClicks(meet.page)).toBe(1);
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-pressed', 'true');

    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
    await expect(hidden(meet.page)).toHaveCount(0);
    expect(await captionClicks(meet.page)).toBe(2);
  });
});

test.describe('Real Meet DOM (research R13, T088)', () => {
  test.setTimeout(90_000);

  test('names arrive from the captions region, and only that region is hidden — never the notifications area', async ({
    context,
    extensionId,
  }) => {
    await emulateMeetCaptionsButton(context);
    const meet = await openMeetPage(context, extensionId, 'real-dom-captions-off');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-label', /^Turn off captions/, { timeout: 10_000 });
    const notifications = meet.page.getByRole('region', { name: 'Call feature notifications and actions' });
    const hidden = meet.page.locator('[data-live-assist-hidden]');
    await expect(hidden).toHaveCount(1);
    await expect(hidden).toHaveAttribute('aria-label', 'Captions');
    await expect(notifications).toHaveCSS('opacity', '1');
    await expect(meet.page.getByRole('button', { name: 'Admit John Doe' })).toBeVisible();

    await speakInMeet(meet.page, 'Emma Jones', 7000);
    await speakInMeet(meet.page, 'You', 10_000);
    await expect(label(panel, 'Emma speaks first.')).toContainText('Emma Jones', { timeout: NAMES_TIMEOUT });
    await expect(label(panel, 'This is me speaking.')).toContainText('Alex', { timeout: NAMES_TIMEOUT });

    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-label', /^Turn on captions/, { timeout: 10_000 });
    await expect(hidden).toHaveCount(0);
  });

  // T104 (FR-024, design decision 36).
  test('leaving the call stops the meeting by itself; the transcript stays and the status says why', async ({
    context,
    extensionId,
  }) => {
    await emulateMeetCaptionsButton(context);
    const meet = await openMeetPage(context, extensionId, 'real-dom-captions-off');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-label', /^Turn off captions/, { timeout: 10_000 });
    await expect(line(panel, 'Emma speaks first.')).toBeVisible({ timeout: NAMES_TIMEOUT });

    // Meet after "Leave call": the controls are gone, the same URL stays.
    await meet.page.evaluate(() => {
      document.body.innerHTML = '<div role="main"><h1>You left the meeting</h1><button>Rejoin</button></div>';
    });
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('Stopped — the call ended', { exact: true })).toBeVisible();
    await expect(line(panel, 'Emma speaks first.')).toBeVisible();
  });
});

test.describe('Meet speaker names unavailable (US2)', () => {
  test.setTimeout(90_000);

  const labels = (panel: Page) =>
    panel.getByRole('region', { name: 'Transcript', exact: true }).getByRole('listitem').locator('[data-label-source]');

  test("a changed Meet page: says why, and every line is Others, the user's included", async ({
    context,
    extensionId,
  }) => {
    const meet = await openMeetPage(context, extensionId, 'changed-page');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel);

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(statusProblems(panel).filter({ hasText: 'Speaker names' })).toHaveText(
      "Speaker names Unavailable — Couldn't turn on Meet captions",
      { timeout: 10_000 },
    );
    // The mixed fixture session has three lines, one of them the user's own ("This is me speaking.").
    await expect(labels(panel)).toHaveCount(3, { timeout: NAMES_TIMEOUT });
    for (const l of await labels(panel).all()) await expect(l).toHaveAttribute('data-label-source', 'fallback');
    await expect(label(panel, 'This is me speaking.')).toContainText('Others');
    await panel.getByRole('button', { name: 'Stop' }).click();
  });

  test('the lobby: says to join, then names start once the call does', async ({ context, extensionId }) => {
    await emulateMeetCaptionsButton(context);
    const meet = await openMeetPage(context, extensionId, 'lobby');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(statusDot(panel, 'Speaker names')).toHaveAttribute(
      'title',
      'Speaker names: Join the call to get speaker names',
      { timeout: 10_000 },
    );

    // Joining: Meet swaps the pre-join screen for the call.
    const inCall = readFileSync(meetSnapshotPath('in-call-captions-off'), 'utf8');
    const body = /<body>([\s\S]*)<\/body>/.exec(inCall)?.[1] ?? '';
    await meet.page.evaluate((html) => (document.body.innerHTML = html), body);
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On');

    await speakInMeet(meet.page, 'Emma Jones', 6000);
    await expect(label(panel, 'Emma speaks first.')).toContainText('Emma Jones', { timeout: NAMES_TIMEOUT });
    await panel.getByRole('button', { name: 'Stop' }).click();
  });

  test('reloading the Meet page mid-meeting: "reconnecting", then names resume by themselves', async ({
    context,
    extensionId,
  }) => {
    await emulateMeetCaptionsButton(context);
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-off');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

    // The reloaded page commits at once (the old page and its port are gone) but a slow blocking script holds its
    // parsing, and so the content script, for 3 s: the gap is visible.
    const html = readFileSync(meetSnapshotPath('in-call-captions-off'), 'utf8').replace(
      '<head>',
      '<head><script src="/__slow.js"></script>',
    );
    await context.route('https://meet.google.com/**', async (route) => {
      if (route.request().url().endsWith('/__slow.js')) {
        await new Promise((r) => setTimeout(r, 3000));
        await route.fulfill({ body: '', contentType: 'text/javascript' });
      } else await route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
    });
    void meet.page.reload();
    await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', /The Meet page reloaded — reconnecting/, {
      timeout: 5000,
    });

    // The new page attaches itself (meet/ready), captions come back on, and new lines are named.
    await expect(captionsButton(meet.page)).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On');
    await speakInMeet(meet.page, 'You', 12_000);
    await expect(label(panel, 'This is me speaking.')).toContainText('Alex', { timeout: NAMES_TIMEOUT });
    await panel.getByRole('button', { name: 'Stop' }).click();
  });
});

test.describe('Mic not sent while muted in Meet (US3)', () => {
  test.setTimeout(90_000);

  /** Meet's mute button flips; returns the page's clock at the flip. */
  const setMeetMuted = (meet: Page, muted: boolean) =>
    meet.evaluate((m) => {
      const button = document.querySelector('button[data-mute-button]')!;
      button.setAttribute('data-is-muted', String(m));
      const icon = button.querySelector('.google-symbols');
      if (icon) icon.textContent = m ? 'mic_off' : 'mic';
      return Date.now();
    }, muted);

  test('the panel follows Meet mute and the mic input leaving the gate is silent while muted', async ({
    context,
    extensionId,
  }) => {
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-off');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel);
    const mic = statusDot(panel, 'Microphone');

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(mic).toHaveAttribute('title', 'Microphone: Live', { timeout: 10_000 });
    // The fake mic keeps speaking (300 ms on, 200 ms off) throughout.
    await panel.waitForTimeout(2000);

    const mutedAt = await setMeetMuted(meet.page, true);
    await expect(mic).toHaveAttribute('title', 'Microphone: Muted in Meet — not sent', { timeout: 2000 });
    await panel.waitForTimeout(3000);
    const unmutedAt = await setMeetMuted(meet.page, false);
    await expect(mic).toHaveAttribute('title', 'Microphone: Live', { timeout: 2000 });
    await panel.waitForTimeout(2000);

    const tap = await panel.evaluate(() =>
      chrome.runtime.sendMessage<unknown, { atMs: number; peak: number }[]>({ type: 'e2e/mic-tap' }),
    );
    const during = tap.filter((f) => f.atMs + 100 > mutedAt - 150 && f.atMs < unmutedAt);
    const before = tap.filter((f) => f.atMs + 100 <= mutedAt - 150);
    const after = tap.filter((f) => f.atMs >= unmutedAt);
    expect(during.length).toBeGreaterThan(25);
    expect(during.every((f) => f.peak === 0)).toBe(true);
    expect(before.some((f) => f.peak > 0)).toBe(true);
    expect(after.some((f) => f.peak > 0)).toBe(true);
    await panel.getByRole('button', { name: 'Stop' }).click();
  });
});

test.describe('Fix a wrong or missing name (US4)', () => {
  test.setTimeout(180_000);

  const editor = (panel: Page) => panel.getByRole('dialog', { name: 'Edit speaker name' });

  /** One meeting on the fixture page: Emma Jones speaks, then the user. Resolves once Emma's line is named. */
  async function meetingWithEmma(panel: Page, meet: Page) {
    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(captionsButton(meet)).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await speakInMeet(meet, 'Emma Jones', 7000);
    await speakInMeet(meet, 'You', 10_000);
    await expect(label(panel, 'Emma speaks first.')).toHaveAttribute('data-label-source', 'caption', {
      timeout: NAMES_TIMEOUT,
    });
  }

  async function stop(panel: Page) {
    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
    // No wait for captions to be off: the next Start may come before Meet shows the restore click (T081).
  }

  test('rename everywhere, override one line, kept across a panel reload, remembered for the next meeting until forgotten', async ({
    context,
    extensionId,
  }) => {
    await emulateMeetCaptionsButton(context);
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-off');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });

    await meetingWithEmma(panel, meet.page);
    await expect(label(panel, 'Emma speaks first.')).toContainText('Emma Jones');

    // Rename everywhere.
    await label(panel, 'Emma speaks first.').click();
    await editor(panel).getByRole('combobox', { name: 'Speaker name' }).fill('Emma');
    await editor(panel)
      .getByRole('button', { name: /Rename .Emma Jones. everywhere/ })
      .click();
    await expect(label(panel, 'Emma speaks first.')).toHaveText(/^Emma \(confirmed\)$/);

    // Just this line.
    await expect(label(panel, 'This is me speaking.')).toContainText('Alex', { timeout: NAMES_TIMEOUT });
    await label(panel, 'This is me speaking.').click();
    await editor(panel).getByRole('combobox', { name: 'Speaker name' }).fill('Bob');
    await editor(panel).getByRole('button', { name: 'Just this line' }).click();
    await expect(label(panel, 'This is me speaking.')).toContainText('Bob');
    await expect(label(panel, 'This is me speaking.')).toHaveAttribute('data-label-source', 'manual');

    // Both survive a panel reload (the meeting's record holds them).
    await panel.reload();
    await expect(label(panel, 'Emma speaks first.')).toHaveText(/^Emma \(confirmed\)$/);
    await expect(label(panel, 'This is me speaking.')).toContainText('Bob');
    await stop(panel);

    // The rename was remembered: the next meeting names Emma Jones "Emma" from the start.
    const remembered = panel.getByRole('list', { name: 'Remembered names' });
    await panel.getByRole('button', { name: 'Settings' }).click();
    await expect(remembered.getByLabel('Name shown for Emma Jones')).toHaveValue('Emma');
    await panel.getByRole('button', { name: 'Back' }).click();
    await meetingWithEmma(panel, meet.page);
    await expect(label(panel, 'Emma speaks first.')).toHaveText(/^Emma \(confirmed\)$/);
    await stop(panel);

    // Forgotten: the meeting after that shows Meet's name again.
    await panel.getByRole('button', { name: 'Settings' }).click();
    await remembered.getByRole('button', { name: 'Forget Emma Jones' }).click();
    await expect(remembered).toHaveCount(0); // 018 decision 108: none left, no section
    await panel.getByRole('button', { name: 'Back' }).click();
    await meetingWithEmma(panel, meet.page);
    await expect(label(panel, 'Emma speaks first.')).toContainText('Emma Jones');
    await stop(panel);
  });
});
