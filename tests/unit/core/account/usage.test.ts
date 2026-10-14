// 005 US1: the one account line and its detail (spec FR-001–FR-007, research R2 and R6).
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_ERROR_KINDS,
  ACCOUNT_ERROR_MESSAGES,
  REALTIME_STT_CREDITS_PER_MINUTE,
  describeAccount,
  describeBadge,
  type AccountUsage,
} from '@/core/account/usage';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 8, 9, 0); // 2026-10-08 09:00 UTC
const RESET = Date.UTC(2026, 9, 20); // 2026-10-20 00:00 UTC
const creator: AccountUsage = { tier: 'creator', creditsUsed: 19_360, creditsLimit: 121_000, resetAt: RESET };
const utc = { timeZone: 'UTC' } as const;

describe('REALTIME_STT_CREDITS_PER_MINUTE', () => {
  it('is unset: ElevenLabs publishes no credit rate for realtime transcription (research R2, open question)', () => {
    // Setting it needs a cited source (a measurement on the user's account or an ElevenLabs document) in its doc
    // comment, and this test updated to that figure.
    expect(REALTIME_STT_CREDITS_PER_MINUTE).toBeNull();
  });

  it('is what describeAccount uses by default', () => {
    expect(describeAccount(creator, NOW, utc).line).toBe(
      describeAccount(creator, NOW, { ...utc, ratePerMinute: REALTIME_STT_CREDITS_PER_MINUTE }).line,
    );
  });
});

describe('describeAccount line', () => {
  it('shows plan, percentage left and renewal when the rate is unknown (acceptance US1-1)', () => {
    expect(describeAccount(creator, NOW, { ...utc, ratePerMinute: null }).line).toBe(
      'Creator plan · 84% of credits left · renews in 12 days (Oct 20)',
    );
  });

  it('adds the minutes estimate after the percentage when a rate is known, rounded down', () => {
    expect(describeAccount(creator, NOW, { ...utc, ratePerMinute: 45 }).line).toBe(
      'Creator plan · 84% left · ≈ 2,258 min of transcription · renews in 12 days (Oct 20)',
    );
  });

  it('rounds the percentage down', () => {
    const u = { ...creator, creditsUsed: 151, creditsLimit: 1000 }; // 84.9% left
    expect(describeAccount(u, NOW, utc).line).toContain('84% of credits left');
  });

  it('shows <1% for a tiny non-zero remainder', () => {
    const u = { ...creator, creditsUsed: 999_999, creditsLimit: 1_000_000 };
    expect(describeAccount(u, NOW, utc).line).toContain('<1% of credits left');
  });

  it('never goes below 0% when usage is over the limit', () => {
    const u = { ...creator, creditsUsed: 31_250, creditsLimit: 30_000 };
    expect(describeAccount(u, NOW, utc).line).toContain('0% of credits left');
    expect(describeAccount(u, NOW, { ...utc, ratePerMinute: 45 }).line).toContain('≈ 0 min of transcription');
  });

  it('says no allowance is reported for a zero limit, with no percentage or minutes', () => {
    const u = { tier: 'free', creditsUsed: 0, creditsLimit: 0, resetAt: null };
    expect(describeAccount(u, NOW, { ...utc, ratePerMinute: 45 }).line).toBe(
      'Free plan · no credit allowance reported',
    );
  });

  it('leaves out the renewal when there is no reset date', () => {
    expect(describeAccount({ ...creator, resetAt: null }, NOW, utc).line).toBe('Creator plan · 84% of credits left');
  });

  it.each([
    [NOW + DAY / 2, 'renews in 1 day (Oct 8)'],
    [NOW + DAY, 'renews in 1 day (Oct 9)'],
    [NOW - DAY, 'renews today (Oct 7)'],
    [NOW, 'renews today (Oct 8)'],
  ])('renewal at %d reads "%s"', (resetAt, text) => {
    expect(describeAccount({ ...creator, resetAt }, NOW, utc).line).toContain(text);
  });

  it.each([
    ['growing_business', 'Growing business plan'],
    ['pro', 'Pro plan'],
    [null, 'Unknown plan'],
    ['', 'Unknown plan'],
  ])('tier %s is shown as "%s"', (tier, plan) => {
    expect(describeAccount({ ...creator, tier }, NOW, utc).line.startsWith(`${plan} · `)).toBe(true);
  });
});

describe('describeAccount detail', () => {
  it('gives the exact numbers with separators', () => {
    expect(describeAccount(creator, NOW, utc).detail).toContain('19,360 of 121,000 credits used · 101,640 left');
  });

  it('says what the percentage covers, and nothing about the missing minutes estimate (006 D8)', () => {
    expect(describeAccount(creator, NOW, { ...utc, ratePerMinute: null }).detail).toEqual([
      '19,360 of 121,000 credits used · 101,640 left',
      'The percentage is of your plan’s credits, shared by everything you use ElevenLabs for, not only live-assist.',
    ]);
  });

  it('adds no sentence repeating a missing allowance (006 D7)', () => {
    const none = { ...creator, creditsLimit: 0, creditsUsed: 0 };
    expect(describeAccount(none, NOW, utc).detail).toEqual(['0 of 0 credits used · 0 left']);
  });

  it('explains the minutes estimate when a rate is known', () => {
    const detail = describeAccount(creator, NOW, { ...utc, ratePerMinute: 45 }).detail.join(' ');
    expect(detail).toMatch(/45 credits per minute/);
    expect(detail).not.toMatch(/no estimate/i);
  });

  it('never shows the over-limit remainder as negative', () => {
    const u = { ...creator, creditsUsed: 31_250, creditsLimit: 30_000 };
    expect(describeAccount(u, NOW, utc).detail[0]).toBe('31,250 of 30,000 credits used · 0 left');
  });
});

// 006 US4 (FR-014, data-model.md "CreditsBadgeView"; copy-review R27, K25, K26).
describe('describeBadge', () => {
  it('reads Checking plan… before the first reply, named as the account', () => {
    expect(describeBadge(null, NOW, utc)).toEqual({
      text: 'Checking plan…',
      mark: 'loading',
      name: 'ElevenLabs account',
    });
  });

  it('shows the percentage left, named with the full account line', () => {
    expect(describeBadge({ ok: true, usage: creator }, NOW, utc)).toEqual({
      text: '84%',
      mark: 'ok',
      name: describeAccount(creator, NOW, utc).line,
    });
  });

  it('rounds like the account line, never overstating', () => {
    const almostEmpty = { ...creator, creditsUsed: 120_999 };
    expect(describeBadge({ ok: true, usage: almostEmpty }, NOW, utc).text).toBe('<1%');
    expect(describeBadge({ ok: true, usage: { ...creator, creditsUsed: 200_000 } }, NOW, utc).text).toBe('0%');
  });

  it('shows a neutral mark when there is no credit allowance', () => {
    const none = { ...creator, creditsLimit: 0, creditsUsed: 0 };
    expect(describeBadge({ ok: true, usage: none }, NOW, utc)).toEqual({
      text: '–',
      mark: 'neutral',
      name: describeAccount(none, NOW, utc).line,
    });
  });

  it.each(ACCOUNT_ERROR_KINDS)('shows a problem mark named with the %s message', (kind) => {
    expect(describeBadge({ ok: false, kind }, NOW, utc)).toEqual({
      text: '!',
      mark: 'problem',
      name: ACCOUNT_ERROR_MESSAGES[kind],
    });
  });

  it("names the 'User: Read' failure with the exact wording", () => {
    expect(describeBadge({ ok: false, kind: 'missing-permission' }, NOW, utc).name).toBe(
      "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io",
    );
  });
});

describe('ACCOUNT_ERROR_MESSAGES', () => {
  it('uses the exact permission wording (FR-010)', () => {
    expect(ACCOUNT_ERROR_MESSAGES['missing-permission']).toBe(
      "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io",
    );
  });

  it('has one plain sentence per kind', () => {
    for (const text of Object.values(ACCOUNT_ERROR_MESSAGES)) expect(text.length).toBeGreaterThan(10);
  });
});
