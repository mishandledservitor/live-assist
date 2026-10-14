// T092 accessibility pass on the side panel: axe (WCAG 2.1 A/AA) on every screen state, keyboard focus order,
// the consent reminder handled from the keyboard, and status and new lines announced through live regions.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  LINE_TIMEOUT,
  emulateMeetCaptionsButton,
  line,
  openMeetingTab,
  openMeetPage,
  openPanel,
  seedAskMeeting,
  seedSettings,
  speakInMeet,
  statusDot,
} from './helpers';

async function expectNoAxeViolations(panel: Page, state: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page: panel })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary, `axe violations on ${state}`).toEqual([]);
}

/** 006 SC-006: the same check in the light and the dark colour scheme. */
async function expectNoAxeViolationsInBothModes(panel: Page, state: string): Promise<void> {
  for (const colorScheme of ['light', 'dark'] as const) {
    await panel.emulateMedia({ colorScheme });
    await expectNoAxeViolations(panel, `${state} (${colorScheme})`);
  }
  await panel.emulateMedia({ colorScheme: null });
}

/** Accessible names of the elements reached by pressing Tab from the top of the page. */
async function tabOrder(panel: Page, steps: number): Promise<string[]> {
  await panel.locator('body').focus();
  const names: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    await panel.keyboard.press('Tab');
    names.push(
      await panel.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return '';
        const label =
          el.getAttribute('aria-label') ??
          (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null);
        return (label ?? el.closest('label')?.textContent ?? el.textContent ?? '').trim();
      }),
    );
  }
  return names;
}

test('first-run setup has no axe violations', async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  await expect(panel.getByRole('region', { name: 'Set up live-assist' })).toBeVisible();
  await expectNoAxeViolationsInBothModes(panel, 'setup');
});

test('the panel is accessible idle, with the consent reminder and while transcribing', async ({
  context,
  extensionId,
}) => {
  const meetingTab = await openMeetingTab(context, extensionId);
  const panel = await openPanel(context, extensionId, meetingTab);
  await seedSettings(panel, { consentReminder: true });
  // The account request is blocked in e2e, so the badge settles on its failure.
  await expect(panel.getByRole('button', { name: 'Could not reach ElevenLabs to check your plan.' })).toBeVisible();
  await expectNoAxeViolationsInBothModes(panel, 'idle panel');

  // Focus order follows the header (006, 008, 012): Start, language, the next meeting's notes, credits badge,
  // Transcripts, Settings.
  const order = await tabOrder(panel, 6);
  expect(order[0]).toBe('Start');
  expect(order[1]).toMatch(/^Language/);
  expect(order[2]).toBe('Add notes for the next meeting');
  expect(order[3]).toBe('Could not reach ElevenLabs to check your plan.');
  expect(order[4]).toBe('Transcripts');
  expect(order[5]).toBe('Settings');

  // The Settings screen, in both modes; Escape goes back to the gear.
  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(panel.getByRole('heading', { level: 2, name: 'Settings' })).toBeFocused();
  await expectNoAxeViolationsInBothModes(panel, 'settings screen');
  await panel.keyboard.press('Escape');
  await expect(panel.getByRole('button', { name: 'Settings' })).toBeFocused();

  // Status changes are announced politely; the transcript is a log, so finished lines are announced as they arrive.
  await expect(panel.getByRole('region', { name: 'Status' }).locator('[aria-live="polite"]')).toHaveCount(1);
  await expect(panel.getByRole('log', { name: 'Transcript lines' })).toBeVisible();

  // Consent reminder from the keyboard: focus lands on it, Escape cancels and returns focus to Start.
  await panel.getByRole('button', { name: 'Start' }).focus();
  await panel.keyboard.press('Enter');
  const consent = panel.getByRole('alertdialog', { name: 'Consent reminder' });
  await expect(consent.getByRole('button', { name: "I've told them — start" })).toBeFocused();
  await expectNoAxeViolationsInBothModes(panel, 'consent reminder');
  await panel.keyboard.press('Escape');
  await expect(consent).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Start' })).toBeFocused();

  // Enter on Start, Enter on the acknowledgement: started without the mouse. The reminder takes the focus when it
  // is drawn.
  await panel.keyboard.press('Enter');
  await expect(consent.getByRole('button', { name: "I've told them — start" })).toBeFocused();
  await panel.keyboard.press('Enter');
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
  // A meeting on a site other than Meet: the status line is expanded with the speaker-names reason.
  await expect(panel.locator('.status-problem')).not.toHaveCount(0);
  await expectNoAxeViolationsInBothModes(panel, 'transcribing, status expanded');

  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
  await panel.getByRole('button', { name: 'Delete transcript' }).click();
  await expect(panel.getByRole('button', { name: 'Delete permanently' })).toBeFocused();
  await expectNoAxeViolationsInBothModes(panel, 'delete confirmation');
});

// T072 (002): names in the transcript, the label editor open, and Settings → Remembered names.
test('speaker names, the label editor and remembered names have no axe violations', async ({
  context,
  extensionId,
}) => {
  test.setTimeout(90_000);
  await emulateMeetCaptionsButton(context);
  const meet = await openMeetPage(context, extensionId, 'real-dom-captions-off');
  const panel = await openPanel(context, extensionId, meet.tabId);
  await seedSettings(panel, { scenario: 'names' });

  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On', { timeout: 15_000 });
  await speakInMeet(meet.page, 'Emma Jones', 7000);
  const emma = line(panel, 'Emma speaks first.').locator('[data-label-source]');
  await expect(emma).toContainText('Emma Jones', { timeout: 30_000 });
  await expectNoAxeViolations(panel, 'transcript with names');

  await emma.click();
  const editor = panel.getByRole('dialog', { name: 'Edit speaker name' });
  await expect(editor).toBeVisible();
  await expectNoAxeViolations(panel, 'label editor');

  await editor.getByRole('combobox', { name: 'Speaker name' }).fill('Emma');
  await editor.getByRole('button', { name: /Rename .Emma Jones. everywhere/ }).click();
  await expect(emma).toContainText('Emma');
  const remembered = panel.getByRole('list', { name: 'Remembered names' });
  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(remembered.getByLabel('Name shown for Emma Jones')).toHaveValue('Emma');
  await expectNoAxeViolations(panel, 'remembered names');
  await panel.getByRole('button', { name: 'Back' }).click();
  await panel.getByRole('button', { name: 'Stop' }).click();
});

// 003 T077: the main view with a conversation (streaming and finished) and Settings with the Questions section.
test('Ask: the conversation strip and the Questions settings have no axe violations', async ({
  context,
  extensionId,
}) => {
  test.setTimeout(60_000);
  const panel = await openPanel(context, extensionId);
  await seedAskMeeting(panel, 800);
  const box = panel.getByRole('textbox', { name: 'Question' });
  await box.fill('What was decided about pricing?');
  await box.press('Enter');
  const reply = panel
    .getByRole('region', { name: 'Questions and answers' })
    .getByRole('article', { name: 'What was decided about pricing?' });
  await expect(reply).toHaveAttribute('aria-busy', 'true');
  await expect(reply).toContainText('Pricing');
  await expectNoAxeViolationsInBothModes(panel, 'answer streaming');

  await expect(reply).not.toHaveAttribute('aria-busy', 'true', { timeout: 30_000 });
  await expect(reply).toContainText('Claude Sonnet 5.5');
  await expectNoAxeViolationsInBothModes(panel, 'answer finished');

  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(panel.getByRole('heading', { name: 'Questions' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'What Anthropic keeps' })).toBeVisible();
  await expectNoAxeViolationsInBothModes(panel, 'settings with Questions');
});

// 003 T108 (FR-003a, design decision 80): the waiting mark, in both colour schemes.
test('Ask: a turn waiting for its answer has no axe violations', async ({ context, extensionId }) => {
  test.setTimeout(60_000);
  const panel = await openPanel(context, extensionId);
  await seedAskMeeting(panel, 0);
  await panel.evaluate(() => chrome.storage.local.set({ e2eScenario: 'silent' }));
  const box = panel.getByRole('textbox', { name: 'Question' });
  await box.fill('Who am I?');
  await box.press('Enter');
  await expect(panel.getByRole('img', { name: 'Waiting for the answer' })).toBeVisible();
  await expectNoAxeViolationsInBothModes(panel, 'waiting for the answer');
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByRole('img', { name: 'Waiting for the answer' })).toHaveCount(0);
});

test('Notes: the menu, the paste dialog and the chips have no axe violations (008)', async ({
  context,
  extensionId,
}) => {
  test.setTimeout(60_000);
  const panel = await openPanel(context, extensionId);
  await seedAskMeeting(panel, 0);
  await expect(panel.getByRole('button', { name: 'Add notes for the next meeting' })).toBeVisible();

  await panel.getByRole('button', { name: 'Add notes', exact: true }).click();
  await expect(panel.getByRole('menu')).toBeVisible();
  await expectNoAxeViolationsInBothModes(panel, 'notes menu open');

  await panel.getByRole('menuitem', { name: 'Paste text' }).click();
  const dialog = panel.getByRole('dialog', { name: 'Notes' });
  await dialog.getByRole('textbox', { name: 'Notes' }).fill('Agenda: pricing, launch date.');
  await expectNoAxeViolationsInBothModes(panel, 'paste dialog open');
  await dialog.getByRole('button', { name: 'Save notes' }).click();
  await expect(panel.getByRole('button', { name: 'Notes: Pasted notes' })).toBeVisible();

  await panel.getByRole('button', { name: 'Add notes for the next meeting' }).click();
  await panel.getByRole('menuitem', { name: 'Paste text' }).click();
  await dialog.getByRole('textbox', { name: 'Notes' }).fill('Next time: hiring.');
  await dialog.getByRole('button', { name: 'Save notes' }).click();
  await expect(panel.getByRole('button', { name: 'Notes for the next meeting: Pasted notes' })).toBeVisible();
  await expectNoAxeViolationsInBothModes(panel, 'notes chips beside Start and in the Ask area');
});
