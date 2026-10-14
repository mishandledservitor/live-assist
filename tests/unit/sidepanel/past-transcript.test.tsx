// 012 T016 (US1; FR-011, FR-012; contracts/transcripts-ui.md "one meeting"): a stored meeting's transcript on the
// Transcripts screen — every line with the labels the main view would show, and nothing that can be edited.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meetingDownload } from '@/core/export/meeting-download';
import type { MeetingState } from '@/core/history/meeting-summary';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';
import { PastTranscript, type PastTranscriptProps } from '@/entrypoints/sidepanel/components/PastTranscript';
import {
  meetingWithCaptions,
  spokenBy,
  spokenBySelf,
  storedCaptionTurn,
  storedMeeting,
  storedSegment,
} from '../../support/stored-meetings';

afterEach(cleanup);

function setup(
  over: { meeting?: Meeting; segments?: TranscriptSegment[]; state?: MeetingState } & Partial<PastTranscriptProps> = {},
) {
  const meeting = over.meeting ?? storedMeeting();
  const segments = over.segments ?? [];
  const props: PastTranscriptProps = {
    meeting,
    segments,
    state: 'stopped',
    load: vi.fn(() => Promise.resolve(meetingDownload({ meeting, segments }, AT))),
    save: vi.fn(),
    remove: vi.fn(() => Promise.resolve()),
    onDeleted: vi.fn(),
    confirming: false,
    onConfirmingChange: vi.fn(),
    ...over,
  };
  const view = render(<PastTranscript {...props} />);
  return { props, ...view };
}

const AT = new Date(2026, 9, 12, 9, 41);
const lines = () => within(screen.getByRole('region', { name: 'Transcript' })).getAllByRole('listitem');

describe('PastTranscript (012 US1)', () => {
  it('shows every line in meeting order with its time, label and text', () => {
    const segments = [
      storedSegment('m1', 2, { text: 'Third.' }),
      storedSegment('m1', 0, { text: 'First.', ...spokenBy('Jane') }),
      storedSegment('m1', 1, { text: 'Second.', ...spokenBySelf() }),
    ];
    setup({ segments });
    expect(lines().map((l) => l.textContent)).toEqual([
      '00:00 Jane (confirmed) First.',
      '00:02 Alex (confirmed) Second.',
      '00:04 Others (speaker not identified) Third.',
    ]);
    const scroller = screen.getByRole('group', { name: 'Transcript lines' });
    expect(scroller.classList.contains('transcript-scroll')).toBe(true);
    expect(scroller.tabIndex).toBe(0);
    expect(screen.queryByRole('log')).toBeNull();
  });

  it('tells confirmed names and "Others" apart as the main view does, with renames and corrections applied', () => {
    const meeting = storedMeeting({ speakerRenames: { 'caption:jane': { name: 'Jane D.', origin: 'manual' } } });
    const segments = [
      storedSegment('m1', 0, spokenBy('Jane')),
      storedSegment('m1', 1),
      storedSegment('m1', 2, { labelOverride: 'Bob' }),
    ];
    setup({ meeting, segments });
    const labels = [...document.querySelectorAll('.label')];
    expect(labels.map((l) => [l.className, l.textContent])).toEqual([
      ['label label-confirmed', 'Jane D. (confirmed)'],
      ['label label-fallback', 'Others (speaker not identified)'],
      ['label label-confirmed', 'Bob (confirmed)'],
    ]);
  });

  it('is read-only: no label is a button, no in-progress line, no footer, no question box', () => {
    setup({ segments: [storedSegment('m1', 0, spokenBy('Jane')), storedSegment('m1', 1)] });
    const region = screen.getByRole('region', { name: 'Transcript' });
    expect(within(region).queryAllByRole('button')).toEqual([]);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Download transcript',
      'Delete transcript',
    ]);
    expect(document.querySelector('[data-in-progress]')).toBeNull();
    expect(document.querySelector('.transcript-footer')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a meeting with no line says nothing was transcribed in place of the transcript', () => {
    const { container } = setup({ segments: [] });
    expect(screen.getByText('Nothing was transcribed.').tagName).toBe('P');
    expect(screen.queryByRole('region', { name: 'Transcript' })).toBeNull();
    expect(container.textContent).toBe('Delete transcriptNothing was transcribed.');
  });

  it('an interrupted meeting says so in the actions row, above the transcript', () => {
    setup({
      meeting: storedMeeting({ endedAt: null, endReason: null }),
      segments: [storedSegment('m1', 0)],
      state: 'interrupted',
    });
    const marker = document.querySelector('.past-actions .meeting-marker')!;
    expect(marker.textContent).toBe('Interrupted');
    const region = screen.getByRole('region', { name: 'Transcript' });
    expect(marker.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.contains(marker)).toBe(false);
  });

  it('a stopped meeting has no marker', () => {
    setup({ segments: [storedSegment('m1', 0)] });
    expect(document.querySelector('.meeting-marker')).toBeNull();
  });

  // The 5,000-line render budget is held in transcript-perf.test.tsx, beside the main view's, so the two heavy
  // renders run one after the other and not in parallel workers.
});

const P13 =
  'Delete the transcript of 7 Oct 2026, 14:30 permanently? Its questions, answers and notes are deleted too. It cannot be recovered.';

describe('PastTranscript: delete (012 US2)', () => {
  it('has Delete transcript in the actions row, above the transcript and outside its scroller', () => {
    setup({ segments: [storedSegment('m1', 0)] });
    const del = screen.getByRole('button', { name: 'Delete transcript' });
    expect(document.querySelector('.past-actions')!.contains(del)).toBe(true);
    const region = screen.getByRole('region', { name: 'Transcript' });
    expect(region.contains(del)).toBe(false);
    expect(del.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(del);
  });

  it('pressing it asks to open the confirmation, which names the meeting and what goes with it', () => {
    const { props, rerender } = setup({ segments: [storedSegment('m1', 0)] });
    fireEvent.click(screen.getByRole('button', { name: 'Delete transcript' }));
    expect(props.onConfirmingChange).toHaveBeenCalledWith(true);
    rerender(<PastTranscript {...props} confirming />);
    const confirm = screen.getByRole('group', { name: 'Confirm delete' });
    expect(within(confirm).getByText(P13)).toBeTruthy();
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Delete permanently' }));
  });

  it('confirming deletes the meeting and reports it', async () => {
    const { props } = setup({ segments: [storedSegment('m1', 0)], confirming: true });
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalledTimes(1));
    expect(props.remove).toHaveBeenCalledTimes(1);
  });

  it('a failed deletion says so and keeps the transcript', async () => {
    const { props } = setup({
      segments: [storedSegment('m1', 0, { text: 'Still here.' })],
      confirming: true,
      remove: vi.fn(() => Promise.reject(new Error('blocked'))),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't delete this transcript. Try again.");
    expect(props.onDeleted).not.toHaveBeenCalled();
    expect(screen.getByText('Still here.')).toBeTruthy();
  });
});

describe('PastTranscript: download (012 US4)', () => {
  const segments = [
    storedSegment('m1', 0, { text: 'First.', ...spokenBy('Jane') }),
    storedSegment('m1', 1, { text: 'Second.' }),
  ];

  it('has Download transcript in the actions row, before Delete, saving the download its load gives', async () => {
    const meeting = storedMeeting({ speakerRenames: { 'caption:jane': { name: 'Jane D.', origin: 'manual' } } });
    const { props } = setup({ meeting, segments });
    const actions = within(document.querySelector<HTMLElement>('.past-actions')!);
    expect(actions.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Download transcript',
      'Delete transcript',
    ]);
    const download = actions.getByRole('button', { name: 'Download transcript' });
    expect(download.hasAttribute('aria-label')).toBe(false);
    expect(props.load).not.toHaveBeenCalled();
    fireEvent.click(download);
    await waitFor(() => expect(props.save).toHaveBeenCalledTimes(1));
    expect(props.load).toHaveBeenCalledTimes(1);
    expect(props.save).toHaveBeenCalledWith(
      'Meeting — 07-10-2026 at 14h30 — Transcript.txt',
      '[00:00] Jane D.: First.\n\n[00:02] Others: Second.\n',
      'text/plain;charset=utf-8',
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('has none for a meeting with no line, or with no line a file would hold', () => {
    setup({ segments: [] });
    expect(screen.queryByRole('button', { name: 'Download transcript' })).toBeNull();
    cleanup();
    setup({ segments: [storedSegment('m1', 0, { text: ' ' })] });
    expect(screen.queryByRole('button', { name: 'Download transcript' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete transcript' })).toBeTruthy();
  });

  it('an interrupted meeting reads Interrupted, then Download, then Delete', () => {
    setup({ meeting: storedMeeting({ endedAt: null, endReason: null }), segments, state: 'interrupted' });
    expect(document.querySelector('.past-actions')!.textContent).toBe(
      'InterruptedDownload transcriptDelete transcript',
    );
  });
});

// 013 T047 (FR-018, FR-019, FR-022; contracts/download-ui.md "Transcripts single-meeting view").
describe('PastTranscript: a meeting with kept captions (013)', () => {
  const C4 =
    "Delete the transcript of 7 Oct 2026, 14:30 permanently? Its questions, answers, notes and Meet's captions are deleted too. It cannot be recovered.";
  const segments = [storedSegment('m1', 0, { text: 'First.', ...spokenBy('Jane') })];
  const turns = [storedCaptionTurn('m1', 1, { speakerName: 'Jane', text: 'The harbour survey starts on Monday.' })];

  it('with no transcript line it still reads "Nothing was transcribed." and has Download beside Delete', async () => {
    const meeting = meetingWithCaptions();
    const captionsOnly = meetingDownload({ meeting, segments: [], captionTurns: turns }, AT)!;
    const { props } = setup({ meeting, segments: [], load: vi.fn(() => Promise.resolve(captionsOnly)) });
    expect(screen.getByText('Nothing was transcribed.')).toBeTruthy();
    expect(document.querySelector('.past-actions')!.textContent).toBe('Download transcriptDelete transcript');
    fireEvent.click(screen.getByRole('button', { name: 'Download transcript' }));
    await waitFor(() => expect(props.save).toHaveBeenCalledTimes(1));
    expect(props.save).toHaveBeenCalledWith(
      'Meeting — 07-10-2026 at 14h30 — Meet captions.txt',
      '[00:04] Jane: The harbour survey starts on Monday.\n',
      'text/plain;charset=utf-8',
    );
  });

  it('with lines a press saves the zip its load gives, and no caption sentence is rendered', async () => {
    const meeting = meetingWithCaptions();
    const zip = meetingDownload({ meeting, segments, captionTurns: turns }, AT)!;
    const { props, container } = setup({ meeting, segments, load: vi.fn(() => Promise.resolve(zip)) });
    const before = container.innerHTML;
    fireEvent.click(screen.getByRole('button', { name: 'Download transcript' }));
    await waitFor(() => expect(props.save).toHaveBeenCalledTimes(1));
    expect(props.save).toHaveBeenCalledWith('Meeting — 07-10-2026 at 14h30.zip', zip.data, 'application/zip');
    expect(container.innerHTML).toBe(before);
    expect(container.textContent).not.toContain('harbour');
  });

  it('a load that fails saves nothing and shows nothing', async () => {
    const { props, container } = setup({
      meeting: meetingWithCaptions(),
      segments,
      load: vi.fn(() => Promise.reject(new Error('storage'))),
    });
    const before = container.innerHTML;
    fireEvent.click(screen.getByRole('button', { name: 'Download transcript' }));
    await waitFor(() => expect(props.load).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(props.save).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe(before);
  });

  it('its confirmation names Meet\u2019s captions (C4); a meeting without them keeps P13', () => {
    const { unmount } = setup({ meeting: meetingWithCaptions(), segments, confirming: true });
    expect(screen.getByRole('group', { name: 'Confirm delete' }).querySelector('p')?.textContent).toBe(C4);
    unmount();
    setup({ segments, confirming: true });
    expect(screen.getByRole('group', { name: 'Confirm delete' }).querySelector('p')?.textContent).toBe(P13);
  });
});
