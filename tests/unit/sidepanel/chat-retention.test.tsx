// 003 T064 (FR-016, constitution I, contracts/ask-ui.md row 8a): what the selected chat provider receives and keeps,
// in its own words (research R11, re-read 2026-10-09).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/entrypoints/sidepanel/App';
import { ChatRetention } from '@/entrypoints/sidepanel/components/ChatRetention';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const ANTHROPIC =
  'Each question sends the transcript so far, any notes you added to the meeting and this meeting’s questions and answers to Anthropic. Anthropic deletes API requests and answers within 30 days, keeps content its safety systems flag for up to 2 years, and does not train its models on API data by default.';
const OPENAI =
  'Each question sends the transcript so far, any notes you added to the meeting and this meeting’s questions and answers to OpenAI, with storage turned off. OpenAI keeps API requests for abuse monitoring for up to 30 days and does not train its models on API data by default.';

describe('ChatRetention', () => {
  it('Claude: What Anthropic keeps, the disclosure and the privacy link', () => {
    render(<ChatRetention provider="anthropic" />);
    const region = screen.getByRole('region', { name: 'What Anthropic keeps' });
    expect(within(region).getByRole('heading', { level: 3 }).textContent).toBe('What Anthropic keeps');
    expect(region.textContent).toContain(ANTHROPIC);
    const link = within(region).getByRole<HTMLAnchorElement>('link', { name: 'Anthropic privacy policy' });
    expect(link.href).toMatch(/^https:\/\/privacy\.claude\.com\//);
    expect(link.rel).toContain('noreferrer');
  });

  it('OpenAI: What OpenAI keeps, the disclosure and the data controls link', () => {
    render(<ChatRetention provider="openai" headingLevel={2} />);
    const region = screen.getByRole('region', { name: 'What OpenAI keeps' });
    expect(within(region).getByRole('heading', { level: 2 })).toBeTruthy();
    expect(region.textContent).toContain(OPENAI);
    const link = within(region).getByRole<HTMLAnchorElement>('link', { name: 'OpenAI data controls' });
    expect(link.href).toMatch(/^https:\/\/developers\.openai\.com\//);
  });
});

describe('ChatRetention in Settings (018 decision 109)', () => {
  it('is a closed disclosure whose summary is the heading text; opened, the text and link unchanged', () => {
    render(<ChatRetention provider="openai" collapsible />);
    const summary = screen.getByText('What OpenAI keeps', { selector: 'summary' });
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    expect(screen.queryByRole('heading')).toBeNull();
    details.open = true;
    expect(details.textContent).toContain(OPENAI);
    expect(within(details).getByRole('link', { name: 'OpenAI data controls' })).toBeTruthy();
  });
});

describe('Settings screen: the selected provider’s disclosure beside its key (018 FR-003)', () => {
  const summary = (settings: HTMLElement, text: string) => within(settings).queryByText(text, { selector: 'summary' });
  it('follows the provider chosen in Settings → Questions', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('region', { name: 'Settings' });
    const eleven = summary(settings, 'What ElevenLabs keeps')!;
    const openai = summary(settings, 'What OpenAI keeps')!;
    expect(eleven.compareDocumentPosition(openai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary(settings, 'What Anthropic keeps')).toBeNull();

    fireEvent.click(within(settings).getByRole('radio', { name: 'Claude' }));
    await waitFor(() => expect(summary(settings, 'What Anthropic keeps')).not.toBeNull());
    expect(summary(settings, 'What OpenAI keeps')).toBeNull();
  });

  it('puts What OpenAI keeps right after the OpenAI key, inside Questions, after the Transcription group', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('region', { name: 'Settings' });
    const questions = within(settings).getByRole('region', { name: 'Questions' });
    const names = within(questions)
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent);
    expect(names).toEqual(['OpenAI key']);
    const key = within(questions).getByRole('region', { name: 'OpenAI key' });
    expect(key.nextElementSibling).toBe(summary(questions, 'What OpenAI keeps')!.closest('details'));
    const eleven = within(settings).getByRole('region', { name: 'Transcription' });
    expect(summary(eleven, 'What ElevenLabs keeps')).not.toBeNull();
  });
});
