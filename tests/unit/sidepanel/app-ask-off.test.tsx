// 017 T004, T005 (US1; FR-001 to FR-007, FR-009; design decision 103): the tick box `Ask questions about the meeting`
// under Settings → Questions turns Ask off. Off, the main view has no Ask or notes element in any state, Settings shows
// no provider, key or retention text, nothing is asked, and an answer still arriving is stopped.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatKeyHintsReply } from '@/core/messaging/protocol';
import type { Settings } from '@/core/settings/schema';
import { initialStatus, reduceStatus } from '@/core/status/status';
import { App } from '@/entrypoints/sidepanel/App';
import { notesKey } from '@/entrypoints/sidepanel/notes-api';
import { readChatMeeting } from '../../support/chat-meetings';
import { storedMeeting, storedSegment } from '../../support/stored-meetings';
import { chatTurnView, fakeChatApi } from './fake-chat-api';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeNotesApi } from './fake-notes-api';
import { fakeSettingsApi } from './fake-settings-api';
import { fakeTranscriptsApi } from './fake-transcripts-api';

const standup = readChatMeeting('standup-en');
const ASK = 'Ask questions about the meeting';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function settings(over: Partial<Settings> = {}, chatKeyHints: ChatKeyHintsReply = { anthropic: null, openai: null }) {
  return fakeSettingsApi(
    {
      userName: 'Alex',
      firstRunComplete: true,
      consentReminder: false,
      chat: {
        provider: 'openai',
        models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
        setupComplete: true,
      },
      ...over,
    },
    'a1b2',
    chatKeyHints,
  );
}

async function open(
  opts: {
    over?: Partial<Settings>;
    meetings?: ReturnType<typeof fakeMeetingApi>;
    keys?: { anthropic: string | null; openai: string | null };
  } = {},
) {
  const s = settings(opts.over, opts.keys);
  const meetings = opts.meetings ?? fakeMeetingApi(standup);
  const chat = fakeChatApi({
    [standup.meeting.id]: [chatTurnView({ seq: 0, meetingId: standup.meeting.id, question: 'Earlier question?' })],
  });
  const notes = fakeNotesApi({
    [standup.meeting.id]: { name: 'agenda.md', source: 'file' },
    [notesKey({ kind: 'next' })]: { name: 'plan.md', source: 'file' },
  });
  render(
    <App
      api={s.api}
      meetings={meetings.api}
      chat={chat.api}
      notes={notes.api}
      transcripts={fakeTranscriptsApi([]).api}
    />,
  );
  await screen.findByRole('button', { name: 'Settings' });
  return { settings: s, meetings, chat, notes };
}

const mainView = () => document.querySelector<HTMLElement>('.main-view')!;
const onMain = () => within(mainView());
const settingsScreen = () => within(screen.getByRole('region', { name: 'Settings' }));

/** No Ask or notes element anywhere on the main view (FR-002, SC-001). */
function expectNoAsk() {
  const view = onMain();
  expect(view.queryByRole('textbox', { name: 'Question' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Ask' })).toBeNull();
  expect(view.queryByRole('region', { name: 'Questions and answers' })).toBeNull();
  expect(view.queryByText(/key in Settings to ask questions/)).toBeNull();
  expect(view.queryByText('GPT-6 Luna')).toBeNull();
  expect(view.queryByRole('button', { name: /notes/i })).toBeNull();
  expect(mainView().querySelector('.ask-area, .ask-dock')).toBeNull();
}

async function openSettings() {
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
}

const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }));

describe('the Ask setting in Settings (017 FR-001, FR-003, FR-005)', () => {
  it('is the first control under Questions, ticked by default', async () => {
    await open();
    await openSettings();
    const box = settingsScreen().getByRole<HTMLInputElement>('checkbox', { name: ASK });
    expect(box.checked).toBe(true);
    const heading = settingsScreen().getByRole('heading', { name: 'Questions' });
    const radios = settingsScreen().getByRole('radiogroup', { name: 'Answers from' });
    expect(heading.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(radios) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('unticked, hides the provider, model, keys and retention text and saves at once; ticked, brings them back', async () => {
    const { settings: s } = await open({ keys: { anthropic: 'wxyz', openai: 'abcd' } });
    await openSettings();
    fireEvent.click(settingsScreen().getByRole('checkbox', { name: ASK }));
    expect(s.api.saveSettings).toHaveBeenCalledWith({ askEnabled: false });
    await waitFor(() => expect(settingsScreen().queryByRole('radiogroup', { name: 'Answers from' })).toBeNull());
    expect(settingsScreen().getByRole('heading', { name: 'Questions' })).toBeTruthy();
    expect(settingsScreen().getByRole<HTMLInputElement>('checkbox', { name: ASK }).checked).toBe(false);
    expect(settingsScreen().queryByRole('combobox', { name: 'Model' })).toBeNull();
    expect(settingsScreen().queryByRole('region', { name: 'OpenAI key' })).toBeNull();
    expect(settingsScreen().queryByRole('region', { name: 'Claude key' })).toBeNull();
    expect(settingsScreen().queryByText('What OpenAI keeps')).toBeNull();

    fireEvent.click(settingsScreen().getByRole('checkbox', { name: ASK }));
    expect(s.api.saveSettings).toHaveBeenLastCalledWith({ askEnabled: true });
    const openai = await settingsScreen().findByRole('region', { name: 'OpenAI key' });
    expect(within(openai).getByText('abcd', { exact: false })).toBeTruthy();
    expect(settingsScreen().getByText('What OpenAI keeps', { selector: 'summary' })).toBeTruthy(); // 018 decision 109
    expect(s.api.removeChatKey).not.toHaveBeenCalled();
  });

  it('a panel opened with Ask off shows the tick box unticked and no provider or key', async () => {
    await open({ over: { askEnabled: false } });
    await openSettings();
    expect(settingsScreen().getByRole<HTMLInputElement>('checkbox', { name: ASK }).checked).toBe(false);
    expect(settingsScreen().queryByRole('radiogroup', { name: 'Answers from' })).toBeNull();
    expect(settingsScreen().queryByText('What OpenAI keeps')).toBeNull();
  });
});

describe('the main view with Ask off (017 FR-002, FR-009, SC-001)', () => {
  // The meeting's own Stop beside Start is not Ask's: `expectNoAsk` checks for no Ask area at all instead.
  it('with no meeting: no notes control beside Start', async () => {
    await open({ over: { askEnabled: false }, meetings: fakeMeetingApi(null) });
    await onMain().findByRole('button', { name: 'Start' });
    await act(async () => {});
    expectNoAsk();
  });

  it('with a stopped meeting: the transcript and its actions, no Ask; after Close transcript, still none', async () => {
    const { chat, notes } = await open({ over: { askEnabled: false } });
    await onMain().findByRole('button', { name: 'Close transcript' });
    expectNoAsk();
    for (const name of ['Download transcript', 'Close transcript', 'Delete transcript', 'Transcripts'])
      expect(onMain().getByRole('button', { name })).toBeTruthy();
    fireEvent.click(onMain().getByRole('button', { name: 'Close transcript' }));
    await waitFor(() => expect(onMain().queryByRole('button', { name: 'Close transcript' })).toBeNull());
    expectNoAsk();
    expect(chat.api.listTurns).not.toHaveBeenCalled();
    expect(notes.api.get).not.toHaveBeenCalled();
  });

  it('from Start to Stop: no Ask while running or after, and nothing is asked or read', async () => {
    const meetings = fakeMeetingApi(null);
    let emit: (e: unknown) => void = () => undefined;
    meetings.api.connect.mockImplementation((onEvent: (e: unknown) => void, onDisconnect: () => void) => {
      emit = onEvent;
      queueMicrotask(onDisconnect);
      return () => undefined;
    });
    const { chat, notes } = await open({ over: { askEnabled: false }, meetings });
    fireEvent.click(await onMain().findByRole('button', { name: 'Start' }));
    await waitFor(() => expect(meetings.api.start).toHaveBeenCalled());
    const running = storedMeeting({ id: 'live', endedAt: null, endReason: null });
    const starting = reduceStatus(initialStatus(), { type: 'capture', state: 'starting' });
    const lines = [storedSegment('live', 0, { text: 'Running line.' })];
    act(() => emit({ type: 'live/snapshot', meeting: running, segments: lines, partials: [], status: starting }));
    expect(onMain().getByText('Running line.')).toBeTruthy();
    expectNoAsk();
    act(() =>
      emit({
        type: 'live/snapshot',
        meeting: { ...running, endedAt: running.startedAt + 60_000, endReason: 'user-stop' },
        segments: lines,
        partials: [],
        status: reduceStatus(starting, { type: 'capture', state: 'stopped' }),
      }),
    );
    await onMain().findByRole('button', { name: 'Close transcript' });
    expectNoAsk();
    expect(chat.api.ask).not.toHaveBeenCalled();
    expect(chat.api.listTurns).not.toHaveBeenCalled();
    expect(notes.api.get).not.toHaveBeenCalled();
  });
});

describe('turning Ask off and on in the open panel (017 FR-005, FR-006)', () => {
  it('applies to the main view at once, and turning it on brings back the earlier answers and notes', async () => {
    const { chat } = await open({ keys: { anthropic: null, openai: 'abcd' } });
    await onMain().findByRole('textbox', { name: 'Question' });
    await onMain().findByText('Earlier question?');
    await onMain().findByRole('button', { name: 'Notes: agenda.md' });
    await openSettings();
    fireEvent.click(settingsScreen().getByRole('checkbox', { name: ASK }));
    back();
    await waitFor(expectNoAsk);

    await openSettings();
    fireEvent.click(settingsScreen().getByRole('checkbox', { name: ASK }));
    back();
    expect(await onMain().findByRole('textbox', { name: 'Question' })).toBeTruthy();
    expect(await onMain().findByText('Earlier question?')).toBeTruthy();
    expect(await onMain().findByRole('button', { name: 'Notes: agenda.md' })).toBeTruthy();
    expect(onMain().getByText('GPT-6 Luna')).toBeTruthy();
    expect(chat.api.listTurns).toHaveBeenCalledTimes(2);
  });
});

describe('an answer arriving when Ask is turned off (017 FR-007)', () => {
  it('is stopped as its own Stop would, the waiting question is never sent, and unsent text is dropped', async () => {
    const { chat } = await open({ keys: { anthropic: null, openai: 'abcd' } });
    const box = await onMain().findByRole('textbox', { name: 'Question' });
    fireEvent.change(box, { target: { value: 'First?' } });
    fireEvent.click(onMain().getByRole('button', { name: 'Ask' }));
    const turn = chatTurnView({ seq: 1, meetingId: standup.meeting.id, question: 'First?' });
    act(() => chat.emit({ type: 'chat/turn', turn: { ...turn, answer: '', status: 'streaming', answeredBy: null } }));
    act(() => chat.emit({ type: 'chat/delta', turnId: turn.id, text: 'Partly ' }));
    fireEvent.change(box, { target: { value: 'Second?' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.change(box, { target: { value: 'Never sent' } });
    expect(chat.api.ask).toHaveBeenCalledTimes(1);

    await openSettings();
    fireEvent.click(settingsScreen().getByRole('checkbox', { name: ASK }));
    await waitFor(() => expect(chat.api.stop).toHaveBeenCalledTimes(1));
    expect(chat.api.stop).toHaveBeenCalledWith(turn.id);
    act(() => chat.emit({ type: 'chat/end', turnId: turn.id, status: 'stopped', error: null }));
    expect(chat.api.ask).toHaveBeenCalledTimes(1);

    fireEvent.click(settingsScreen().getByRole('checkbox', { name: ASK }));
    back();
    const again = await onMain().findByRole<HTMLTextAreaElement>('textbox', { name: 'Question' });
    expect(again.value).toBe('');
    expect(chat.api.ask).toHaveBeenCalledTimes(1);
  });
});
