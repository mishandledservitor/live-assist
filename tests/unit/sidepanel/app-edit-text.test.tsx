// 020 T007 (US1; FR-004, FR-015): the main view's line editor saves through the meeting API, and a refused save keeps
// the editor open with the reason.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/entrypoints/sidepanel/App';
import { spokenBy, storedMeeting, storedSegment } from '../../support/stored-meetings';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const ready = () => fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2').api;

async function open() {
  const meeting = storedMeeting({ id: 'shown' });
  const segments = [storedSegment('shown', 0, { text: 'the cue three budget', ...spokenBy('Jane') })];
  const meetings = fakeMeetingApi({ meeting, segments });
  render(<App api={ready()} meetings={meetings.api} />);
  const text = await screen.findByText('the cue three budget');
  window.getSelection()?.removeAllRanges();
  fireEvent.doubleClick(text);
  const group = screen.getByRole('group', { name: 'Edit line text' });
  fireEvent.change(within(group).getByRole('textbox', { name: 'Line text' }), { target: { value: 'the Q3 budget' } });
  return { meetings, group, segmentId: segments[0]!.id };
}

describe('Edit a line’s text on the main view (020)', () => {
  it('saves the stopped meeting’s line through the repo path', async () => {
    const { meetings, group, segmentId } = await open();
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    await act(() => Promise.resolve());
    expect(meetings.api.overrideText).toHaveBeenCalledWith(
      { meetingId: 'shown', live: false },
      segmentId,
      'the Q3 budget',
    );
    expect(screen.queryByRole('group', { name: 'Edit line text' })).toBeNull();
  });

  it('a refused save keeps the editor open with the reason', async () => {
    const { meetings, group } = await open();
    meetings.api.overrideText.mockImplementationOnce(() => Promise.reject(new Error('write failed')));
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    await act(() => Promise.resolve());
    expect(within(group).getByRole('alert').textContent).toBe("Couldn't save this line. Try again.");
  });
});
