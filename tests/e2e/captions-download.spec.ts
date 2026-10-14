// 013 Captions download in the real extension (US1, US3, US4 and the cross-cutting checks; FR-012–FR-022, SC-001,
// SC-002, SC-005, SC-008): `Download transcript` saves one file. For a meeting with transcript lines and kept captions
// that file is a zip, unpacked here with the system's `unzip` and compared name by name and byte by byte. Meetings are
// seeded into the panel's own IndexedDB or run on the routed saved Meet page. Every name and sentence is invented. No
// network.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { StoredCaptionTurn } from '@/core/captions/model';
import { transcriptFile } from '@/core/export/transcript-file';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK, holdsMarker } from '../support/caption-marker-text';
import { longTranscript, spokenBy, spokenBySelf, storedMeeting, storedSegment } from '../support/stored-meetings';
import {
  baseName,
  captionInMeet,
  newestMeeting,
  readCaptionTurns,
  saveFrom,
  unzipDownload,
  watchForMarker,
} from './captions-helpers';
import { expect, extensionPath, test } from './fixtures';
import { LINE_TIMEOUT, line, openMeetPage, openMeetingTab, openPanel, seedSettings, statusDot } from './helpers';
import {
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
const utf8 = (text: string) => Buffer.from(text, 'utf8');

const title = (startedAt: number) => `${when(startedAt).date}, ${when(startedAt).time}`;
const confirmation = (panel: Page) => transcriptsScreen(panel).getByRole('group', { name: 'Confirm delete' });
const mainDownload = (panel: Page) =>
  panel.locator('.main-view').getByRole('button', { name: 'Download transcript', exact: true });

const turn = (
  meetingId: string,
  seq: number,
  startMs: number,
  speakerName: string,
  text: string,
  self = false,
): StoredCaptionTurn => ({ meetingId, seq, startMs, speakerName, self, text, schemaVersion: 1 });

/**
 * The spec's meeting: 14:30 on 7 October 2026, with transcript lines and six kept caption turns. Among the captions: the
 * user's own turn (Meet's "You"), a speaker renamed in this meeting, a speaker with a remembered name whom no transcript
 * line was ever named after, and a Greek turn. One transcript line carries a single-line correction.
 */
function captioned(id = 'm-cap', startedAt = at(7, 14, 30)): SeededMeeting {
  const meeting = storedMeeting({
    id,
    startedAt,
    endedAt: startedAt + 80 * MIN,
    hasCaptions: true,
    speakerRenames: {
      'caption:bob b.': { name: 'Bob Brown', origin: 'manual' },
      'caption:irene k.': { name: 'Irene Kosta', origin: 'remembered' },
    },
  });
  const segments = [
    storedSegment(id, 0, { text: 'Good morning everyone.', ...spokenBy('Sarah Brown') }),
    storedSegment(id, 1, { text: 'Morning.', ...spokenBySelf() }),
    storedSegment(id, 2, { text: 'I can take notes.', ...spokenBy('Bob B.') }),
    storedSegment(id, 3, { text: 'Thanks for that.', ...spokenBy('Sarah Brown'), labelOverride: 'Mike' }),
  ];
  const captionTurns = [
    turn(id, 1, 4_000, 'Sarah Brown', 'Good morning, can everyone see the roadmap slide?'),
    turn(id, 2, 11_000, 'You', "Yes, it's up.", true),
    turn(id, 3, 15_000, 'Bob B.', 'I will take the notes today.'),
    turn(id, 4, 21_000, 'Irene K.', 'Sorry I am late.'),
    turn(id, 5, 26_000, 'Sarah Brown', 'Καλημέρα σε όλους, ας ξεκινήσουμε.'),
    turn(id, 6, 4_512_000, 'Bob B.', 'That is everything from me.'),
  ];
  return { meeting, segments, captionTurns };
}

/** The captions file of `captioned()`, written out: the names the transcript shows, never a single-line correction. */
const CAPTIONS_BODY =
  '[00:04] Sarah Brown: Good morning, can everyone see the roadmap slide?\n\n' +
  "[00:11] Alex: Yes, it's up.\n\n" +
  '[00:15] Bob Brown: I will take the notes today.\n\n' +
  '[00:21] Irene Kosta: Sorry I am late.\n\n' +
  '[00:26] Sarah Brown: Καλημέρα σε όλους, ας ξεκινήσουμε.\n\n' +
  '[75:12] Bob Brown: That is everything from me.\n';

const TRANSCRIPT_BODY =
  '[00:00] Sarah Brown: Good morning everyone.\n\n' +
  '[00:02] Alex: Morning.\n\n' +
  '[00:04] Bob Brown: I can take notes.\n\n' +
  '[00:06] Mike: Thanks for that.\n';

type Saved = Awaited<ReturnType<typeof saveFrom>>;

/** Asserts a saved download is the zip of `seed`: its name, its two entries in order, and both bodies byte for byte. */
async function expectZipOf(saved: Saved, seed: SeededMeeting, captionsBody: string): Promise<void> {
  const base = baseName(seed.meeting.startedAt);
  expect(saved.download.suggestedFilename()).toBe(`${base}.zip`);
  const { names, files } = await unzipDownload(saved.download);
  const transcriptName = `${base} — Transcript.txt`.normalize('NFC');
  const captionsName = `${base} — Meet captions.txt`.normalize('NFC');
  expect(names).toEqual([transcriptName, captionsName]);
  expect([...files.keys()].sort()).toEqual([transcriptName, captionsName].sort());
  const transcript = transcriptFile(seed.meeting, seed.segments ?? []).body;
  expect(files.get(transcriptName)!.equals(utf8(transcript))).toBe(true);
  expect(files.get(captionsName)!.equals(utf8(captionsBody))).toBe(true);
}

test.describe('US1: Meet\u2019s captions come with the transcript', () => {
  test('one press saves one zip holding the transcript and the captions, each under its name, byte for byte', async ({
    context,
    extensionId,
  }) => {
    const panel = await openPanel(context, extensionId);
    const seed = captioned();
    await seedStoredMeetings(panel, [seed]);
    await expect(line(panel, 'Thanks for that.')).toBeVisible();
    const before = await panel.locator('body').innerText();
    const downloads: string[] = [];
    panel.on('download', (d) => downloads.push(d.suggestedFilename()));

    const saved = await saveFrom(panel, mainDownload(panel));
    expect(saved.download.suggestedFilename()).toBe('Meeting — 07-10-2026 at 14h30.zip');
    await expectZipOf(saved, seed, CAPTIONS_BODY);
    // 007's body, unchanged, under the new name; written out once so the formatter is not its own witness.
    expect(transcriptFile(seed.meeting, seed.segments!).body).toBe(TRANSCRIPT_BODY);

    // One press, one file; the panel says nothing about it and shows no caption sentence.
    await panel.waitForTimeout(2_000);
    expect(downloads).toEqual(['Meeting — 07-10-2026 at 14h30.zip']);
    expect(await panel.locator('body').innerText()).toBe(before);
    for (const kept of seed.captionTurns!) expect(before).not.toContain(kept.text);
  });
});

const C4 = (startedAt: number) =>
  `Delete the transcript of ${title(startedAt)} permanently? Its questions, answers, notes and Meet's captions are deleted too. It cannot be recovered.`;
const P13 = (startedAt: number) =>
  `Delete the transcript of ${title(startedAt)} permanently? Its questions, answers and notes are deleted too. It cannot be recovered.`;

/**
 * A caption turn by `name` that gains a word every `stepMs` for a minute, without waiting for it. Returns how many
 * words it showed at a moment of the machine's clock, and the text of that many words.
 */
async function startCounting(page: Page, name: string, stepMs: number) {
  const startedAt = await page.evaluate(
    ({ name, stepMs }) => {
      const region = document.querySelector('[role="region"][aria-label="Captions"]');
      if (!region) throw new Error('no captions region');
      const item = document.createElement('div');
      item.className = 'nMcdL bj4p3b';
      item.innerHTML =
        '<div class="adE6rb"><img class="Z6byG r6DyN" data-iml="9" src="https://lh3.googleusercontent.com/a/fixture-avatar-e2e=s48" alt="" />' +
        '<div class="KcIKyf jxFHg"><span class="NWpY1d"></span></div></div><div class="ygicle VbkSUe"></div>';
      item.querySelector('span')!.textContent = name;
      const text = item.querySelector('.ygicle')!;
      [...region.querySelectorAll(':scope > .nMcdL')].at(-1)!.after(item);
      const startedAt = Date.now();
      const write = () => {
        const words = Math.floor((Date.now() - startedAt) / stepMs) + 1;
        text.textContent = Array.from({ length: words }, (_, i) => `count${i + 1}`).join(' ');
        if (words < 120) setTimeout(write, stepMs);
      };
      write();
      return startedAt;
    },
    { name, stepMs },
  );
  return {
    wordsAt: (moment: number) => Math.max(1, Math.floor((moment - startedAt) / stepMs) + 1),
    textOf: (words: number) => Array.from({ length: words }, (_, i) => `count${i + 1}`).join(' '),
  };
}

test.describe('US3: captions of a running or past meeting', () => {
  test('a running meeting downloads the captions so far, a turn still changing as it stands, and capture carries on', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(120_000);
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-on');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names' });
    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On', { timeout: 10_000 });
    const meeting = (await newestMeeting(panel))!;
    const base = baseName(meeting.startedAt);

    await captionInMeet(meet.page, 'Emma Jones', ['The harbour', 'The harbour survey starts on Monday.']);
    await captionInMeet(meet.page, 'You', ['I can', 'I can bring the tide tables.']);
    // One turn keeps changing: a word more every 500 ms for a minute.
    const counting = await startCounting(meet.page, 'Tom Brown', 500);
    // The first transcript line has settled, so the meeting has both files.
    await expect(line(panel, 'Emma speaks first.')).toBeVisible({ timeout: LINE_TIMEOUT });
    await expect(line(panel, 'Emma speaks first.').locator('[data-label-pending]')).toHaveCount(0, {
      timeout: LINE_TIMEOUT,
    });
    await expect.poll(async () => (await readCaptionTurns(panel, meeting.id)).length, { timeout: 15_000 }).toBe(3);

    const captionsOf = async (saved: Saved) => {
      expect(saved.download.suggestedFilename()).toBe(`${base}.zip`);
      const { names, files } = await unzipDownload(saved.download);
      expect(names).toEqual([`${base} — Transcript.txt`, `${base} — Meet captions.txt`]);
      expect(files.get(names[0]!)!.toString('utf8')).toContain('Emma speaks first.\n');
      return files.get(names[1]!)!.toString('utf8').slice(0, -1).split('\n\n');
    };
    /** The counting turn's line holds a text the page showed between five seconds before the press and its end. */
    const expectFresh = (lineText: string, pressedAt: number, savedAt: number) => {
      const said = /^\[\d\d:\d\d\] Tom Brown: (.+)$/.exec(lineText)?.[1] ?? '';
      const words = said.split(' ').length;
      expect(said).toBe(counting.textOf(words));
      expect(words).toBeGreaterThanOrEqual(counting.wordsAt(pressedAt - 5_000));
      expect(words).toBeLessThanOrEqual(counting.wordsAt(savedAt));
      return words;
    };

    let pressedAt = Date.now();
    const first = await captionsOf(await saveFrom(panel, mainDownload(panel)));
    expect(first).toHaveLength(3);
    expect(first[0]).toMatch(/^\[00:\d\d\] Emma Jones: The harbour survey starts on Monday\.$/);
    expect(first[1]).toMatch(/^\[00:\d\d\] Alex: I can bring the tide tables\.$/);
    const wordsThen = expectFresh(first[2]!, pressedAt, Date.now());

    // A few seconds later: the later text of that turn, and the turn since.
    await captionInMeet(meet.page, 'Emma Jones', ['And the', 'And the ferry leaves at nine.']);
    await meet.page.waitForTimeout(4_000);
    pressedAt = Date.now();
    const second = await captionsOf(await saveFrom(panel, mainDownload(panel)));
    expect(second).toHaveLength(4);
    expect(second.slice(0, 2)).toEqual(first.slice(0, 2));
    expect(expectFresh(second[2]!, pressedAt, Date.now())).toBeGreaterThan(wordsThen);
    expect(second[3]).toMatch(/^\[00:\d\d\] Emma Jones: And the ferry leaves at nine\.$/);

    // Transcription and capture carry on after both.
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(line(panel, 'This is me speaking.')).toBeVisible({ timeout: 30_000 });
    await captionInMeet(meet.page, 'You', ['Agreed', 'Agreed, nine it is.']);
    await expect
      .poll(async () => (await readCaptionTurns(panel, meeting.id)).map((t) => t.text).at(-1), { timeout: 15_000 })
      .toBe('Agreed, nine it is.');
    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('the Transcripts screen saves the same zip from a row and from the meeting, and its delete names the captions', async ({
    context,
    extensionId,
  }) => {
    const panel = await openPanel(context, extensionId);
    const middle = captioned();
    const newest: SeededMeeting = {
      meeting: storedMeeting({ id: 'm-new', startedAt: at(9, 10, 0), hasCaptions: true }),
      segments: [storedSegment('m-new', 0, { text: 'Newest meeting line.', ...spokenBy('Jane') })],
      captionTurns: [turn('m-new', 1, 2_000, 'Jane', 'The ferry leaves at nine.')],
    };
    const oldest: SeededMeeting = {
      meeting: storedMeeting({ id: 'm-old', startedAt: at(5, 16, 0) }),
      segments: [storedSegment('m-old', 0, { text: 'Oldest meeting line.' })],
    };
    await seedStoredMeetings(panel, [newest, middle, oldest]);
    await expect(line(panel, 'Newest meeting line.')).toBeVisible();
    await transcriptsButton(panel).click();
    await expect(rows(panel)).toHaveCount(3);

    // The row: the same name and the same two entries the main view saves for this seed (US1 above).
    const inRow = row(panel, 'm-cap').getByRole('button', { name: `Download transcript of ${title(at(7, 14, 30))}` });
    await expect(inRow).toHaveText('Download transcript');
    const before = await transcriptsScreen(panel).innerText();
    await expectZipOf(await saveFrom(panel, inRow), middle, CAPTIONS_BODY);
    expect(await transcriptsScreen(panel).innerText()).toBe(before);
    for (const kept of middle.captionTurns!) expect(before).not.toContain(kept.text);

    // A row without captions asks as before 013.
    await row(panel, 'm-old')
      .getByRole('button', { name: /^Delete transcript of / })
      .click();
    await expect(confirmation(panel).locator('p').first()).toHaveText(P13(at(5, 16, 0)));
    await confirmation(panel).getByRole('button', { name: 'Cancel' }).click();

    // The meeting itself: the same zip, and a confirmation that names Meet's captions.
    await openControl(panel, at(7, 14, 30)).click();
    await expect(transcriptsScreen(panel).getByText('Thanks for that.')).toBeVisible();
    const here = panel.locator('.past-actions');
    await expectZipOf(
      await saveFrom(panel, here.getByRole('button', { name: 'Download transcript', exact: true })),
      middle,
      CAPTIONS_BODY,
    );
    const shown = await transcriptsScreen(panel).innerText();
    for (const kept of middle.captionTurns!) expect(shown).not.toContain(kept.text);
    await here.getByRole('button', { name: 'Delete transcript', exact: true }).click();
    await expect(confirmation(panel).locator('p').first()).toHaveText(C4(at(7, 14, 30)));
    await confirmation(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(rows(panel)).toHaveCount(2);

    // SC-005: none of its caption turns is left, and the newest meeting's are intact.
    const stores = await readAllStores(panel);
    expect(stores.captionTurns).toEqual(newest.captionTurns);
    const everything = JSON.stringify(stores);
    expect(everything).not.toContain('m-cap');
    for (const kept of middle.captionTurns!) expect(everything).not.toContain(kept.text);
  });
});

const K6 = 'Delete this transcript permanently? It cannot be recovered.';
const C3 =
  "Delete this transcript permanently? Meet's captions of this meeting are deleted too. It cannot be recovered.";
const mainDelete = (panel: Page) =>
  panel.locator('.main-view').getByRole('button', { name: 'Delete transcript', exact: true });
const mainConfirmation = (panel: Page) => panel.locator('.main-view').getByRole('group', { name: 'Confirm delete' });

// Pinning (T049): what US1 and US3 built must leave these as they were, or as the spec says for a captions-only meeting.
test.describe('US4: meetings without captions, and captions without a transcript', () => {
  test('a meeting on a site that is not Meet keeps no captions and downloads the transcript alone', async ({
    context,
    extensionId,
  }) => {
    const meetingTab = await openMeetingTab(context, extensionId);
    const panel = await openPanel(context, extensionId, meetingTab);
    await seedSettings(panel);
    await panel.getByRole('button', { name: 'Start' }).click();
    await expect(line(panel, 'Hello everyone.')).toBeVisible({ timeout: LINE_TIMEOUT });
    await expect(line(panel, 'This is me speaking.')).toBeVisible({ timeout: LINE_TIMEOUT });
    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
    const meeting = (await newestMeeting(panel))!;
    expect(meeting).not.toHaveProperty('hasCaptions');

    const downloads: string[] = [];
    panel.on('download', (d) => downloads.push(d.suggestedFilename()));
    const saved = await saveFrom(panel, mainDownload(panel));
    expect(saved.download.suggestedFilename()).toBe(`${baseName(meeting.startedAt)} — Transcript.txt`);
    // The body of before 013: 007's lines, nothing else.
    const body = saved.bytes.toString('utf8');
    expect(body).toContain('] Others: Hello everyone.\n');
    expect(body).toContain('] Others: This is me speaking.\n');
    for (const written of body.slice(0, -1).split('\n\n'))
      expect(written).toMatch(/^\[\d{2,}:\d{2}\] [^:\n]+: [^\n]+$/);
    await panel.waitForTimeout(1_000);
    expect(downloads).toHaveLength(1);
    expect((await readAllStores(panel)).captionTurns).toEqual([]);
    await mainDelete(panel).click();
    await expect(mainConfirmation(panel).locator('p').first()).toHaveText(K6);
    await expect(panel.locator('.main-view')).not.toContainText("Meet's captions");
  });

  test('a meeting with kept captions and no transcript line downloads the captions file from all three places', async ({
    context,
    extensionId,
  }) => {
    const panel = await openPanel(context, extensionId);
    const startedAt = at(8, 9, 15);
    const captionsOnly: SeededMeeting = {
      meeting: storedMeeting({ id: 'm-quiet', startedAt, endedAt: startedAt + 20 * MIN, hasCaptions: true }),
      captionTurns: [
        turn('m-quiet', 1, 3_000, 'Sarah Brown', 'Can you hear me?'),
        turn('m-quiet', 2, 9_000, 'You', 'Όχι ακόμα, δοκίμασε ξανά.', true),
      ],
    };
    const neither: SeededMeeting = { meeting: storedMeeting({ id: 'm-none', startedAt: at(6, 9, 0) }) };
    await seedStoredMeetings(panel, [captionsOnly, neither]);
    const name = `${baseName(startedAt)} — Meet captions.txt`;
    const expected = utf8('[00:03] Sarah Brown: Can you hear me?\n\n[00:09] Alex: Όχι ακόμα, δοκίμασε ξανά.\n');
    const expectCaptionsFile = (saved: Saved) => {
      expect(saved.download.suggestedFilename()).toBe(name);
      expect(saved.bytes.equals(expected)).toBe(true);
    };

    // Main view: no line, and the two actions.
    await expect(panel.getByRole('region', { name: 'Transcript', exact: true })).toContainText('No transcript yet.');
    expectCaptionsFile(await saveFrom(panel, mainDownload(panel)));
    await mainDelete(panel).click();
    await expect(mainConfirmation(panel).locator('p').first()).toHaveText(C3);
    await mainConfirmation(panel).getByRole('button', { name: 'Cancel' }).click();

    // Its row, and its single-meeting view beside `Nothing was transcribed.`.
    await transcriptsButton(panel).click();
    await expect(rows(panel)).toHaveCount(2);
    await expect(row(panel, 'm-quiet')).toContainText('Nothing was transcribed.');
    expectCaptionsFile(
      await saveFrom(panel, row(panel, 'm-quiet').getByRole('button', { name: /^Download transcript of / })),
    );
    await openControl(panel, startedAt).click();
    await expect(panel.locator('.past-transcript')).toContainText('Nothing was transcribed.');
    await expect(panel.locator('.past-actions').getByRole('button')).toHaveText([
      'Download transcript',
      'Delete transcript',
    ]);
    expectCaptionsFile(
      await saveFrom(
        panel,
        panel.locator('.past-actions').getByRole('button', { name: 'Download transcript', exact: true }),
      ),
    );

    // A meeting with neither has no Download anywhere.
    await transcriptsScreen(panel).getByRole('button', { name: 'Back' }).click();
    await expect(row(panel, 'm-none').getByRole('button', { name: /^Download transcript/ })).toHaveCount(0);
    await openControl(panel, at(6, 9, 0)).click();
    await expect(panel.locator('.past-actions').getByRole('button')).toHaveText(['Delete transcript']);
  });

  test('a database from before 013 lists, opens, downloads and deletes as before', async ({ context, extensionId }) => {
    const panel = await openPanel(context, extensionId);
    const newer: SeededMeeting = {
      meeting: storedMeeting({ id: 'm-v3a', startedAt: at(7, 14, 30) }),
      segments: [
        storedSegment('m-v3a', 0, { text: 'Stored before captions were kept.', ...spokenBy('Jane') }),
        storedSegment('m-v3a', 1, { text: 'Second old line.' }),
      ],
    };
    const older: SeededMeeting = {
      meeting: storedMeeting({ id: 'm-v3b', startedAt: at(5, 16, 0) }),
      segments: [storedSegment('m-v3b', 0, { text: 'An older old line.' })],
    };
    await seedStoredMeetings(panel, [newer, older], { dbVersion: 3 });
    // The panel opened it and added the empty store; every record is as seeded.
    await expect(line(panel, 'Stored before captions were kept.')).toBeVisible();
    const stores = await readAllStores(panel);
    expect(stores.captionTurns).toEqual([]);
    expect(stores.meetings).toHaveLength(2);
    expect(stores.segments).toHaveLength(3);

    const body = utf8('[00:00] Jane: Stored before captions were kept.\n\n[00:02] Others: Second old line.\n');
    const fromMain = await saveFrom(panel, mainDownload(panel));
    expect(fromMain.download.suggestedFilename()).toBe('Meeting — 07-10-2026 at 14h30 — Transcript.txt');
    expect(fromMain.bytes.equals(body)).toBe(true);
    await mainDelete(panel).click();
    await expect(mainConfirmation(panel).locator('p').first()).toHaveText(K6);
    await mainConfirmation(panel).getByRole('button', { name: 'Cancel' }).click();

    await transcriptsButton(panel).click();
    await expect(rows(panel)).toHaveCount(2);
    const fromRow = await saveFrom(
      panel,
      row(panel, 'm-v3a').getByRole('button', { name: /^Download transcript of / }),
    );
    expect(fromRow.download.suggestedFilename()).toBe('Meeting — 07-10-2026 at 14h30 — Transcript.txt');
    expect(fromRow.bytes.equals(body)).toBe(true);
    await openControl(panel, at(5, 16, 0)).click();
    await expect(transcriptsScreen(panel).getByText('An older old line.')).toBeVisible();
    await panel.locator('.past-actions').getByRole('button', { name: 'Delete transcript', exact: true }).click();
    await expect(confirmation(panel).locator('p').first()).toHaveText(P13(at(5, 16, 0)));
    await confirmation(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(rows(panel)).toHaveCount(1);
    expect(((await readAllStores(panel)).meetings as { id: string }[]).map((m) => m.id)).toEqual(['m-v3a']);
  });
});

/** axe (WCAG 2.1 A/AA) in the light and the dark colour scheme. */
async function expectNoAxeViolations(panel: Page, state: string): Promise<void> {
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

/** How far the page itself scrolls beyond the panel: zero on every screen (006 FR-023). */
const pageHeights = (panel: Page) =>
  panel.evaluate(() => ({ page: document.documentElement.scrollHeight, panel: window.innerHeight }));

function builtFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? builtFiles(path) : [path];
  });
}

test.describe('Cross-cutting: off the network, quick, accessible, and nothing new said', () => {
  test('a whole Meet meeting with marked captions, a question, a download and a delete sends no caption text anywhere', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(120_000);
    const watch = await watchForMarker(context);
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-on');
    const panel = await openPanel(context, extensionId, meet.tabId);
    await seedSettings(panel, { scenario: 'names', consentReminder: true });
    // A chat key for the provider the settings name; answers come from the fixture provider (no network).
    await panel.evaluate(() => chrome.storage.local.set({ openaiCredential: 'test-openai-e2e-0001' }));
    await panel.reload();

    await panel.getByRole('button', { name: 'Start' }).click();
    await panel.getByRole('button', { name: "I've told them — start" }).click();
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(statusDot(panel, 'Speaker names')).toHaveAttribute('title', 'Speaker names: On', { timeout: 10_000 });
    const meeting = (await newestMeeting(panel))!;
    await captionInMeet(meet.page, 'Emma Jones', ['The', `The plan stands. ${CAPTION_MARKER}`]);
    await captionInMeet(meet.page, 'You', ['Ναι', `Ναι. ${CAPTION_MARKER_GREEK}`]);
    await expect.poll(async () => (await readCaptionTurns(panel, meeting.id)).length, { timeout: 15_000 }).toBe(2);
    await expect(line(panel, 'Emma speaks first.')).toBeVisible({ timeout: LINE_TIMEOUT });
    await expect(line(panel, 'Emma speaks first.').locator('[data-label-pending]')).toHaveCount(0, {
      timeout: LINE_TIMEOUT,
    });

    // Ask: what goes to the chat provider is the transcript, and none of the captions (decision 72).
    const box = panel.getByRole('textbox', { name: 'Question' });
    await box.fill('What was said first?');
    await box.press('Enter');
    const reply = panel
      .getByRole('region', { name: 'Questions and answers' })
      .getByRole('article', { name: 'What was said first?' });
    await expect(reply).not.toHaveAttribute('aria-busy', 'true', { timeout: 30_000 });
    const sent = await panel.evaluate(() => chrome.storage.local.get('e2eLastChatRequest'));
    expect(JSON.stringify(sent)).toContain('Emma speaks first.');
    expect(holdsMarker(sent)).toBe(false);

    // Download: the captions are in the file, and only there.
    const saved = await saveFrom(panel, mainDownload(panel));
    const { names, files } = await unzipDownload(saved.download);
    expect(holdsMarker(files.get(names[1]!)!.toString('utf8'))).toBe(true);
    expect(holdsMarker(files.get(names[0]!)!.toString('utf8'))).toBe(false);
    expect(holdsMarker(await panel.locator('body').innerText())).toBe(false);

    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Start' })).toBeVisible();
    // Everything stored: the marker is in captionTurns and in no other store, nor in chrome.storage.
    const stores = await readAllStores(panel);
    expect(holdsMarker(stores.captionTurns)).toBe(true);
    const { captionTurns: _kept, ...others } = stores;
    expect(holdsMarker(others)).toBe(false);
    expect(holdsMarker(await panel.evaluate(() => chrome.storage.local.get(null)))).toBe(false);

    await transcriptsButton(panel).click();
    await expect(rows(panel)).toHaveCount(1);
    expect(holdsMarker(await transcriptsScreen(panel).innerText())).toBe(false);
    await row(panel, meeting.id)
      .getByRole('button', { name: /^Delete transcript of / })
      .click();
    await expect(confirmation(panel).locator('p').first()).toHaveText(C4(meeting.startedAt));
    await confirmation(panel).getByRole('button', { name: 'Delete permanently' }).click();
    await expect(transcriptsScreen(panel).getByText('No transcripts stored.')).toBeVisible();
    expect(holdsMarker(await readAllStores(panel))).toBe(false);

    expect(watch.problems()).toEqual([]);
  });

  test('a 3-hour meeting (5,000 lines, 1,200 caption turns) is in Downloads within two seconds of the press (SC-008)', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(120_000);
    const panel = await openPanel(context, extensionId);
    const startedAt = at(7, 14, 30);
    const long: SeededMeeting = {
      meeting: storedMeeting({ id: 'm-3h', startedAt, endedAt: startedAt + 180 * MIN, hasCaptions: true }),
      segments: longTranscript('m-3h', 5_000),
      captionTurns: Array.from({ length: 1_200 }, (_, i) =>
        turn(
          'm-3h',
          i + 1,
          i * 9_000,
          ['Jane', 'Mike', 'Tom', 'You'][i % 4]!,
          `Caption turn ${i + 1} with about a hundred and thirty characters of ordinary invented meeting speech in it, give or take a few words.`,
          i % 4 === 3,
        ),
      ),
    };
    await seedStoredMeetings(panel, [long]);
    await expect(panel.locator('.main-view .transcript-scroll li')).toHaveCount(5_000, { timeout: 30_000 });

    // Timed in the panel, from the press to the moment the file is handed to Chrome's downloads: reading the stored
    // lines and captions, building both files and the zip. (Timing it from the test also counted the test's own
    // round trips and its reading back of the saved file, which is not what SC-008 is about.)
    await panel.evaluate(() => {
      const w = window as unknown as { pressedAt: number; handedOverAt: number };
      const click = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'click')!.value as (
        this: HTMLElement,
      ) => void;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        if (this.download !== '') w.handedOverAt = performance.now();
        click.call(this);
      };
      document.addEventListener('click', () => (w.pressedAt ??= performance.now()), true);
    });
    const saved = await saveFrom(panel, mainDownload(panel));
    const took = await panel.evaluate(() => {
      const w = window as unknown as { pressedAt: number; handedOverAt: number };
      return w.handedOverAt - w.pressedAt;
    });
    expect(took).toBeGreaterThan(0);
    expect(took).toBeLessThan(2_000);
    expect(saved.download.suggestedFilename()).toBe('Meeting — 07-10-2026 at 14h30.zip');
    expect(saved.bytes.length).toBeLessThan(2_000_000);
    const { names, files } = await unzipDownload(saved.download);
    expect(files.get(names[0]!)!.toString('utf8').split('\n\n')).toHaveLength(5_000);
    expect(files.get(names[1]!)!.toString('utf8').split('\n\n')).toHaveLength(1_200);
  });

  test('the reminder and the two confirmations that name the captions are accessible and never make the page scroll', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(90_000);
    // The reminder on a Meet call, at the narrowest panel width: K1, with no sentence about captions (decision 79).
    const meet = await openMeetPage(context, extensionId, 'in-call-captions-on');
    const onMeet = await openPanel(context, extensionId, meet.tabId);
    await onMeet.setViewportSize({ width: 320, height: 600 });
    await seedSettings(onMeet, { consentReminder: true });
    await onMeet.getByRole('button', { name: 'Start' }).click();
    await expect(onMeet.getByRole('alertdialog', { name: 'Consent reminder' })).toContainText(
      'the transcript is kept on this computer. You can turn this reminder off in Settings.',
    );
    await expect(onMeet.getByRole('alertdialog', { name: 'Consent reminder' })).not.toContainText(/caption/i);
    await expectNoAxeViolations(onMeet, 'the reminder on a Meet call');
    expect(await pageHeights(onMeet)).toEqual({ page: 600, panel: 600 });
    await onMeet.getByRole('button', { name: 'Cancel' }).click();
    await onMeet.close();

    const panel = await openPanel(context, extensionId);
    await panel.setViewportSize({ width: 320, height: 600 });
    await seedStoredMeetings(panel, [captioned()]);
    await expect(line(panel, 'Thanks for that.')).toBeVisible();
    await mainDelete(panel).click();
    await expect(mainConfirmation(panel).locator('p').first()).toHaveText(C3);
    await expectNoAxeViolations(panel, 'the main view with C3 open');
    expect(await pageHeights(panel)).toEqual({ page: 600, panel: 600 });
    await mainConfirmation(panel).getByRole('button', { name: 'Cancel' }).click();

    await transcriptsButton(panel).click();
    await row(panel, 'm-cap')
      .getByRole('button', { name: /^Delete transcript of / })
      .click();
    await expect(confirmation(panel).locator('p').first()).toHaveText(C4(at(7, 14, 30)));
    await expectNoAxeViolations(panel, 'the Transcripts screen with C4 open in a row');
    expect(await pageHeights(panel)).toEqual({ page: 600, panel: 600 });
    await confirmation(panel).getByRole('button', { name: 'Cancel' }).click();
    await openControl(panel, at(7, 14, 30)).click();
    await panel.locator('.past-actions').getByRole('button', { name: 'Delete transcript', exact: true }).click();
    await expect(confirmation(panel).locator('p').first()).toHaveText(C4(at(7, 14, 30)));
    await expectNoAxeViolations(panel, 'one meeting with C4 open');
    expect(await pageHeights(panel)).toEqual({ page: 600, panel: 600 });
  });

  test('the built panel says none of the things the copy review rules out', () => {
    const files = builtFiles(extensionPath).filter((f) => /\.(js|html)$/.test(f));
    expect(files.length).toBeGreaterThan(3);
    // contracts/download-ui.md "Never add": a kept-captions badge or count, a line about the zip, a second button, a
    // message that a meeting has no captions, a "Downloaded" message, a setting for keeping captions.
    const never = [
      /captions kept/i,
      /captions (are|were|being) kept/i,
      // C2's sentence, withdrawn by decision 79: a removed string (copy-review W1).
      /captions of the meeting are kept/i,
      /keep (meet(['’]s)? )?captions/i,
      /(has|have|with) no captions/i,
      /\bDownloaded\b/,
      /download (meet(['’]s)? )?captions/i,
      /\bas a zip\b/i,
      /zip (holds|contains)/i,
    ];
    const hits = files.flatMap((f) => {
      const body = readFileSync(f, 'utf8');
      return never
        .filter((pattern) => pattern.test(body))
        .map((pattern) => `${String(pattern)} in ${relative(extensionPath, f)}`);
    });
    expect(hits).toEqual([]);
    // The reminder is in the build, whole: K1's two sentences about what is kept and the setting, with nothing between.
    const reminder = files.filter((f) =>
      readFileSync(f, 'utf8').includes(
        'the transcript is kept on this computer. You can turn this reminder off in Settings.',
      ),
    );
    expect(reminder.length).toBeGreaterThan(0);
  });
});
