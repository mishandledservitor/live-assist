// US3 independent test (T077): the fixture provider is scripted (e2e builds only, see seedSettings) to drop
// the (one) session mid-utterance, to hit the session time limit, and to reject the key. Drops and limits reconnect by
// themselves and the transcript continues without duplicates; an auth error stops the meeting with a plain reason.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { LINE_TIMEOUT, line, openMeetingTab, openPanel, seedSettings, statusDot, statusProblems } from './helpers';

/** Records every transcription status the panel shows from now on; the reconnecting state can be brief. */
async function recordTranscriptionStates(panel: Page): Promise<() => Promise<string[]>> {
  await panel.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    const note = () => {
      const title = document.querySelector('.status-dot[title^="Transcription: "]')?.getAttribute('title');
      if (title && seen.at(-1) !== title) seen.push(title);
    };
    new MutationObserver(note).observe(document.body, { subtree: true, attributes: true, childList: true });
    note();
  });
  return () => panel.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
}

test('a dropped session reconnects by itself and the transcript continues', async ({ context, extensionId }) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel, { scenario: 'drop' });
  const seen = await recordTranscriptionStates(panel);
  await panel.getByRole('button', { name: 'Start' }).click();

  await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
  // Reconnecting, then transcribing again (006: no reconnect counter, D2).
  await expect(statusDot(panel, 'Transcription')).toHaveAttribute('title', 'Transcription: Transcribing');
  const states = await seen();
  const reconnect = states.indexOf('Transcription: Reconnecting… — Connection to ElevenLabs lost');
  expect(reconnect).toBeGreaterThanOrEqual(0);
  expect(states.slice(reconnect)).toContain('Transcription: Transcribing');
  await expect(line(panel, 'Καλημέρα σε όλους.')).toBeVisible({ timeout: LINE_TIMEOUT });
  await expect(line(panel, 'Hello everyone.')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Stop' }).click();
});

test('the session time limit starts a new session without losing or repeating a line', async ({
  context,
  extensionId,
}) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel, { scenario: 'time-limit' });
  await panel.getByRole('button', { name: 'Start' }).click();

  // "Hello everyone." comes from the replacement session: the limit was crossed without the user doing anything. The
  // reconnect is immediate and has no reason to show (006 D5), so the panel may never paint it.
  await expect(line(panel, 'Last line before the limit.')).toBeVisible({ timeout: LINE_TIMEOUT });
  await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
  await expect(statusDot(panel, 'Transcription')).toHaveAttribute('title', 'Transcription: Transcribing');
  await expect(statusProblems(panel).filter({ hasText: 'Transcription' })).toHaveCount(0);
  await expect(line(panel, 'Last line before the limit.')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Stop' }).click();
});

test('an auth error stops the meeting and says why, keeping the transcript', async ({ context, extensionId }) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel, { scenario: 'auth-error' });
  await panel.getByRole('button', { name: 'Start' }).click();

  await expect(statusDot(panel, 'Transcription')).toHaveAttribute(
    'title',
    'Transcription: Stopped working — ElevenLabs rejected the API key — check or replace it in Settings, then press Start again.',
    { timeout: LINE_TIMEOUT },
  );
  await expect(statusProblems(panel).filter({ hasText: 'Stopped working' })).toContainText(
    'ElevenLabs rejected the API key',
  );
  await expect(statusDot(panel, 'Capture')).toHaveAttribute('title', /^Capture: Failed/);
  // The meeting is over: Start is offered again.
  await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: LINE_TIMEOUT });
});
