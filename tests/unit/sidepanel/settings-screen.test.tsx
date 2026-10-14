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

const SECTIONS = [
  'ElevenLabs API key',
  'ElevenLabs account',
  'Key terms',
  'Consent reminder',
  'Remembered names',
  'Microphone',
  'What ElevenLabs keeps',
];

describe('Settings screen contents (006 US3)', () => {
  it('has the name field first, then the sections in the contract order', async () => {
    const { screenEl } = await openSettings();
    const headings = within(screenEl)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
      .filter((t) => SECTIONS.includes(t ?? ''));
    expect(headings).toEqual(SECTIONS);
    const name = within(screenEl).getByLabelText('Your name');
    const keyHeading = within(screenEl).getByRole('heading', { name: 'ElevenLabs API key' });
    expect(name.compareDocumentPosition(keyHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('the refresh button fetches again', async () => {
    const { account, screenEl } = await openSettings();
    const region = within(screenEl).getByRole('region', { name: 'ElevenLabs account' });
    await within(region).findByText(/^Creator plan/);
    fireEvent.click(within(region).getByRole('button', { name: 'Refresh account status' }));
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
    const button = screen.getByRole('button', { name: 'Refresh account status' });
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
