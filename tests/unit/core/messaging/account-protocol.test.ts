// 005 contracts/account-messages.md: the `account/usage` command and the reply the panel validates.
import { describe, expect, it } from 'vitest';
import { parseAccountUsageReply, parseCommand } from '@/core/messaging/protocol';

const usage = { tier: 'creator', creditsUsed: 19_360, creditsLimit: 121_000, resetAt: 1_792_454_400_000 };

describe('account/usage command', () => {
  it('is accepted', () => {
    expect(parseCommand({ type: 'account/usage' })).toEqual({ type: 'account/usage' });
  });

  it('is rejected with a key-like field', () => {
    expect(parseCommand({ type: 'account/usage', apiKey: 'x' })).toBeNull();
  });
});

describe('account usage reply', () => {
  it('accepts a success reply with derived fields only', () => {
    expect(parseAccountUsageReply({ ok: true, usage })).toEqual({ ok: true, usage });
  });

  it('accepts unknown tier and missing reset as null', () => {
    const u = { ...usage, tier: null, resetAt: null };
    expect(parseAccountUsageReply({ ok: true, usage: u })).toEqual({ ok: true, usage: u });
  });

  it('drops fields beyond the derived ones', () => {
    expect(parseAccountUsageReply({ ok: true, usage: { ...usage, raw: { voice_limit: 30 } } })).toEqual({
      ok: true,
      usage,
    });
  });

  it.each(['missing', 'missing-permission', 'invalid', 'network', 'rate-limited', 'unknown'])(
    'accepts error kind %s',
    (kind) => expect(parseAccountUsageReply({ ok: false, kind })).toEqual({ ok: false, kind }),
  );

  it.each([
    ['negative used', { ok: true, usage: { ...usage, creditsUsed: -1 } }],
    ['NaN limit', { ok: true, usage: { ...usage, creditsLimit: Number.NaN } }],
    ['infinite limit', { ok: true, usage: { ...usage, creditsLimit: Number.POSITIVE_INFINITY } }],
    ['numeric tier', { ok: true, usage: { ...usage, tier: 3 } }],
    ['string resetAt', { ok: true, usage: { ...usage, resetAt: '2026-10-20' } }],
    ['missing usage', { ok: true }],
    ['unknown kind', { ok: false, kind: 'boom' }],
    ['secret-looking field', { ok: true, usage, apiKey: 'x' }],
    ['nested secret', { ok: true, usage: { ...usage, xiApiKey: 'x' } }],
    ['not an object', 'ok'],
  ])('rejects %s', (_name, reply) => expect(parseAccountUsageReply(reply)).toBeNull());
});
