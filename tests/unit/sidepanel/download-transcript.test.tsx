// 007 T008, T010, T012, T014 (FR-001–FR-003, FR-006; contracts/download-ui.md): `Download transcript` after the last
// line of the meeting the panel shows, running or stopped; absent when nothing can be saved.
// 012 T043 (FR-014–FR-016; research R7): the button does not build the file itself. Its caller says whether there is
// anything to save and how to load it, so a Transcripts row and the main view go through the same seam.
// 013 T042 (FR-012, FR-020; contracts/files-and-storage.md "Side panel"): what a press loads is one download
// (`meetingDownload`): a text file or a zip, or nothing.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meetingDownload, type MeetingDownload } from '@/core/export/meeting-download';
import { transcriptFile } from '@/core/export/transcript-file';
import { initialStatus, reduceStatus } from '@/core/status/status';
import { segmentId, type Meeting, type TranscriptSegment } from '@/core/transcript/model';
import { App } from '@/entrypoints/sidepanel/App';
import { DownloadTranscript } from '@/entrypoints/sidepanel/components/DownloadTranscript';
import { saveBlob } from '@/entrypoints/sidepanel/save-file';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

vi.mock('@/entrypoints/sidepanel/save-file', async (original) => ({
  ...(await original<typeof import('@/entrypoints/sidepanel/save-file')>()),
  saveBlob: vi.fn(),
}));
const saved = vi.mocked(saveBlob);

beforeEach(() => saved.mockClear());
afterEach(cleanup);

const START = new Date(2026, 9, 7, 14, 30).getTime();
const NAME = 'Meeting — 07-10-2026 at 14h30 — Transcript.txt';
const TEXT = 'text/plain;charset=utf-8';
const AT = new Date(2026, 9, 12, 9, 41);

const meeting = (endedAt: number | null = START + 60_000, renames: Meeting['speakerRenames'] = {}): Meeting => ({
  id: 'm1',
  startedAt: START,
  endedAt,
  endReason: endedAt === null ? null : 'user-stop',
  source: { url: 'https://meet.google.com/x', title: 'Standup', platform: 'meet' },
  languageMode: { kind: 'auto' },
  userName: 'Alex',
  speakerRenames: renames,
  schemaVersion: 2,
});

const seg = (seq: number, text: string, extra: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  id: segmentId('m1', 'mixed', seq),
  meetingId: 'm1',
  stream: 'mixed',
  seq,
  startMs: seq * 1000,
  endMs: seq * 1000 + 500,
  text,
  language: null,
  speakerLabel: 'Tom',
  labelSource: 'caption',
  captionName: 'Tom',
  captionSelf: false,
  labelOverride: null,
  schemaVersion: 2,
  words: [],
  timing: 'words',
  sessionId: 's',
  createdAt: 0,
  ...extra,
});

const ready = () => fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2').api;
const download = () => screen.queryByRole<HTMLButtonElement>('button', { name: 'Download transcript' });

/** The panel with a running meeting fed over a fake live port. */
async function running() {
  let emit: (e: unknown) => void = () => undefined;
  const meetings = {
    ...fakeMeetingApi().api,
    connect: vi.fn((onEvent: (e: unknown) => void) => {
      emit = onEvent;
      return () => undefined;
    }),
  };
  render(<App api={ready()} meetings={meetings} />);
  // The panel is listening on its live port: only then does an event reach it. (Waiting for the header alone left a
  // window in which the port was not connected yet and the snapshot below went nowhere.)
  await waitFor(() => expect(meetings.connect).toHaveBeenCalled());
  const status = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });
  return {
    snapshot(segments: TranscriptSegment[], partials: { stream: 'mixed'; text: string }[] = []) {
      act(() => emit({ type: 'live/snapshot', meeting: meeting(null), segments, partials, status }));
    },
    emit(e: unknown) {
      act(() => emit(e));
    },
  };
}

const FILE: MeetingDownload = { name: NAME, type: TEXT, data: '[00:01] Tom: First.\n' };
const ZIP: MeetingDownload = {
  name: 'Meeting — 07-10-2026 at 14h30.zip',
  type: 'application/zip',
  data: new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
};

describe('DownloadTranscript', () => {
  it('saves the download its caller loads: the transcript of the meeting with its current labels', () => {
    const m = meeting(undefined, { 'caption:tom': { name: 'Tom D.', origin: 'manual' } });
    const segments = [seg(2, 'Second.'), seg(1, 'First.')];
    const save = vi.fn();
    render(<DownloadTranscript available load={() => meetingDownload({ meeting: m, segments }, AT)} save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download transcript' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(NAME, '[00:01] Tom D.: First.\n\n[00:02] Tom D.: Second.\n', TEXT);
  });

  it('renders nothing when there is nothing to save, and loads nothing', () => {
    const load = vi.fn(() => FILE);
    const { container } = render(<DownloadTranscript available={false} load={load} save={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    expect(load).not.toHaveBeenCalled();
  });

  it('builds the download on press only: one load and one save per press, in the same task', () => {
    const load = vi.fn(() => FILE);
    const save = vi.fn();
    const view = render(<DownloadTranscript available load={load} save={save} />);
    view.rerender(<DownloadTranscript available load={load} save={save} />);
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(download()!);
    expect(load).toHaveBeenCalledTimes(1);
    expect(save.mock.calls).toEqual([[FILE.name, FILE.data, FILE.type]]);
    fireEvent.click(download()!);
    expect(load).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('a zip is saved once, with its bytes and its type', () => {
    const save = vi.fn();
    render(<DownloadTranscript available load={() => ZIP} save={save} />);
    fireEvent.click(download()!);
    expect(save.mock.calls).toEqual([[ZIP.name, ZIP.data, 'application/zip']]);
  });

  it('load may be asynchronous: the download is saved once it resolves', async () => {
    let resolve: (d: MeetingDownload | null) => void = () => undefined;
    const load = vi.fn(() => new Promise<MeetingDownload | null>((r) => (resolve = r)));
    const save = vi.fn();
    render(<DownloadTranscript available load={load} save={save} />);
    fireEvent.click(download()!);
    expect(load).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    resolve(ZIP);
    await waitFor(() => expect(save).toHaveBeenCalledWith(ZIP.name, ZIP.data, ZIP.type));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves nothing and shows nothing when the load gives null or fails (the meeting is gone, or cannot be read)', async () => {
    const save = vi.fn();
    const loads = [() => null, () => Promise.resolve(null), () => Promise.reject(new Error('storage'))];
    for (const load of loads) {
      const view = render(<DownloadTranscript available load={load} save={save} />);
      const before = view.container.innerHTML;
      fireEvent.click(download()!);
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.container.innerHTML).toBe(before);
      view.unmount();
    }
    expect(save).not.toHaveBeenCalled();
  });

  it('accessibleName names the button while its text stays Download transcript', () => {
    const name = 'Download transcript of 7 Oct 2026, 14:30';
    render(<DownloadTranscript available load={() => FILE} save={vi.fn()} accessibleName={name} />);
    expect(screen.getByRole('button', { name }).textContent).toBe('Download transcript');
    expect(download()).toBeNull();
  });

  it('without accessibleName the button carries no aria-label', () => {
    render(<DownloadTranscript available load={() => FILE} save={vi.fn()} />);
    expect(download()!.hasAttribute('aria-label')).toBe(false);
  });

  it('renders and announces nothing after a save, text or zip: the button is all there is, before and after', () => {
    for (const loaded of [FILE, ZIP]) {
      const { container, unmount } = render(<DownloadTranscript available load={() => loaded} save={vi.fn()} />);
      const before = container.innerHTML;
      expect(before).toBe('<button type="button" class="secondary">Download transcript</button>');
      fireEvent.click(download()!);
      expect(container.innerHTML).toBe(before);
      expect(container.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
      expect(download()!.disabled).toBe(false);
      unmount();
    }
  });

  it('saves through the browser download when no save is injected', () => {
    render(<DownloadTranscript available load={() => FILE} />);
    fireEvent.click(download()!);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledWith(FILE.name, FILE.data, FILE.type);
  });
});

describe('Download transcript in the panel', () => {
  it('stopped meeting: after the last line, before Delete, and saves the file (US1)', async () => {
    const stored = { meeting: meeting(), segments: [seg(1, 'Hello.'), seg(2, 'Last line.')] };
    render(<App api={ready()} meetings={fakeMeetingApi(stored).api} />);
    const button = await screen.findByRole('button', { name: 'Download transcript' });
    const region = screen.getByRole('region', { name: 'Transcript' });
    expect(region.contains(button)).toBe(true);
    const last = within(region).getByText('Last line.');
    expect(last.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const del = screen.getByRole('button', { name: 'Delete transcript' });
    expect(button.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('header')!.contains(button)).toBe(false);

    fireEvent.click(button);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    // 007's body under the panel download's name (013 decision 70).
    expect(saved).toHaveBeenCalledWith(NAME, transcriptFile(stored.meeting, stored.segments).body, TEXT);
    // 012 FR-014: the main view's button goes through the same seam as a Transcripts row.
    const same = meetingDownload(stored, AT);
    expect(saved.mock.calls[0]).toEqual([same?.name, same?.data, same?.type]);
    expect(saved.mock.calls[0]?.[1]).toBe('[00:01] Tom: Hello.\n\n[00:02] Tom: Last line.\n');
  });

  it('running meeting: shown without Delete; saves settled lines only, never in-progress text (US2)', async () => {
    const panel = await running();
    panel.snapshot(
      [seg(1, 'Settled.'), seg(2, 'Name coming.', { labelPending: true, speakerLabel: 'Others' })],
      [{ stream: 'mixed', text: 'still speaking' }],
    );
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete transcript' })).toBeNull();
    fireEvent.click(download()!);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved).toHaveBeenLastCalledWith(NAME, '[00:01] Tom: Settled.\n', TEXT);

    // The line settles and a rename arrives: the next download has both.
    panel.emit({ type: 'live/segment-updated', segment: seg(2, 'Name coming.', { labelPending: false }) });
    panel.emit({
      type: 'live/labels',
      meetingId: 'm1',
      speakerRenames: { 'caption:tom': { name: 'Tom D.', origin: 'manual' } },
    });
    fireEvent.click(download()!);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
    expect(saved).toHaveBeenLastCalledWith(NAME, '[00:01] Tom D.: Settled.\n\n[00:02] Tom D.: Name coming.\n', TEXT);
  });

  it('absent with no meeting (US3)', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi().api} />);
    await screen.findByText('No transcript yet.');
    expect(download()).toBeNull();
  });

  it('absent while a running meeting has only in-progress or pending lines; appears with the first settled line (US3)', async () => {
    const panel = await running();
    panel.snapshot([], [{ stream: 'mixed', text: 'hello' }]);
    expect(download()).toBeNull();
    panel.emit({ type: 'live/segment', segment: seg(1, 'Hello.', { labelPending: true }) });
    expect(download()).toBeNull();
    panel.emit({ type: 'live/segment-updated', segment: seg(1, 'Hello.') });
    expect(download()).not.toBeNull();
  });
});
