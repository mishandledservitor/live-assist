// 003 T038: an answer's text (contracts/ask-ui.md "Turn rendering"): line breaks kept, each matched citation a
// button that goes to its line, unmatched times plain text, and no markup from the model ever rendered as HTML.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerText } from '@/entrypoints/sidepanel/components/AnswerText';
import { GROUNDING_PROMPT } from '@/core/chat/prompt';
import type { ChatRequest } from '@/core/chat/provider';
import { createChatProvider } from '@/providers/chat/factory';
import { fixtureFetch, readChatFixture } from '../../support/chat-fixtures';
import { readChatMeeting } from '../../support/chat-meetings';

afterEach(cleanup);

const { segments } = readChatMeeting('standup-en');
const at = (startMs: number) => segments.find((s) => s.startMs === startMs)!.id;

describe('AnswerText', () => {
  it('keeps line breaks', () => {
    const { container } = render(
      <AnswerText text={'- First point\n- Second point'} segments={segments} onCite={vi.fn()} />,
    );
    const el = container.querySelector('.answer-text') as HTMLElement;
    expect(el.textContent).toBe('- First point\n- Second point');
    expect(getComputedStyle(el).whiteSpace === 'pre-wrap' || el.classList.contains('answer-text')).toBe(true);
  });

  it('makes each matched citation a button named for its time that goes to the line', () => {
    const onCite = vi.fn();
    render(
      <AnswerText
        text="Interviews start Monday [12:40]. Deck by Friday [03:45] [04:02]."
        segments={segments}
        onCite={onCite}
      />,
    );
    const button = screen.getByRole('button', { name: 'Go to 12:40 in the transcript' });
    expect(button.textContent).toBe('[12:40]');
    fireEvent.click(button);
    expect(onCite).toHaveBeenCalledWith(at(760_000));
    fireEvent.click(screen.getByRole('button', { name: 'Go to 04:02 in the transcript' }));
    expect(onCite).toHaveBeenLastCalledWith(at(242_000));
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('shows a time that matches no line as plain text', () => {
    const { container } = render(
      <AnswerText text="Maybe at [59:59] or [99:99]." segments={segments} onCite={vi.fn()} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.textContent).toBe('Maybe at [59:59] or [99:99].');
  });

  it('never renders the answer as markup', () => {
    const { container } = render(
      <AnswerText text={'<b>bold</b> <img src=x onerror="alert(1)"> [00:12]'} segments={segments} onCite={vi.fn()} />,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<b>bold</b>');
  });

  it('a Greek answer over the English transcript links its citations to the English lines (US4, T074)', async () => {
    const fixture = readChatFixture('anthropic', 'greek-answer');
    const provider = createChatProvider('anthropic', 'test-key', fixtureFetch(fixture).fetch);
    let text = '';
    const request: ChatRequest = {
      model: 'claude-sonnet-5-5',
      system: GROUNDING_PROMPT,
      turns: [{ role: 'user', context: 'ctx', question: 'Τι αποφασίστηκε για την τιμολόγηση;' }],
      maxOutputTokens: 1024,
    };
    for await (const event of provider.stream(request, new AbortController().signal))
      if (event.type === 'text') text += event.text;
    expect(text).toBe(fixture.answer);
    expect(text).toMatch(/[\u0370-\u03ff]/);

    const onCite = vi.fn();
    render(<AnswerText text={text} segments={segments} onCite={onCite} />);
    for (const [time, ms] of [
      ['00:12', 12_000],
      ['03:45', 225_000],
      ['04:02', 242_000],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Go to ${time} in the transcript` }));
      expect(onCite).toHaveBeenLastCalledWith(at(ms));
    }
  });
});

// 008 T073 (design decisions 59 and 77, eval runs of 2026-10-12).
describe('AnswerText with notes statements', () => {
  it('shows a notes statement attributed in its sentence as written, with no label and no citation button', () => {
    const { container } = render(
      <AnswerText text="Your notes give a launch budget of 40k." segments={segments} onCite={vi.fn()} />,
    );
    expect(container.textContent).toBe('Your notes give a launch budget of 40k.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a half-translated Greek notes label in Greek, on its own paragraph, with no citation inside it', () => {
    const { container } = render(
      <AnswerText
        text="Συζητήθηκε η τιμολόγηση [00:12]. From τις σημειώσεις σου: Παραμένει η πρόσληψη [02:00]."
        segments={segments}
        onCite={vi.fn()}
      />,
    );
    expect(container.textContent).toBe(
      'Συζητήθηκε η τιμολόγηση [00:12].\n\nΑπό τις σημειώσεις σου: Παραμένει η πρόσληψη.',
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['[00:12]']);
  });
});
