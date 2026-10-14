import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Setup } from '@/entrypoints/sidepanel/components/Setup';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const KEY = 'sk_test_fixture_setup_a1b2';

const CHAT_KEY = 'test-fixture-chat-key-c3d4';

/** 003: setup also takes the chat provider's key (setup-chat.test.tsx covers that step). */
function fill(name: string, key: string) {
  fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/elevenlabs api key/i), { target: { value: key } });
  fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: CHAT_KEY } });
  fireEvent.click(screen.getByRole('button', { name: 'Check keys and save' })); // 006 R28
}

function renderSetup(f: ReturnType<typeof fakeSettingsApi>, onComplete = vi.fn()) {
  const initial = { settings: f.state.settings, keyHint: f.state.keyHint, chatKeyHints: f.state.chatKeyHints };
  return render(<Setup api={f.api} initial={initial} onComplete={onComplete} />);
}

describe('Setup (first run, US2)', () => {
  it('asks for name and key; the key field is masked', () => {
    const f = fakeSettingsApi();
    renderSetup(f);
    expect(screen.getByLabelText(/your name/i)).toBeTruthy();
    expect(screen.getByLabelText(/elevenlabs api key/i).getAttribute('type')).toBe('password');
  });

  it('requires a name', async () => {
    const f = fakeSettingsApi();
    renderSetup(f);
    fill('   ', KEY);
    expect(await screen.findByText('Enter your name.')).toBeTruthy(); // 006 R18
    expect(f.api.validateKey).not.toHaveBeenCalled();
  });

  it('rejects names over 60 characters', async () => {
    const f = fakeSettingsApi();
    renderSetup(f);
    fill('x'.repeat(61), KEY);
    expect(await screen.findByText(/60 characters/i)).toBeTruthy();
  });

  it('requires a key', async () => {
    const f = fakeSettingsApi();
    renderSetup(f);
    fill('Alex', '  ');
    expect(await screen.findByText(/enter your elevenlabs api key/i)).toBeTruthy();
    expect(f.api.validateKey).not.toHaveBeenCalled();
  });

  it('checks the key, saves the name, marks first run complete and shows the key only masked', async () => {
    const f = fakeSettingsApi();
    const { api, state } = f;
    const onComplete = vi.fn();
    renderSetup(f, onComplete);
    fill('  Alex ', ` ${KEY} `);
    expect(await screen.findByText('••••a1b2')).toBeTruthy();
    // 006 R19/R29: a rejected key is never saved, so "saved" already says it was checked.
    expect(screen.getByText('••••a1b2').parentElement!.textContent).toBe(
      'Keys saved on this computer only: ElevenLabs ••••a1b2, OpenAI ••••c3d4',
    );
    expect(api.validateKey).toHaveBeenCalledWith(KEY);
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ userName: 'Alex', firstRunComplete: true }),
    );
    expect(state.settings.firstRunComplete).toBe(true);
    expect(document.body.textContent).not.toContain(KEY);
    expect(screen.queryByLabelText(/elevenlabs api key/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onComplete).toHaveBeenCalledWith({
      settings: state.settings,
      keyHint: 'a1b2',
      chatKeyHints: { anthropic: null, openai: 'c3d4' },
    });
  });

  it('offers the one-time microphone permission after the key is saved', async () => {
    const f = fakeSettingsApi();
    renderSetup(f);
    fill('Alex', KEY);
    fireEvent.click(await screen.findByRole('button', { name: /allow microphone/i }));
    expect(f.api.openMicPermission).toHaveBeenCalled();
  });

  it.each([
    ['invalid', /rejected this key/i],
    ['forbidden', /not allowed to use speech-to-text/i],
    ['network', /could not reach elevenlabs/i],
    ['rate-limited', /try again/i],
    ['unknown', /unexpected response/i],
  ] as const)('shows a plain-language message when the key check fails: %s', async (kind, text) => {
    const f = fakeSettingsApi();
    f.failNextValidation(kind);
    renderSetup(f);
    fill('Alex', KEY);
    expect((await screen.findByRole('alert')).textContent).toMatch(text);
    expect(f.api.saveSettings).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/elevenlabs api key/i)).toBeTruthy();
  });

  it('shows the retention notice truthfully, with how to opt out of model training', () => {
    const f = fakeSettingsApi();
    renderSetup(f);
    const notice = screen.getByRole('region', { name: /what elevenlabs keeps/i });
    expect(notice.textContent).toMatch(/may keep audio and transcripts/i);
    expect(notice.textContent).toMatch(/Improve the models for everyone/);
    expect(notice.textContent).not.toMatch(
      /zero[- ]retention|never (stored|kept|retained)|not (stored|kept|retained)/i,
    );
  });

  it('says ElevenLabs bills about the length of each meeting (FR-005, design decision 28; 006 R17)', () => {
    const f = fakeSettingsApi();
    renderSetup(f);
    const notice = screen.getByRole('region', { name: /what elevenlabs keeps/i });
    expect(notice.textContent).toContain('ElevenLabs bills about the length of each meeting.');
    expect(notice.textContent).not.toMatch(/mixed on this computer/);
  });

  it('disables Save while the key is being checked', async () => {
    const f = fakeSettingsApi();
    const { api } = f;
    let release: () => void = () => {};
    api.validateKey.mockImplementationOnce(() => new Promise((r) => (release = () => r({ ok: true, hint: 'a1b2' }))));
    renderSetup(f);
    fill('Alex', KEY);
    await waitFor(
      () => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Checking keys…' }).disabled).toBe(true), // 006 R28
    );
    release();
    expect(await screen.findByText('••••a1b2')).toBeTruthy();
  });
});
