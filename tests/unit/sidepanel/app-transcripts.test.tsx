// 012 T020 (US1; FR-001 to FR-003; research R1): the Transcripts screen as the panel's third screen — opened from the
// header, the main view kept alive underneath, focus moving with each switch.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialStatus, reduceStatus } from '@/core/status/status';
import { App } from '@/entrypoints/sidepanel/App';
import { spokenBy, storedMeeting, storedSegment, STORED_START } from '../../support/stored-meetings';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';
import { fakeTranscriptsApi, summarised } from './fake-transcripts-api';

afterEach(cleanup);

const ready = () => fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2').api;
const control = () => screen.getByRole('button', { name: 'Transcripts' });
const title = () => screen.getByRole('heading', { level: 2, name: 'Transcripts' });
const mainView = () => document.querySelector<HTMLElement>('.main-view')!;
const rowIds = () =>
  [...document.querySelectorAll('[data-meeting-id]')].map((li) => li.getAttribute('data-meeting-id'));

const older = () =>
  summarised(storedMeeting({ id: 'old', startedAt: STORED_START - 86_400_000 }), [
    storedSegment('old', 0, spokenBy('Jane')),
  ]);

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

describe('Transcripts screen in the panel (012 US1)', () => {
  it('the header control shows the screen with its title focused and hides the main view without unmounting it', async () => {
    const transcripts = fakeTranscriptsApi([older()]);
    render(<App api={ready()} meetings={fakeMeetingApi().api} transcripts={transcripts.api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Transcripts' }));
    expect(document.activeElement).toBe(title());
    expect(mainView().hidden).toBe(true);
    expect(mainView().querySelector('header.panel-header')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^start$/i })).toBeNull();
    await waitFor(() => expect(rowIds()).toEqual(['old']));
  });

  it('Back returns to the main view with focus on the Transcripts control', async () => {
    const transcripts = fakeTranscriptsApi([older()]);
    render(<App api={ready()} meetings={fakeMeetingApi().api} transcripts={transcripts.api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Transcripts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(mainView().hidden).toBe(false);
    expect(screen.getByRole('button', { name: /^start$/i })).toBeTruthy();
    expect(document.activeElement).toBe(control());
  });

  it('Escape from the list returns too', async () => {
    const transcripts = fakeTranscriptsApi([older()]);
    render(<App api={ready()} meetings={fakeMeetingApi().api} transcripts={transcripts.api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Transcripts' }));
    fireEvent.keyDown(title(), { key: 'Escape' });
    expect(document.querySelector('.transcripts-screen')).toBeNull();
    expect(document.activeElement).toBe(control());
  });

  it('is unmounted while not shown, so every opening reads the list again', async () => {
    const transcripts = fakeTranscriptsApi([older()]);
    render(<App api={ready()} meetings={fakeMeetingApi().api} transcripts={transcripts.api} />);
    await screen.findByRole('button', { name: 'Transcripts' });
    expect(transcripts.api.list).not.toHaveBeenCalled();
    expect(document.querySelector('.transcripts-screen')).toBeNull();
    fireEvent.click(control());
    await waitFor(() => expect(rowIds()).toEqual(['old']));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(document.querySelector('.transcripts-screen')).toBeNull();
    transcripts.put(summarised(storedMeeting({ id: 'new' })));
    fireEvent.click(control());
    await waitFor(() => expect(rowIds()).toEqual(['new', 'old']));
    expect(transcripts.api.list).toHaveBeenCalledTimes(2);
  });

  it('opening the screen while the consent reminder shows cancels it and starts nothing', async () => {
    const meetings = fakeMeetingApi();
    render(<App api={ready()} meetings={meetings.api} transcripts={fakeTranscriptsApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: /^start$/i }));
    expect(await screen.findByRole('alertdialog', { name: 'Consent reminder' })).toBeTruthy();
    fireEvent.click(control());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /^start$/i }).disabled).toBe(false),
    );
    expect(meetings.api.start).not.toHaveBeenCalled();
  });

  it('there is no Transcripts control during setup', async () => {
    const setup = fakeSettingsApi({ firstRunComplete: false }, null).api;
    render(<App api={setup} meetings={fakeMeetingApi().api} transcripts={fakeTranscriptsApi().api} />);
    await screen.findByRole('region', { name: 'Set up live-assist' });
    expect(screen.queryByRole('button', { name: 'Transcripts' })).toBeNull();
  });

  it('without a transcripts API the header is as before', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi().api} />);
    await screen.findByRole('button', { name: 'Settings' });
    expect(screen.queryByRole('button', { name: 'Transcripts' })).toBeNull();
  });

  it('lines that arrive while the screen shows are on the main view after Back, and the port was never reopened', async () => {
    const live = liveMeetingApi();
    const running = storedMeeting({ id: 'live', endedAt: null, endReason: null });
    const transcripts = fakeTranscriptsApi([{ meeting: running }, older()]);
    render(<App api={ready()} meetings={live.api} transcripts={transcripts.api} />);
    // The live port opens in an effect, which may run after the header is first drawn.
    await waitFor(() => expect(live.api.connect).toHaveBeenCalled());
    const status = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });
    live.emit({
      type: 'live/snapshot',
      meeting: running,
      segments: [storedSegment('live', 0, { text: 'first line' })],
      partials: [],
      status,
    });
    fireEvent.click(control());
    await waitFor(() => expect(rowIds()).toEqual(['live', 'old']));
    expect(document.querySelector('[data-meeting-id="live"]')!.getAttribute('data-state')).toBe('in-progress');
    live.emit({ type: 'live/segment', segment: storedSegment('live', 1, { text: 'said while looking at the list' }) });

    // Selecting the running row returns to the live transcript.
    fireEvent.click(document.querySelector<HTMLElement>('[data-meeting-id="live"] .meeting-when')!);
    expect(document.querySelector('.transcripts-screen')).toBeNull();
    expect(document.activeElement).toBe(control());
    const transcript = screen.getByRole('region', { name: 'Transcript' });
    expect(transcript.textContent).toContain('first line');
    expect(transcript.textContent).toContain('said while looking at the list');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(live.api.connect).toHaveBeenCalledTimes(1);
    expect(live.api.stop).not.toHaveBeenCalled();
  });

  it('Settings and Transcripts are separate screens: the gear still opens Settings and returns to the gear', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi().api} transcripts={fakeTranscriptsApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Settings' }));
    expect(document.querySelector('.transcripts-screen')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settings' }));
  });
});
