// T084: consent reminder on every Start unless turned off (US5, FR-007, Constitution I). Nothing is sent until the
// user acknowledges it; Cancel sends nothing. 013 T061 (decision 79, superseding decision 71): the reminder is K1 on
// every platform; it takes nothing about the tab and is on screen in the same turn as the press.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsentDialog } from '@/entrypoints/sidepanel/components/ConsentDialog';
import { StartControls, type StartControlsProps } from '@/entrypoints/sidepanel/components/StartControls';
import type { MeetingApi } from '@/entrypoints/sidepanel/meeting-api';
import { startSteps } from '@/entrypoints/sidepanel/start-flow';

afterEach(cleanup);

function setup(props: Partial<StartControlsProps> = {}) {
  const api = {
    start: vi.fn(() => Promise.resolve({ ok: true as const, meetingId: 'm1' })),
    stop: vi.fn(() => Promise.resolve({ ok: true as const })),
  } satisfies Pick<MeetingApi, 'start' | 'stop'>;
  const onChanged = vi.fn();
  render(
    <StartControls
      api={api}
      ready
      notReadyReason={null}
      running={false}
      meeting={null}
      onChanged={onChanged}
      consentReminder
      {...props}
    />,
  );
  return { api, onChanged };
}

const dialog = () => screen.queryByRole('alertdialog', { name: /consent reminder/i });
/** Start pressed: the reminder is there at once. */
function pressStart() {
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  return screen.getByRole('alertdialog', { name: /consent reminder/i });
}

const K1 =
  'Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs and the transcript is kept on this computer. You can turn this reminder off in Settings.';

describe('ConsentDialog', () => {
  function shown() {
    const onAcknowledge = vi.fn();
    const onCancel = vi.fn();
    render(<ConsentDialog onAcknowledge={onAcknowledge} onCancel={onCancel} />);
    const el = screen.getByRole('alertdialog', { name: 'Consent reminder' });
    return { el, onAcknowledge, onCancel };
  }

  it('reads K1, exactly, and says nothing about captions', () => {
    const text = shown().el.querySelector('p')?.textContent;
    expect(text).toBe(K1);
    expect(text).not.toMatch(/caption/i);
  });

  it('role, description, buttons, focus and Escape', () => {
    const { el, onAcknowledge, onCancel } = shown();
    expect(el.getAttribute('aria-describedby')).toBe(el.querySelector('p')?.id);
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(["I've told them — start", 'Cancel']);
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.click(buttons[0]!);
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.click(buttons[1]!);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

describe('start flow', () => {
  it('asks for consent only when the reminder is on', () => {
    expect(startSteps({ consentReminder: true })).toEqual(['consent']);
    expect(startSteps({ consentReminder: false })).toEqual([]);
  });
});

describe('consent reminder', () => {
  it('shows the reminder on Start when it is on, without starting', () => {
    const { api } = setup();
    expect(pressStart().querySelector('p')?.textContent).toBe(K1);
    expect(api.start).not.toHaveBeenCalled();
  });

  it('Cancel closes it and sends nothing', async () => {
    const { api } = setup();
    pressStart();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(dialog()).toBeNull();
    await Promise.resolve();
    expect(api.start).not.toHaveBeenCalled();
  });

  it('Acknowledge starts the meeting with the chosen language', async () => {
    const { api, onChanged } = setup();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'eng' } });
    pressStart();
    fireEvent.click(screen.getByRole('button', { name: /i've told them — start/i }));
    await waitFor(() => expect(api.start).toHaveBeenCalledWith({ kind: 'fixed', code: 'eng' }));
    expect(api.start).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(dialog()).toBeNull();
  });

  it('shows the reminder again on the next Start', () => {
    setup();
    pressStart();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(pressStart()).not.toBeNull();
  });

  it('starts immediately when the reminder is off', async () => {
    const { api } = setup({ consentReminder: false });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(dialog()).toBeNull();
    await waitFor(() => expect(api.start).toHaveBeenCalledWith({ kind: 'auto' }));
  });

  it('tells the user how to turn it off', () => {
    setup();
    expect(pressStart().textContent).toMatch(/settings/i);
  });
});
