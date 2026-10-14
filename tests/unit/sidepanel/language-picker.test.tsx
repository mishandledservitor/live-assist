// T079: per-meeting language override (US4, FR-014): Automatic by default, Greek and English first, fixed while the
// meeting runs (showing its choice), back to Automatic for the next meeting.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPPORTED_LANGUAGES } from '@/core/settings/languages';
import type { Meeting } from '@/core/transcript/model';
import { LanguagePicker } from '@/entrypoints/sidepanel/components/LanguagePicker';
import { StartControls, type StartControlsProps } from '@/entrypoints/sidepanel/components/StartControls';
import type { MeetingApi } from '@/entrypoints/sidepanel/meeting-api';

afterEach(cleanup);

const select = () => screen.getByLabelText<HTMLSelectElement>('Language');

describe('LanguagePicker', () => {
  it('defaults to Automatic, then lists Greek and English, then every supported language', () => {
    render(<LanguagePicker value={{ kind: 'auto' }} onChange={() => {}} disabled={false} />);
    const options = within(select()).getAllByRole<HTMLOptionElement>('option');
    expect(options[0]?.textContent).toBe('Auto-detect'); // 006 R4
    expect(options.slice(1, 3).map((o) => o.textContent)).toEqual(['Greek', 'English']);
    expect(options).toHaveLength(1 + SUPPORTED_LANGUAGES.length);
    expect(select().value).toBe('auto');
  });

  it('reports a fixed language or automatic', () => {
    const onChange = vi.fn();
    render(<LanguagePicker value={{ kind: 'auto' }} onChange={onChange} disabled={false} />);
    fireEvent.change(select(), { target: { value: 'ell' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'fixed', code: 'ell' });
    fireEvent.change(select(), { target: { value: 'auto' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'auto' });
  });
});

const meeting = (endedAt: number | null, languageMode: Meeting['languageMode']): Meeting => ({
  id: 'm1',
  startedAt: 1,
  endedAt,
  endReason: endedAt === null ? null : 'user-stop',
  source: { url: 'https://meet.google.com/x', title: 'Standup', platform: 'generic' },
  languageMode,
  userName: 'Alex',
  speakerRenames: {},
  schemaVersion: 1,
});

function controls(props: Partial<StartControlsProps> = {}) {
  const api = {
    start: vi.fn(() => Promise.resolve({ ok: true as const, meetingId: 'm1' })),
    stop: vi.fn(() => Promise.resolve({ ok: true as const })),
  } satisfies Pick<MeetingApi, 'start' | 'stop'>;
  const all: StartControlsProps = {
    api,
    ready: true,
    notReadyReason: null,
    running: false,
    meeting: null,
    onChanged: () => {},
    consentReminder: false,
    ...props,
  };
  const view = render(<StartControls {...all} />);
  return { api, all, view };
}

describe('language choice in the Start flow', () => {
  it('starts with Automatic by default', async () => {
    const { api } = controls();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(api.start).toHaveBeenCalledWith({ kind: 'auto' }));
  });

  it('starts with the chosen language', async () => {
    const { api } = controls();
    fireEvent.change(select(), { target: { value: 'ell' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(api.start).toHaveBeenCalledWith({ kind: 'fixed', code: 'ell' }));
  });

  it("is disabled while running and shows the running meeting's choice", () => {
    controls({ running: true, meeting: meeting(null, { kind: 'fixed', code: 'eng' }) });
    expect(select().disabled).toBe(true);
    expect(select().value).toBe('eng');
  });

  it('goes back to Automatic after Stop', () => {
    const { all, view } = controls();
    fireEvent.change(select(), { target: { value: 'ell' } });
    view.rerender(<StartControls {...all} running meeting={meeting(null, { kind: 'fixed', code: 'ell' })} />);
    view.rerender(<StartControls {...all} running={false} meeting={meeting(9, { kind: 'fixed', code: 'ell' })} />);
    expect(select().disabled).toBe(false);
    expect(select().value).toBe('auto');
  });
});
