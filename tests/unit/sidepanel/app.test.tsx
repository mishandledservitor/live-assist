import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/entrypoints/sidepanel/App';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const startButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /^start$/i });

describe('App gating (FR-001)', () => {
  it('shows first-run setup and no Start until setup is complete', async () => {
    const { api } = fakeSettingsApi();
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    expect(await screen.findByRole('region', { name: /set up live-assist/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^start$/i })).toBeNull();
  });

  it('enables Start once setup finishes', async () => {
    const { api } = fakeSettingsApi();
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    fireEvent.change(await screen.findByLabelText(/your name/i), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText(/elevenlabs api key/i), { target: { value: 'sk_test_fixture_app_1234' } });
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: 'test-fixture-chat-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check keys and save' }));
    fireEvent.click(await screen.findByRole('button', { name: /done/i }));
    expect((await screen.findByRole<HTMLButtonElement>('button', { name: /^start$/i })).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('skips setup when it was completed before, with Start enabled', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    await screen.findByRole('button', { name: 'Settings' });
    expect(screen.queryByRole('region', { name: /set up live-assist/i })).toBeNull();
    expect(startButton().disabled).toBe(false);
  });

  it('disables Start and says why when the key was removed', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, null);
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    await screen.findByRole('button', { name: 'Settings' });
    expect(startButton().disabled).toBe(true);
    expect(screen.getByText(/add your elevenlabs api key in settings/i)).toBeTruthy();
  });
});

describe('App consent reminder (US5)', () => {
  it('starts without the reminder when it is turned off in settings', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true, consentReminder: false }, 'a1b2');
    const meetings = fakeMeetingApi();
    render(<App api={api} meetings={meetings.api} />);
    fireEvent.click(await screen.findByRole('button', { name: /^start$/i }));
    await waitFor(() => expect(meetings.api.start).toHaveBeenCalledWith({ kind: 'auto' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('App status (US3, FR-020)', () => {
  it('always shows the status line, even with no meeting running, and no retention row there (006 D12)', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    const status = await screen.findByRole('region', { name: 'Status' });
    expect(status.textContent).toMatch(/not capturing/i);
    expect(status.textContent).not.toMatch(/Improve the models for everyone/);
  });
});

describe('App transcription (US1)', () => {
  it('shows the transcript area and starts transcription of this tab from Start', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    const meetings = fakeMeetingApi();
    render(<App api={api} meetings={meetings.api} />);
    expect((await screen.findByRole('region', { name: 'Transcript' })).textContent).toContain('No transcript yet');
    fireEvent.click(startButton());
    // The consent reminder is on by default (FR-007): nothing starts until it is acknowledged.
    expect(meetings.api.start).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /i've told them — start/i }));
    await waitFor(() => expect(meetings.api.start).toHaveBeenCalledWith({ kind: 'auto' }));
  });

  it('tells the user to click the toolbar icon on the meeting tab when capture was not granted there', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    const meetings = fakeMeetingApi();
    meetings.failNextStart({ ok: false, error: 'not-invoked' });
    render(<App api={api} meetings={meetings.api} />);
    fireEvent.click(await screen.findByRole('button', { name: /^start$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /i've told them — start/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/click the live-assist icon in the chrome toolbar/i);
  });
});
