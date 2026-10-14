// 006 T010 (FR-013, K6; 001 FR-029): Delete transcript sits after the last line of a stopped meeting, never while one
// runs. The confirmation and its focus return are unchanged from 001.
// 012 T029 (FR-017, FR-021, spec Clarifications D2; research R8): the same component serves a Transcripts row, so it
// takes what to remove, its prompt and its name from the caller, can be opened from outside, and says when it failed.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialStatus, reduceStatus } from '@/core/status/status';
import { segmentId, type Meeting, type TranscriptSegment } from '@/core/transcript/model';
import { App } from '@/entrypoints/sidepanel/App';
import { DeleteTranscript } from '@/entrypoints/sidepanel/components/DeleteTranscript';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const meeting = (id: string, endedAt: number | null = 5): Meeting => ({
  id,
  startedAt: 1,
  endedAt,
  endReason: endedAt === null ? null : 'user-stop',
  source: { url: 'https://meet.google.com/x', title: 'Standup', platform: 'generic' },
  languageMode: { kind: 'auto' },
  userName: 'Alex',
  speakerRenames: {},
  schemaVersion: 1,
});

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

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
const ready = () => fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2').api;

describe('Delete transcript placement (006 FR-013)', () => {
  it('renders after the last line of a stopped meeting, inside the transcript region', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi({ meeting: meeting('m1'), segments: [seg(1, 'last')] }).api} />);
    const del = await screen.findByRole('button', { name: 'Delete transcript' });
    const region = screen.getByRole('region', { name: 'Transcript' });
    expect(region.contains(del)).toBe(true);
    const last = within(region).getByText('last');
    expect(last.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('header')!.contains(del)).toBe(false);
  });

  it('is not shown while a meeting runs', async () => {
    const base = fakeMeetingApi().api;
    let emit: (e: unknown) => void = () => undefined;
    const meetings = {
      ...base,
      connect: vi.fn((onEvent: (e: unknown) => void) => {
        emit = onEvent;
        return () => undefined;
      }),
    };
    render(<App api={ready()} meetings={meetings} />);
    // The live port is connected: only then does the snapshot reach the panel.
    await waitFor(() => expect(meetings.connect).toHaveBeenCalled());
    const status = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });
    act(() =>
      emit({ type: 'live/snapshot', meeting: meeting('m1', null), segments: [seg(1, 'x')], partials: [], status }),
    );
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete transcript' })).toBeNull();
  });
});

const K6 = 'Delete this transcript permanently? It cannot be recovered.';
const P13 =
  'Delete the transcript of 7 Oct 2026, 14:30 permanently? Its questions, answers and notes are deleted too. It cannot be recovered.';
const P17 = "Couldn't delete this transcript. Try again.";

const group = () => screen.queryByRole('group', { name: 'Confirm delete' });

describe('DeleteTranscript', () => {
  it('asks for confirmation, Cancel returns focus to the button, then removes and reports it once', async () => {
    const remove = vi.fn(() => Promise.resolve());
    const onDeleted = vi.fn();
    const view = render(<DeleteTranscript remove={remove} onDeleted={onDeleted} />);
    fireEvent.click(button('Delete transcript'));
    expect(group()?.textContent).toBe(`${K6}Delete permanently Cancel`);
    fireEvent.click(button('Cancel'));
    expect(remove).not.toHaveBeenCalled();
    expect(group()).toBeNull();
    expect(document.activeElement).toBe(button('Delete transcript'));

    fireEvent.click(button('Delete transcript'));
    fireEvent.click(button('Delete permanently'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith();

    // The panel then shows another meeting, which can be deleted the same way.
    const removeNext = vi.fn(() => Promise.resolve());
    view.rerender(<DeleteTranscript remove={removeNext} onDeleted={onDeleted} />);
    fireEvent.click(button('Delete transcript'));
    fireEvent.click(button('Delete permanently'));
    await waitFor(() => expect(removeNext).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(2));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("the default prompt is K6's text; a prompt prop replaces it", () => {
    const props = { remove: () => Promise.resolve(), onDeleted: () => undefined };
    const view = render(<DeleteTranscript {...props} />);
    fireEvent.click(button('Delete transcript'));
    expect(group()?.querySelector('p')?.textContent).toBe(K6);
    view.unmount();

    render(<DeleteTranscript {...props} prompt={P13} />);
    fireEvent.click(button('Delete transcript'));
    expect(group()?.textContent).toBe(`${P13}Delete permanently Cancel`);
    expect(group()?.textContent).not.toContain(K6);
  });

  it('accessibleName names the button while its text stays Delete transcript', () => {
    const name = 'Delete transcript of 7 Oct 2026, 14:30';
    render(<DeleteTranscript remove={() => Promise.resolve()} onDeleted={() => undefined} accessibleName={name} />);
    expect(button(name).textContent).toBe('Delete transcript');
    expect(screen.queryByRole('button', { name: 'Delete transcript' })).toBeNull();
    fireEvent.click(button(name));
    fireEvent.click(button('Cancel'));
    expect(document.activeElement).toBe(button(name));
  });

  it('without accessibleName the button carries no aria-label', () => {
    render(<DeleteTranscript remove={() => Promise.resolve()} onDeleted={() => undefined} />);
    expect(button('Delete transcript').hasAttribute('aria-label')).toBe(false);
  });

  it('Delete permanently has focus when the confirmation opens', () => {
    render(<DeleteTranscript remove={() => Promise.resolve()} onDeleted={() => undefined} />);
    fireEvent.click(button('Delete transcript'));
    expect(document.activeElement).toBe(button('Delete permanently'));
  });

  it('Escape closes the confirmation, returns focus to the button and goes no further', () => {
    const remove = vi.fn(() => Promise.resolve());
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <DeleteTranscript remove={remove} onDeleted={() => undefined} />
      </div>,
    );
    fireEvent.click(button('Delete transcript'));
    fireEvent.keyDown(button('Delete permanently'), { key: 'Escape' });
    expect(group()).toBeNull();
    expect(remove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('Delete transcript'));
    expect(outer).not.toHaveBeenCalled();

    // With no confirmation open, Escape is the screen's to handle (Back).
    fireEvent.keyDown(button('Delete transcript'), { key: 'Escape' });
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('other keys in the confirmation are left alone', () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <DeleteTranscript remove={() => Promise.resolve()} onDeleted={() => undefined} />
      </div>,
    );
    fireEvent.click(button('Delete transcript'));
    fireEvent.keyDown(button('Delete permanently'), { key: 'Tab' });
    expect(group()).not.toBeNull();
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('a failed removal keeps the confirmation open and says what happened and what to do', async () => {
    const remove = vi.fn(() => Promise.reject(new Error('storage')));
    const onDeleted = vi.fn();
    render(<DeleteTranscript remove={remove} onDeleted={onDeleted} />);
    fireEvent.click(button('Delete transcript'));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(button('Delete permanently'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(P17);
    expect(group()?.contains(alert)).toBe(true);
    expect(group()?.querySelector('p')?.textContent).toBe(K6);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(button('Delete permanently').disabled).toBe(false);
    expect(button('Cancel').disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(button('Delete permanently')));
  });

  it('a second attempt clears the alert, and succeeds when the removal does', async () => {
    let release: (ok: boolean) => void = () => undefined;
    const remove = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          release = (ok) => (ok ? resolve() : reject(new Error('storage')));
        }),
    );
    const onDeleted = vi.fn();
    render(<DeleteTranscript remove={remove} onDeleted={onDeleted} />);
    fireEvent.click(button('Delete transcript'));
    fireEvent.click(button('Delete permanently'));
    await act(async () => {
      release(false);
      await Promise.resolve();
    });
    await screen.findByRole('alert');

    fireEvent.click(button('Delete permanently'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(button('Delete permanently').disabled).toBe(true);
    await act(async () => {
      release(true);
      await Promise.resolve();
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Cancel after a failure closes the confirmation and forgets the failure', async () => {
    const remove = vi.fn(() => Promise.reject(new Error('storage')));
    render(<DeleteTranscript remove={remove} onDeleted={() => undefined} />);
    fireEvent.click(button('Delete transcript'));
    fireEvent.click(button('Delete permanently'));
    await screen.findByRole('alert');
    fireEvent.click(button('Cancel'));
    expect(group()).toBeNull();
    fireEvent.click(button('Delete transcript'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('controlled (a list that allows one confirmation at a time)', () => {
    const props = { remove: () => Promise.resolve(), onDeleted: () => undefined };

    it('opens and closes only through the props', () => {
      const onConfirmingChange = vi.fn();
      const view = render(<DeleteTranscript {...props} confirming={false} onConfirmingChange={onConfirmingChange} />);
      fireEvent.click(button('Delete transcript'));
      expect(onConfirmingChange).toHaveBeenLastCalledWith(true);
      expect(group()).toBeNull();

      view.rerender(<DeleteTranscript {...props} confirming onConfirmingChange={onConfirmingChange} />);
      expect(group()).not.toBeNull();
      expect(document.activeElement).toBe(button('Delete permanently'));

      fireEvent.click(button('Cancel'));
      expect(onConfirmingChange).toHaveBeenLastCalledWith(false);
      expect(group()).not.toBeNull();

      view.rerender(<DeleteTranscript {...props} confirming={false} onConfirmingChange={onConfirmingChange} />);
      expect(group()).toBeNull();
      expect(document.activeElement).toBe(button('Delete transcript'));
      expect(onConfirmingChange).toHaveBeenCalledTimes(2);
    });

    it('Escape asks to close and returns focus once the prop closes it', () => {
      const onConfirmingChange = vi.fn();
      const view = render(<DeleteTranscript {...props} confirming onConfirmingChange={onConfirmingChange} />);
      fireEvent.keyDown(button('Delete permanently'), { key: 'Escape' });
      expect(onConfirmingChange).toHaveBeenCalledWith(false);
      view.rerender(<DeleteTranscript {...props} confirming={false} onConfirmingChange={onConfirmingChange} />);
      expect(document.activeElement).toBe(button('Delete transcript'));
    });

    it('closed from outside (another row opened its own) it does not take focus', () => {
      const view = render(
        <>
          <button type="button">elsewhere</button>
          <DeleteTranscript {...props} confirming onConfirmingChange={() => undefined} />
        </>,
      );
      button('elsewhere').focus();
      view.rerender(
        <>
          <button type="button">elsewhere</button>
          <DeleteTranscript {...props} confirming={false} onConfirmingChange={() => undefined} />
        </>,
      );
      expect(group()).toBeNull();
      expect(document.activeElement).toBe(button('elsewhere'));
    });

    it('a removal that resolves asks to close and reports it once', async () => {
      const onConfirmingChange = vi.fn();
      const onDeleted = vi.fn();
      render(
        <DeleteTranscript
          remove={() => Promise.resolve()}
          onDeleted={onDeleted}
          confirming
          onConfirmingChange={onConfirmingChange}
        />,
      );
      fireEvent.click(button('Delete permanently'));
      await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
      expect(onConfirmingChange).toHaveBeenCalledWith(false);
    });

    it('uncontrolled, it still tells a listener when it opens and closes', () => {
      const onConfirmingChange = vi.fn();
      render(<DeleteTranscript {...props} onConfirmingChange={onConfirmingChange} />);
      fireEvent.click(button('Delete transcript'));
      expect(group()).not.toBeNull();
      fireEvent.click(button('Cancel'));
      expect(group()).toBeNull();
      expect(onConfirmingChange.mock.calls).toEqual([[true], [false]]);
    });
  });
});

describe('Delete transcript on the main view (012: through remove and onDeleted, behaviour as before)', () => {
  it('deletes the meeting shown, once, and reads the stored meeting again', async () => {
    const fake = fakeMeetingApi({ meeting: meeting('m1'), segments: [seg(1, 'last')] });
    render(<App api={ready()} meetings={fake.api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete transcript' }));
    expect(group()?.textContent).toBe(`${K6}Delete permanently Cancel`);
    const reads = fake.api.latestStored.mock.calls.length;
    fireEvent.click(button('Delete permanently'));
    await waitFor(() => expect(fake.api.deleteMeeting).toHaveBeenCalledWith('m1'));
    expect(fake.api.deleteMeeting).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fake.api.latestStored.mock.calls.length).toBeGreaterThan(reads));
  });

  it('a failed deletion leaves the transcript and the confirmation, with the failure said', async () => {
    const fake = fakeMeetingApi({ meeting: meeting('m1'), segments: [seg(1, 'last')] });
    fake.api.deleteMeeting.mockRejectedValueOnce(new Error('storage'));
    render(<App api={ready()} meetings={fake.api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete transcript' }));
    const reads = fake.api.latestStored.mock.calls.length;
    fireEvent.click(button('Delete permanently'));
    expect((await screen.findByRole('alert')).textContent).toBe(P17);
    expect(group()).not.toBeNull();
    expect(screen.getByText('last')).toBeTruthy();
    expect(fake.api.latestStored.mock.calls.length).toBe(reads);
  });
});
