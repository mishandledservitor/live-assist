// 005: the panel asks the service worker for the account status and trusts only a validated reply (FR-009).
import { describe, expect, it, vi } from 'vitest';
import { createAccountApi } from '@/entrypoints/sidepanel/account-api';

const usage = { tier: 'creator', creditsUsed: 19_360, creditsLimit: 121_000, resetAt: 1_792_454_400_000 };

describe('createAccountApi', () => {
  it('sends account/usage and returns a valid reply', async () => {
    const sendCommand = vi.fn(() => Promise.resolve<unknown>({ ok: true, usage }));
    expect(await createAccountApi({ sendCommand }).usage()).toEqual({ ok: true, usage });
    expect(sendCommand).toHaveBeenCalledWith({ type: 'account/usage' });
  });

  it('passes an error kind through', async () => {
    const sendCommand = () => Promise.resolve<unknown>({ ok: false, kind: 'missing-permission' });
    expect(await createAccountApi({ sendCommand }).usage()).toEqual({ ok: false, kind: 'missing-permission' });
  });

  it.each([undefined, { ok: true }, { ok: true, usage: { ...usage, creditsUsed: 'lots' } }])(
    'treats malformed reply %o as unknown',
    async (reply) => {
      const sendCommand = () => Promise.resolve<unknown>(reply);
      expect(await createAccountApi({ sendCommand }).usage()).toEqual({ ok: false, kind: 'unknown' });
    },
  );

  it('treats a failed send (no service worker answer) as unknown', async () => {
    const sendCommand = () => Promise.reject(new Error('Could not establish connection'));
    expect(await createAccountApi({ sendCommand }).usage()).toEqual({ ok: false, kind: 'unknown' });
  });
});
