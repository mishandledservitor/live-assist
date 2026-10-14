// 003 T064 (FR-016, constitution I, contracts/ask-ui.md row 8a): what the selected chat provider receives and keeps,
// in its own words (research R11, re-read 2026-10-09).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

describe('Settings screen: the selected provider’s disclosure after What ElevenLabs keeps', () => {
  it('follows the provider chosen in Settings → Questions', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('region', { name: 'Settings' });
    const eleven = within(settings).getByRole('heading', { name: 'What ElevenLabs keeps' });
    const openai = within(settings).getByRole('heading', { name: 'What OpenAI keeps' });
    expect(eleven.compareDocumentPosition(openai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(settings).queryByRole('heading', { name: 'What Anthropic keeps' })).toBeNull();

    fireEvent.click(within(settings).getByRole('radio', { name: 'Claude' }));
    expect(await within(settings).findByRole('heading', { name: 'What Anthropic keeps' })).toBeTruthy();
    expect(within(settings).queryByRole('heading', { name: 'What OpenAI keeps' })).toBeNull();
  });

  it('places Questions, Claude API key and OpenAI API key after Key terms', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('region', { name: 'Settings' });
    const names = within(settings)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    const at = (n: string) => names.indexOf(n);
    expect(at('Key terms')).toBeGreaterThan(-1);
    expect(at('Questions')).toBe(at('Key terms') + 1);
    expect(at('Claude API key')).toBe(at('Questions') + 1);
    expect(at('OpenAI API key')).toBe(at('Claude API key') + 1);
  });
});
