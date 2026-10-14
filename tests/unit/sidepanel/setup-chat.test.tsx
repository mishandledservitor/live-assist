// 003 T068 (FR-011a, design decisions 39-40, research R16, contracts/ask-ui.md "First-run setup additions"): the chat
// provider and its key are a required step of first-run setup, checked like the ElevenLabs key.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Setup } from '@/entrypoints/sidepanel/components/Setup';
import type { LoadedSettings } from '@/entrypoints/sidepanel/settings-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const ELEVEN = 'sk_test_fixture_setup_a1b2';
const CHAT = 'test-fixture-chat-key-c3d4';

function setup() {
  const f = fakeSettingsApi();
  const initial: LoadedSettings = { settings: f.state.settings, keyHint: null, chatKeyHints: f.state.chatKeyHints };
  const onComplete = vi.fn();
  render(<Setup api={f.api} initial={initial} onComplete={onComplete} />);
  return { ...f, onComplete };
}

function fill({ name = 'Alex', eleven = ELEVEN, chat = CHAT }: { name?: string; eleven?: string; chat?: string }) {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('ElevenLabs API key'), { target: { value: eleven } });
  const chatField = screen.queryByLabelText('OpenAI API key') ?? screen.getByLabelText('Claude API key');
  fireEvent.change(chatField, { target: { value: chat } });
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Check keys and save' }));
const region = () => screen.getByRole('region', { name: 'Set up live-assist' });

describe('Setup: chat provider and key (T068)', () => {
  it('offers Answers from with OpenAI checked and an OpenAI API key field', () => {
    setup();
    const group = within(region()).getByRole('radiogroup', { name: 'Answers from' });
    expect(within(group).getByRole<HTMLInputElement>('radio', { name: 'OpenAI' }).checked).toBe(true);
    expect(within(group).getByRole<HTMLInputElement>('radio', { name: 'Claude' }).checked).toBe(false);
    const field = screen.getByLabelText('OpenAI API key');
    expect(field.getAttribute('type')).toBe('password');
    expect(field.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(field.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Stored only in this browser on this computer (never synced).',
    );
  });

  it('labels the key field for Claude when Claude is chosen, and shows its disclosure after ElevenLabs’', () => {
    setup();
    const eleven = screen.getByRole('heading', { name: 'What ElevenLabs keeps' });
    const openai = screen.getByRole('heading', { name: 'What OpenAI keeps' });
    expect(eleven.compareDocumentPosition(openai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Claude' }));
    expect(screen.getByLabelText('Claude API key')).toBeTruthy();
    expect(screen.queryByLabelText('OpenAI API key')).toBeNull();
    expect(screen.getByRole('heading', { name: 'What Anthropic keeps' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'What OpenAI keeps' })).toBeNull();
  });

  it('checks the ElevenLabs key, then the chat key, then saves the whole chat object', async () => {
    const f = setup();
    fill({});
    submit();
    expect(await screen.findByText(/Keys saved on this computer only/)).toBeTruthy();
    expect(f.api.validateKey).toHaveBeenCalledWith(ELEVEN);
    expect(f.api.replaceChatKey).toHaveBeenCalledWith('openai', CHAT);
    expect(f.api.validateKey.mock.invocationCallOrder[0]!).toBeLessThan(
      f.api.replaceChatKey.mock.invocationCallOrder[0]!,
    );
    expect(f.api.saveSettings).toHaveBeenCalledWith({
      userName: 'Alex',
      firstRunComplete: true,
      chat: {
        provider: 'openai',
        models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
        setupComplete: true,
      },
    });
  });

  it('saves Claude when Claude is chosen', async () => {
    const f = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Claude' }));
    fill({});
    submit();
    await screen.findByText(/Keys saved on this computer only/);
    expect(f.api.replaceChatKey).toHaveBeenCalledWith('anthropic', CHAT);
    expect(f.state.settings.chat.provider).toBe('anthropic');
    expect(f.state.settings.chat.setupComplete).toBe(true);
  });

  it('the saved screen shows both keys masked and never a key value (006 R29)', async () => {
    const f = setup();
    fill({});
    submit();
    const line = await screen.findByText(/Keys saved on this computer only/);
    expect(line.textContent).toBe('Keys saved on this computer only: ElevenLabs ••••a1b2, OpenAI ••••c3d4');
    expect(document.body.textContent).not.toContain(ELEVEN);
    expect(document.body.textContent).not.toContain(CHAT);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(f.onComplete).toHaveBeenCalledWith({
      settings: f.state.settings,
      keyHint: 'a1b2',
      chatKeyHints: { anthropic: null, openai: 'c3d4' },
    });
  });

  it('an empty chat key is refused before any check', async () => {
    const f = setup();
    fill({ chat: '  ' });
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe('Enter your OpenAI API key.');
    expect(f.api.validateKey).not.toHaveBeenCalled();
    expect(f.api.saveSettings).not.toHaveBeenCalled();
  });

  it.each([
    [
      'invalid-key',
      'OpenAI rejected this key. Check that you copied the whole key, or create a new one in your OpenAI account.',
    ],
    ['forbidden', "This key isn't allowed to use the OpenAI API."],
    ['network', 'Could not reach OpenAI. Check your internet connection and try again.'],
    ['unknown', 'OpenAI returned an unexpected response. Try again in a moment.'],
  ] as const)('a %s chat key shows its error, keeps the fields and does not finish', async (kind, text) => {
    const f = setup();
    f.setChatValidation('openai', { ok: false, kind });
    fill({});
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe(text);
    expect(f.api.saveSettings).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>('Your name').value).toBe('Alex');
    expect(screen.getByLabelText('OpenAI API key')).toBeTruthy();
  });

  it('a re-submit does not re-check an ElevenLabs key that already passed', async () => {
    const f = setup();
    f.setChatValidation('openai', { ok: false, kind: 'invalid-key' });
    fill({});
    submit();
    await screen.findByRole('alert');
    f.setChatValidation('openai', { ok: true, hint: 'c3d4' });
    submit();
    await screen.findByText(/Keys saved on this computer only/);
    expect(f.api.validateKey).toHaveBeenCalledTimes(1);
    expect(f.api.replaceChatKey).toHaveBeenCalledTimes(2);
  });

  it('the button says Checking keys… while checking (006 R28)', async () => {
    const f = setup();
    let release: () => void = () => {};
    f.api.validateKey.mockImplementationOnce(() => new Promise((r) => (release = () => r({ ok: true, hint: 'a1b2' }))));
    fill({});
    submit();
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Checking keys…' }).disabled).toBe(true),
    );
    release();
    await screen.findByText(/Keys saved on this computer only/);
  });
});

describe('Setup: chat step only (installs set up before 003, T070)', () => {
  function chatOnly() {
    const f = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true, keyterms: ['Northwind'] }, 'a1b2', {
      anthropic: null,
      openai: null,
    });
    f.state.settings = { ...f.state.settings, chat: { ...f.state.settings.chat, setupComplete: false } };
    const initial: LoadedSettings = { settings: f.state.settings, keyHint: 'a1b2', chatKeyHints: f.state.chatKeyHints };
    const onComplete = vi.fn();
    render(<Setup api={f.api} initial={initial} mode="chat" onComplete={onComplete} />);
    return { ...f, onComplete };
  }

  it('asks only for the provider and its key, with its disclosure', () => {
    chatOnly();
    expect(screen.getByRole('radiogroup', { name: 'Answers from' })).toBeTruthy();
    expect(screen.getByLabelText('OpenAI API key')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What OpenAI keeps' })).toBeTruthy();
    expect(screen.queryByLabelText('Your name')).toBeNull();
    expect(screen.queryByLabelText('ElevenLabs API key')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'What ElevenLabs keeps' })).toBeNull();
  });

  it('checks the key, saves only the chat settings and shows the key masked, then Done', async () => {
    const f = chatOnly();
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: CHAT } });
    fireEvent.click(screen.getByRole('button', { name: 'Check key and save' }));
    const line = await screen.findByText(/Key saved on this computer only/);
    expect(line.textContent).toBe('Key saved on this computer only: ••••c3d4');
    expect(f.api.validateKey).not.toHaveBeenCalled();
    expect(f.api.saveSettings).toHaveBeenCalledWith({
      chat: {
        provider: 'openai',
        models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
        setupComplete: true,
      },
    });
    expect(f.state.settings.keyterms).toEqual(['Northwind']);
    expect(screen.queryByRole('button', { name: /allow microphone/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(f.onComplete).toHaveBeenCalledWith({
      settings: f.state.settings,
      keyHint: 'a1b2',
      chatKeyHints: { anthropic: null, openai: 'c3d4' },
    });
  });
});
