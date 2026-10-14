// 003 T010: chat commands and the `chat` port (contracts/chat-messages.md), validated at every receiving boundary.
import { describe, expect, it } from 'vitest';
import {
  CHAT_PORT_NAME,
  containsSecretField,
  parseChatKeyHintsReply,
  parseChatPortIn,
  parseChatPortOut,
  parseCommand,
  parseValidateChatKeyReply,
} from '@/core/messaging/protocol';
import type { ChatTurnView } from '@/core/chat/turn';

const view: ChatTurnView = {
  id: 'm1:chat:0',
  meetingId: 'm1',
  seq: 0,
  question: 'What was decided?',
  askedAt: 1,
  transcriptUntilMs: 16_000,
  provider: 'anthropic',
  requestedModel: 'claude-sonnet-5-5',
  answeredBy: null,
  answer: '',
  status: 'streaming',
  error: null,
  updatedAt: 1,
  schemaVersion: 1,
};

describe('chat commands (panel → service worker)', () => {
  it('accepts settings/chat-key-hints', () => {
    expect(parseCommand({ type: 'settings/chat-key-hints' })).toEqual({ type: 'settings/chat-key-hints' });
  });

  it.each(['anthropic', 'openai'])('accepts settings/validate-chat-key for %s', (provider) => {
    expect(parseCommand({ type: 'settings/validate-chat-key', provider })).toEqual({
      type: 'settings/validate-chat-key',
      provider,
    });
  });

  it.each([undefined, 'gemini', 3])('rejects settings/validate-chat-key with provider %s', (provider) => {
    expect(parseCommand({ type: 'settings/validate-chat-key', provider })).toBeNull();
  });

  it('rejects a command carrying a key', () => {
    expect(parseCommand({ type: 'settings/validate-chat-key', provider: 'openai', apiKey: 'x' })).toBeNull();
  });
});

describe('chat port: panel → service worker', () => {
  it('is named chat', () => expect(CHAT_PORT_NAME).toBe('chat'));

  it('accepts chat/ask and trims the question', () => {
    expect(parseChatPortIn({ type: 'chat/ask', meetingId: 'm1', question: '  What was decided?\n' })).toEqual({
      type: 'chat/ask',
      meetingId: 'm1',
      question: 'What was decided?',
    });
  });

  it('accepts a 2,000-character question and rejects 2,001', () => {
    expect(parseChatPortIn({ type: 'chat/ask', meetingId: 'm1', question: 'a'.repeat(2000) })).not.toBeNull();
    expect(parseChatPortIn({ type: 'chat/ask', meetingId: 'm1', question: 'a'.repeat(2001) })).toBeNull();
  });

  it.each([
    { type: 'chat/ask', meetingId: 'm1', question: '   ' },
    { type: 'chat/ask', meetingId: 'm1', question: 42 },
    { type: 'chat/ask', meetingId: 7, question: 'q' },
    { type: 'chat/ask', question: 'q' },
    { type: 'chat/stop' },
    { type: 'chat/stop', turnId: 3 },
    { type: 'chat/delta', turnId: 't', text: 'x' },
    { type: 'chat/ask', meetingId: 'm1', question: 'q', token: 'x' },
    'chat/ask',
    null,
  ])('rejects %j', (raw) => {
    expect(parseChatPortIn(raw)).toBeNull();
  });

  it('accepts chat/stop', () => {
    expect(parseChatPortIn({ type: 'chat/stop', turnId: 'm1:chat:0' })).toEqual({
      type: 'chat/stop',
      turnId: 'm1:chat:0',
    });
  });
});

describe('chat port: service worker → panel', () => {
  it.each([
    { type: 'chat/rejected', kind: 'empty-transcript' },
    { type: 'chat/rejected', kind: 'missing-key' },
    { type: 'chat/rejected', kind: 'busy' },
    { type: 'chat/rejected', kind: 'unknown-meeting' },
    { type: 'chat/turn', turn: view },
    { type: 'chat/turn', turn: { ...view, status: 'failed', error: 'too-large' } },
    { type: 'chat/model', turnId: 'm1:chat:0', model: 'claude-sonnet-5' },
    { type: 'chat/delta', turnId: 'm1:chat:0', text: 'Pricing [00:12]' },
    { type: 'chat/end', turnId: 'm1:chat:0', status: 'complete', error: null },
    { type: 'chat/end', turnId: 'm1:chat:0', status: 'failed', error: 'declined' },
    { type: 'chat/end', turnId: 'm1:chat:0', status: 'failed', error: 'no-answer' },
    { type: 'chat/turn', turn: { ...view, status: 'failed', error: 'no-answer', answer: '' } },
    { type: 'chat/end', turnId: 'm1:chat:0', status: 'stopped', error: null },
    { type: 'chat/end', turnId: 'm1:chat:0', status: 'cut-off', error: null },
  ])('accepts %j', (raw) => {
    expect(parseChatPortOut(raw)).toEqual(raw);
    expect(containsSecretField(raw)).toBe(false);
  });

  it.each([
    { type: 'chat/rejected', kind: 'too-large' },
    { type: 'chat/turn', turn: { ...view, contextBlock: 'Transcript of the meeting so far.' } },
    { type: 'chat/turn', turn: { ...view, sentLines: {} } },
    { type: 'chat/turn', turn: { ...view, apiKey: 'x' } },
    { type: 'chat/turn', turn: { ...view, status: 'thinking' } },
    { type: 'chat/turn', turn: { ...view, error: 'bad' } },
    { type: 'chat/turn', turn: { ...view, provider: 'gemini' } },
    { type: 'chat/end', turnId: 'm1:chat:0', status: 'streaming', error: null },
    { type: 'chat/end', turnId: 'm1:chat:0', status: 'failed' },
    { type: 'chat/delta', turnId: 'm1:chat:0' },
    { type: 'chat/model', turnId: 'm1:chat:0', model: '' },
    { type: 'chat/ask', meetingId: 'm1', question: 'q' },
  ])('rejects %j', (raw) => {
    expect(parseChatPortOut(raw)).toBeNull();
  });
});

describe('chat command replies (read by the panel)', () => {
  it('key hints: last four characters or null', () => {
    expect(parseChatKeyHintsReply({ anthropic: 'ab12', openai: null })).toEqual({ anthropic: 'ab12', openai: null });
  });

  it.each([
    [
      { anthropic: 'sk-ant-api03-whole-key', openai: 'cd34' },
      { anthropic: null, openai: 'cd34' },
    ],
    [
      { anthropic: '', openai: 5 },
      { anthropic: null, openai: null },
    ],
    [null, { anthropic: null, openai: null }],
  ])('key hints: anything else reads as no key (%j)', (raw, expected) => {
    expect(parseChatKeyHintsReply(raw)).toEqual(expected);
  });

  it('validate-chat-key: success with a hint', () => {
    expect(parseValidateChatKeyReply({ ok: true, hint: 'ab12' })).toEqual({ ok: true, hint: 'ab12' });
  });

  it.each(['invalid-key', 'forbidden', 'network', 'unknown', 'missing-key'])('validate-chat-key: %s', (kind) => {
    expect(parseValidateChatKeyReply({ ok: false, kind })).toEqual({ ok: false, kind });
  });

  it.each([
    { ok: true, hint: 'sk-ant-api03-whole-key' },
    { ok: true },
    { ok: false, kind: 'billing' },
    { ok: true, hint: 'ab12', key: 'x' },
    undefined,
  ])('validate-chat-key: a malformed reply reads as unknown (%j)', (raw) => {
    expect(parseValidateChatKeyReply(raw)).toEqual({ ok: false, kind: 'unknown' });
  });
});
