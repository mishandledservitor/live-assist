// 012 T014 (US1; contracts/transcripts-ui.md "A row", data-model.md "Row"): one stored meeting in the Transcripts
// list — when it started, how long it ran, who spoke, and its marker. T031 (US2): its Delete and the confirmation.
// T045 (US4): its Download. 013 T047 (FR-018, FR-019, FR-022): Download for a meeting with kept captions, what a press
// saves, and the confirmation that names the captions (C4).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meetingDownload } from '@/core/export/meeting-download';
import { summariseMeeting, type MeetingState } from '@/core/history/meeting-summary';
import type { Meeting, MeetingSummary, TranscriptSegment } from '@/core/transcript/model';
import { MeetingRow, type MeetingRowProps } from '@/entrypoints/sidepanel/components/MeetingRow';
import {
  meetingWithCaptions,
  spokenBy,
  spokenBySelf,
  storedCaptionTurn,
  storedMeeting,
  storedSegment,
  titled,
} from '../../support/stored-meetings';

afterEach(cleanup);

const OPEN = 'Open transcript of 7 Oct 2026, 14:30';
const AT = new Date(2026, 9, 12, 9, 41);
const TEXT = 'text/plain;charset=utf-8';

function setup(
  over: {
    meeting?: Meeting;
    segments?: TranscriptSegment[];
    state?: MeetingState;
    summary?: MeetingSummary | null;
  } & Partial<MeetingRowProps> = {},
) {
  const { meeting = storedMeeting(), segments = [], state = 'stopped', summary, ...rest } = over;
  const props: MeetingRowProps = {
    meeting,
    state,
    summary: summary === undefined ? summariseMeeting(meeting, segments) : summary,
    onOpen: vi.fn(),
    load: vi.fn(() => Promise.resolve(meetingDownload({ meeting, segments }, AT))),
    save: vi.fn(),
    remove: vi.fn(() => Promise.resolve()),
    onDeleted: vi.fn(),
    confirming: false,
    onConfirmingChange: vi.fn(),
    ...rest,
  };
  render(
    <ul>
      <MeetingRow {...props} />
    </ul>,
  );
  return props;
}

const item = () => screen.getByRole('listitem');
const opener = () => screen.getByRole('button', { name: OPEN });
/** What `aria-describedby` on the opening control reads out. */
const description = () =>
  (opener().getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id !== '')
    .map((id) => document.getElementById(id)?.textContent ?? `missing ${id}`)
    .join(' | ');

const mixed = [
  storedSegment('m1', 0, spokenBy('Jane')),
  storedSegment('m1', 1, spokenBySelf()),
  storedSegment('m1', 2),
];

// 012 T056 (FR-028, FR-031; design decision 76): the meeting's title is the row's first line.
describe('MeetingRow: the title line (012 decision 76)', () => {
  const TITLED = 'Open transcript of Weekly sync, 7 Oct 2026, 14:30';
  const titledOpener = () => screen.getByRole('button', { name: TITLED });

  it('a meeting with a title shows it first, with the date line under it and then the names', () => {
    setup({ meeting: storedMeeting({ source: titled('Weekly sync') }), segments: mixed });
    const open = titledOpener();
    expect([...open.children].map((el) => `${el.tagName.toLowerCase()}.${el.className}`)).toEqual([
      'span.meeting-title',
      'span.meeting-when',
    ]);
    expect(open.querySelector('.meeting-title')!.textContent).toBe('Weekly sync');
    expect(open.querySelector('.meeting-when')!.textContent).toBe('7 Oct 2026 · 14:30 · 45 min');
    expect(item().textContent).toBe(
      'Weekly sync7 Oct 2026 · 14:30 · 45 minJane, AlexDownload transcriptDelete transcript',
    );
    expect(screen.queryByRole('button', { name: OPEN })).toBeNull();
  });

  it('the whole title is on hover, however long it is', () => {
    const long = 'Quarterly planning and budget review with the whole department '.repeat(4).trim();
    setup({ meeting: storedMeeting({ source: titled(long) }) });
    const line = item().querySelector('.meeting-title')!;
    expect(line.textContent).toBe(long);
    expect(line.getAttribute('title')).toBe(long);
    expect(screen.getByRole('button', { name: `Open transcript of ${long}, 7 Oct 2026, 14:30` })).toBeTruthy();
  });

  it('selecting the title opens the meeting', () => {
    const props = setup({ meeting: storedMeeting({ id: 'm7', source: titled('Weekly sync') }) });
    fireEvent.click(item().querySelector('.meeting-title')!);
    expect(props.onOpen).toHaveBeenCalledWith('m7');
  });

  it('a Meet call without a name has no title line and nothing in its place', () => {
    setup({ segments: mixed });
    expect(item().querySelector('.meeting-title')).toBeNull();
    expect([...opener().children].map((el) => el.className)).toEqual(['meeting-when']);
    expect(item().textContent).toBe('7 Oct 2026 · 14:30 · 45 minJane, AlexDownload transcriptDelete transcript');
  });

  it.each(['', 'Meet', 'Meet – abc-defg-hij'])('a stored title of %j gives no title line', (title) => {
    setup({ meeting: storedMeeting({ source: { ...storedMeeting().source, title } }) });
    expect(item().querySelector('.meeting-title')).toBeNull();
    expect(opener()).toBeTruthy();
  });

  it('a title from another site is shown as stored', () => {
    const source = {
      url: 'https://example.com/call',
      title: 'Quarterly planning - Zoom',
      platform: 'generic' as const,
    };
    setup({ meeting: storedMeeting({ source }) });
    expect(item().querySelector('.meeting-title')!.textContent).toBe('Quarterly planning - Zoom');
  });

  it('the running meeting shows its title too', () => {
    setup({
      meeting: storedMeeting({ source: titled('Weekly sync'), endedAt: null, endReason: null }),
      state: 'in-progress',
      summary: null,
    });
    expect(item().textContent).toBe('Weekly sync7 Oct 2026 · 14:30In progress');
    expect(titledOpener().getAttribute('aria-describedby')).not.toBeNull();
  });

  it('a title is text, never markup', () => {
    const markup = '<img src=x onerror=alert(1)><b>Roadmap</b>';
    setup({ meeting: storedMeeting({ source: titled(markup) }) });
    const line = item().querySelector('.meeting-title')!;
    expect(line.textContent).toBe(markup);
    expect(line.children).toHaveLength(0);
    expect(item().querySelector('img, b')).toBeNull();
  });

  it('Download, Delete and the confirmation still name the meeting by date and time', () => {
    setup({ meeting: storedMeeting({ source: titled('Weekly sync') }), segments: mixed, confirming: true });
    expect(screen.getByRole('button', { name: 'Download transcript of 7 Oct 2026, 14:30' })).toBeTruthy();
    expect(item().textContent).toContain('Delete the transcript of 7 Oct 2026, 14:30 permanently?');
    expect(item().textContent.match(/Weekly sync/g)).toHaveLength(1);
  });
});

describe('MeetingRow (012 US1)', () => {
  it('a stopped meeting reads date · time · duration in its opening control, described by who spoke', () => {
    setup({ segments: mixed });
    expect(opener().textContent).toBe('7 Oct 2026 · 14:30 · 45 min');
    expect(opener().classList.contains('meeting-open')).toBe(true);
    expect(opener().querySelector('span.meeting-when')!.textContent).toBe('7 Oct 2026 · 14:30 · 45 min');
    expect(item().querySelector('.meeting-names')!.textContent).toBe('Jane, Alex');
    expect(description()).toBe('Jane, Alex');
    expect(item().querySelector('.meeting-marker')).toBeNull();
    expect(item().textContent).not.toContain('Others');
  });

  it('carries the meeting id and its state', () => {
    setup({ meeting: storedMeeting({ id: 'm42' }) });
    expect(item().getAttribute('data-meeting-id')).toBe('m42');
    expect(item().getAttribute('data-state')).toBe('stopped');
  });

  it('shows four names and counts the rest', () => {
    const names = ['Jane', 'Mike', 'Tom', 'Bob', 'Sarah', 'Mary'];
    setup({ segments: names.map((n, i) => storedSegment('m1', i, spokenBy(n))) });
    expect(item().querySelector('.meeting-names')!.textContent).toBe('Jane, Mike, Tom, Bob +2 more');
  });

  it('shows no names, and nothing in their place, when every line is "Others"', () => {
    setup({ segments: [storedSegment('m1', 0), storedSegment('m1', 1)] });
    expect(item().querySelector('.meeting-names')).toBeNull();
    expect(item().textContent).toBe('7 Oct 2026 · 14:30 · 45 minDownload transcriptDelete transcript');
    expect(opener().hasAttribute('aria-describedby')).toBe(false);
  });

  it('a meeting with no line says nothing was transcribed where the names would be', () => {
    setup({ segments: [] });
    expect(item().textContent).toBe('7 Oct 2026 · 14:30 · 45 minNothing was transcribed.Delete transcript');
    expect(description()).toBe('Nothing was transcribed.');
  });

  it('an interrupted meeting is marked and measured to its last line', () => {
    const meeting = storedMeeting({ endedAt: null, endReason: null });
    const segments = [storedSegment('m1', 0, spokenBy('Tom')), storedSegment('m1', 1, { startMs: 12 * 60_000 })];
    setup({ meeting, segments, state: 'interrupted' });
    expect(opener().textContent).toBe('7 Oct 2026 · 14:30 · 12 min');
    expect(item().querySelector('.meeting-marker')!.textContent).toBe('Interrupted');
    expect(item().getAttribute('data-state')).toBe('interrupted');
    expect(description()).toBe('Interrupted | Tom');
  });

  it('an interrupted meeting closed at the next Start is not measured to that closing time', () => {
    const meeting = storedMeeting({ endedAt: storedMeeting().startedAt + 3 * 86_400_000, endReason: 'crashed' });
    setup({ meeting, segments: [storedSegment('m1', 0, { startMs: 5 * 60_000 })], state: 'interrupted' });
    expect(opener().textContent).toBe('7 Oct 2026 · 14:30 · 5 min');
  });

  it('an interrupted meeting with no line shows no duration', () => {
    setup({ meeting: storedMeeting({ endedAt: null, endReason: null }), state: 'interrupted' });
    expect(opener().textContent).toBe('7 Oct 2026 · 14:30');
    expect(item().textContent).toBe('7 Oct 2026 · 14:30InterruptedNothing was transcribed.Delete transcript');
  });

  it('the running meeting is marked In progress and shows no duration and no names', () => {
    setup({ meeting: storedMeeting({ endedAt: null, endReason: null }), state: 'in-progress', summary: null });
    expect(opener().textContent).toBe('7 Oct 2026 · 14:30');
    expect(item().querySelector('.meeting-marker')!.textContent).toBe('In progress');
    expect(item().getAttribute('data-state')).toBe('in-progress');
    expect(description()).toBe('In progress');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('before its details are ready a row shows date, time, duration and the opening control, and no names', () => {
    setup({ summary: null });
    expect(item().textContent).toBe('7 Oct 2026 · 14:30 · 45 minDelete transcript');
    expect(opener()).toBeTruthy();
  });

  it('before its details are ready an interrupted row shows no duration yet', () => {
    setup({ meeting: storedMeeting({ endedAt: null, endReason: null }), state: 'interrupted', summary: null });
    expect(item().textContent).toBe('7 Oct 2026 · 14:30InterruptedDelete transcript');
  });

  it('pressing the opening control opens that meeting', () => {
    const props = setup({ meeting: storedMeeting({ id: 'm42' }) });
    fireEvent.click(opener());
    expect(props.onOpen).toHaveBeenCalledTimes(1);
    expect(props.onOpen).toHaveBeenCalledWith('m42');
  });
});

const DELETE = 'Delete transcript of 7 Oct 2026, 14:30';
const P13 =
  'Delete the transcript of 7 Oct 2026, 14:30 permanently? Its questions, answers and notes are deleted too. It cannot be recovered.';

describe('MeetingRow: delete (012 US2)', () => {
  it('a stopped row has Delete, named for its meeting, after the opening control', () => {
    setup({ segments: mixed });
    const del = screen.getByRole('button', { name: DELETE });
    expect(del.textContent).toBe('Delete transcript');
    expect(opener().compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('an interrupted row has Delete too; the running row has none', () => {
    setup({ meeting: storedMeeting({ endedAt: null, endReason: null }), state: 'interrupted' });
    expect(screen.getByRole('button', { name: DELETE })).toBeTruthy();
    cleanup();
    setup({ meeting: storedMeeting({ endedAt: null, endReason: null }), state: 'in-progress', summary: null });
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('pressing Delete asks the list to open this row\u2019s confirmation', () => {
    const props = setup({ meeting: storedMeeting({ id: 'm42' }) });
    fireEvent.click(screen.getByRole('button', { name: DELETE }));
    expect(props.onConfirmingChange).toHaveBeenCalledWith('m42', true);
    expect(props.remove).not.toHaveBeenCalled();
  });

  it('the open confirmation names the meeting and what is deleted with it, in place of Delete', () => {
    setup({ confirming: true });
    const confirm = screen.getByRole('group', { name: 'Confirm delete' });
    expect(item().contains(confirm)).toBe(true);
    expect(within(confirm).getByText(P13)).toBeTruthy();
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Delete permanently' }));
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: DELETE })).toBeNull();
  });

  it('confirming deletes that meeting and reports it; cancelling asks to close and deletes nothing', async () => {
    const props = setup({ meeting: storedMeeting({ id: 'm42' }), confirming: true });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onConfirmingChange).toHaveBeenCalledWith('m42', false);
    expect(props.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith('m42'));
    expect(props.remove).toHaveBeenCalledTimes(1);
    expect(props.remove).toHaveBeenCalledWith('m42');
  });

  it('a failed deletion says so in the confirmation and reports nothing', async () => {
    const props = setup({ confirming: true, remove: vi.fn(() => Promise.reject(new Error('blocked'))) });
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("Couldn't delete this transcript. Try again.");
    expect(screen.getByRole('group', { name: 'Confirm delete' }).contains(alert)).toBe(true);
    expect(props.onDeleted).not.toHaveBeenCalled();
    expect(opener()).toBeTruthy();
  });
});

const DOWNLOAD = 'Download transcript of 7 Oct 2026, 14:30';

describe('MeetingRow: download (012 US4)', () => {
  it('a stopped row whose file would have a line has Download, named for its meeting, before Delete', () => {
    setup({ segments: mixed });
    const download = screen.getByRole('button', { name: DOWNLOAD });
    expect(download.textContent).toBe('Download transcript');
    const del = screen.getByRole('button', { name: DELETE });
    expect(opener().compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(download.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('an interrupted row with lines has it too', () => {
    setup({ meeting: storedMeeting({ endedAt: null, endReason: null }), segments: mixed, state: 'interrupted' });
    expect(screen.getByRole('button', { name: DOWNLOAD })).toBeTruthy();
  });

  it('there is none when the file would be empty, before the details are ready, or while the meeting runs', () => {
    setup({ segments: [] });
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
    cleanup();
    setup({ segments: [storedSegment('m1', 0, { text: '   ' })] });
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
    cleanup();
    setup({ segments: mixed, summary: null });
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
    cleanup();
    setup({
      meeting: storedMeeting({ endedAt: null, endReason: null }),
      segments: mixed,
      state: 'in-progress',
      summary: summariseMeeting(storedMeeting(), mixed),
    });
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
  });

  it('pressing it loads that meeting\u2019s download and saves it, and changes nothing in the row', async () => {
    const meeting = storedMeeting({ id: 'm42' });
    const props = setup({ meeting, segments: mixed });
    const before = item().innerHTML;
    expect(props.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: DOWNLOAD }));
    await waitFor(() => expect(props.save).toHaveBeenCalledTimes(1));
    expect(props.load).toHaveBeenCalledTimes(1);
    expect(props.load).toHaveBeenCalledWith('m42');
    const file = meetingDownload({ meeting, segments: mixed }, AT);
    expect(props.save).toHaveBeenCalledWith('Meeting — 07-10-2026 at 14h30 — Transcript.txt', file!.data, TEXT);
    expect(item().innerHTML).toBe(before);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a meeting with no file after all saves nothing and shows nothing', async () => {
    const props = setup({ segments: mixed, load: vi.fn(() => Promise.resolve(null)) });
    const before = item().innerHTML;
    fireEvent.click(screen.getByRole('button', { name: DOWNLOAD }));
    await waitFor(() => expect(props.load).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(props.save).not.toHaveBeenCalled();
    expect(item().innerHTML).toBe(before);
  });
});

// 013 T047 (FR-018, FR-019, FR-022; contracts/download-ui.md).
describe('MeetingRow: a meeting with kept captions (013)', () => {
  const C4 =
    "Delete the transcript of 7 Oct 2026, 14:30 permanently? Its questions, answers, notes and Meet's captions are deleted too. It cannot be recovered.";
  const turns = [storedCaptionTurn('m1', 1, { speakerName: 'Jane', text: 'The harbour survey starts on Monday.' })];

  it('has Download when it has kept captions and no transcript line, beside "Nothing was transcribed."', () => {
    setup({ meeting: meetingWithCaptions(), segments: [] });
    expect(screen.getByRole('button', { name: DOWNLOAD }).textContent).toBe('Download transcript');
    expect(item().textContent).toContain('Nothing was transcribed.');
  });

  it('has Download before its details are worked out, since the meeting itself says it has captions', () => {
    setup({ meeting: meetingWithCaptions(), segments: mixed, summary: null });
    expect(screen.getByRole('button', { name: DOWNLOAD })).toBeTruthy();
  });

  it('the running meeting\u2019s row has no Download, with captions or without', () => {
    setup({
      meeting: meetingWithCaptions({ endedAt: null, endReason: null }),
      segments: mixed,
      state: 'in-progress',
    });
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
  });

  it('a press saves the zip its load gives, once, and the row shows no caption sentence', async () => {
    const meeting = meetingWithCaptions();
    const zip = meetingDownload({ meeting, segments: mixed, captionTurns: turns }, AT)!;
    const props = setup({ meeting, segments: mixed, load: vi.fn(() => Promise.resolve(zip)) });
    const before = item().innerHTML;
    fireEvent.click(screen.getByRole('button', { name: DOWNLOAD }));
    await waitFor(() => expect(props.save).toHaveBeenCalledTimes(1));
    expect(props.save).toHaveBeenCalledWith('Meeting — 07-10-2026 at 14h30.zip', zip.data, 'application/zip');
    expect(item().innerHTML).toBe(before);
    expect(item().textContent).not.toContain('harbour');
  });

  it('a load that fails (the captions cannot be read) saves nothing and shows nothing', async () => {
    const props = setup({
      meeting: meetingWithCaptions(),
      segments: mixed,
      load: vi.fn(() => Promise.reject(new Error('storage'))),
    });
    const before = item().innerHTML;
    fireEvent.click(screen.getByRole('button', { name: DOWNLOAD }));
    await waitFor(() => expect(props.load).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(props.save).not.toHaveBeenCalled();
    expect(item().innerHTML).toBe(before);
  });

  it('its confirmation names Meet\u2019s captions (C4); a meeting without them keeps P13', () => {
    setup({ meeting: meetingWithCaptions(), segments: mixed, confirming: true });
    expect(screen.getByRole('group', { name: 'Confirm delete' }).querySelector('p')?.textContent).toBe(C4);
    cleanup();
    setup({ segments: mixed, confirming: true });
    expect(screen.getByRole('group', { name: 'Confirm delete' }).querySelector('p')?.textContent).toBe(P13);
  });
});
