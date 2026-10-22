// 003 T070 (FR-011a, research R16): setup gating. The flag `chat.setupComplete`, not key presence, decides whether
// the chat step shows, so removing a chat key later only disables Ask; Start never depends on the chat key.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isReadyToStart } from '@/core/settings/schema';
import { App } from '@/entrypoints/sidepanel/App';
import { readChatMeeting } from '../../support/chat-meetings';
import { fakeChatApi } from './fake-chat-api';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const standup = readChatMeeting('standup-en');
const region = () => screen.getByRole('region', { name: 'Set up live-assist' });

describe('App setup gating (T070)', () => {
  it('a fresh install gets the full setup: name, ElevenLabs key and the chat step', async () => {
    const { api } = fakeSettingsApi();
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    await screen.findByRole('region', { name: 'Set up live-assist' });
    expect(within(region()).getByLabelText('Your name')).toBeTruthy();
    expect(within(region()).getByLabelText('ElevenLabs API key')).toBeTruthy();
    expect(within(region()).getByRole('radiogroup', { name: 'Answers from' })).toBeTruthy();
  });

  it('a fresh install reaches the main view with Start enabled once both keys pass', async () => {
    const { api } = fakeSettingsApi();
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText('ElevenLabs API key'), { target: { value: 'sk_test_fixture_app_1234' } });
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: 'test-fixture-chat-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check keys and save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect((await screen.findByRole<HTMLButtonElement>('button', { name: /^start$/i })).disabled).toBe(false);
  });

  // 017 FR-008, SC-004 (design decision 102): only an ElevenLabs key; the main view opens with Ask off.
  it('a fresh install finished without a chat key reaches the main view with Start and no Ask', async () => {
    const f = fakeSettingsApi();
    const chat = fakeChatApi({});
    render(<App api={f.api} meetings={fakeMeetingApi().api} chat={chat.api} />);
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText('ElevenLabs API key'), { target: { value: 'sk_test_fixture_app_1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check keys and save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect((await screen.findByRole<HTMLButtonElement>('button', { name: /^start$/i })).disabled).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'Question' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
    expect(f.state.settings.askEnabled).toBe(false);
  });

  it('an install set up before 003 sees only the chat step, once, then the main view', async () => {
    const f = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2', { anthropic: null, openai: null });
    f.state.settings = { ...f.state.settings, chat: { ...f.state.settings.chat, setupComplete: false } };
    const { unmount } = render(<App api={f.api} meetings={fakeMeetingApi().api} />);
    await screen.findByRole('region', { name: 'Set up live-assist' });
    expect(screen.queryByLabelText('Your name')).toBeNull();
    expect(screen.queryByLabelText('ElevenLabs API key')).toBeNull();
    expect(screen.queryByRole('button', { name: /^start$/i })).toBeNull();
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: 'test-fixture-chat-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check key and save' }));
    expect((await screen.findByText(/Key saved on this computer only/)).textContent).toBe(
      'Key saved on this computer only: ••••c3d4',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: /^start$/i })).toBeTruthy();

    unmount();
    render(<App api={f.api} meetings={fakeMeetingApi().api} />);
    await screen.findByRole('button', { name: /^start$/i });
    expect(screen.queryByRole('region', { name: 'Set up live-assist' })).toBeNull();
  });

  it('removing the chat key after setup shows the Ask notice and never brings setup back', async () => {
    const f = fakeSettingsApi(
      {
        userName: 'Alex',
        firstRunComplete: true,
        chat: {
          provider: 'openai',
          models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
          setupComplete: true,
        },
      },
      'a1b2',
      { anthropic: null, openai: 'abcd' },
    );
    const { unmount } = render(
      <App api={f.api} meetings={fakeMeetingApi(standup).api} chat={fakeChatApi({ [standup.meeting.id]: [] }).api} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const openaiKey = screen.getByRole('region', { name: 'OpenAI API key' });
    fireEvent.click(within(openaiKey).getByRole('button', { name: 'Remove' }));
    await within(openaiKey).findByText('No key saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Add a Claude or OpenAI key in Settings to ask questions.')).toBeTruthy();

    unmount();
    render(
      <App api={f.api} meetings={fakeMeetingApi(standup).api} chat={fakeChatApi({ [standup.meeting.id]: [] }).api} />,
    );
    await screen.findByRole('button', { name: 'Settings' });
    expect(screen.queryByRole('region', { name: 'Set up live-assist' })).toBeNull();
    await waitFor(() =>
      expect(screen.getByText('Add a Claude or OpenAI key in Settings to ask questions.')).toBeTruthy(),
    );
  });

  it('Start readiness does not depend on the chat key', () => {
    const f = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2', { anthropic: null, openai: null });
    expect(isReadyToStart(f.state.settings, true)).toBe(true);
    expect(
      isReadyToStart({ ...f.state.settings, chat: { ...f.state.settings.chat, setupComplete: false } }, true),
    ).toBe(true);
  });
});
