// 006 T008 (US1, FR-003, FR-004, FR-016; copy-review D12, K32): nothing settings-related on the main view.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountApi } from '@/entrypoints/sidepanel/account-api';
import { App } from '@/entrypoints/sidepanel/App';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const account: AccountApi = {
  usage: vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      usage: { tier: 'creator', creditsUsed: 19_360, creditsLimit: 121_000, resetAt: null },
    }),
  ),
};

async function mainView() {
  const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
  render(<App api={api} meetings={fakeMeetingApi().api} account={account} />);
  await screen.findByRole('button', { name: 'Settings' });
  return document.querySelector<HTMLElement>('.main-view')!;
}

describe('main view (006 US1)', () => {
  it('has no settings field, checkbox, retention text or account line', async () => {
    const view = await mainView();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(view.textContent).not.toContain('What ElevenLabs keeps');
    expect(view.textContent).not.toContain('Improve the models for everyone');
    expect(view.textContent).not.toMatch(/plan ·/);
  });

  it('has no Retention row in the status line (D12)', async () => {
    await mainView();
    const status = screen.getByRole('region', { name: 'Status' });
    expect(status.textContent).not.toContain('Retention');
    expect(status.textContent).not.toContain('What ElevenLabs keeps');
  });

  it('keeps live-assist as a visually hidden level-1 heading (K32)', async () => {
    await mainView();
    const h1 = screen.getByRole('heading', { level: 1, name: 'live-assist' });
    expect(h1.className).toContain('sr-only');
  });
});
