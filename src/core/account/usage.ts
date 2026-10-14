// 005: the user's ElevenLabs account status as the side panel shows it (spec FR-001–FR-007, data-model.md).
// The service worker derives these fields from ElevenLabs' answer; the panel never sees the key or the raw answer.

/** What the panel receives on success. */
export interface AccountUsage {
  /** Plan tier as ElevenLabs names it (e.g. "creator"); null when missing. */
  tier: string | null;
  /** Credits used in the current period (ElevenLabs `character_count`). */
  creditsUsed: number;
  /** Credits allowed in the current period (ElevenLabs `character_limit`); 0 = no allowance reported. */
  creditsLimit: number;
  /** Next reset, epoch ms; null when ElevenLabs gives none. */
  resetAt: number | null;
}

export type AccountErrorKind = 'missing' | 'missing-permission' | 'invalid' | 'network' | 'rate-limited' | 'unknown';

export const ACCOUNT_ERROR_KINDS: readonly AccountErrorKind[] = [
  'missing',
  'missing-permission',
  'invalid',
  'network',
  'rate-limited',
  'unknown',
];

export type AccountUsageReply = { ok: true; usage: AccountUsage } | { ok: false; kind: AccountErrorKind };

/**
 * Credits ElevenLabs charges per minute of realtime transcription (Scribe v2 Realtime) through the API, or null when
 * unknown. live-assist sends one mixed stream (constitution v1.1.0), so one meeting minute is one transcription minute.
 *
 * Null on purpose (research R2, 2026-10-08): https://elevenlabs.io/pricing states "Speech to Text 330 credits per
 * minute" for speech to text in general but nothing for the realtime model, which costs more than batch in dollars;
 * https://elevenlabs.io/pricing/api says "API usage is billed in US dollars, not credits" ($0.39 per hour for Scribe
 * v2 Realtime). Neither gives a credit rate for realtime API transcription, so no minutes estimate is shown. Set it
 * only from a cited source (e.g. the manual-check measurement) and update its test.
 */
export const REALTIME_STT_CREDITS_PER_MINUTE: number | null = null;

export const ACCOUNT_ERROR_MESSAGES: Record<AccountErrorKind, string> = {
  missing: 'No ElevenLabs API key is saved, so your plan cannot be checked.',
  'missing-permission': "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io",
  invalid: 'ElevenLabs rejected the API key, so your plan cannot be checked.',
  network: 'Could not reach ElevenLabs to check your plan.',
  'rate-limited': 'ElevenLabs is rate-limiting requests; refresh again in a minute.',
  unknown: 'ElevenLabs gave an unexpected answer about your plan.',
};

export interface DescribeOptions {
  /** Defaults to REALTIME_STT_CREDITS_PER_MINUTE. */
  ratePerMinute?: number | null;
  /** For tests; defaults to the browser's time zone. */
  timeZone?: string | undefined;
}

export interface AccountSummary {
  /** The one line: parts joined by " · ". */
  line: string;
  /** The exact credits and what the numbers cover (shown on the Settings screen). */
  detail: string[];
}

const DAY_MS = 86_400_000;
const SEP = ' · ';
const count = (n: number) => n.toLocaleString('en-US');

function planName(tier: string | null): string {
  const words = (tier ?? '').replace(/_/g, ' ').trim();
  return words === '' ? 'Unknown plan' : `${words.charAt(0).toUpperCase()}${words.slice(1)} plan`;
}

/** Whole percent left, rounded down so it never overstates; "<1" for a non-zero remainder under 1%. */
function percentLeft(left: number, limit: number): string {
  if (left <= 0) return '0';
  const pct = Math.floor((100 * left) / limit);
  return pct === 0 ? '<1' : String(Math.min(100, pct));
}

function renewal(resetAt: number, now: number, timeZone: string | undefined): string {
  const days = Math.max(0, Math.ceil((resetAt - now) / DAY_MS));
  const date = new Date(resetAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
  if (days === 0) return `renews today (${date})`;
  return `renews in ${days} day${days === 1 ? '' : 's'} (${date})`;
}

/** The panel's account line and detail (spec FR-001–FR-007). */
export function describeAccount(usage: AccountUsage, now: number, options: DescribeOptions = {}): AccountSummary {
  const rate = options.ratePerMinute === undefined ? REALTIME_STT_CREDITS_PER_MINUTE : options.ratePerMinute;
  const { creditsUsed: used, creditsLimit: limit } = usage;
  const left = Math.max(0, limit - used);
  const parts = [planName(usage.tier)];
  const detail = [`${count(used)} of ${count(limit)} credits used · ${count(left)} left`];

  if (limit === 0) {
    parts.push('no credit allowance reported');
  } else if (rate !== null && rate > 0) {
    parts.push(`${percentLeft(left, limit)}% left`, `≈ ${count(Math.floor(left / rate))} min of transcription`);
    detail.push(
      'Credits are your plan’s allowance, shared by everything you use ElevenLabs for, not only live-assist.',
      `Minutes assume ${count(rate)} credits per minute of live transcription.`,
    );
  } else {
    parts.push(`${percentLeft(left, limit)}% of credits left`);
    detail.push(
      'The percentage is of your plan’s credits, shared by everything you use ElevenLabs for, not only live-assist.',
    );
  }
  if (usage.resetAt !== null) parts.push(renewal(usage.resetAt, now, options.timeZone));
  return { line: parts.join(SEP), detail };
}

/** The header badge (006 US4): its short text, its mark, and the full sentence it stands for. */
export interface BadgeView {
  text: string;
  mark: 'ok' | 'neutral' | 'problem' | 'loading';
  /** Accessible name and tooltip: the account line or the error message (copy-review K25, K26). */
  name: string;
}

/** The credits badge for a reply; null = no reply yet (data-model.md "CreditsBadgeView"). */
export function describeBadge(reply: AccountUsageReply | null, now: number, options: DescribeOptions = {}): BadgeView {
  if (reply === null) return { text: 'Checking plan…', mark: 'loading', name: 'ElevenLabs account' };
  if (!reply.ok) return { text: '!', mark: 'problem', name: ACCOUNT_ERROR_MESSAGES[reply.kind] };
  const { creditsUsed: used, creditsLimit: limit } = reply.usage;
  const name = describeAccount(reply.usage, now, options).line;
  if (limit === 0) return { text: '–', mark: 'neutral', name };
  return { text: `${percentLeft(Math.max(0, limit - used), limit)}%`, mark: 'ok', name };
}
