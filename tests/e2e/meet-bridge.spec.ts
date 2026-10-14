// 002 T005 bridge proof (research R3): the Meet content script's `platform:meet` port reaches the offscreen document.
// The Meet call URL is routed to a saved snapshot, so no real Meet page or network is involved.
import { expect, test } from './fixtures';
import { openMeetTab, openPanel, seedSettings } from './helpers';

interface BridgeStats {
  ports: number;
  hellos: { meetingId: string; inCall: boolean }[];
}

test('the offscreen document receives the Meet page port and its hello after Start', async ({
  context,
  extensionId,
}) => {
  const meetingTab = await openMeetTab(context, extensionId, 'in-call-captions-off');
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel);

  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();

  const stats = () =>
    panel.evaluate(() => chrome.runtime.sendMessage<unknown, BridgeStats>({ type: 'e2e/meet-bridge-stats' }));
  await expect.poll(async () => (await stats())?.ports, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await stats())?.hellos.map((h) => h.inCall)).toEqual([true]);
  expect((await stats()).hellos[0]?.meetingId).toMatch(/^[0-9a-f-]{36}$/);

  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
});
