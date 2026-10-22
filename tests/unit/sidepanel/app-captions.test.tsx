// 013 (T031 US2, T044 US1, T049 US4; FR-009, FR-012, FR-017, FR-018, FR-022; contracts/download-ui.md, contracts/
// files-and-storage.md "Call sites"): the main view knows that a meeting has kept captions and never what they say. Its
// delete confirmation names them (C3), and its Download reads them at the press and saves one file. Every caption
// sentence here is the invented marker.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredCaptionTurn } from '@/core/captions/model';
import { zipStored } from '@/core/export/zip';
import { initialStatus, reduceStatus } from '@/core/status/status';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';
import { App } from '@/entrypoints/sidepanel/App';
import { saveBlob } from '@/entrypoints/sidepanel/save-file';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK, expectNoMarker, holdsMarker } from '../../support/caption-marker';
import {
  meetingWithCaptions,
  spokenBy,
  storedCaptionTurn,
  storedMeeting,
  storedSegment,
} from '../../support/stored-meetings';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

vi.mock('@/entrypoints/sidepanel/save-file', async (original) => ({
  ...(await original<typeof import('@/entrypoints/sidepanel/save-file')>()),
  saveBlob: vi.fn(),
}));
const saved = vi.mocked(saveBlob);

beforeEach(() => saved.mockClear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ready = () => fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2').api;
const K6 = 'Delete this transcript permanently? It cannot be recovered.';
const C3 =
  "Delete this transcript permanently? Meet's captions of this meeting are deleted too. It cannot be recovered.";

const lines = (id = 'm1'): TranscriptSegment[] => [
  storedSegment(id, 0, { text: 'First line.', ...spokenBy('Jane') }),
  storedSegment(id, 1, { text: 'Second line.', ...spokenBy('Jane') }),
];

/** Two kept turns carrying the marker sentences, so a leak into the panel is found. */
const turns = (id = 'm1'): StoredCaptionTurn[] => [
  storedCaptionTurn(id, 1, { speakerName: 'Jane', text: CAPTION_MARKER }),
  storedCaptionTurn(id, 2, { speakerName: 'You', self: true, text: CAPTION_MARKER_GREEK }),
];

function show(
  meeting: Meeting,
  segments: TranscriptSegment[] = lines(meeting.id),
  captionTurns: StoredCaptionTurn[] = meeting.hasCaptions === true ? turns(meeting.id) : [],
) {
  const meetings = fakeMeetingApi({ meeting, segments, captionTurns });
  render(<App api={ready()} meetings={meetings.api} />);
  return meetings;
}

const download = () => screen.findByRole('button', { name: 'Download transcript' });
const BASE = 'Meeting — 07-10-2026 at 14h30';
const utf8 = (text: string) => new TextEncoder().encode(text);

const prompt = () => screen.getByRole('group', { name: 'Confirm delete' }).querySelector('p')?.textContent;

describe('main view: the delete confirmation names kept captions (US2, decision 74)', () => {
  it('a stopped meeting with kept captions asks with C3, and confirming deletes it as before', async () => {
    const meetings = show(meetingWithCaptions());
    fireEvent.click(await screen.findByRole('button', { name: 'Delete transcript' }));
    expect(prompt()).toBe(C3);
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(meetings.api.deleteMeeting).toHaveBeenCalledWith('m1'));
    expect(meetings.api.deleteMeeting).toHaveBeenCalledTimes(1);
  });

  it('a stopped meeting without kept captions asks with K6, unchanged', async () => {
    const meetings = show(storedMeeting());
    fireEvent.click(await screen.findByRole('button', { name: 'Delete transcript' }));
    expect(prompt()).toBe(K6);
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(meetings.api.deleteMeeting).toHaveBeenCalledWith('m1'));
  });

  it('a meeting whose captions were first kept while it ran asks with C3 once it has stopped', async () => {
    let emit: (e: unknown) => void = () => undefined;
    let disconnect: () => void = () => undefined;
    const running = storedMeeting({ endedAt: null, endReason: null });
    const fake = fakeMeetingApi({ meeting: meetingWithCaptions(), segments: lines() });
    const meetings = {
      ...fake.api,
      connect: vi.fn((onEvent: (e: unknown) => void, onDisconnect: () => void) => {
        emit = onEvent;
        disconnect = onDisconnect;
        return () => undefined;
      }),
    };
    render(<App api={ready()} meetings={meetings} />);
    await waitFor(() => expect(meetings.connect).toHaveBeenCalled());
    const status = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });
    act(() => emit({ type: 'live/snapshot', meeting: running, segments: lines(), partials: [], status }));
    const before = document.body.innerHTML;
    act(() => emit({ type: 'live/captions-kept', meetingId: 'm1' }));
    // Nothing on screen says so: no badge, no row, no count (contracts/download-ui.md "Never add").
    expect(document.body.innerHTML).toBe(before);
    act(() => disconnect());
    fireEvent.click(await screen.findByRole('button', { name: 'Delete transcript' }));
    expect(prompt()).toBe(C3);
  });
});

describe('main view: Download saves one file (US1, US4; decisions 67, 68, 75; 016 decisions 93, 94, 99)', () => {
  const TRANSCRIPT = '[00:00] Jane: First line.\n\n[00:02] Jane: Second line.\n';
  const CAPTIONS = `[00:04] Jane: ${CAPTION_MARKER}\n\n[00:08] Alex: ${CAPTION_MARKER_GREEK}\n`;
  /** Captions that carry the transcript's words under another name than the live labels give. */
  const sarahSaid = (id = 'm1') => [
    storedCaptionTurn(id, 1, { speakerName: 'Sarah Brown', text: 'first line second line' }),
  ];
  const MERGED = '[00:00] Sarah Brown: First line.\n\n[00:02] Sarah Brown: Second line.\n';

  it('016: a stopped meeting with lines and kept captions reads the caption turns once, at the press, and saves the merged transcript as text', async () => {
    const meetings = show(meetingWithCaptions(), lines(), sarahSaid());
    const button = await download();
    expect(meetings.api.captionTurns).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(meetings.api.captionTurns.mock.calls).toEqual([['m1']]);
    expect(saved.mock.calls[0]).toEqual([`${BASE} — Transcript.txt`, MERGED, 'text/plain;charset=utf-8']);
  });

  it('016: the merged transcript holds no caption text', async () => {
    show(meetingWithCaptions());
    fireEvent.click(await download());
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    const [name, data, type] = saved.mock.calls[0]!;
    expect([name, type]).toEqual([`${BASE} — Transcript.txt`, 'text/plain;charset=utf-8']);
    expectNoMarker(data);
    expect(typeof data).toBe('string');
    expect((data as string).replace(/^\[\d\d:\d\d\] [^:]+: /gm, '')).toBe('First line.\n\nSecond line.\n');
  });

  it('a running meeting with lines and kept captions still saves the zip of both, stamped with the moment of the press', async () => {
    let emit: (e: unknown) => void = () => undefined;
    const fake = fakeMeetingApi({ meeting: meetingWithCaptions(), segments: lines(), captionTurns: turns() });
    const meetings = {
      ...fake.api,
      connect: vi.fn((onEvent: (e: unknown) => void) => {
        emit = onEvent;
        return () => undefined;
      }),
    };
    render(<App api={ready()} meetings={meetings} />);
    await waitFor(() => expect(meetings.connect).toHaveBeenCalled());
    const status = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });
    const running = storedMeeting({ endedAt: null, endReason: null, hasCaptions: true });
    act(() => emit({ type: 'live/snapshot', meeting: running, segments: lines(), partials: [], status }));
    const button = await download();
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date(2026, 9, 12, 9, 41, 30);
    vi.setSystemTime(now);
    fireEvent.click(button);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    const [name, data, type] = saved.mock.calls[0]!;
    expect(name).toBe(`${BASE}.zip`);
    expect(type).toBe('application/zip');
    // The zip of the two files, in order, stamped with the moment of the press (spec P5).
    expect(data).toEqual(
      zipStored(
        [
          { name: `${BASE} — Transcript.txt`, data: utf8(TRANSCRIPT) },
          { name: `${BASE} — Meet captions.txt`, data: utf8(CAPTIONS) },
        ],
        now,
      ),
    );
    expect(holdsMarker(data)).toBe(true);
  });

  it('lines and no kept captions: never reads caption turns, and saves the transcript as text', async () => {
    const meetings = show(storedMeeting());
    fireEvent.click(await download());
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved.mock.calls[0]).toEqual([`${BASE} — Transcript.txt`, TRANSCRIPT, 'text/plain;charset=utf-8']);
    expect(meetings.api.captionTurns).not.toHaveBeenCalled();
  });

  it('kept captions and no transcript line: Download is there and saves the captions file as text', async () => {
    const meetings = show(meetingWithCaptions(), []);
    fireEvent.click(await download());
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved.mock.calls[0]).toEqual([`${BASE} — Meet captions.txt`, CAPTIONS, 'text/plain;charset=utf-8']);
    expect(meetings.api.captionTurns).toHaveBeenCalledTimes(1);
    // Delete stands beside it, with the captions named.
    fireEvent.click(screen.getByRole('button', { name: 'Delete transcript' }));
    expect(prompt()).toBe(C3);
  });

  it('neither a line nor kept captions: no Download', async () => {
    show(storedMeeting(), []);
    await screen.findByRole('button', { name: 'Delete transcript' });
    expect(screen.queryByRole('button', { name: 'Download transcript' })).toBeNull();
  });

  it('caption turns that cannot be read: nothing is saved, nothing is shown, and the next press tries again', async () => {
    const meetings = show(meetingWithCaptions(), lines(), sarahSaid());
    meetings.api.captionTurns.mockRejectedValueOnce(new Error('storage'));
    const button = await download();
    const before = document.body.innerHTML;
    fireEvent.click(button);
    await waitFor(() => expect(meetings.api.captionTurns).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    // Never the live transcript in place of the merged one (016 spec A13).
    expect(saved).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe(before);
    fireEvent.click(button);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved.mock.calls[0]?.slice(0, 2)).toEqual([`${BASE} — Transcript.txt`, MERGED]);
  });

  it('a running meeting whose captions are kept before its first settled line offers Download', async () => {
    let emit: (e: unknown) => void = () => undefined;
    const fake = fakeMeetingApi({ meeting: meetingWithCaptions(), segments: [], captionTurns: turns() });
    const meetings = {
      ...fake.api,
      connect: vi.fn((onEvent: (e: unknown) => void) => {
        emit = onEvent;
        return () => undefined;
      }),
    };
    render(<App api={ready()} meetings={meetings} />);
    await waitFor(() => expect(meetings.connect).toHaveBeenCalled());
    const status = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });
    const running = storedMeeting({ endedAt: null, endReason: null });
    act(() => emit({ type: 'live/snapshot', meeting: running, segments: [], partials: [], status }));
    expect(screen.queryByRole('button', { name: 'Download transcript' })).toBeNull();
    act(() => emit({ type: 'live/captions-kept', meetingId: 'm1' }));
    fireEvent.click(await download());
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved.mock.calls[0]?.[0]).toBe(`${BASE} — Meet captions.txt`);
    // Still running: no Delete.
    expect(screen.queryByRole('button', { name: 'Delete transcript' })).toBeNull();
  });

  it('the panel never renders a caption sentence, before or after a download', async () => {
    show(meetingWithCaptions());
    const button = await download();
    expectNoMarker(document.body.textContent);
    expectNoMarker(document.body.innerHTML);
    fireEvent.click(button);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expectNoMarker(document.body.textContent);
    expectNoMarker(document.body.innerHTML);
  });
});
