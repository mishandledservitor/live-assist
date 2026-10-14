// 013 T013 (US2; FR-001–FR-004, FR-008–FR-010, SC-004): on a routed saved Meet page the real content script, bridge,
// offscreen runtime and repository keep Meet's caption turns as the meeting goes. The page plays Meet's part: caption
// turns appear and are rewritten. What was kept is read from IndexedDB; nothing of it shows in the panel or leaves the
// machine. Every name and sentence is invented. No network.
import type { Page } from '@playwright/test';
import { CAPTION_MARKER } from '../support/caption-marker-text';
import { captionInMeet, newestMeeting, readCaptionTurns, rewriteCaption, watchForMarker } from './captions-helpers';
import { expect, test } from './fixtures';
import { LINE_TIMEOUT, line, openMeetPage, openMeetingTab, openPanel, seedSettings, statusDot } from './helpers';

const KEPT_TIMEOUT = 15_000;
/** The three turns the saved page holds before Start: never kept (decision 73). */
const BEFORE_START = [
  'Kickoff is at ten tomorrow.',
  "I'll post the notes afterwards.",
  'Can we move the review to Thursday',
];

async function startOnMeet(panel: Page): Promise<string> {
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On', { timeout: 10_000 });
  const meeting = await newestMeeting(panel);
  if (!meeting) throw new Error('no meeting stored after Start');
  return meeting.id;
}

test.describe('Meet captions are kept (US2)', () => {
  test.setTimeout(90_000);

  test('every turn after Start is stored with its last text, none from before, and an interruption loses nothing older than a few seconds', async ({
    context,
    extensionId,
  }) => {
    const watch = await watchForMarker(context);
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-on');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });
    const meetingId = await startOnMeet(panel);

    // Three speakers, one of them the user. The first turn is rewritten four times.
    const first = await captionInMeet(meet.page, 'Emma Jones', [
      'The',
      'The harbour',
      'The harbour survey',
      'The harbour survey starts',
      `The harbour survey starts on Monday. ${CAPTION_MARKER}`,
    ]);
    const second = await captionInMeet(meet.page, 'You', ['I can', 'I can bring the tide tables.']);
    // Meet corrects the older turn after the newer one began.
    await rewriteCaption(meet.page, first.index, `The harbour survey starts on Tuesday. ${CAPTION_MARKER}`);
    const third = await captionInMeet(meet.page, 'Tom Brown', ['Tuesday', 'Tuesday suits the whole crew.']);

    const expected = [
      {
        seq: 1,
        speakerName: 'Emma Jones',
        self: false,
        text: `The harbour survey starts on Tuesday. ${CAPTION_MARKER}`,
      },
      { seq: 2, speakerName: 'You', self: true, text: 'I can bring the tide tables.' },
      { seq: 3, speakerName: 'Tom Brown', self: false, text: 'Tuesday suits the whole crew.' },
    ];
    const kept = async () =>
      (await readCaptionTurns(panel, meetingId)).map(({ seq, speakerName, self, text }) => ({
        seq,
        speakerName,
        self,
        text,
      }));
    await expect.poll(kept, { timeout: KEPT_TIMEOUT }).toEqual(expected);

    const meeting = await newestMeeting(panel);
    expect(meeting).toMatchObject({ id: meetingId, hasCaptions: true });
    const turns = await readCaptionTurns(panel, meetingId);
    const appeared = [first, second, third].map((t) => t.appearedAt - meeting!.startedAt);
    turns.forEach((turn, i) => {
      expect(Math.abs(turn.startMs - appeared[i]!)).toBeLessThan(2_000);
      expect(turn).toMatchObject({ meetingId, schemaVersion: 1 });
    });
    // None of what the page held before Start, however the meeting went on.
    const stored = JSON.stringify(turns);
    for (const sentence of BEFORE_START) expect(stored).not.toContain(sentence);

    // The panel never shows a caption sentence.
    const shown = await panel.locator('body').innerText();
    for (const { text } of expected) expect(shown).not.toContain(text);
    expect(shown).not.toContain(CAPTION_MARKER);

    // SC-004: the offscreen document goes away without Stop, four seconds after a change; the change is stored.
    await captionInMeet(meet.page, 'Tom Brown', ['And the', 'And the ferry leaves at nine.']);
    await meet.page.waitForTimeout(4_000);
    const [worker] = context.serviceWorkers();
    await worker!.evaluate(() => chrome.offscreen.closeDocument());
    expect((await kept()).at(-1)).toEqual({
      seq: 4,
      speakerName: 'Tom Brown',
      self: false,
      text: 'And the ferry leaves at nine.',
    });
    expect(watch.problems()).toEqual([]);
  });

  test('deleting the meeting deletes its caption turns', async ({ context, extensionId }) => {
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-on');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });
    const meetingId = await startOnMeet(panel);

    await captionInMeet(meet.page, 'Emma Jones', ['The lighthouse', 'The lighthouse keeper sends his regards.']);
    await expect.poll(async () => (await readCaptionTurns(panel, meetingId)).length, { timeout: KEPT_TIMEOUT }).toBe(1);

    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
    await panel.getByRole('button', { name: 'Delete transcript' }).click();
    await panel.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(panel.getByRole('button', { name: 'Delete permanently' })).toHaveCount(0);

    expect(await readCaptionTurns(panel, meetingId)).toEqual([]);
    expect(await newestMeeting(panel)).toBeNull();
  });
});

// Decision 79 (2026-10-13, superseding decision 71): the reminder before Start is one text on every tab and says
// nothing about captions. Decision 65: on a Meet call the captions are kept, with the reminder on or off.
test.describe('one reminder on every tab, and captions kept with it on or off (US2)', () => {
  test.setTimeout(90_000);

  const K1 =
    'Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs and the transcript is kept on this computer. You can turn this reminder off in Settings.';
  const reminder = (panel: Page) => panel.getByRole('alertdialog', { name: 'Consent reminder' });

  /** The meeting is running on the Meet page: one turn said now is kept. */
  async function keepsCaptions(meetPage: Page, panel: Page) {
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On', { timeout: 10_000 });
    const meeting = await newestMeeting(panel);
    await captionInMeet(meetPage, 'Tom Brown', ['The', 'The tide turns at four.']);
    await expect
      .poll(async () => (await readCaptionTurns(panel, meeting!.id)).map((t) => t.text), { timeout: KEPT_TIMEOUT })
      .toEqual(['The tide turns at four.']);
    expect(await newestMeeting(panel)).toMatchObject({ hasCaptions: true });
    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
  }

  test('on a Meet call with the reminder on: the same text as everywhere, and that Start keeps the captions', async ({
    context,
    extensionId,
  }) => {
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-on');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names', consentReminder: true });

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(reminder(panel).locator('p')).toHaveText(K1);
    await expect(reminder(panel)).not.toContainText(/caption/i);
    // Nothing runs, and nothing is kept, until the reminder is acknowledged.
    expect(await newestMeeting(panel)).toBeNull();
    await captionInMeet(meet.page, 'Emma Jones', ['Said before the reminder was acknowledged.']);

    await reminder(panel).getByRole('button', { name: "I've told them — start" }).click();
    await keepsCaptions(meet.page, panel);
  });

  test('on a Meet call with the reminder off: no reminder, and that Start keeps the captions', async ({
    context,
    extensionId,
  }) => {
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-on');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names', consentReminder: false });

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(reminder(panel)).toHaveCount(0);
    await keepsCaptions(meet.page, panel);
  });

  test('on any other tab the reminder is the same text and nothing is kept', async ({ context, extensionId }) => {
    const meetingTab = await openMeetingTab(context, extensionId);
    const panel = await openPanel(context, extensionId, meetingTab);
    await seedSettings(panel, { consentReminder: true });

    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(reminder(panel).locator('p')).toHaveText(K1);
    await reminder(panel).getByRole('button', { name: "I've told them — start" }).click();
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
    const meeting = await newestMeeting(panel);
    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();

    expect(await readCaptionTurns(panel, meeting!.id)).toEqual([]);
    const stored = await newestMeeting(panel);
    expect(stored).toMatchObject({ id: meeting!.id, source: { platform: 'generic' } });
    expect(stored).not.toHaveProperty('hasCaptions');
  });
});
