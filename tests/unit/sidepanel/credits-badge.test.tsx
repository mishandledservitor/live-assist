// 006 T028 (US4, FR-014, FR-015): the header badge shows 005's account status at a glance and opens its details; it
// never affects Start (005 FR-011).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_ERROR_MESSAGES, type AccountUsageReply } from '@/core/account/usage';
import { App } from '@/entrypoints/sidepanel/App';
import { CreditsBadge } from '@/entrypoints/sidepanel/components/CreditsBadge';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const NOW = Date.UTC(2026, 9, 8, 9, 0);
const usage = { tier: 'creator', creditsUsed: 19_360, creditsLimit: 121_000, resetAt: Date.UTC(2026, 9, 20) };
const LINE = 'Creator plan · 84% of credits left · renews in 12 days (Oct 20)';
const PERMISSION = ACCOUNT_ERROR_MESSAGES['missing-permission'];

function show(reply: AccountUsageReply | null, busy = false) {
  const onOpenAccount = vi.fn();
  render(
    <CreditsBadge
      account={{ reply, busy, refresh: vi.fn() }}
      onOpenAccount={onOpenAccount}
      now={() => NOW}
      timeZone="UTC"
    />,
  );
  return onOpenAccount;
}

describe('CreditsBadge', () => {
  it('shows the percentage, named and titled with the full account line', () => {
    show({ ok: true, usage });
    const badge = screen.getByRole('button', { name: LINE });
    expect(badge.textContent).toBe('84%');
    expect(badge.getAttribute('title')).toBe(LINE);
    expect(badge.getAttribute('aria-busy')).toBe('false');
  });

  it('reads Checking plan… and is busy before the first reply', () => {
    show(null, true);
    const badge = screen.getByRole('button', { name: 'ElevenLabs account' });
    expect(badge.textContent).toBe('Checking plan…');
    expect(badge.getAttribute('aria-busy')).toBe('true');
  });

  it("shows a problem mark named with the exact 'User: Read' message", () => {
    show({ ok: false, kind: 'missing-permission' });
    const badge = screen.getByRole('button', { name: PERMISSION });
    expect(badge.textContent).toBe('!');
    expect(badge.getAttribute('title')).toBe(PERMISSION);
    expect(badge.className).toContain('mark-problem');
  });

  it('activating it asks to open the account details', () => {
    const onOpenAccount = show({ ok: true, usage });
    fireEvent.click(screen.getByRole('button', { name: LINE }));
    expect(onOpenAccount).toHaveBeenCalled();
  });
});

describe('CreditsBadge in the panel', () => {
  const renderApp = (reply: Promise<AccountUsageReply>) => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    render(<App api={api} meetings={fakeMeetingApi().api} account={{ usage: () => reply }} />);
  };
  const start = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Start' });

  it('sits in the header, and Start stays enabled when the check fails', async () => {
    renderApp(Promise.resolve({ ok: false, kind: 'missing-permission' }));
    const badge = await screen.findByRole('button', { name: PERMISSION });
    expect(document.querySelector('header')!.contains(badge)).toBe(true);
    expect(start().disabled).toBe(false);
  });

  it('keeps Start enabled while the check is pending', async () => {
    renderApp(new Promise(() => undefined));
    expect(await screen.findByRole('button', { name: 'ElevenLabs account' })).toBeTruthy();
    expect(start().disabled).toBe(false);
  });

  // 018 decision 108: the account section has no heading of its own; focus lands on the section, named for it.
  it('opens Settings with the account section focused', async () => {
    renderApp(Promise.resolve({ ok: true, usage }));
    const badge = await screen.findByRole('button', { name: /^Creator plan · 84% of credits left/ });
    fireEvent.click(badge);
    const account = screen.getByRole('region', { name: 'ElevenLabs account' });
    await waitFor(() => expect(document.activeElement).toBe(account));
    expect(screen.getByRole('heading', { level: 2, name: 'Settings' })).toBeTruthy();
  });
});
