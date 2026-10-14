// 012 T040 (US3; FR-019, FR-020, FR-026, FR-027; design decision 64; contracts/internal-api.md "Panel"): after the
// meeting the main view shows is deleted, there or on the Transcripts screen, the main view is clean; a delete on the
// main view opens the Transcripts screen.
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

/** `shown` is the most recent meeting, on the main view; `older` and `oldest` are only on the Transcripts screen. */
function stored() {
  const shown = storedMeeting({ id: 'shown' });
  const shownLines = [storedSegment('shown', 0, { text: 'Latest meeting line.', ...spokenBy('Jane') })];
  const older = storedMeeting({ id: 'older', startedAt: STORED_START - DAY });
  const oldest = storedMeeting({ id: 'oldest', startedAt: STORED_START - 2 * DAY });
  const transcripts = fakeTranscriptsApi([
    summarised(shown, shownLines),
    summarised(older, [storedSegment('older', 0, { text: 'Older meeting line.' })]),
    summarised(oldest),
  ]);
  const meetings = fakeMeetingApi({ meeting: shown, segments: shownLines });
  // One store behind both APIs, as in the panel: a main-view delete removes the meeting the screen lists.
  meetings.api.deleteMeeting.mockImplementation((id: string) => transcripts.api.remove(id));
  return { transcripts, meetings };
}

function open(setup = stored(), extra: { chat?: ReturnType<typeof fakeChatApi>['api'] } = {}) {
  render(<App api={ready()} meetings={setup.meetings.api} transcripts={setup.transcripts.api} {...extra} />);
  return setup;
}

const mainView = () => document.querySelector<HTMLElement>('.main-view')!;
const onMain = () => within(mainView());
const transcriptsControl = () => screen.getByRole('button', { name: 'Transcripts' });
const title = () => screen.getByRole('heading', { level: 2, name: 'Transcripts' });
const rowIds = () =>
  [...document.querySelectorAll('[data-meeting-id]')].map((li) => li.getAttribute('data-meeting-id'));
/** The panel has loaded and shows the most recent meeting. */
const mainLine = () => screen.findByText('Latest meeting line.');

async function deleteOnMain() {
  fireEvent.click(await onMain().findByRole('button', { name: 'Delete transcript' }));
  fireEvent.click(onMain().getByRole('button', { name: 'Delete permanently' }));
}

async function deleteOnScreen(id: string) {
  fireEvent.click(transcriptsControl());
  await waitFor(() => expect(rowIds()).toContain(id));
  const row = document.querySelector<HTMLElement>(`[data-meeting-id="${id}"]`)!;
  fireEvent.click(within(row).getByRole('button', { name: /^Delete transcript of / }));
  fireEvent.click(within(row).getByRole('button', { name: 'Delete permanently' }));
  await waitFor(() => expect(rowIds()).not.toContain(id));
}

function expectCleanMain() {
  expect(onMain().getByRole('log', { name: 'Transcript lines' }).textContent).toBe('No transcript yet.');
  expect(onMain().queryByRole('button', { name: 'Download transcript' })).toBeNull();
  expect(onMain().queryByRole('button', { name: 'Delete transcript' })).toBeNull();
}

describe('Delete transcript on the main view (012 US3)', () => {
  it('deletes, clears the main view, then shows the Transcripts screen with what remains and its title focused', async () => {
    const { meetings, transcripts } = open();
    await mainLine();
    await deleteOnMain();
    await waitFor(() => expect(document.activeElement).toBe(title()));
    expect(meetings.api.deleteMeeting.mock.calls).toEqual([['shown']]);
    expect(meetings.api.clearMainView).toHaveBeenCalledTimes(1);
    expect(meetings.api.deleteMeeting.mock.invocationCallOrder[0]).toBeLessThan(
      meetings.api.clearMainView.mock.invocationCallOrder[0]!,
    );
    expect(mainView().hidden).toBe(true);
    await waitFor(() => expect(rowIds()).toEqual(['older', 'oldest']));
    expect(transcripts.api.remove).toHaveBeenCalledTimes(1);
  });

  it('Back then shows a clean main view, not an older meeting, with focus on the Transcripts control', async () => {
    open();
    await mainLine();
    await deleteOnMain();
    await waitFor(() => expect(document.activeElement).toBe(title()));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(mainView().hidden).toBe(false);
    expect(document.activeElement).toBe(transcriptsControl());
    await waitFor(expectCleanMain);
    expect(mainView().textContent).not.toContain('meeting line.');
    // Nothing says a transcript was deleted or where the others are (K43 "Never add").
    expect(mainView().textContent).not.toMatch(/deleted|Transcripts/i);
  });

  it('the question box is as with no meeting: no earlier answers, nothing to ask about', async () => {
    const chat = fakeChatApi({ shown: [chatTurnView({ seq: 0, meetingId: 'shown' })] });
    open(stored(), { chat: chat.api });
    await mainLine();
    await onMain().findByText('Answer 0.');
    await deleteOnMain();
    await waitFor(() => expect(document.activeElement).toBe(title()));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(expectCleanMain);
    expect(onMain().queryByText('Answer 0.')).toBeNull();
    expect(onMain().getByRole('textbox', { name: 'Question' })).toBeTruthy();
    fireEvent.change(onMain().getByRole('textbox', { name: 'Question' }), { target: { value: 'Anything?' } });
    expect(onMain().getByRole<HTMLButtonElement>('button', { name: 'Ask' }).disabled).toBe(true);
  });

  it('a failed deletion says so, keeps the transcript and stays on the main view', async () => {
    const { meetings } = open();
    await mainLine();
    meetings.api.deleteMeeting.mockRejectedValueOnce(new Error('blocked'));
    await deleteOnMain();
    const alert = await onMain().findByRole('alert');
    expect(alert.textContent).toBe("Couldn't delete this transcript. Try again.");
    expect(meetings.api.clearMainView).not.toHaveBeenCalled();
    expect(mainView().hidden).toBe(false);
    expect(document.querySelector('.transcripts-screen')).toBeNull();
    expect(onMain().getByText('Latest meeting line.')).toBeTruthy();
  });

  it('Cancel changes nothing', async () => {
    const { meetings } = open();
    await mainLine();
    fireEvent.click(await onMain().findByRole('button', { name: 'Delete transcript' }));
    fireEvent.click(onMain().getByRole('button', { name: 'Cancel' }));
    expect(meetings.api.deleteMeeting).not.toHaveBeenCalled();
    expect(meetings.api.clearMainView).not.toHaveBeenCalled();
    expect(document.querySelector('.transcripts-screen')).toBeNull();
    expect(onMain().getByText('Latest meeting line.')).toBeTruthy();
  });

  it('when the marker cannot be written the deletion stands and the screen still opens', async () => {
    const { meetings } = open();
    await mainLine();
    meetings.api.clearMainView.mockRejectedValueOnce(new Error('quota'));
    await deleteOnMain();
    await waitFor(() => expect(document.activeElement).toBe(title()));
    await waitFor(() => expect(rowIds()).toEqual(['older', 'oldest']));
    expect(meetings.api.deleteMeeting).toHaveBeenCalledTimes(1);
  });

  it('without a Transcripts screen the main view is still cleared after its delete', async () => {
    const { meetings } = stored();
    render(<App api={ready()} meetings={meetings.api} />);
    await mainLine();
    await deleteOnMain();
    await waitFor(expectCleanMain);
    expect(meetings.api.clearMainView).toHaveBeenCalledTimes(1);
  });
});

describe('Deleting on the Transcripts screen and the main view (012 US3)', () => {
  it('the meeting the main view shows: the main view is cleared and read again', async () => {
    const { meetings } = open();
    await mainLine();
    const reads = meetings.api.latestStored.mock.calls.length;
    await deleteOnScreen('shown');
    await waitFor(() => expect(meetings.api.clearMainView).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(meetings.api.latestStored.mock.calls.length).toBeGreaterThan(reads));
    expect(meetings.api.deleteMeeting).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(expectCleanMain);
  });

  it('another meeting: the main view is left as it was (FR-027)', async () => {
    const { meetings } = open();
    await mainLine();
    const connects = meetings.api.connect.mock.calls.length;
    await deleteOnScreen('older');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(meetings.api.clearMainView).not.toHaveBeenCalled();
    expect(meetings.api.connect.mock.calls.length).toBe(connects);
    expect(onMain().getByText('Latest meeting line.')).toBeTruthy();
    expect(onMain().getByRole('button', { name: 'Delete transcript' })).toBeTruthy();
  });

  it('a clean main view stays clean when another meeting is deleted', async () => {
    const { meetings } = open();
    await mainLine();
    await deleteOnMain();
    await waitFor(() => expect(rowIds()).toEqual(['older', 'oldest']));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(expectCleanMain);
    await deleteOnScreen('older');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expectCleanMain();
    expect(meetings.api.clearMainView).toHaveBeenCalledTimes(1);
  });

  it('while a meeting runs, deleting an older one leaves the running meeting in view', async () => {
    const setup = stored();
    let emit: (e: unknown) => void = () => undefined;
    setup.meetings.api.connect.mockImplementation((onEvent: (e: unknown) => void) => {
      emit = onEvent;
      return () => undefined;
    });
    const running = storedMeeting({ id: 'live', startedAt: STORED_START + DAY, endedAt: null, endReason: null });
    setup.transcripts.put({ meeting: running });
    open(setup);
    // The live port opens in an effect, which may run after the header is first drawn.
    await waitFor(() => expect(setup.meetings.api.connect).toHaveBeenCalled());
    const status = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });
    act(() =>
      emit({
        type: 'live/snapshot',
        meeting: running,
        segments: [storedSegment('live', 0, { text: 'Said in the running meeting.' })],
        partials: [],
        status,
      }),
    );
    await deleteOnScreen('shown');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(setup.meetings.api.clearMainView).not.toHaveBeenCalled();
    expect(setup.meetings.api.connect).toHaveBeenCalledTimes(1);
    expect(onMain().getByText('Said in the running meeting.')).toBeTruthy();
    expect(onMain().getByRole('button', { name: 'Stop' })).toBeTruthy();
  });
});

describe('The main view cleared in another window (012 US3)', () => {
  it('drops the transcript here when nothing runs', async () => {
    const { meetings } = open();
    await mainLine();
    expect(meetings.clearedListenerCount()).toBe(1);
    act(() => meetings.clearedElsewhere());
    await waitFor(expectCleanMain);
    expect(meetings.api.clearMainView).not.toHaveBeenCalled();
  });

  it('does not disturb a running meeting', async () => {
    const setup = stored();
    let emit: (e: unknown) => void = () => undefined;
    setup.meetings.api.connect.mockImplementation((onEvent: (e: unknown) => void) => {
      emit = onEvent;
      return () => undefined;
    });
    open(setup);
    await waitFor(() => expect(setup.meetings.api.connect).toHaveBeenCalled());
    const running = storedMeeting({ id: 'live', endedAt: null, endReason: null });
    const status = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });
    act(() =>
      emit({
        type: 'live/snapshot',
        meeting: running,
        segments: [storedSegment('live', 0, { text: 'Still running.' })],
        partials: [],
        status,
      }),
    );
    act(() => setup.meetings.clearedElsewhere());
    expect(setup.meetings.api.connect).toHaveBeenCalledTimes(1);
    expect(onMain().getByText('Still running.')).toBeTruthy();
  });

  it('stops listening when the panel closes', async () => {
    const setup = stored();
    const view = render(<App api={ready()} meetings={setup.meetings.api} transcripts={setup.transcripts.api} />);
    await mainLine();
    view.unmount();
    expect(setup.meetings.clearedListenerCount()).toBe(0);
  });
});
