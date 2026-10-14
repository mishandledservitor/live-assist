// US1 independent test (T060, T106), with US5's consent steps (T086): Start → consent → lines from the one mixed stream,
// every one labelled "Others" → close and reopen the panel → Stop keeps the transcript → Delete removes it. Built in e2e
// mode: the mixed source reads Chrome's fake audio device as both tab and mic, and the one transcription session
// replays a recorded ElevenLabs session (mixed-happy-path). No network.
import { expect, test } from './fixtures';
import { LINE_TIMEOUT, line, openMeetingTab, openPanel, seedSettings, statusDot } from './helpers';

test('transcribes the mixed stream live, survives a panel reopen, keeps the transcript on Stop, and deletes it', async ({
  context,
  extensionId,
}) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  let panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel, { consentReminder: true });

  // Consent reminder (US5, T086): Cancel captures nothing; acknowledging starts.
  await panel.getByRole('button', { name: 'Start' }).click();
  const consent = panel.getByRole('alertdialog', { name: 'Consent reminder' });
  await expect(consent).toBeVisible();
  await consent.getByRole('button', { name: 'Cancel' }).click();
  await expect(consent).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Stop' })).toHaveCount(0);
  await expect(statusDot(panel, 'Capture')).toHaveAttribute('title', 'Capture: Not capturing');

  await panel.getByRole('button', { name: 'Start' }).click();
  await consent.getByRole('button', { name: "I've told them — start" }).click();
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  // One transcription stream (constitution v1.1.0): a single status dot, no per-source dots.
  await expect(statusDot(panel, 'Transcription')).toHaveCount(1);
  await expect(panel.getByRole('region', { name: 'Status' }).locator('.status-dot')).toHaveCount(4);

  const others = line(panel, 'Hello everyone.');
  await expect(others).toBeVisible({ timeout: LINE_TIMEOUT });
  await expect(others).toContainText('Others');
  await expect(others).toContainText('speaker not identified');
  await expect(others).toContainText('00:02');

  // The user's own speech is in the mix too, and in 001 it is also the "Others" fallback (FR-010).
  const mine = line(panel, 'This is me speaking.');
  await expect(mine).toBeVisible({ timeout: LINE_TIMEOUT });
  await expect(mine).toContainText('Others');
  await expect(mine).toContainText('speaker not identified');
  await expect(mine).not.toContainText('Alex');

  // Close the panel; transcription carries on in the offscreen document (FR-018).
  await panel.close();
  panel = await openPanel(context, extensionId, meetingTab);
  await expect(line(panel, 'Καλημέρα σε όλους.')).toBeVisible({ timeout: LINE_TIMEOUT });
  await expect(line(panel, 'Hello everyone.')).toBeVisible();
  await expect(line(panel, 'This is me speaking.')).toBeVisible();

  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(line(panel, 'Hello everyone.')).toBeVisible();
  await expect(line(panel, 'This is me speaking.')).toBeVisible();

  await panel.getByRole('button', { name: 'Delete transcript' }).click();
  await panel.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(line(panel, 'Hello everyone.')).toHaveCount(0);
  await panel.reload();
  await expect(panel.getByRole('region', { name: 'Transcript', exact: true })).toContainText('No transcript yet');
});
