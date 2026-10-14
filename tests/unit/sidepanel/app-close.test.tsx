// 014 T004 (US1; FR-001, FR-002, FR-003, FR-006, FR-009; design decisions 91, 92): `Close transcript` beside Download
// and Delete clears the main view without deleting, never while a meeting runs.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { initialStatus, reduceStatus } from '@/core/status/status';
import { App } from '@/entrypoints/sidepanel/App';
import { spokenBy, storedMeeting, storedSegment, STORED_START } from '../../support/stored-meetings';
import { chatTurnView, fakeChatApi } from './fake-chat-api';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';
import { fakeTranscriptsApi, summarised } from './fake-transcripts-api';

afterEach(cleanup);

const DAY = 86_400_000;
const ready = () => fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2').api;

function stored() {
  const shown = storedMeeting({ id: 'shown' });
  const shownLines = [storedSegment('shown', 0, { text: 'Latest meeting line.', ...spokenBy('Jane') })];
  const older = storedMeeting({ id: 'older', startedAt: STORED_START - DAY });
  const transcripts = fakeTranscriptsApi([summarised(shown, shownLines), summarised(older)]);
  const meetings = fakeMeetingApi({ meeting: shown, segments: shownLines });
  return { transcripts, meetings };
}

type Setup = ReturnType<typeof stored>;

function open(
  setup: Setup = stored(),
  extra: { chat?: ReturnType<typeof fakeChatApi>['api']; withTranscripts?: boolean } = {},
) {
  const { withTranscripts = true, chat } = extra;
  render(
    <App
      api={ready()}
      meetings={setup.meetings.api}
      {...(withTranscripts ? { transcripts: setup.transcripts.api } : {})}
      {...(chat ? { chat } : {})}
    />,
  );
  return setup;
}

const mainView = () => document.querySelector<HTMLElement>('.main-view')!;
const onMain = () => within(mainView());
const mainLine = () => screen.findByText('Latest meeting line.');
const closeButton = () => onMain().findByRole('button', { name: 'Close transcript' });
const rowIds = () =>
  [...document.querySelectorAll('[data-meeting-id]')].map((li) => li.getAttribute('data-meeting-id'));

function expectCleanMain() {
  expect(onMain().getByRole('log', { name: 'Transcript lines' }).textContent).toBe('No transcript yet.');
  for (const name of ['Download transcript', 'Close transcript', 'Delete transcript'])
    expect(onMain().queryByRole('button', { name })).toBeNull();
}

describe('Close transcript on the main view (014 US1)', () => {
  it('stands between Download transcript and Delete transcript under a stopped meeting', async () => {
    open();
    await mainLine();
    await closeButton();
    const names = [...document.querySelectorAll('.transcript-actions button')].map((b) => b.textContent);
    expect(names).toEqual(['Download transcript', 'Close transcript', 'Delete transcript']);
  });

  it('clears the main view at once, deletes nothing, and moves focus to the Transcripts control', async () => {
    const { meetings, transcripts } = open();
    await mainLine();
    fireEvent.click(await closeButton());
    await waitFor(expectCleanMain);
    expect(meetings.api.clearMainView).toHaveBeenCalledTimes(1);
    expect(meetings.api.deleteMeeting).not.toHaveBeenCalled();
    expect(transcripts.api.remove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Transcripts' }));
  });

  it('moves focus to the Settings gear when there is no Transcripts control', async () => {
    open(stored(), { withTranscripts: false });
    await mainLine();
    fireEvent.click(await closeButton());
    await waitFor(expectCleanMain);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settings' }));
  });

  it('leaves the meeting on the Transcripts screen, and Back returns to a clean main view', async () => {
    open();
    await mainLine();
    fireEvent.click(await closeButton());
    await waitFor(expectCleanMain);
    fireEvent.click(screen.getByRole('button', { name: 'Transcripts' }));
    await waitFor(() => expect(rowIds()).toEqual(['shown', 'older']));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expectCleanMain();
  });

  it('with the delete confirmation open, closing clears the view and deletes nothing', async () => {
    const { meetings } = open();
    await mainLine();
    fireEvent.click(onMain().getByRole('button', { name: 'Delete transcript' }));
    expect(onMain().getByRole('group', { name: 'Confirm delete' })).toBeTruthy();
    fireEvent.click(await closeButton());
    await waitFor(expectCleanMain);
    expect(onMain().queryByRole('group', { name: 'Confirm delete' })).toBeNull();
    expect(meetings.api.deleteMeeting).not.toHaveBeenCalled();
  });

  it('takes the conversation strip with it', async () => {
    const chat = fakeChatApi({ shown: [chatTurnView({ seq: 1, meetingId: 'shown', answer: 'An earlier answer.' })] });
    open(stored(), { chat: chat.api });
    await screen.findByText('An earlier answer.');
    fireEvent.click(await closeButton());
    await waitFor(expectCleanMain);
    expect(screen.queryByText('An earlier answer.')).toBeNull();
  });

  it('keeps the transcript and says so when the close cannot be remembered', async () => {
    const { meetings } = open();
    await mainLine();
    meetings.api.clearMainView.mockImplementationOnce(() => Promise.reject(new Error('quota')));
    fireEvent.click(await closeButton());
    expect((await onMain().findByRole('alert')).textContent).toBe("Couldn't close this transcript. Try again.");
    expect(onMain().getByText('Latest meeting line.')).toBeTruthy();
    expect(onMain().getByRole('button', { name: 'Close transcript' })).toBeTruthy();
  });

  it('is never shown while a meeting runs', async () => {
    const setup = stored();
    let emit: (e: unknown) => void = () => undefined;
    setup.meetings.api.connect.mockImplementation((onEvent: (e: unknown) => void) => {
      emit = onEvent;
      return () => undefined;
    });
    open(setup);
    await waitFor(() => expect(setup.meetings.api.connect).toHaveBeenCalled());
    const running = storedMeeting({ id: 'live', endedAt: null, endReason: null });
    act(() =>
      emit({
        type: 'live/snapshot',
        meeting: running,
        segments: [storedSegment('live', 0, { text: 'Still running.' })],
        partials: [],
        status: reduceStatus(initialStatus(), { type: 'capture', state: 'starting' }),
      }),
    );
    expect(onMain().getByText('Still running.')).toBeTruthy();
    expect(onMain().getByRole('button', { name: 'Download transcript' })).toBeTruthy();
    expect(onMain().queryByRole('button', { name: 'Close transcript' })).toBeNull();
    expect(onMain().queryByRole('button', { name: 'Delete transcript' })).toBeNull();
  });
});
