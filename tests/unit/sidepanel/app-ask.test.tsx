// 003 T046: Ask on the main view (FR-001, design decision 38): the conversation strip and question box sit under the
// transcript for the meeting shown; following a citation highlights the line while the answer stays.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/sidepanel/App';
import { readChatMeeting } from '../../support/chat-meetings';
import { chatTurnView, fakeChatApi } from './fake-chat-api';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

const standup = readChatMeeting('standup-en');

const scrollIntoView = vi.fn();
beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(cleanup);

function settings() {
  return fakeSettingsApi(
    {
      userName: 'Alex',
      firstRunComplete: true,
      chat: {
        provider: 'anthropic',
        models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
        setupComplete: true,
      },
    },
    'a1b2',
  ).api;
}

async function renderApp(chat = fakeChatApi({ [standup.meeting.id]: [] })) {
  render(<App api={settings()} meetings={fakeMeetingApi(standup).api} chat={chat.api} />);
  await screen.findByRole('textbox', { name: 'Question' });
  return chat;
}

describe('Ask on the main view', () => {
  it('puts the question box under the transcript, for the meeting shown', async () => {
    const chat = await renderApp();
    const view = document.querySelector<HTMLElement>('.main-view')!;
    const transcript = within(view).getByRole('region', { name: 'Transcript' });
    const box = within(view).getByRole('textbox', { name: 'Question' });
    expect(transcript.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(chat.api.listTurns).toHaveBeenCalledWith(standup.meeting.id));
    expect(within(view).getByText('Claude Sonnet 5.5')).toBeTruthy();
  });

  it('asks about the stopped meeting shown and streams the answer into the strip between transcript and box', async () => {
    const chat = await renderApp();
    await waitFor(() => expect(chat.api.listTurns).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), { target: { value: 'What about pricing?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(chat.api.ask).toHaveBeenCalledWith(standup.meeting.id, 'What about pricing?');
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Question' }).value).toBe('');

    const turn = chatTurnView({ seq: 0, meetingId: standup.meeting.id, question: 'What about pricing?' });
    act(() => chat.answer(turn, ['Pricing stays ', 'until January [00:12].']));
    const strip = screen.getByRole('region', { name: 'Questions and answers' });
    const transcript = screen.getByRole('region', { name: 'Transcript' });
    const box = screen.getByRole('textbox', { name: 'Question' });
    expect(transcript.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(strip).getByRole('article', { name: 'What about pricing?' }).textContent).toContain(
      'Pricing stays until January [00:12].',
    );
  });

  it('clicking a citation highlights the transcript line and the answer stays', async () => {
    const chat = fakeChatApi({
      [standup.meeting.id]: [
        chatTurnView({ seq: 0, meetingId: standup.meeting.id, question: 'Q?', answer: 'Yes [00:12].' }),
      ],
    });
    await renderApp(chat);
    const cite = await screen.findByRole('button', { name: 'Go to 00:12 in the transcript' });
    fireEvent.click(cite);
    const line = document.querySelector(`[data-segment-id="${standup.segments[1]!.id}"]`)!;
    expect(line.getAttribute('aria-current')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole('article', { name: 'Q?' })).toBeTruthy();
  });

  it('a question turned away comes back into the box with the notice', async () => {
    const chat = await renderApp();
    await waitFor(() => expect(chat.api.listTurns).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), { target: { value: 'Anything?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    act(() => chat.emit({ type: 'chat/rejected', kind: 'empty-transcript' }));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Question' }).value).toBe('Anything?');
    expect(screen.getByText('Nothing transcribed yet.')).toBeTruthy();
  });

  describe('waiting for the answer, and no answer (FR-003a, FR-018a, design decision 80)', () => {
    const box = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Question' });
    const askArea = () => document.querySelector<HTMLElement>('.ask-area')!;
    const announced = () =>
      within(askArea())
        .getAllByRole('status')
        .map((s) => s.textContent)
        .join('');

    async function askAndWait(question: string) {
      const chat = await renderApp();
      await waitFor(() => expect(chat.api.listTurns).toHaveBeenCalled());
      expect(announced()).toBe('');
      fireEvent.change(box(), { target: { value: question } });
      fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
      const turn = {
        ...chatTurnView({ seq: 0, meetingId: standup.meeting.id, question }),
        status: 'streaming' as const,
        answer: '',
        answeredBy: null,
      };
      act(() => chat.emit({ type: 'chat/turn', turn }));
      return { chat, turn };
    }

    it('announces the wait once, outside the strip, and falls silent when the first text arrives', async () => {
      const { chat, turn } = await askAndWait('Who am I?');
      expect(announced()).toBe('Waiting for the answer');
      const status = within(askArea()).getByRole('status');
      expect(status.classList.contains('sr-only')).toBe(true);
      expect(status.closest('.chat-turns')).toBeNull();
      expect(status.closest('[aria-busy="true"]')).toBeNull();
      expect(screen.getByRole('img', { name: 'Waiting for the answer' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();

      act(() => chat.emit({ type: 'chat/delta', turnId: turn.id, text: 'You are ' }));
      expect(announced()).toBe('');
      expect(screen.queryByRole('img', { name: 'Waiting for the answer' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    });

    it('no answer: the turn says so and the question is back in the box, ready to send', async () => {
      const { chat, turn } = await askAndWait('Who am I?');
      expect(box().value).toBe('');
      act(() => chat.emit({ type: 'chat/end', turnId: turn.id, status: 'failed', error: 'no-answer' }));

      expect(within(screen.getByRole('alert')).getByText('No answer came back. Ask again.')).toBeTruthy();
      expect(box().value).toBe('Who am I?');
      expect(announced()).toBe('');
      expect(screen.queryByRole('img', { name: 'Waiting for the answer' })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
      expect(chat.api.ask).toHaveBeenCalledTimes(2);
      expect(chat.api.ask).toHaveBeenLastCalledWith(standup.meeting.id, 'Who am I?');
    });

    it('no answer: something typed in the meantime is kept, and Try again still brings the question back', async () => {
      const { chat, turn } = await askAndWait('Who am I?');
      fireEvent.change(box(), { target: { value: 'A new thought' } });
      act(() => chat.emit({ type: 'chat/end', turnId: turn.id, status: 'failed', error: 'no-answer' }));
      expect(box().value).toBe('A new thought');
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(box().value).toBe('Who am I?');
    });

    it('Stop during the wait: Stopped, no message, the box stays empty', async () => {
      const { chat, turn } = await askAndWait('Who am I?');
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      expect(chat.api.stop).toHaveBeenCalledWith(turn.id);
      act(() => chat.emit({ type: 'chat/end', turnId: turn.id, status: 'stopped', error: null }));
      expect(screen.getByText('Stopped')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('img', { name: 'Waiting for the answer' })).toBeNull();
      expect(box().value).toBe('');
    });
  });

  it('Try again on a failed answer puts the question back in the box', async () => {
    const chat = fakeChatApi({
      [standup.meeting.id]: [
        chatTurnView({
          seq: 0,
          meetingId: standup.meeting.id,
          question: 'Retry me?',
          status: 'failed',
          error: 'network',
          answer: '',
        }),
      ],
    });
    await renderApp(chat);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Question' }).value).toBe('Retry me?');
  });

  it('Settings and its screen are unaffected', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const settingsScreen = await screen.findByRole('heading', { name: 'Settings' });
    expect(settingsScreen).toBeTruthy();
    expect(document.querySelector<HTMLElement>('.main-view')!.hidden).toBe(true);
  });

  it('without a chat api the main view renders as before', async () => {
    render(<App api={settings()} meetings={fakeMeetingApi(standup).api} />);
    await screen.findByRole('button', { name: 'Settings' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Questions and answers' })).toBeNull();
  });

  it('follows Settings: a provider switch changes the model label, a removed key disables Ask (T066)', async () => {
    const f = fakeSettingsApi(
      {
        userName: 'Alex',
        firstRunComplete: true,
        chat: {
          provider: 'anthropic',
          models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
          setupComplete: true,
        },
      },
      'a1b2',
      { anthropic: 'wxyz', openai: 'abcd' },
    );
    render(
      <App api={f.api} meetings={fakeMeetingApi(standup).api} chat={fakeChatApi({ [standup.meeting.id]: [] }).api} />,
    );
    await screen.findByRole('textbox', { name: 'Question' });
    const view = document.querySelector<HTMLElement>('.main-view')!;
    expect(within(view).getByText('Claude Sonnet 5.5')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const settingsScreen = screen.getByRole('region', { name: 'Settings' });
    fireEvent.click(within(settingsScreen).getByRole('radio', { name: 'OpenAI' }));
    await waitFor(() => expect(f.state.settings.chat.provider).toBe('openai'));
    const openaiKey = within(settingsScreen).getByRole('region', { name: 'OpenAI key' });
    fireEvent.click(within(openaiKey).getByRole('button', { name: 'Remove' }));
    await within(openaiKey).findByText('No key saved.');
    fireEvent.click(within(settingsScreen).getByRole('button', { name: 'Back' }));

    expect(await within(view).findByText('GPT-6 Luna')).toBeTruthy();
    expect(within(view).getByText('Add an OpenAI key in Settings to ask questions.')).toBeTruthy();
    fireEvent.change(within(view).getByRole('textbox', { name: 'Question' }), { target: { value: 'Q?' } });
    expect(within(view).getByRole<HTMLButtonElement>('button', { name: 'Ask' }).disabled).toBe(true);
  });
});
