// 008 T040: the too-large text names the notes when the meeting has some (contracts/notes-ui.md "Strings").
import { describe, expect, it } from 'vitest';
import { chatErrorText } from '@/core/chat/messages';

describe('chatErrorText too-large', () => {
  it('without notes is 003’s text', () => {
    expect(chatErrorText('too-large', 'openai', 'gpt-6-luna')).toBe(
      'The meeting is too long to send to GPT-6 Luna in full.',
    );
    expect(chatErrorText('too-large', 'openai', 'gpt-6-luna', { hasNotes: false })).toBe(
      'The meeting is too long to send to GPT-6 Luna in full.',
    );
  });

  it('with notes names them and says what to do', () => {
    expect(chatErrorText('too-large', 'openai', 'gpt-6-luna', { hasNotes: true })).toBe(
      'The meeting and your notes are too long to send to GPT-6 Luna in full. Remove or shorten the notes.',
    );
  });

  it('other kinds ignore the notes', () => {
    expect(chatErrorText('network', 'openai', 'gpt-6-luna', { hasNotes: true })).toBe("Couldn't reach OpenAI.");
  });
});

// 003 T099 (FR-018a, design decision 80; spec Clarifications 2026-10-13 A3).
describe('chatErrorText no-answer', () => {
  it('says what happened and what to do, the same for either provider, naming neither', () => {
    for (const [provider, model] of [
      ['openai', 'gpt-6-luna'],
      ['anthropic', 'claude-sonnet-5-5'],
    ] as const)
      expect(chatErrorText('no-answer', provider, model, { hasNotes: true })).toBe('No answer came back. Ask again.');
  });
});
