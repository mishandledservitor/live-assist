// 008 T034: where the notes controls sit (contracts/notes-ui.md "Placement"): beside Start for the next meeting while
// nothing runs, and at the top of the Ask dock for the meeting shown; without a notes API nothing changes.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/sidepanel/App';
import { StartControls } from '@/entrypoints/sidepanel/components/StartControls';
import { readChatMeeting } from '../../support/chat-meetings';
import { fakeChatApi } from './fake-chat-api';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeNotesApi } from './fake-notes-api';
import { fakeSettingsApi } from './fake-settings-api';

const standup = readChatMeeting('standup-en');

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const settings = () =>
  fakeSettingsApi(
    {
      userName: 'Alex',
      firstRunComplete: true,
      chat: {
        provider: 'openai',
        models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
        setupComplete: true,
      },
    },
    'a1b2',
  ).api;

describe('notes on the main view', () => {
  it('beside Start for the next meeting, and in the Ask dock for the stopped meeting shown', async () => {
    const notes = fakeNotesApi({ [standup.meeting.id]: { name: 'agenda.md', source: 'file' } });
    render(
      <App
        api={settings()}
        meetings={fakeMeetingApi(standup).api}
        chat={fakeChatApi({ [standup.meeting.id]: [] }).api}
        notes={notes.api}
      />,
    );
    await screen.findByRole('textbox', { name: 'Question' });
    const view = document.querySelector<HTMLElement>('.main-view')!;
    const forNext = await within(view).findByRole('button', { name: 'Add notes for the next meeting' });
    const start = within(view).getByRole('button', { name: 'Start' });
    expect(start.compareDocumentPosition(forNext) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const chip = await within(view).findByRole('button', { name: 'Notes: agenda.md' });
    expect(chip.closest('.ask-dock')).not.toBeNull();
    expect(notes.api.get).toHaveBeenCalledWith({ kind: 'meeting', meetingId: standup.meeting.id });
  });

  it('without a notes API the main view has no notes controls', async () => {
    render(
      <App
        api={settings()}
        meetings={fakeMeetingApi(standup).api}
        chat={fakeChatApi({ [standup.meeting.id]: [] }).api}
      />,
    );
    await screen.findByRole('textbox', { name: 'Question' });
    expect(screen.queryByRole('button', { name: /Add notes/ })).toBeNull();
  });
});

describe('StartControls notes slot', () => {
  const props = {
    api: { start: vi.fn(), stop: vi.fn() },
    ready: true,
    notReadyReason: null,
    meeting: null,
    onChanged: vi.fn(),
    consentReminder: false,
    notes: <button type="button">notes-slot</button>,
  };

  it('shows the slot after the language picker while nothing runs', () => {
    render(<StartControls {...props} running={false} />);
    const slot = screen.getByRole('button', { name: 'notes-slot' });
    const language = screen.getByRole('combobox');
    expect(language.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides it while a meeting runs', () => {
    render(<StartControls {...props} running />);
    expect(screen.queryByRole('button', { name: 'notes-slot' })).toBeNull();
  });
});
