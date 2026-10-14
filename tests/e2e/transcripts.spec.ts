// 012 Past transcripts in the real extension: the Transcripts screen lists every stored meeting and shows one read-only
// (US1), deletes one for real (US2), a delete on the main view leaves it clean (US3, decision 64), every meeting
// downloads as 007's file (US4), and the screen stays accessible, fast, in one page height and off the network.
// Meetings are seeded into the panel's own IndexedDB; the running one comes from the fixture provider. No network.
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  longTranscript,
  spokenBy,
  spokenBySelf,
  storedMeeting,
  storedSegment,
  titled,
} from '../support/stored-meetings';
import { expect, test } from './fixtures';
import { LINE_TIMEOUT, line, openMeetingTab, openPanel } from './helpers';
import {
  fileName,
  openControl,
  readAllStores,
  row,
  rows,
  seedStoredMeetings,
  transcriptsButton,
  transcriptsScreen,
  when,
  type SeededMeeting,
} from './transcripts-helpers';

const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).getTime();
const MIN = 60_000;

const heading = (panel: Page, name: string) => panel.getByRole('heading', { level: 2, name, exact: true });
const back = (panel: Page) => transcriptsScreen(panel).getByRole('button', { name: 'Back' });
const listScroller = (panel: Page) => panel.locator('.transcripts-list');
const title = (startedAt: number) => `${when(startedAt).date}, ${when(startedAt).time}`;

/** Tuesday's meeting of the spec's examples: 14:30 on 7 October 2026, 45 minutes, Jane, the user and "Others". */
function tuesday(lines = 60): SeededMeeting {
  const meeting = storedMeeting({ id: 'm-tue', startedAt: at(7, 14, 30) });
  const speakers = [spokenBy('Jane'), spokenBySelf(), {}];
  const segments = Array.from({ length: lines }, (_, i) =>
    storedSegment('m-tue', i, { text: `Tuesday line ${i}.`, ...speakers[i % 3] }),
  );
  return { meeting, segments };
}

/** Six named speakers, 1 h 15 min. */
function sixNames(): SeededMeeting {
  const startedAt = at(9, 10, 0);
  const meeting = storedMeeting({ id: 'm-six', startedAt, endedAt: startedAt + 75 * MIN });
  const names = ['Jane', 'Mike', 'Tom', 'Bob', 'Sarah', 'Mary'];
  return {
    meeting,
    segments: names.map((n, i) => storedSegment('m-six', i, { text: `${n} speaks.`, ...spokenBy(n) })),
  };
}

/** Cut off when the browser closed: an open record whose last line ends 12 minutes in. */
function interrupted(): SeededMeeting {
  const meeting = storedMeeting({ id: 'm-int', startedAt: at(6, 9, 5), endedAt: null, endReason: null });
  return {
    meeting,
    segments: [
      storedSegment('m-int', 0, { text: 'Before the browser closed.', ...spokenBy('Tom') }),
      storedSegment('m-int', 1, { startMs: 12 * MIN - 1_500, text: 'And then it st' }),
    ],
  };
}

/** Started and stopped in silence. */
function silent(): SeededMeeting {
  const startedAt = at(5, 16, 0);
  return { meeting: storedMeeting({ id: 'm-empty', startedAt, endedAt: startedAt + 3 * MIN }) };
}

/**
 * A meeting with everything a meeting can own, each part carrying a sentinel: lines, a single-line correction, a
 * rename, two questions with their answers and the transcript text sent with them, and notes.
 */
function withChatAndNotes(): SeededMeeting {
  const startedAt = at(8, 11, 0);
  const meeting = storedMeeting({
    id: 'm-del',
    startedAt,
    endedAt: startedAt + 30 * MIN,
    speakerRenames: { 'caption:bob': { name: 'SENTINEL-RENAME', origin: 'manual' } },
  });
  const segments = [
    storedSegment('m-del', 0, { text: 'SENTINEL-LINE one.', ...spokenBy('Bob') }),
    storedSegment('m-del', 1, { text: 'SENTINEL-LINE two.', labelOverride: 'SENTINEL-LABEL' }),
  ];
  const chatTurns = [0, 1].map((seq) => ({
    id: `m-del:chat:${seq}`,
    meetingId: 'm-del',
    seq,
    question: `SENTINEL-QUESTION ${seq}?`,
    askedAt: startedAt + MIN,
    contextBlock: '[00:00] Bob: SENTINEL-CONTEXT one.',
    sentLines: { 'm-del:mixed:0': '[00:00] Bob: SENTINEL-SENT one.' },
    transcriptUntilMs: 1_500,
    provider: 'anthropic' as const,
    requestedModel: 'claude-sonnet-5-5',
    answeredBy: 'claude-sonnet-5-5',
    answer: `SENTINEL-ANSWER ${seq}.`,
    status: 'complete' as const,
    error: null,
    updatedAt: startedAt + 2 * MIN,
    schemaVersion: 1 as const,
    notesSent: null,
  }));
  const notes = {
    meetingId: 'm-del',
    version: 1,
    notes: { name: 'SENTINEL-NOTES.txt', source: 'paste' as const, text: 'SENTINEL-NOTES agenda.', addedAt: startedAt },
    updatedAt: startedAt,
    schemaVersion: 1 as const,
  };
  return { meeting, segments, chatTurns, notes };
}

const confirmation = (panel: Page) => transcriptsScreen(panel).getByRole('group', { name: 'Confirm delete' });
const deleteIn = (panel: Page, id: string) => row(panel, id).getByRole('button', { name: /^Delete transcript of / });
const P13 = (startedAt: number) =>
  `Delete the transcript of ${title(startedAt)} permanently? Its questions, answers and notes are deleted too. It cannot be recovered.`;

/** Everything the extension keeps on this machine: every object store and chrome.storage.local, as one text. */
async function everythingStored(panel: Page): Promise<string> {
  const local = await panel.evaluate(() => chrome.storage.local.get(null));
  return JSON.stringify({ stores: await readAllStores(panel), local });
}

test.describe('US1: see every stored transcript and read one', () => {
  test('lists every meeting newest first, shows one read-only, and Back and Escape return', async ({
    context,
    extensionId,
  }) => {
    const panel = await openPanel(context, extensionId);
    await panel.setViewportSize({ width: 360, height: 240 });
    await seedStoredMeetings(panel, [silent(), tuesday(), sixNames(), interrupted()]);

    await transcriptsButton(panel).click();
    await expect(heading(panel, 'Transcripts')).toBeFocused();
    await expect(panel.locator('.main-view')).toBeHidden();
    await expect(rows(panel)).toHaveCount(4);
    await expect(rows(panel).locator('.meeting-when')).toHaveText([
      '9 Oct 2026 · 10:00 · 1 h 15 min',
      '7 Oct 2026 · 14:30 · 45 min',
      '6 Oct 2026 · 09:05 · 12 min',
      '5 Oct 2026 · 16:00 · 3 min',
    ]);
    await expect(row(panel, 'm-six').locator('.meeting-names')).toHaveText('Jane, Mike, Tom, Bob +2 more');
    await expect(row(panel, 'm-tue').locator('.meeting-names')).toHaveText('Jane, Alex');
    await expect(row(panel, 'm-int').locator('.meeting-marker')).toHaveText('Interrupted');
    await expect(row(panel, 'm-int')).toHaveAttribute('data-state', 'interrupted');
    await expect(row(panel, 'm-empty')).toContainText('Nothing was transcribed.');
    await expect(row(panel, 'm-tue').locator('.meeting-marker')).toHaveCount(0);

    // Scrolled part-way, so "the same position" after Back means something.
    await row(panel, 'm-int').scrollIntoViewIfNeeded();
    await listScroller(panel).evaluate((el) => (el.scrollTop = Math.min(40, el.scrollHeight - el.clientHeight)));
    const scrolled = await listScroller(panel).evaluate((el) => el.scrollTop);
    expect(scrolled).toBeGreaterThan(0);

    await openControl(panel, at(7, 14, 30)).click();
    await expect(heading(panel, title(at(7, 14, 30)))).toBeFocused();
    const transcript = transcriptsScreen(panel).getByRole('region', { name: 'Transcript', exact: true });
    await expect(transcript.getByRole('group', { name: 'Transcript lines' })).toBeVisible();
    const lines = transcript.getByRole('listitem');
    await expect(lines).toHaveCount(60);
    await expect(lines.first()).toHaveText(/^00:00 Jane \(confirmed\) Tuesday line 0\.$/);
    await expect(lines.nth(1)).toHaveText(/^00:02 Alex \(confirmed\) Tuesday line 1\.$/);
    await expect(lines.nth(2)).toHaveText(/^00:04 Others \(speaker not identified\) Tuesday line 2\.$/);
    await expect(lines.first()).toBeInViewport();
    await expect(lines.last()).not.toBeInViewport();
    // Read-only: no label is a button, no question box, no notes control, no row of the list in view.
    await expect(transcript.locator('button')).toHaveCount(0);
    await expect(panel.getByRole('textbox')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /notes/i })).toHaveCount(0);
    await expect(rows(panel)).toHaveCount(0);

    await back(panel).click();
    await expect(heading(panel, 'Transcripts')).toBeVisible();
    await expect(openControl(panel, at(7, 14, 30))).toBeFocused();
    expect(await listScroller(panel).evaluate((el) => el.scrollTop)).toBe(scrolled);

    await back(panel).click();
    await expect(transcriptsButton(panel)).toBeFocused();
    await expect(line(panel, 'Jane speaks.')).toBeVisible();
    await expect(transcriptsScreen(panel)).toHaveCount(0);

    // Escape does the same, one level at a time.
    await transcriptsButton(panel).click();
    await openControl(panel, at(9, 10, 0)).click();
    await expect(heading(panel, title(at(9, 10, 0)))).toBeFocused();
    await panel.keyboard.press('Escape');
    await expect(openControl(panel, at(9, 10, 0))).toBeFocused();
    await panel.keyboard.press('Escape');
    await expect(transcriptsButton(panel)).toBeFocused();

    // A meeting with no line reads the same sentence when opened; an interrupted one says so beside its actions.
    await transcriptsButton(panel).click();
    await openControl(panel, at(5, 16, 0)).click();
    await expect(heading(panel, title(at(5, 16, 0)))).toBeFocused();
    await expect(panel.locator('.past-transcript > p')).toHaveText('Nothing was transcribed.');
    await panel.keyboard.press('Escape');
    await openControl(panel, at(6, 9, 5)).click();
    await expect(heading(panel, title(at(6, 9, 5)))).toBeFocused();
    await expect(transcriptsScreen(panel).locator('.past-actions .meeting-marker')).toHaveText('Interrupted');
  });

  test('the running meeting is first, marked In progress, and leads back to the live transcript', async ({
    context,
    extensionId,
  }) => {
    const meetingTab = await openMeetingTab(context, extensionId);
    const panel = await openPanel(context, extensionId, meetingTab);
    await seedStoredMeetings(panel, [tuesday(6)]);
    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();

    // The fixture session commits its three lines 3–5 s after Start; all of them arrive while the screen is open.
    await transcriptsButton(panel).click();
    await expect(heading(panel, 'Transcripts')).toBeFocused();
    await expect(rows(panel)).toHaveCount(2);
    const running = rows(panel).first();
    await expect(running).toHaveAttribute('data-state', 'in-progress');
    await expect(running.locator('.meeting-marker')).toHaveText('In progress');
    await expect(running.locator('.meeting-when')).toHaveText(/^\d{1,2} [A-Z][a-z]{2} \d{4} · \d{2}:\d{2}$/);
    await expect(running.getByRole('button')).toHaveCount(1);
    await expect(rows(panel).nth(1)).toHaveAttribute('data-meeting-id', 'm-tue');
    await panel.waitForTimeout(7000);

    await running.getByRole('button').click();
    await expect(transcriptsScreen(panel)).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
    for (const text of ['Hello everyone.', 'This is me speaking.', 'Καλημέρα σε όλους.'])
      await expect(line(panel, text)).toBeVisible({ timeout: LINE_TIMEOUT });

    // Stopped while the screen is open elsewhere is covered by the unit tests; here the stopped meeting gains its row.
    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
    await transcriptsButton(panel).click();
    await expect(rows(panel).first()).toHaveAttribute('data-state', 'stopped');
    await expect(rows(panel).first().locator('.meeting-marker')).toHaveCount(0);
  });

  test('with no stored meeting the screen says so and nothing else', async ({ context, extensionId }) => {
    const panel = await openPanel(context, extensionId);
    await seedStoredMeetings(panel, []);
    await transcriptsButton(panel).click();
    await expect(heading(panel, 'Transcripts')).toBeFocused();
    await expect(transcriptsScreen(panel)).toHaveText('←TranscriptsNo transcripts stored.');
    await panel.keyboard.press('Escape');
    await expect(transcriptsButton(panel)).toBeFocused();
  });
});

test.describe('US2: delete a past transcript for real', () => {
  test('a row asks first, then removes the meeting and everything it owns, and only that', async ({
    context,
    extensionId,
  }) => {
    const panel = await openPanel(context, extensionId);
    await seedStoredMeetings(panel, [tuesday(6), withChatAndNotes(), sixNames()]);
    expect(await everythingStored(panel)).toContain('SENTINEL-ANSWER 1.');
    await transcriptsButton(panel).click();
    await expect(rows(panel)).toHaveCount(3);

    // The confirmation names the meeting and what goes with it; the confirming button has focus.
    await deleteIn(panel, 'm-del').click();
    await expect(confirmation(panel)).toHaveCount(1);
    await expect(row(panel, 'm-del').getByRole('group', { name: 'Confirm delete' })).toContainText(P13(at(8, 11, 0)));
    await expect(confirmation(panel).getByRole('button', { name: 'Delete permanently' })).toBeFocused();

    // Cancel: nothing deleted, focus back on that row's Delete.
    await confirmation(panel).getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation(panel)).toHaveCount(0);
    await expect(deleteIn(panel, 'm-del')).toBeFocused();
    await expect(rows(panel)).toHaveCount(3);

    // Escape closes the confirmation only; the screen stays.
    await deleteIn(panel, 'm-del').click();
    await expect(confirmation(panel).getByRole('button', { name: 'Delete permanently' })).toBeFocused();
    await panel.keyboard.press('Escape');
    await expect(confirmation(panel)).toHaveCount(0);
    await expect(heading(panel, 'Transcripts')).toBeVisible();
    await expect(deleteIn(panel, 'm-del')).toBeFocused();
    expect(await everythingStored(panel)).toContain('SENTINEL-ANSWER 1.');

    // At most one confirmation: opening another row's closes this one.
    await deleteIn(panel, 'm-del').click();
    await deleteIn(panel, 'm-tue').click();
    await expect(confirmation(panel)).toHaveCount(1);
    await expect(row(panel, 'm-tue').getByRole('group', { name: 'Confirm delete' })).toContainText(P13(at(7, 14, 30)));
    await expect(deleteIn(panel, 'm-del')).toBeVisible();
    await confirmation(panel).getByRole('button', { name: 'Cancel' }).click();

    // Confirm: the row is gone, it is announced, focus is on the next row, and nothing of the meeting is stored.
    await deleteIn(panel, 'm-del').click();
    await confirmation(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(rows(panel)).toHaveCount(2);
    await expect(row(panel, 'm-del')).toHaveCount(0);
    await expect(transcriptsScreen(panel).getByRole('status')).toHaveText('Transcript deleted.');
    await expect(transcriptsScreen(panel).getByRole('status')).not.toBeInViewport();
    await expect(openControl(panel, at(7, 14, 30))).toBeFocused();
    const after = await everythingStored(panel);
    expect(after).not.toContain('m-del');
    expect(after).not.toContain('SENTINEL');
    const stores = await readAllStores(panel);
    expect((stores.meetings as { id: string }[]).map((m) => m.id).sort()).toEqual(['m-six', 'm-tue']);
    expect(stores.segments).toHaveLength(6 + 6);
    expect(stores.chatTurns).toEqual([]);
    expect(stores.meetingContexts).toEqual([]);

    // From a meeting's transcript: the list returns without it.
    await openControl(panel, at(7, 14, 30)).click();
    await expect(heading(panel, title(at(7, 14, 30)))).toBeFocused();
    await transcriptsScreen(panel).getByRole('button', { name: 'Delete transcript', exact: true }).click();
    await expect(confirmation(panel)).toContainText(P13(at(7, 14, 30)));
    await expect(confirmation(panel).getByRole('button', { name: 'Delete permanently' })).toBeFocused();
    await confirmation(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(heading(panel, 'Transcripts')).toBeVisible();
    await expect(rows(panel)).toHaveCount(1);
    await expect(openControl(panel, at(9, 10, 0))).toBeFocused();
    await expect(transcriptsScreen(panel).getByRole('status')).toHaveText('Transcript deleted.');

    // The last one: the empty state, with the title focused.
    await deleteIn(panel, 'm-six').click();
    await confirmation(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(transcriptsScreen(panel).getByText('No transcripts stored.')).toBeVisible();
    await expect(heading(panel, 'Transcripts')).toBeFocused();
    const empty = await readAllStores(panel);
    expect(Object.values(empty).flat()).toEqual([]);
  });
});

const mainView = (panel: Page) => panel.locator('.main-view');
const mainDelete = (panel: Page) => mainView(panel).getByRole('button', { name: 'Delete transcript', exact: true });
const mainDownload = (panel: Page) => mainView(panel).getByRole('button', { name: 'Download transcript', exact: true });

/** The main view as before any meeting was transcribed. */
async function expectCleanMain(panel: Page): Promise<void> {
  await expect(mainView(panel).getByRole('log', { name: 'Transcript lines' })).toHaveText('No transcript yet.');
  await expect(mainDownload(panel)).toHaveCount(0);
  await expect(mainDelete(panel)).toHaveCount(0);
  await expect(
    mainView(panel).getByRole('region', { name: 'Transcript', exact: true }).getByRole('listitem'),
  ).toHaveCount(0);
}

test.describe('US3: deleting on the main view leaves it clean and leads to the rest', () => {
  test('a delete on the main view opens the Transcripts screen, and the main view stays clean across a reload', async ({
    context,
    extensionId,
  }) => {
    const panel = await openPanel(context, extensionId);
    await seedStoredMeetings(panel, [tuesday(6), withChatAndNotes(), sixNames()]);
    await expect(line(panel, 'Jane speaks.')).toBeVisible();

    // Cancel: nothing changes and the screen does not open.
    await mainDelete(panel).click();
    await mainView(panel).getByRole('button', { name: 'Cancel' }).click();
    await expect(transcriptsScreen(panel)).toHaveCount(0);
    await expect(line(panel, 'Jane speaks.')).toBeVisible();

    await mainDelete(panel).click();
    await expect(mainView(panel).getByRole('group', { name: 'Confirm delete' })).toHaveText(
      /^Delete this transcript permanently\? It cannot be recovered\./,
    );
    await mainView(panel).getByRole('button', { name: 'Delete permanently' }).click();

    // SC-004: the screen shows exactly what remains, title focused.
    await expect(heading(panel, 'Transcripts')).toBeFocused();
    await expect(rows(panel)).toHaveCount(2);
    await expect(rows(panel).nth(0)).toHaveAttribute('data-meeting-id', 'm-del');
    await expect(rows(panel).nth(1)).toHaveAttribute('data-meeting-id', 'm-tue');
    expect(JSON.stringify(await readAllStores(panel))).not.toContain('m-six');

    await back(panel).click();
    await expect(transcriptsButton(panel)).toBeFocused();
    await expectCleanMain(panel);
    await expect(mainView(panel)).not.toContainText('SENTINEL-LINE');

    // SC-011: closing and reopening the panel does not bring an older transcript back.
    await panel.reload();
    await expect(transcriptsButton(panel)).toBeVisible();
    await expectCleanMain(panel);
    await transcriptsButton(panel).click();
    await expect(rows(panel)).toHaveCount(2);

    // A remaining meeting is read on the screen; the main view stays clean.
    await openControl(panel, at(7, 14, 30)).click();
    await expect(transcriptsScreen(panel).getByText('Tuesday line 0.')).toBeVisible();
    await back(panel).click();
    await back(panel).click();
    await expectCleanMain(panel);

    // Another panel (another window) is clean too.
    const second = await openPanel(context, extensionId);
    await expect(transcriptsButton(second)).toBeVisible();
    await expectCleanMain(second);
  });

  test('deleting the only stored meeting on the main view ends on the empty state', async ({
    context,
    extensionId,
  }) => {
    const panel = await openPanel(context, extensionId);
    await seedStoredMeetings(panel, [tuesday(6)]);
    await expect(line(panel, 'Tuesday line 5.')).toBeVisible();
    await mainDelete(panel).click();
    await mainView(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(heading(panel, 'Transcripts')).toBeFocused();
    await expect(transcriptsScreen(panel)).toHaveText('←TranscriptsNo transcripts stored.');
    await back(panel).click();
    await expectCleanMain(panel);
  });

  test('deleting on the screen: another meeting leaves the main view, the one it shows cleans it, the next Start ends that', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(60_000);
    const meetingTab = await openMeetingTab(context, extensionId);
    const panel = await openPanel(context, extensionId, meetingTab);
    await seedStoredMeetings(panel, [tuesday(6), sixNames()]);
    await expect(line(panel, 'Jane speaks.')).toBeVisible();

    // FR-027: an older meeting deleted on the screen leaves the main view as it was.
    await transcriptsButton(panel).click();
    await deleteIn(panel, 'm-tue').click();
    await confirmation(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(rows(panel)).toHaveCount(1);
    await back(panel).click();
    await expect(line(panel, 'Jane speaks.')).toBeVisible();
    await expect(mainDelete(panel)).toBeVisible();

    // C2: the meeting the main view shows, deleted on the screen, leaves the main view clean.
    await transcriptsButton(panel).click();
    await deleteIn(panel, 'm-six').click();
    await confirmation(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(transcriptsScreen(panel).getByText('No transcripts stored.')).toBeVisible();
    await back(panel).click();
    await expectCleanMain(panel);

    // FR-026: the next meeting shows while it runs and after it stops, also after a reload.
    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
    await expect(line(panel, 'This is me speaking.')).toBeVisible({ timeout: LINE_TIMEOUT });
    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(line(panel, 'Hello everyone.')).toBeVisible();
    await expect(mainDownload(panel)).toBeVisible();
    await expect(mainDelete(panel)).toBeVisible();
    await panel.reload();
    await expect(line(panel, 'Hello everyone.')).toBeVisible();
    await expect(mainDownload(panel)).toBeVisible();
    await expect(mainDelete(panel)).toBeVisible();
  });
});

/** Presses a Download control and returns the saved file. */
async function download(panel: Page, control: Locator): Promise<{ name: string; bytes: Buffer }> {
  const [saved] = await Promise.all([panel.waitForEvent('download'), control.click()]);
  return { name: saved.suggestedFilename(), bytes: await readFile(await saved.path()) };
}

test.describe('US4: download any past transcript', () => {
  test('a row and a meeting\u2019s transcript save the file the main view saves, byte for byte', async ({
    context,
    extensionId,
  }) => {
    const panel = await openPanel(context, extensionId);
    // Questions and answers exist for the meeting; none of it may reach the file (FR-015).
    const turn = { ...withChatAndNotes().chatTurns![0]!, id: 'm-tue:chat:0', meetingId: 'm-tue' };
    await seedStoredMeetings(panel, [{ ...tuesday(12), chatTurns: [turn] }]);
    await expect(line(panel, 'Tuesday line 11.')).toBeVisible();
    const fromMain = await download(panel, mainDownload(panel));
    expect(fromMain.name).toBe('Meeting — 07-10-2026 at 14h30 — Transcript.txt');
    expect(fromMain.name).toBe(fileName(at(7, 14, 30)));
    const text = fromMain.bytes.toString('utf8');
    expect(text.startsWith('[00:00] Jane: Tuesday line 0.\n\n[00:02] Alex: Tuesday line 1.\n\n[00:04] Others: ')).toBe(
      true,
    );
    expect(text).not.toContain('SENTINEL');

    // Two newer meetings beside it: it is no longer the one the main view shows.
    await seedStoredMeetings(panel, [sixNames(), withChatAndNotes(), silent()], { keep: true });
    await expect(line(panel, 'Jane speaks.')).toBeVisible();
    await transcriptsButton(panel).click();
    await expect(rows(panel)).toHaveCount(4);
    await expect(row(panel, 'm-tue').locator('.meeting-names')).toHaveText('Jane, Alex');

    const inRow = row(panel, 'm-tue').getByRole('button', { name: `Download transcript of ${title(at(7, 14, 30))}` });
    await expect(inRow).toHaveText('Download transcript');
    const before = await transcriptsScreen(panel).innerText();
    const scrollBefore = await listScroller(panel).evaluate((el) => el.scrollTop);
    const fromRow = await download(panel, inRow);
    expect(fromRow.name).toBe(fromMain.name);
    expect(fromRow.bytes.equals(fromMain.bytes)).toBe(true);

    // FR-016: the screen is unchanged: same list, same position, same focus, no message.
    await expect(inRow).toBeFocused();
    expect(await transcriptsScreen(panel).innerText()).toBe(before);
    expect(await listScroller(panel).evaluate((el) => el.scrollTop)).toBe(scrollBefore);
    await expect(transcriptsScreen(panel).getByRole('status')).toHaveText('');
    await expect(rows(panel)).toHaveCount(4);

    // A meeting with no line has no Download; one with lines does, also when interrupted or renamed.
    await expect(row(panel, 'm-empty').getByRole('button', { name: /^Download transcript/ })).toHaveCount(0);
    await expect(row(panel, 'm-empty').getByRole('button', { name: /^Delete transcript/ })).toHaveCount(1);
    await expect(row(panel, 'm-del').getByRole('button', { name: /^Download transcript/ })).toHaveCount(1);

    // The same file from its transcript in the screen.
    await openControl(panel, at(7, 14, 30)).click();
    await expect(heading(panel, title(at(7, 14, 30)))).toBeFocused();
    const here = panel.locator('.past-actions').getByRole('button', { name: 'Download transcript', exact: true });
    const fromTranscript = await download(panel, here);
    expect(fromTranscript.name).toBe(fromMain.name);
    expect(fromTranscript.bytes.equals(fromMain.bytes)).toBe(true);
    await expect(heading(panel, title(at(7, 14, 30)))).toBeVisible();

    // Current labels: a renamed speaker and a corrected line are written as shown.
    await back(panel).click();
    const renamed = await download(panel, row(panel, 'm-del').getByRole('button', { name: /^Download transcript/ }));
    expect(renamed.name).toBe(fileName(at(8, 11, 0)));
    expect(renamed.bytes.toString('utf8')).toBe(
      '[00:00] SENTINEL-RENAME: SENTINEL-LINE one.\n\n[00:02] SENTINEL-LABEL: SENTINEL-LINE two.\n',
    );

    // The empty meeting's transcript view has no Download either.
    await openControl(panel, at(5, 16, 0)).click();
    await expect(heading(panel, title(at(5, 16, 0)))).toBeFocused();
    await expect(panel.locator('.past-actions').getByRole('button')).toHaveText(['Delete transcript']);
  });
});

/** axe (WCAG 2.1 A/AA) in the light and the dark colour scheme (SC-009). */
async function expectNoAxeViolationsInBothModes(panel: Page, state: string): Promise<void> {
  for (const colorScheme of ['light', 'dark'] as const) {
    await panel.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page: panel })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(summary, `axe violations on ${state} (${colorScheme})`).toEqual([]);
  }
  await panel.emulateMedia({ colorScheme: null });
}

const HISTORY = 200;
const LONG = 'h3';
const VERY_LONG = 'h5';

/** 200 stored meetings, one a day back from 9 October 2026; one has 1,500 lines and one 5,000 (a 3-hour meeting). */
function longHistory(): SeededMeeting[] {
  return Array.from({ length: HISTORY }, (_, i) => {
    const id = `h${i}`;
    const startedAt = at(9, 10, 0) - i * 24 * 60 * MIN;
    const lines = id === LONG ? 1_500 : id === VERY_LONG ? 5_000 : 0;
    if (lines > 0)
      return {
        meeting: storedMeeting({ id, startedAt, endedAt: startedAt + 180 * MIN }),
        segments: longTranscript(id, lines),
      };
    return {
      meeting: storedMeeting({ id, startedAt }),
      segments: [
        storedSegment(id, 0, { text: `Meeting ${i} begins.`, ...spokenBy('Jane') }),
        storedSegment(id, 1, { text: `Meeting ${i} goes on.` }),
      ],
    };
  });
}

/** Presses the control `press` finds and resolves with the milliseconds until `done` holds and a frame was drawn. */
async function timeInPage(panel: Page, press: string, done: string): Promise<number> {
  return panel.evaluate(
    async ({ press, done }) => {
      const control = document.querySelector<HTMLElement>(press);
      if (!control) throw new Error(`no control ${press}`);
      const started = performance.now();
      control.click();
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- a test condition evaluated in the page
      const holds = new Function(`return (${done});`) as () => boolean;
      while (!holds()) await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return performance.now() - started;
    },
    { press, done },
  );
}

/** How far the page itself scrolls beyond the panel: zero on every screen (006 FR-023, 012 FR-024). */
const pageHeights = (panel: Page) =>
  panel.evaluate(() => ({ page: document.documentElement.scrollHeight, panel: window.innerHeight }));

test.describe('Cross-cutting: accessible, fast, in one page height, off the network', () => {
  test('axe finds nothing on the list, one meeting, an open confirmation and the empty state, light and dark (SC-009)', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(60_000);
    const panel = await openPanel(context, extensionId);
    await seedStoredMeetings(panel, [silent(), tuesday(), sixNames(), interrupted()]);
    await transcriptsButton(panel).click();
    await expect(row(panel, 'm-int').locator('.meeting-when')).toHaveText('6 Oct 2026 · 09:05 · 12 min');
    await expectNoAxeViolationsInBothModes(panel, 'the list');

    await deleteIn(panel, 'm-tue').click();
    await expect(confirmation(panel).getByRole('button', { name: 'Delete permanently' })).toBeFocused();
    await expectNoAxeViolationsInBothModes(panel, 'a row confirmation');
    await panel.keyboard.press('Escape');

    await openControl(panel, at(6, 9, 5)).click();
    await expect(heading(panel, title(at(6, 9, 5)))).toBeFocused();
    await expectNoAxeViolationsInBothModes(panel, 'one meeting');
    await transcriptsScreen(panel).getByRole('button', { name: 'Delete transcript', exact: true }).click();
    await expect(confirmation(panel).getByRole('button', { name: 'Delete permanently' })).toBeFocused();
    await expectNoAxeViolationsInBothModes(panel, 'the confirmation beside a transcript');
    await panel.keyboard.press('Escape');
    await panel.keyboard.press('Escape');

    await openControl(panel, at(5, 16, 0)).click();
    await expect(heading(panel, title(at(5, 16, 0)))).toBeFocused();
    await expectNoAxeViolationsInBothModes(panel, 'a meeting with no line');

    // Keyboard order on the list: Back, the list scroller, then per row its opening control, Download, Delete.
    await panel.keyboard.press('Escape');
    await back(panel).focus();
    const order: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      await panel.keyboard.press('Tab');
      order.push(
        await panel.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          return el.getAttribute('aria-label') ?? el.className;
        }),
      );
    }
    expect(order).toEqual([
      'transcripts-list',
      `Open transcript of ${title(at(9, 10, 0))}`,
      `Download transcript of ${title(at(9, 10, 0))}`,
      `Delete transcript of ${title(at(9, 10, 0))}`,
      `Open transcript of ${title(at(7, 14, 30))}`,
    ]);

    await seedStoredMeetings(panel, []);
    await transcriptsButton(panel).click();
    await expect(transcriptsScreen(panel).getByText('No transcripts stored.')).toBeVisible();
    await expectNoAxeViolationsInBothModes(panel, 'the empty state');
  });

  test('200 meetings and a 5,000-line transcript: quick, the page never scrolls, and nothing leaves the machine', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(180_000);
    const panel = await openPanel(context, extensionId);
    await panel.setViewportSize({ width: 400, height: 870 });
    await seedStoredMeetings(panel, longHistory());
    await expect(line(panel, 'Meeting 0 begins.')).toBeVisible();
    // The account check made when the panel opens has settled (it is blocked in e2e); nothing else may follow.
    await expect(panel.getByRole('button', { name: 'Could not reach ElevenLabs to check your plan.' })).toBeVisible();
    const requests: string[] = [];
    context.on('request', (request) => requests.push(request.url()));

    // SC-006: every row's date line within a second of pressing the control.
    const allRows = `document.querySelectorAll('.transcripts-list [data-meeting-id] .meeting-when').length === ${HISTORY}`;
    expect(await timeInPage(panel, 'button.transcripts', allRows)).toBeLessThan(1_000);
    await expect(rows(panel)).toHaveCount(HISTORY);
    await expect(rows(panel).last().locator('.meeting-when')).toHaveText(/ · 10:00 · 45 min$/);

    // SC-010: the list scrolls inside the screen; the page does not, and the title and Back stay in view.
    const heights = await pageHeights(panel);
    expect(heights).toEqual({ page: 870, panel: 870 });
    const list = await listScroller(panel).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, position: getComputedStyle(el).position };
    });
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight * 5);
    expect(list.position).toBe('relative');
    await expect(rows(panel).last()).toBeInViewport();
    await expect(heading(panel, 'Transcripts')).toBeInViewport({ ratio: 1 });
    await expect(back(panel)).toBeInViewport({ ratio: 1 });
    expect(await pageHeights(panel)).toEqual({ page: 870, panel: 870 });

    // The row details are worked out once (a few seconds for 200 meetings) and kept on each meeting's record.
    await expect(panel.locator('.transcripts-list .meeting-names')).toHaveCount(HISTORY, { timeout: 60_000 });
    const summaries = (await readAllStores(panel)).meetings as { summary?: { v: number } }[];
    expect(summaries.filter((m) => m.summary?.v === 1)).toHaveLength(HISTORY);

    // From the second opening on the names are there within the same second.
    await back(panel).click();
    const allNames = `document.querySelectorAll('.transcripts-list .meeting-names').length === ${HISTORY}`;
    expect(await timeInPage(panel, 'button.transcripts', allNames)).toBeLessThan(1_000);
    await expect(row(panel, VERY_LONG).locator('.meeting-names')).toHaveText('Jane, Mike, Tom');
    await expect(row(panel, VERY_LONG).locator('.meeting-when')).toHaveText(/ · 3 h$/);

    // SC-006: a 3-hour transcript within two seconds of selecting it; Back answered within 200 ms.
    const opened = await timeInPage(
      panel,
      `.transcripts-list [data-meeting-id="${VERY_LONG}"] .meeting-when`,
      `document.querySelectorAll('.past-transcript .line').length === 5000`,
    );
    expect(opened).toBeLessThan(2_000);
    await expect(transcriptsScreen(panel).getByRole('listitem').first()).toBeInViewport();
    expect(await pageHeights(panel)).toEqual({ page: 870, panel: 870 });
    const backAnswered = await timeInPage(
      panel,
      '.transcripts-screen button.back',
      `document.querySelector('.past-transcript') === null && !document.querySelector('.transcripts-list').hidden`,
    );
    expect(backAnswered).toBeLessThan(200);
    await expect(row(panel, VERY_LONG).locator('.meeting-open')).toBeFocused();

    // SC-010: a 1,500-line transcript open, scrolled to its end: still one page height.
    await row(panel, LONG).locator('.meeting-when').click();
    const transcript = transcriptsScreen(panel).getByRole('group', { name: 'Transcript lines' });
    await expect(transcript.getByRole('listitem')).toHaveCount(1_500);
    expect(await pageHeights(panel)).toEqual({ page: 870, panel: 870 });
    const scroll = await transcript.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, position: getComputedStyle(el).position };
    });
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight * 5);
    expect(scroll.position).toBe('relative');
    await expect(transcript.getByRole('listitem').last()).toBeInViewport();
    expect(await pageHeights(panel)).toEqual({ page: 870, panel: 870 });
    const actions = panel.locator('.past-actions');
    await expect(actions.getByRole('button', { name: 'Download transcript', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(actions.getByRole('button', { name: 'Delete transcript', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(back(panel)).toBeInViewport({ ratio: 1 });

    // Download and delete, here and in a row, so the whole of the screen's use is covered by the request check.
    const saved = await download(panel, actions.getByRole('button', { name: 'Download transcript', exact: true }));
    expect(saved.bytes.toString('utf8').split('\n\n')).toHaveLength(1_500);
    await actions.getByRole('button', { name: 'Delete transcript', exact: true }).click();
    await confirmation(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(rows(panel)).toHaveCount(HISTORY - 1);
    expect(await pageHeights(panel)).toEqual({ page: 870, panel: 870 });
    await deleteIn(panel, 'h1').click();
    expect(await pageHeights(panel)).toEqual({ page: 870, panel: 870 });
    await confirmation(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(rows(panel)).toHaveCount(HISTORY - 2);
    await expect(transcriptsScreen(panel).getByRole('status')).toHaveText('Transcript deleted.');
    expect(await pageHeights(panel)).toEqual({ page: 870, panel: 870 });
    await download(panel, row(panel, 'h2').getByRole('button', { name: /^Download transcript of / }));

    // SC-007: nothing but the extension's own files and local blobs was requested, by any part of the extension.
    const own = [`chrome-extension://${extensionId}/`, `blob:chrome-extension://${extensionId}/`];
    expect(requests.filter((url) => !own.some((prefix) => url.startsWith(prefix)))).toEqual([]);
  });

  test('at 320 px the header and every date line stay on one line and no control is cut off', async ({
    context,
    extensionId,
  }) => {
    const panel = await openPanel(context, extensionId);
    await panel.setViewportSize({ width: 320, height: 700 });
    const longest = at(28, 23, 59);
    await seedStoredMeetings(panel, [
      silent(),
      tuesday(6),
      sixNames(),
      interrupted(),
      {
        meeting: storedMeeting({ id: 'm-wide', startedAt: longest, endedAt: longest + (11 * 60 + 15) * MIN }),
        segments: [storedSegment('m-wide', 0, spokenBy('A participant with quite a long display name'))],
      },
    ]);
    await expect(panel.getByRole('button', { name: 'Could not reach ElevenLabs to check your plan.' })).toBeVisible();

    const header = panel.locator('header.panel-header');
    const controls = [
      header.getByRole('button', { name: 'Start' }),
      header.getByRole('combobox', { name: 'Language' }),
      header.getByRole('button', { name: 'Add notes for the next meeting' }),
      header.getByRole('button', { name: 'Could not reach ElevenLabs to check your plan.' }),
      header.getByRole('button', { name: 'Transcripts' }),
      header.getByRole('button', { name: 'Settings' }),
    ];
    const boxes = await Promise.all(controls.map(async (control) => (await control.boundingBox())!));
    const middles = boxes.map((box) => Math.round(box.y + box.height / 2));
    expect(Math.max(...middles) - Math.min(...middles)).toBeLessThanOrEqual(2);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.width).toBeGreaterThanOrEqual(20);
      // One line of text each: no label wraps inside its control.
      expect(box.height).toBeLessThanOrEqual(30);
    }
    for (let i = 1; i < boxes.length; i += 1)
      expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width);
    expect(await panel.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

    await transcriptsButton(panel).click();
    await expect(row(panel, 'm-wide').locator('.meeting-when')).toHaveText('28 Oct 2026 · 23:59 · 11 h 15 min');
    await expect(row(panel, 'm-int').locator('.meeting-when')).toHaveText('6 Oct 2026 · 09:05 · 12 min');
    await deleteIn(panel, 'm-six').click();
    const layout = await panel.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('.transcripts-list')!;
      const edge = scroller.getBoundingClientRect();
      const whens = [...scroller.querySelectorAll<HTMLElement>('.meeting-when')].map((el) => ({
        lines: el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
        right: el.getBoundingClientRect().right,
      }));
      const cut = [...scroller.querySelectorAll<HTMLElement>('button, .meeting-names, .meeting-marker, p')].filter(
        (el) => {
          const box = el.getBoundingClientRect();
          return box.left < edge.left || box.right > edge.right || el.scrollWidth > el.clientWidth + 1;
        },
      );
      return {
        whens,
        cut: cut.map((el) => el.textContent),
        sideways: scroller.scrollWidth - scroller.clientWidth,
        page: document.documentElement.scrollWidth,
        right: edge.right,
      };
    });
    expect(layout.whens).toHaveLength(5);
    for (const when of layout.whens) {
      expect(when.lines).toBeLessThan(1.5);
      expect(when.right).toBeLessThanOrEqual(layout.right);
    }
    expect(layout.cut).toEqual([]);
    expect(layout.sideways).toBe(0);
    expect(layout.page).toBeLessThanOrEqual(320);
  });

  // 012 T061 (FR-028 to FR-031, design decision 76): the meeting's title is the row's first line.
  test('a meeting’s title is its row’s first line and heads its transcript; a long one is cut, never widening the page', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(60_000);
    const LONG_TITLE =
      'Quarterly planning and budget review with the whole department, the regional leads and everyone from finance';
    const named = at(9, 10, 0);
    const wordy = at(8, 11, 0);
    const elsewhere = at(4, 9, 0);
    const panel = await openPanel(context, extensionId);
    await panel.setViewportSize({ width: 320, height: 700 });
    await seedStoredMeetings(panel, [
      {
        meeting: storedMeeting({ id: 'm-named', startedAt: named, source: titled('Weekly sync') }),
        segments: [storedSegment('m-named', 0, spokenBy('Jane'))],
      },
      {
        meeting: storedMeeting({ id: 'm-wordy', startedAt: wordy, source: titled(LONG_TITLE) }),
        segments: [storedSegment('m-wordy', 0, spokenBy('Tom'))],
      },
      // A Meet call without a name: the tab was titled with the meeting code.
      tuesday(3),
      // Cut off, on another site, with markup characters in its tab title.
      {
        meeting: storedMeeting({
          id: 'm-site',
          startedAt: elsewhere,
          endedAt: null,
          endReason: null,
          source: { url: 'https://example.com/call', title: '<b>Roadmap</b> - Zoom', platform: 'generic' },
        }),
        segments: [storedSegment('m-site', 0)],
      },
    ]);
    await transcriptsButton(panel).click();
    await expect(rows(panel)).toHaveCount(4);

    // The title first, the date line under it, then the names.
    await expect(row(panel, 'm-named').locator('.meeting-open')).toHaveText('Weekly sync9 Oct 2026 · 10:00 · 45 min');
    await expect(row(panel, 'm-named').locator('.meeting-title')).toHaveText('Weekly sync');
    await expect(row(panel, 'm-named').locator('.meeting-names')).toHaveText('Jane');
    const order = await row(panel, 'm-named').evaluate((li) => {
      const top = (selector: string) => li.querySelector(selector)!.getBoundingClientRect().top;
      return [top('.meeting-title'), top('.meeting-when'), top('.meeting-names')];
    });
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
    await expect(
      panel.getByRole('button', { name: `Open transcript of Weekly sync, ${title(named)}`, exact: true }),
    ).toBeVisible();

    // No title line for the unnamed Meet call, and no code in its row.
    await expect(row(panel, 'm-tue').locator('.meeting-title')).toHaveCount(0);
    await expect(row(panel, 'm-tue').locator('.meeting-open')).toHaveText('7 Oct 2026 · 14:30 · 45 min');
    await expect(row(panel, 'm-tue')).not.toContainText('abc-defg-hij');
    await expect(openControl(panel, at(7, 14, 30))).toBeVisible();

    // Another site's title as stored, as text.
    await expect(row(panel, 'm-site').locator('.meeting-title')).toHaveText('<b>Roadmap</b> - Zoom');
    await expect(row(panel, 'm-site').locator('b')).toHaveCount(0);
    await expect(row(panel, 'm-site').locator('.meeting-marker')).toHaveText('Interrupted');

    // A long title at 320 px: one line, cut with an ellipsis, whole on hover and to a screen reader (006 FR-023).
    const measure = (selector: string) =>
      panel.evaluate((sel) => {
        const el = document.querySelector<HTMLElement>(sel)!;
        const style = getComputedStyle(el);
        const when = el.parentElement!.querySelector<HTMLElement>('.meeting-when')!;
        const scroller = document.querySelector<HTMLElement>('.transcripts-list')!;
        return {
          lines: el.getBoundingClientRect().height / parseFloat(style.lineHeight),
          cut: el.scrollWidth > el.clientWidth,
          ellipsis: style.textOverflow,
          right: el.getBoundingClientRect().right,
          hover: el.getAttribute('title'),
          whenWhole: when.scrollWidth <= when.clientWidth && when.getBoundingClientRect().right <= 320,
          sideways: scroller.scrollWidth - scroller.clientWidth,
          page: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight - window.innerHeight,
        };
      }, selector);
    const inRow = await measure('[data-meeting-id="m-wordy"] .meeting-title');
    expect(inRow.lines).toBeLessThan(1.5);
    expect(inRow.cut).toBe(true);
    expect(inRow.ellipsis).toBe('ellipsis');
    expect(inRow.right).toBeLessThanOrEqual(320);
    expect(inRow.hover).toBe(LONG_TITLE);
    expect(inRow.whenWhole).toBe(true);
    expect(inRow.sideways).toBe(0);
    expect(inRow.page).toBeLessThanOrEqual(320);
    expect(inRow.pageHeight).toBeLessThanOrEqual(0);
    await expect(row(panel, 'm-wordy').locator('.meeting-when')).toHaveText('8 Oct 2026 · 11:00 · 45 min');
    const longOpen = panel.getByRole('button', {
      name: `Open transcript of ${LONG_TITLE}, ${title(wordy)}`,
      exact: true,
    });
    await expect(longOpen).toBeVisible();
    await expectNoAxeViolationsInBothModes(panel, 'the list with titles');

    // Its heading: the title above the date and time, cut the same way, Back still in view.
    await longOpen.click();
    const h2 = panel.getByRole('heading', { level: 2 });
    await expect(h2).toBeFocused();
    await expect(h2.locator('.meeting-title')).toHaveText(LONG_TITLE);
    await expect(h2.locator('.meeting-when')).toHaveText(title(wordy));
    const inHeading = await measure('.screen-bar h2 .meeting-title');
    expect(inHeading.lines).toBeLessThan(1.5);
    expect(inHeading.cut).toBe(true);
    expect(inHeading.ellipsis).toBe('ellipsis');
    expect(inHeading.right).toBeLessThanOrEqual(320);
    expect(inHeading.hover).toBe(LONG_TITLE);
    expect(inHeading.whenWhole).toBe(true);
    expect(inHeading.page).toBeLessThanOrEqual(320);
    expect(inHeading.pageHeight).toBeLessThanOrEqual(0);
    const stacked = await h2.evaluate((el) => {
      const top = (selector: string) => el.querySelector(selector)!.getBoundingClientRect().top;
      return top('.meeting-title') < top('.meeting-when');
    });
    expect(stacked).toBe(true);
    const backBox = (await back(panel).boundingBox())!;
    expect(backBox.x).toBeGreaterThanOrEqual(0);
    expect(backBox.width).toBeGreaterThanOrEqual(20);
    await expect(line(panel, 'Line 0.')).toBeVisible();
    await expectNoAxeViolationsInBothModes(panel, 'one meeting with a title');

    // A meeting without a title is headed by its date and time alone.
    await back(panel).click();
    await expect(longOpen).toBeFocused();
    await openControl(panel, at(7, 14, 30)).click();
    await expect(heading(panel, title(at(7, 14, 30)))).toBeFocused();
    await expect(panel.locator('.screen-bar h2 .meeting-title')).toHaveCount(0);
  });
});
