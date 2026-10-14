// 006 T004 (US3, FR-010, FR-012, research R1/R7): the main view and the Settings screen in one panel.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialStatus, reduceStatus } from '@/core/status/status';
import { segmentId, type Meeting, type TranscriptSegment } from '@/core/transcript/model';
import { App } from '@/entrypoints/sidepanel/App';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const ready = () => fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2').api;
const gear = () => screen.getByRole('button', { name: 'Settings' });

const meeting: Meeting = {
  id: 'm1',
  startedAt: 1,
  endedAt: null,
  endReason: null,
  source: { url: 'https://meet.google.com/x', title: 'Standup', platform: 'meet' },
  languageMode: { kind: 'auto' },
  userName: 'Alex',
  speakerRenames: {},
  schemaVersion: 1,
};

const seg = (seq: number, text: string): TranscriptSegment => ({
  id: segmentId('m1', 'mixed', seq),
  meetingId: 'm1',
  stream: 'mixed',
  seq,
  startMs: seq * 1000,
  endMs: seq * 1000 + 500,
  text,
  language: null,
  speakerLabel: 'Others',
  labelSource: 'fallback',
  captionName: null,
  captionSelf: false,
  labelOverride: null,
  schemaVersion: 2,
  words: [],
  timing: 'words',
  sessionId: 's',
  createdAt: 0,
});

/** A meeting API whose live port stays open, so a test can push events. */
function liveMeetingApi() {
  const base = fakeMeetingApi().api;
  let emit: (e: unknown) => void = () => undefined;
  const api = {
    ...base,
    connect: vi.fn((onEvent: (e: unknown) => void) => {
      emit = onEvent;
      return () => undefined;
    }),
  };
  return { api, emit: (e: unknown) => act(() => emit(e)) };
}

describe('Settings screen (006 US3)', () => {
  it('opens on the main view, and the gear switches to Settings with its heading focused', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const heading = screen.getByRole('heading', { level: 2, name: 'Settings' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^start$/i })).toBeNull();
  });

  it('Back returns to the main view and focuses the gear', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: /^start$/i })).toBeTruthy();
    expect(document.activeElement).toBe(gear());
  });

  it('Escape returns too, but not from a text field or a select', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.keyDown(screen.getByLabelText('Your name'), { key: 'Escape' });
    expect(screen.queryByRole('heading', { level: 2, name: 'Settings' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('heading', { level: 2, name: 'Settings' }), { key: 'Escape' });
    expect(screen.queryByRole('heading', { level: 2, name: 'Settings' })).toBeNull();
    expect(document.activeElement).toBe(gear());
  });

  it('keeps the main view mounted, so lines arriving while Settings is open are there after Back', async () => {
    const live = liveMeetingApi();
    render(<App api={ready()} meetings={live.api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const status = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });
    live.emit({ type: 'live/snapshot', meeting, segments: [seg(1, 'first line')], partials: [], status });
    live.emit({ type: 'live/segment', segment: seg(2, 'said while in settings') });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const transcript = screen.getByRole('region', { name: 'Transcript' });
    expect(transcript.textContent).toContain('first line');
    expect(transcript.textContent).toContain('said while in settings');
    expect(live.api.connect).toHaveBeenCalledTimes(1);
  });

  it('opening Settings while the consent reminder shows cancels it and sends nothing', async () => {
    const meetings = fakeMeetingApi();
    render(<App api={ready()} meetings={meetings.api} />);
    fireEvent.click(await screen.findByRole('button', { name: /^start$/i }));
    expect(await screen.findByRole('alertdialog', { name: 'Consent reminder' })).toBeTruthy();
    fireEvent.click(gear());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /^start$/i }).disabled).toBe(false),
    );
    expect(meetings.api.start).not.toHaveBeenCalled();
  });
});
