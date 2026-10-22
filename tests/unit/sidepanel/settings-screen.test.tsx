// 006 T021 (US3, FR-011, contracts/panel-ui.md "Settings screen"; copy-review D9, K24–K26): every setting, the
// ElevenLabs account details and the retention disclosure on one screen, in order. Carries over 005's rendering cases.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_ERROR_KINDS, ACCOUNT_ERROR_MESSAGES, type AccountUsageReply } from '@/core/account/usage';
import { App } from '@/entrypoints/sidepanel/App';
import { AccountDetails } from '@/entrypoints/sidepanel/components/AccountDetails';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const NOW = Date.UTC(2026, 9, 8, 9, 0);
const usage = { tier: 'creator', creditsUsed: 19_360, creditsLimit: 121_000, resetAt: Date.UTC(2026, 9, 20) };
const LINE = 'Creator plan · 84% of credits left · renews in 12 days (Oct 20)';

async function openSettings(reply: Promise<AccountUsageReply> = Promise.resolve({ ok: true, usage })) {
  const account = { usage: vi.fn(() => reply) };
  const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
  render(<App api={api} meetings={fakeMeetingApi().api} account={account} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  return { account, screenEl: screen.getByRole('region', { name: 'Settings' }) };
}

const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const inOrder = (els: Element[]) => els.every((el, i) => i === 0 || before(els[i - 1]!, el));
const h4s = (group: HTMLElement) =>
  within(group)
    .getAllByRole('heading', { level: 4 })
    .map((h) => h.textContent);

describe('Settings screen contents (006 US3; 018 groups, decision 105)', () => {
  it('has three groups, Transcription, Speaker names and Questions, and nothing outside them', async () => {
    const { screenEl } = await openSettings();
    const groups = within(screenEl).getAllByRole('heading', { level: 3 });
    expect(groups.map((h) => h.textContent)).toEqual(['Transcription', 'Speaker names', 'Questions']);
    const sections = groups.map((h) => h.closest('section')!);
    expect(sections.map((g) => g.getAttribute('aria-labelledby'))).toEqual(groups.map((h) => h.id));
    expect(Array.from(screenEl.children).slice(1)).toEqual(sections);
  });

  it('Transcription: the ElevenLabs key, account and what it keeps, key terms, fillers, microphone, consent reminder', async () => {
    const { screenEl } = await openSettings();
    const group = within(screenEl).getByRole('region', { name: 'Transcription' });
    expect(h4s(group)).toEqual(['ElevenLabs API key', 'ElevenLabs account', 'What ElevenLabs keeps', 'Key terms']);
    const g = within(group);
    expect(
      inOrder([
        g.getByRole('region', { name: 'What ElevenLabs keeps' }),
        g.getByRole('heading', { name: 'Key terms' }),
        g.getByRole('checkbox', { name: 'Leave out fillers and false starts' }),
        g.getByRole('button', { name: 'Allow microphone' }),
        g.getByRole('checkbox', {
          name: 'Remind me to tell participants they are being transcribed each time I press Start',
        }),
      ]),
    ).toBe(true);
  });

  it('Speaker names: your name, Show Meet captions, remembered names', async () => {
    const { screenEl } = await openSettings();
    const group = within(screenEl).getByRole('region', { name: 'Speaker names' });
    const g = within(group);
    expect(h4s(group)).toEqual(['Remembered names']);
    expect(
      inOrder([
        g.getByLabelText('Your name'),
        g.getByRole('button', { name: 'Save name' }),
        g.getByRole('checkbox', { name: 'Show Meet captions' }),
        g.getByRole('heading', { name: 'Remembered names' }),
      ]),
    ).toBe(true);
    expect(await g.findByText(/No remembered names yet/)).toBeTruthy();
  });

  it('Questions: the Ask tick box, provider and model, the selected provider’s key and what it keeps', async () => {
    const { screenEl } = await openSettings();
    const group = within(screenEl).getByRole('region', { name: 'Questions' });
    const g = within(group);
    expect(h4s(group)).toEqual(['OpenAI API key', 'What OpenAI keeps']);
    expect(
      inOrder([
        g.getByRole('checkbox', { name: 'Ask questions about the meeting' }),
        g.getByRole('radiogroup', { name: 'Answers from' }),
        g.getByRole('combobox', { name: 'Model' }),
        g.getByRole('region', { name: 'OpenAI API key' }),
        g.getByRole('region', { name: 'What OpenAI keeps' }),
      ]),
    ).toBe(true);
  });

  it('Questions with Ask off holds only its heading and the tick box (017)', async () => {
    const { screenEl } = await openSettings();
    const group = within(screenEl).getByRole('region', { name: 'Questions' });
    fireEvent.click(within(group).getByRole('checkbox', { name: 'Ask questions about the meeting' }));
    await waitFor(() => expect(within(group).queryByRole('radiogroup')).toBeNull());
    expect(
      within(group)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Questions']);
    expect(group.querySelectorAll('input, select, button, a')).toHaveLength(1);
    expect(screenEl.textContent).not.toContain('What OpenAI keeps');
  });

  it('shows the account line, exact credits and caveat directly, with no Details disclosure (D9)', async () => {
    const { screenEl } = await openSettings();
    const account = within(screenEl).getByRole('region', { name: 'ElevenLabs account' });
    expect(await within(account).findByText(/^Creator plan · 84% of credits left/)).toBeTruthy();
    expect(account.textContent).toContain('19,360 of 121,000 credits used · 101,640 left');
    expect(account.textContent).toContain(
      'The percentage is of your plan’s credits, shared by everything you use ElevenLabs for, not only live-assist.',
    );
    expect(account.querySelector('details, summary')).toBeNull();
    expect(within(account).queryByText('Details')).toBeNull();
  });

  it('Check again fetches again', async () => {
    const { account, screenEl } = await openSettings();
    const region = within(screenEl).getByRole('region', { name: 'ElevenLabs account' });
    await within(region).findByText(/^Creator plan/);
    fireEvent.click(within(region).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(account.usage).toHaveBeenCalledTimes(2));
  });

  it('holds the retention disclosure', async () => {
    const { screenEl } = await openSettings();
    const retention = within(screenEl).getByRole('region', { name: 'What ElevenLabs keeps' });
    expect(retention.textContent).toContain('Audio is sent to ElevenLabs for transcription.');
    expect(within(retention).getByRole('link', { name: 'ElevenLabs privacy policy' })).toBeTruthy();
  });
});

describe('AccountDetails (005 rendering, on the Settings screen since 006)', () => {
  const show = (reply: AccountUsageReply | null, busy = false, refresh = vi.fn()) => {
    render(<AccountDetails account={{ reply, busy, refresh }} now={() => NOW} timeZone="UTC" />);
    return { refresh, region: screen.getByRole('region', { name: 'ElevenLabs account' }) };
  };

  it('says it is checking before the first reply', () => {
    const { region } = show(null, true);
    expect(region.textContent).toContain('Checking plan…');
    expect(region.getAttribute('aria-busy')).toBe('true');
  });

  it('shows the line and the exact numbers', () => {
    const { region } = show({ ok: true, usage });
    expect(within(region).getByText(LINE)).toBeTruthy();
    expect(region.textContent).toContain('19,360 of 121,000 credits used · 101,640 left');
  });

  it('marks refresh disabled while in flight, keeping the line and focus', () => {
    const refresh = vi.fn();
    render(
      <AccountDetails account={{ reply: { ok: true, usage }, busy: true, refresh }} now={() => NOW} timeZone="UTC" />,
    );
    const button = screen.getByRole('button', { name: 'Check again' });
    button.focus();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(document.activeElement).toBe(button);
    expect(screen.getByText(LINE)).toBeTruthy();
  });

  it.each(ACCOUNT_ERROR_KINDS)('shows the plain sentence for %s', (kind) => {
    const { region } = show({ ok: false, kind });
    expect(within(region).getByText(ACCOUNT_ERROR_MESSAGES[kind])).toBeTruthy();
  });

  it('uses the exact permission wording', () => {
    const { region } = show({ ok: false, kind: 'missing-permission' });
    expect(
      within(region).getByText("API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io"),
    ).toBeTruthy();
  });
});
