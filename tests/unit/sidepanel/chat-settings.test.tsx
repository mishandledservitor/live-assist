// 003 T062 (US3, FR-011–FR-013, contracts/ask-ui.md "Settings screen additions" rows 4a–4c): which provider answers,
// its model, and a key per provider, checked when saved and shown only by its last four characters.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatKeyHintsReply } from '@/core/messaging/protocol';
import type { ChatSettings as ChatSettingsData } from '@/core/settings/schema';
import { ChatSettings } from '@/entrypoints/sidepanel/components/ChatSettings';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const KEY = 'test-chat-settings-key-c3d4';

function renderChat(
  chat: Partial<ChatSettingsData> = {},
  hints: ChatKeyHintsReply = { anthropic: null, openai: 'o1o2' },
) {
  const f = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2', hints);
  f.state.settings = { ...f.state.settings, chat: { ...f.state.settings.chat, ...chat } };
  const onSettings = vi.fn();
  const onHints = vi.fn();
  const view = render(
    <ChatSettings
      api={f.api}
      chat={f.state.settings.chat}
      hints={hints}
      onSettings={onSettings}
      onHints={onHints}
      askEnabled
      onAskEnabled={vi.fn()}
    />,
  );
  return { ...f, onSettings, onHints, view };
}

const radio = (name: string) =>
  within(screen.getByRole('radiogroup', { name: 'Answers from' })).getByRole<HTMLInputElement>('radio', { name });
const modelBox = () => screen.getByRole<HTMLSelectElement>('combobox', { name: 'Model' });
const optionLabels = () =>
  within(modelBox())
    .getAllByRole('option')
    .map((o) => o.textContent);
const section = (name: string) => screen.getByRole('region', { name });

describe('Settings → Questions (4a)', () => {
  it('has the heading Questions, OpenAI selected by default, and OpenAI’s models with GPT-6 Luna chosen', () => {
    renderChat();
    expect(screen.getByRole('heading', { level: 3, name: 'Questions' })).toBeTruthy();
    expect(radio('OpenAI').checked).toBe(true);
    expect(radio('Claude').checked).toBe(false);
    expect(optionLabels()).toEqual(['GPT-6 Luna', 'GPT-6.1 Sol', 'GPT-6 Astra']);
    expect(modelBox().selectedOptions[0]?.textContent).toBe('GPT-6 Luna');
  });

  it('switching to Claude lists Claude’s models with its own choice, and saves the provider', async () => {
    const { api, onSettings } = renderChat({
      models: { anthropic: 'claude-opus-5-5', openai: 'gpt-6.1-sol' },
    });
    fireEvent.click(radio('Claude'));
    await waitFor(() => expect(api.saveChatSettings).toHaveBeenLastCalledWith({ provider: 'anthropic' }));
    expect(optionLabels()).toEqual(['Claude Sonnet 5.5', 'Claude Opus 5.5', 'Claude Haiku 5.5']);
    expect(modelBox().selectedOptions[0]?.textContent).toBe('Claude Opus 5.5');
    expect(onSettings).toHaveBeenCalled();
    fireEvent.click(radio('OpenAI'));
    await waitFor(() => expect(modelBox().selectedOptions[0]?.textContent).toBe('GPT-6.1 Sol'));
  });

  it('picking a model saves it for the selected provider', async () => {
    const { api } = renderChat();
    fireEvent.change(modelBox(), { target: { value: 'gpt-6-astra' } });
    await waitFor(() =>
      expect(api.saveChatSettings).toHaveBeenLastCalledWith({ provider: 'openai', model: 'gpt-6-astra' }),
    );
    expect(modelBox().value).toBe('gpt-6-astra');
  });
});

// 018 (decisions 106, 107): only the selected provider's key, as one line; switching shows the other's, both kept.
describe('Settings → the selected provider’s key (4b, 4c)', () => {
  const replaceIn = (s: HTMLElement) => fireEvent.click(within(s).getByRole('button', { name: 'Replace' }));

  it('shows only the selected provider’s key block, then What it keeps', () => {
    renderChat();
    expect(screen.queryByRole('region', { name: 'Claude API key' })).toBeNull();
    const openai = section('OpenAI API key');
    expect(within(openai).getByText('••••o1o2')).toBeTruthy();
    expect(within(openai).getByRole('button', { name: 'Remove' })).toBeTruthy();
    const keeps = screen.getByRole('region', { name: 'What OpenAI keeps' });
    expect(within(keeps).getByRole('heading', { level: 4 })).toBeTruthy();
    expect(openai.compareDocumentPosition(keeps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'What Anthropic keeps' })).toBeNull();
  });

  it('switching provider shows the other provider’s key and what it keeps; the first key is kept', async () => {
    const { api } = renderChat({}, { anthropic: 'c1c2', openai: 'o1o2' });
    fireEvent.click(radio('Claude'));
    const claude = await screen.findByRole('region', { name: 'Claude API key' });
    expect(within(claude).getByText('••••c1c2')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'OpenAI API key' })).toBeNull();
    expect(screen.getByRole('region', { name: 'What Anthropic keeps' })).toBeTruthy();
    fireEvent.click(radio('OpenAI'));
    expect(within(await screen.findByRole('region', { name: 'OpenAI API key' })).getByText('••••o1o2')).toBeTruthy();
    expect(api.removeChatKey).not.toHaveBeenCalled();
  });

  it('with no key saved for the provider, the field shows at once beside No key saved.', () => {
    renderChat({ provider: 'anthropic' });
    const claude = section('Claude API key');
    expect(within(claude).getByText('No key saved.')).toBeTruthy();
    expect(within(claude).getByLabelText('Claude API key')).toBeTruthy();
    expect(within(claude).queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('checks and saves a key, shows Key works. and the hint, and clears the box', async () => {
    const { api, onHints } = renderChat({ provider: 'anthropic' });
    const claude = section('Claude API key');
    const box = within(claude).getByLabelText<HTMLInputElement>('Claude API key');
    expect(box.type).toBe('password');
    fireEvent.change(box, { target: { value: KEY } });
    fireEvent.click(within(claude).getByRole('button', { name: 'Check and save' }));
    expect(await within(claude).findByText('Key works.')).toBeTruthy();
    expect(api.replaceChatKey).toHaveBeenCalledWith('anthropic', KEY);
    expect(within(claude).getByText('••••c3d4')).toBeTruthy();
    expect(onHints).toHaveBeenLastCalledWith({ anthropic: 'c3d4', openai: 'o1o2' });
    expect(document.body.textContent).not.toContain(KEY);
  });

  it.each([
    ['anthropic', 'Claude API key', 'invalid-key', 'Anthropic rejected the API key.'],
    ['anthropic', 'Claude API key', 'forbidden', "This key isn't allowed to use the Claude API."],
    ['anthropic', 'Claude API key', 'network', "Couldn't reach Anthropic."],
    ['openai', 'OpenAI API key', 'invalid-key', 'OpenAI rejected the API key.'],
    ['openai', 'OpenAI API key', 'forbidden', "This key isn't allowed to use the OpenAI API."],
    ['openai', 'OpenAI API key', 'network', "Couldn't reach OpenAI."],
    ['openai', 'OpenAI API key', 'unknown', 'OpenAI returned an unexpected response. Try again in a moment.'],
  ] as const)('%s check failing with %s says %s', async (provider, heading, kind, text) => {
    const f = renderChat({ provider });
    f.setChatValidation(provider, { ok: false, kind });
    const s = section(heading);
    if (provider === 'openai') replaceIn(s);
    const box = within(s).getByLabelText<HTMLInputElement>(heading);
    fireEvent.change(box, { target: { value: KEY } });
    fireEvent.click(within(s).getByRole('button', { name: 'Check and save' }));
    expect((await within(s).findByRole('alert')).textContent).toBe(text);
    expect(box.value).toBe('');
    expect(f.onHints).not.toHaveBeenCalled();
  });

  it('an empty key asks for one and checks nothing', async () => {
    const { api } = renderChat();
    const s = section('OpenAI API key');
    replaceIn(s);
    fireEvent.click(within(s).getByRole('button', { name: 'Check and save' }));
    expect((await within(s).findByRole('alert')).textContent).toBe('Enter your OpenAI API key.');
    expect(api.replaceChatKey).not.toHaveBeenCalled();
  });

  it('Remove removes that provider’s key and keeps the other', async () => {
    const { api, onHints } = renderChat({}, { anthropic: 'c1c2', openai: 'o1o2' });
    fireEvent.click(within(section('OpenAI API key')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.removeChatKey).toHaveBeenCalledWith('openai'));
    expect(await within(section('OpenAI API key')).findByText('No key saved.')).toBeTruthy();
    expect(onHints).toHaveBeenLastCalledWith({ anthropic: 'c1c2', openai: null });
  });
});
