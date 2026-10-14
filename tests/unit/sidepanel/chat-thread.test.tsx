// 003 T040: the conversation strip (contracts/ask-ui.md "Layout" and "Turn rendering").
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatTurnView } from '@/core/chat/turn';
import { ChatThread } from '@/entrypoints/sidepanel/components/ChatThread';
import { readChatMeeting } from '../../support/chat-meetings';
import { chatTurnView } from './fake-chat-api';

afterEach(cleanup);

const { segments } = readChatMeeting('standup-en');

function show(turns: ChatTurnView[], over: { waiting?: string | null } = {}) {
  const onCite = vi.fn();
  const onRetry = vi.fn();
  render(
    <ChatThread turns={turns} waiting={over.waiting ?? null} segments={segments} onCite={onCite} onRetry={onRetry} />,
  );
  return { onCite, onRetry, region: () => screen.getByRole('region', { name: 'Questions and answers' }) };
}

describe('ChatThread', () => {
  it('is absent until the meeting has a turn', () => {
    show([]);
    expect(screen.queryByRole('region', { name: 'Questions and answers' })).toBeNull();
  });

  it('shows each question and its answer, the answer an article named by the question', () => {
    const { region } = show([chatTurnView({ seq: 0, question: 'What about pricing?', answer: 'It stays [00:12].' })]);
    const article = within(region()).getByRole('article', { name: 'What about pricing?' });
    expect(article.textContent).toContain('It stays [00:12].');
    expect(within(region()).getByText('What about pricing?').tagName).toBe('P');
  });

  it('marks a streaming answer busy, with no model label yet', () => {
    show([chatTurnView({ seq: 0, question: 'Q?', status: 'streaming', answer: 'Partial', answeredBy: null })]);
    expect(screen.getByRole('article', { name: 'Q?' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('Claude Sonnet 5.5')).toBeNull();
  });

  it('shows the model that wrote a finished answer', () => {
    show([chatTurnView({ seq: 0, question: 'Q?', answeredBy: 'claude-sonnet-5-5' })]);
    const article = screen.getByRole('article', { name: 'Q?' });
    expect(article.getAttribute('aria-busy')).not.toBe('true');
    expect(within(article).getByText('Claude Sonnet 5.5')).toBeTruthy();
  });

  it('a citation button goes to its line', () => {
    const { onCite } = show([chatTurnView({ seq: 0, question: 'Q?', answer: 'Yes [00:12].' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Go to 00:12 in the transcript' }));
    expect(onCite).toHaveBeenCalledWith(segments[1]!.id);
  });

  it('a stopped answer keeps its text and says Stopped', () => {
    show([chatTurnView({ seq: 0, question: 'Q?', status: 'stopped', answer: 'Partial answer' })]);
    const article = screen.getByRole('article', { name: 'Q?' });
    expect(article.textContent).toContain('Partial answer');
    expect(within(article).getByText('Stopped')).toBeTruthy();
  });

  it('a cut-off answer says so, with Try again', () => {
    const { onRetry } = show([chatTurnView({ seq: 0, question: 'Q?', status: 'cut-off', answer: 'Long answer' })]);
    expect(screen.getByText('The answer was cut off.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledWith('Q?');
  });

  it('a failed answer is an alert with the error text and Try again, which puts the question back', () => {
    const { onRetry } = show([
      chatTurnView({
        seq: 0,
        question: 'Q?',
        status: 'failed',
        error: 'rate-limited',
        answer: '',
        provider: 'anthropic',
      }),
    ]);
    expect(screen.getByRole('alert').textContent).toContain(
      'Anthropic is rate-limiting requests. Try again in a moment.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledWith('Q?');
  });

  it('error texts name the provider and model', () => {
    show([
      chatTurnView({ seq: 0, question: 'A?', status: 'failed', error: 'too-large', requestedModel: 'claude-opus-5-5' }),
      chatTurnView({
        seq: 1,
        question: 'B?',
        status: 'failed',
        error: 'invalid-key',
        provider: 'openai',
        requestedModel: 'gpt-6-luna',
      }),
    ]);
    expect(screen.getByText('The meeting is too long to send to Claude Opus 5.5 in full.')).toBeTruthy();
    expect(screen.getByText('OpenAI rejected the API key. Replace it in Settings.')).toBeTruthy();
  });

  it('008: a too-large turn in a meeting with notes names the notes', () => {
    render(
      <ChatThread
        turns={[
          chatTurnView({ seq: 0, question: 'A?', status: 'failed', error: 'too-large', requestedModel: 'gpt-6-luna' }),
        ]}
        waiting={null}
        segments={segments}
        onCite={vi.fn()}
        onRetry={vi.fn()}
        hasNotes
      />,
    );
    expect(
      screen.getByText(
        'The meeting and your notes are too long to send to GPT-6 Luna in full. Remove or shorten the notes.',
      ),
    ).toBeTruthy();
  });

  it('a declined answer says so and shows none of the partial text that streamed before (US2)', () => {
    show([
      chatTurnView({
        seq: 0,
        question: 'Q?',
        status: 'failed',
        error: 'declined',
        answer: 'Someone (not identified) said ',
        requestedModel: 'claude-haiku-5-5',
      }),
    ]);
    expect(screen.getByRole('alert').textContent).toContain('Claude Haiku 5.5 declined to answer this question.');
    expect(screen.getByRole('article', { name: 'Q?' }).textContent).not.toContain('Someone (not identified)');
  });

  it('an answer written by a model outside the list shows its raw ID', () => {
    show([
      chatTurnView({ seq: 0, question: 'Q?', requestedModel: 'claude-sonnet-5-5', answeredBy: 'claude-sonnet-5' }),
    ]);
    expect(within(screen.getByRole('article', { name: 'Q?' })).getByText('claude-sonnet-5')).toBeTruthy();
  });

  describe('waiting for the answer (FR-003a, design decision 80)', () => {
    const waitingMark = () => screen.queryByRole('img', { name: 'Waiting for the answer' });

    it('a turn with no answer text yet shows the mark in the answer’s place, and no sentence', () => {
      show([chatTurnView({ seq: 0, question: 'Q?', status: 'streaming', answer: '', answeredBy: null })]);
      const article = screen.getByRole('article', { name: 'Q?' });
      const mark = within(article).getByRole('img', { name: 'Waiting for the answer' });
      expect(mark.classList.contains('chat-pending')).toBe(true);
      expect(article.textContent).toBe('');
      expect(article.querySelector('.answer-text')).toBeNull();
      expect(article.getAttribute('aria-busy')).toBe('true');
    });

    it('is replaced by the answer once text exists', () => {
      show([chatTurnView({ seq: 0, question: 'Q?', status: 'streaming', answer: 'Pricing ', answeredBy: null })]);
      expect(waitingMark()).toBeNull();
      expect(screen.getByRole('article', { name: 'Q?' }).textContent).toBe('Pricing ');
    });

    it.each(['stopped', 'failed', 'complete', 'cut-off'] as const)('is gone on a %s turn without text', (status) => {
      show([
        chatTurnView({ seq: 0, question: 'Q?', status, answer: '', error: status === 'failed' ? 'network' : null }),
      ]);
      expect(waitingMark()).toBeNull();
    });

    it('only the turn that is waiting shows it; a queued question keeps Waiting…', () => {
      show([chatTurnView({ seq: 0 }), chatTurnView({ seq: 1, status: 'streaming', answer: '', answeredBy: null })], {
        waiting: 'And who disagreed?',
      });
      expect(screen.getAllByRole('img', { name: 'Waiting for the answer' })).toHaveLength(1);
      expect(screen.getByText('Waiting…')).toBeTruthy();
    });
  });

  it('a turn that got no answer says so, names no provider, and offers Try again (FR-018a)', () => {
    const { onRetry } = show([
      chatTurnView({
        seq: 0,
        question: 'Who am I?',
        status: 'failed',
        error: 'no-answer',
        answer: '',
        provider: 'openai',
        requestedModel: 'gpt-6-luna',
        answeredBy: null,
      }),
    ]);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('No answer came back. Ask again.')).toBeTruthy();
    expect(alert.textContent).not.toMatch(/OpenAI|GPT/);
    expect(screen.queryByRole('img', { name: 'Waiting for the answer' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledWith('Who am I?');
  });

  it('shows a waiting question with Waiting…', () => {
    show([chatTurnView({ seq: 0, status: 'streaming' })], { waiting: 'And who disagreed?' });
    expect(screen.getByText('And who disagreed?')).toBeTruthy();
    expect(screen.getByText('Waiting…')).toBeTruthy();
  });

  it('collapses to the latest question on one line, and opens again', () => {
    show([chatTurnView({ seq: 0, question: 'First?' }), chatTurnView({ seq: 1, question: 'Latest?' })]);
    const hide = screen.getByRole('button', { name: 'Hide answers' });
    expect(hide.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(hide);
    const showButton = screen.getByRole('button', { name: 'Show answers' });
    expect(showButton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByText('Latest?')).toBeTruthy();
    expect(screen.queryByText('First?')).toBeNull();
    fireEvent.click(showButton);
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('opens scrolled to the latest turn', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    show([chatTurnView({ seq: 0, question: 'First?' }), chatTurnView({ seq: 1, question: 'Latest?' })]);
    expect(scrollIntoView).toHaveBeenCalled();
    const target = scrollIntoView.mock.contexts.at(-1) as Element;
    expect(target.textContent).toContain('Latest?');
  });
});
