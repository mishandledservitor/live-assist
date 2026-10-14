// 003 T042: the question box under the transcript (contracts/ask-ui.md "Layout" and "Strings").
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatKeyHintsReply, ChatRejectKind } from '@/core/messaging/protocol';
import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from '@/core/settings/schema';
import { AskDock } from '@/entrypoints/sidepanel/components/AskDock';

afterEach(cleanup);

const both: ChatKeyHintsReply = { anthropic: 'wxyz', openai: 'abcd' };
const claude: ChatSettings = { ...DEFAULT_CHAT_SETTINGS, provider: 'anthropic' };

function Dock(props: {
  initial?: string;
  hints?: ChatKeyHintsReply;
  chat?: ChatSettings;
  hasMeeting?: boolean;
  streaming?: boolean;
  notice?: ChatRejectKind | null;
  onSend?: (q: string) => void;
  onStop?: () => void;
}) {
  const [value, setValue] = useState(props.initial ?? '');
  return (
    <AskDock
      value={value}
      onChange={setValue}
      onSend={props.onSend ?? vi.fn()}
      onStop={props.onStop ?? vi.fn()}
      streaming={props.streaming ?? false}
      hasMeeting={props.hasMeeting ?? true}
      keyHints={props.hints ?? both}
      chat={props.chat ?? claude}
      notice={props.notice ?? null}
    />
  );
}

const box = () => screen.getByRole('textbox', { name: 'Question' });
const askButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Ask' });

describe('AskDock', () => {
  it('has a multi-line Question box with its placeholder', () => {
    render(<Dock />);
    expect(box().tagName).toBe('TEXTAREA');
    expect(box().getAttribute('placeholder')).toBe('Ask about this meeting');
  });

  it('Enter sends the trimmed question; Shift+Enter adds a line', () => {
    const onSend = vi.fn();
    render(<Dock initial="  What about pricing?  " onSend={onSend} />);
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('What about pricing?');
  });

  it('Ask sends', () => {
    const onSend = vi.fn();
    render(<Dock initial="Q?" onSend={onSend} />);
    fireEvent.click(askButton());
    expect(onSend).toHaveBeenCalledWith('Q?');
  });

  it('Ask is disabled with an empty box, no key or no meeting', () => {
    const { unmount } = render(<Dock initial="   " />);
    expect(askButton().disabled).toBe(true);
    unmount();
    const second = render(<Dock initial="Q?" hints={{ anthropic: null, openai: 'abcd' }} />);
    expect(askButton().disabled).toBe(true);
    second.unmount();
    render(<Dock initial="Q?" hasMeeting={false} />);
    expect(askButton().disabled).toBe(true);
  });

  it('Enter does not send when Ask is disabled', () => {
    const onSend = vi.fn();
    render(<Dock initial="Q?" hasMeeting={false} onSend={onSend} />);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Stop replaces Ask while an answer streams', () => {
    const onStop = vi.fn();
    render(<Dock initial="" streaming onStop={onStop} />);
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalled();
  });

  it('a question typed while an answer streams can still be sent (it waits)', () => {
    const onSend = vi.fn();
    render(<Dock initial="Next?" streaming onSend={onSend} />);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('Next?');
  });

  it('shows the selected model after the box', () => {
    render(<Dock />);
    expect(screen.getByText('Claude Sonnet 5.5')).toBeTruthy();
    cleanup();
    render(<Dock chat={DEFAULT_CHAT_SETTINGS} />);
    expect(screen.getByText('GPT-6 Luna')).toBeTruthy();
  });

  it('says which key to add when the selected provider has none', () => {
    render(<Dock hints={{ anthropic: null, openai: 'abcd' }} />);
    expect(screen.getByText('Add a Claude key in Settings to ask questions.')).toBeTruthy();
    cleanup();
    render(<Dock chat={DEFAULT_CHAT_SETTINGS} hints={{ anthropic: 'wxyz', openai: null }} />);
    expect(screen.getByText('Add an OpenAI key in Settings to ask questions.')).toBeTruthy();
    cleanup();
    render(<Dock hints={{ anthropic: null, openai: null }} />);
    expect(screen.getByText('Add a Claude or OpenAI key in Settings to ask questions.')).toBeTruthy();
  });

  it('says nothing has been transcribed yet after that rejection', () => {
    render(<Dock notice="empty-transcript" />);
    expect(screen.getByText('Nothing transcribed yet.')).toBeTruthy();
  });

  it('adds no helper text while ready', () => {
    const { container } = render(<Dock />);
    expect(container.textContent).toBe('AskClaude Sonnet 5.5');
  });

  it('the model label follows the selected provider and model (T066)', () => {
    const { rerender } = render(<Dock />);
    expect(screen.getByText('Claude Sonnet 5.5')).toBeTruthy();
    rerender(<Dock chat={{ ...DEFAULT_CHAT_SETTINGS, provider: 'openai' }} />);
    expect(screen.getByText('GPT-6 Luna')).toBeTruthy();
    rerender(
      <Dock
        chat={{
          ...DEFAULT_CHAT_SETTINGS,
          provider: 'openai',
          models: { ...DEFAULT_CHAT_SETTINGS.models, openai: 'gpt-6-astra' },
        }}
      />,
    );
    expect(screen.getByText('GPT-6 Astra')).toBeTruthy();
  });

  it('the no-key notice names the selected provider (T066)', () => {
    const { rerender } = render(<Dock hints={{ anthropic: null, openai: 'abcd' }} />);
    expect(screen.getByText('Add a Claude key in Settings to ask questions.')).toBeTruthy();
    rerender(
      <Dock hints={{ anthropic: 'wxyz', openai: null }} chat={{ ...DEFAULT_CHAT_SETTINGS, provider: 'openai' }} />,
    );
    expect(screen.getByText('Add an OpenAI key in Settings to ask questions.')).toBeTruthy();
  });
});
