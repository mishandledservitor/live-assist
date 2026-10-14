// 005: the user's ElevenLabs plan and credit usage (research R1, R3). Runs in the service worker only; the key goes
// to ElevenLabs as a header and nowhere else, and only derived fields leave this module.
import type { AccountErrorKind, AccountUsage, AccountUsageReply } from '../../core/account/usage';
import type { Logger } from '../../core/log';

export const SUBSCRIPTION_URL = 'https://api.elevenlabs.io/v1/user/subscription';

export interface AccountDeps {
  readKey: () => Promise<string | null>;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** A redacting logger (createLogger); failures log their kind and HTTP status only. */
  log: Logger;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function derive(body: unknown): AccountUsage | null {
  if (!isRec(body) || !isCount(body.character_count) || !isCount(body.character_limit)) return null;
  const reset = body.next_character_count_reset_unix;
  return {
    tier: typeof body.tier === 'string' && body.tier !== '' ? body.tier : null,
    creditsUsed: body.character_count,
    creditsLimit: body.character_limit,
    resetAt: typeof reset === 'number' && Number.isFinite(reset) && reset > 0 ? reset * 1000 : null,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchAccountUsage(deps: AccountDeps): Promise<AccountUsageReply> {
  const fail = (kind: AccountErrorKind, status?: number): AccountUsageReply => {
    deps.log.warn(`account status unavailable: ${kind}${status === undefined ? '' : ` (HTTP ${status})`}`);
    return { ok: false, kind };
  };

  const key = await deps.readKey();
  if (!key) return { ok: false, kind: 'missing' };

  let response: Response;
  try {
    response = await deps.fetch(SUBSCRIPTION_URL, { method: 'GET', headers: { 'xi-api-key': key } });
  } catch {
    // The underlying error is discarded on purpose: it may echo request details.
    return fail('network');
  }
  const body = await readJson(response);
  if (response.ok) {
    const usage = derive(body);
    return usage ? { ok: true, usage } : fail('unknown', response.status);
  }
  return fail(errorKind(response.status, body), response.status);
}

/** Text of an ElevenLabs error body: `detail` as a string, or its `status` and `message`. */
function detailText(body: unknown): string {
  const detail = isRec(body) ? body.detail : undefined;
  if (typeof detail === 'string') return detail;
  if (!isRec(detail)) return '';
  return [detail.status, detail.message].filter((v): v is string => typeof v === 'string').join(' ');
}

/**
 * A scoped key without 'User: Read' is answered with 401 and a `missing_permissions` detail naming `user_read`, so the
 * detail is checked before the status — otherwise a working key would be reported as rejected (research R3).
 */
function errorKind(status: number, body: unknown): AccountErrorKind {
  if (/user_read|missing_permissions/i.test(detailText(body))) return 'missing-permission';
  if (status === 401) return 'invalid';
  if (status === 429) return 'rate-limited';
  return 'unknown';
}
