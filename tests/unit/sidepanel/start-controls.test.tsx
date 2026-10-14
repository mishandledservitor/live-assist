import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StartError, StartResult } from '@/core/messaging/protocol';
import type { Meeting } from '@/core/transcript/model';
import { StartControls, type StartControlsProps } from '@/entrypoints/sidepanel/components/StartControls';
import type { MeetingApi } from '@/entrypoints/sidepanel/meeting-api';

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

function setup(props: Partial<StartControlsProps> = {}, startResult: StartResult = { ok: true, meetingId: 'm9' }) {
  const api = {
    start: vi.fn(() => Promise.resolve(startResult)),
    stop: vi.fn(() => Promise.resolve({ ok: true as const })),
  } satisfies Pick<MeetingApi, 'start' | 'stop'>;
  const onChanged = vi.fn();
  const all: StartControlsProps = {
    api,
    ready: true,
    notReadyReason: null,
    running: false,
    meeting: null,
    onChanged,
    consentReminder: false,
    ...props,
  };
  const view = render(<StartControls {...all} />);
  return { api, onChanged, view, all };
}

const button = (name: string | RegExp) => screen.getByRole<HTMLButtonElement>('button', { name });

describe('StartControls', () => {
  it('keeps Start disabled and says why until settings are complete', () => {
    const { api } = setup({ ready: false, notReadyReason: 'Add your name in Settings to start.' });
    expect(button('Start').disabled).toBe(true);
    expect(screen.getByText('Add your name in Settings to start.')).toBeTruthy();
    fireEvent.click(button('Start'));
    expect(api.start).not.toHaveBeenCalled();
  });

  it('Start sends meeting/start with automatic language and reports the change', async () => {
    const { api, onChanged } = setup();
    fireEvent.click(button('Start'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.start).toHaveBeenCalledWith({ kind: 'auto' });
  });

  it.each<[StartError, RegExp]>([
    [
      'not-invoked',
      /click the live-assist icon in the chrome toolbar while you are on the meeting tab, then press start again/i,
    ],
    // 006 R3: what happened and what to do, without Chrome's rule.
    [
      'tab-not-capturable',
      /^This tab can't be captured\. Go to your meeting tab, click the live-assist icon there, then press Start\.$/,
    ],
    ['settings-incomplete', /finish setup/i],
    ['offscreen-failed', /couldn't start/i],
  ])('shows a plain-language message for %s', async (error, text) => {
    setup({}, { ok: false, error });
    fireEvent.click(button('Start'));
    expect((await screen.findByRole('alert')).textContent).toMatch(text);
  });

  it('already-running names the other tab and offers to stop it', async () => {
    const { api, onChanged } = setup({}, { ok: false, error: 'already-running', runningTabTitle: 'Weekly sync' });
    fireEvent.click(button('Start'));
    // 006 R2: the Stop that one button is the action; no sentence explaining the one-meeting rule.
    expect((await screen.findByRole('alert')).textContent).toBe('Already transcribing “Weekly sync”.Stop that one');
    fireEvent.click(button('Stop that one'));
    await waitFor(() => expect(api.stop).toHaveBeenCalled());
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('while running shows Stop, which sends meeting/stop', async () => {
    const { api, onChanged } = setup({ running: true, meeting: meeting('m1', null) });
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    fireEvent.click(button('Stop'));
    await waitFor(() => expect(api.stop).toHaveBeenCalled());
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  // Delete transcript moved to the transcript's footer (006 FR-013): tests/unit/sidepanel/delete-transcript.test.tsx.
  it('never offers Delete transcript itself', () => {
    setup({ running: false, meeting: meeting('m1') });
    expect(screen.queryByRole('button', { name: 'Delete transcript' })).toBeNull();
  });

  // 013 T061 (decision 79, superseding decision 71; contracts/download-ui.md "Reminder on Start"): one reminder text on
  // every platform, shown at once. The panel asks nothing about the tab, so there is no wait for an answer to be
  // cancelled, overtaken or left pending; the cases below are what the fixes for that wait guarded, on the simple flow.
  describe('the reminder', () => {
    const K1 =
      'Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs and the transcript is kept on this computer. You can turn this reminder off in Settings.';
    const reminder = () => screen.queryByRole('alertdialog', { name: 'Consent reminder' });
    const acknowledgement = () => button("I've told them — start");

    it('a press right after the panel is drawn shows K1 in the same turn; Start is disabled and nothing starts', () => {
      const { api } = setup({ consentReminder: true });
      fireEvent.click(button('Start'));
      expect(reminder()?.querySelector('p')?.textContent).toBe(K1);
      expect(button('Start').disabled).toBe(true);
      expect(api.start).not.toHaveBeenCalled();
    });

    it('Cancel puts it away, starts nothing and gives Start back with the focus', async () => {
      const { api } = setup({ consentReminder: true });
      fireEvent.click(button('Start'));
      fireEvent.click(button('Cancel'));
      expect(reminder()).toBeNull();
      expect(button('Start').disabled).toBe(false);
      expect(document.activeElement).toBe(button('Start'));
      await Promise.resolve();
      expect(api.start).not.toHaveBeenCalled();
    });

    it('another screen opening puts it away for good: nothing starts, and back on the main view Start is enabled', async () => {
      const { api, view, all } = setup({ consentReminder: true });
      fireEvent.click(button('Start'));
      view.rerender(<StartControls {...all} active={false} />);
      expect(reminder()).toBeNull();
      view.rerender(<StartControls {...all} active />);
      expect(reminder()).toBeNull();
      expect(button('Start').disabled).toBe(false);
      await Promise.resolve();
      expect(api.start).not.toHaveBeenCalled();
    });

    it('acknowledging starts once, however often the acknowledgement is pressed', async () => {
      const { api, onChanged } = setup({ consentReminder: true });
      fireEvent.click(button('Start'));
      const acknowledge = acknowledgement();
      fireEvent.click(acknowledge);
      fireEvent.click(acknowledge);
      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(api.start).toHaveBeenCalledTimes(1);
      expect(reminder()).toBeNull();
    });

    it('with the reminder off Start starts at once and shows no reminder', async () => {
      const { api, onChanged } = setup({ consentReminder: false });
      fireEvent.click(button('Start'));
      expect(reminder()).toBeNull();
      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(api.start).toHaveBeenCalledTimes(1);
    });
  });
});
