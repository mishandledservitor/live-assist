// 005: the ElevenLabs subscription request and its mapping to derived fields (research R1, R3), on recorded answers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@/core/log';
import { SUBSCRIPTION_URL, fetchAccountUsage } from '@/providers/account/elevenlabs-subscription';

const KEY = 'sk_test_fixture_account_9f3e';
const FIXTURES = join(import.meta.dirname, '../../../fixtures/elevenlabs/subscription');

interface Recorded {
  status: number;
  body: unknown;
}
const recorded = (name: string): Recorded =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as Recorded;

function respond({ status, body }: Recorded): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

function setup(answer: Recorded | (() => Promise<Response>), key: string | null = KEY) {
  const fetch = vi.fn((_input: string, _init?: RequestInit) =>
    typeof answer === 'function' ? answer() : Promise.resolve(respond(answer)),
  );
  const lines: unknown[][] = [];
  const log: Logger = {
    error: (...a: unknown[]) => void lines.push(a),
    warn: (...a: unknown[]) => void lines.push(a),
    info: (...a: unknown[]) => void lines.push(a),
  };
  const run = () => fetchAccountUsage({ readKey: () => Promise.resolve(key), fetch, log });
  return { fetch, lines, run };
}

describe('fetchAccountUsage: request', () => {
  it('GETs the subscription endpoint with the key in xi-api-key', async () => {
    const { fetch, run } = setup(recorded('success'));
    await run();
    expect(SUBSCRIPTION_URL).toBe('https://api.elevenlabs.io/v1/user/subscription');
    expect(fetch).toHaveBeenCalledWith(SUBSCRIPTION_URL, { method: 'GET', headers: { 'xi-api-key': KEY } });
  });
});

describe('fetchAccountUsage: successful answers', () => {
  it('returns only the derived fields, reset in ms', async () => {
    expect(await setup(recorded('success')).run()).toStrictEqual({
      ok: true,
      usage: { tier: 'creator', creditsUsed: 19_360, creditsLimit: 121_000, resetAt: 1_792_454_400_000 },
    });
  });

  it('maps a null reset to null', async () => {
    const reply = await setup(recorded('no-reset')).run();
    expect(reply.ok && reply.usage.resetAt).toBeNull();
  });

  it('keeps a zero limit', async () => {
    expect(await setup(recorded('zero-limit')).run()).toEqual({
      ok: true,
      usage: { tier: 'free', creditsUsed: 0, creditsLimit: 0, resetAt: 1_792_454_400_000 },
    });
  });

  it('keeps usage over the limit as reported', async () => {
    const reply = await setup(recorded('over-limit')).run();
    expect(reply.ok && reply.usage).toMatchObject({ creditsUsed: 31_250, creditsLimit: 30_000 });
  });

  it('treats a missing count as an unexpected answer', async () => {
    expect(await setup(recorded('malformed')).run()).toEqual({ ok: false, kind: 'unknown' });
  });

  it('treats a non-JSON success body as an unexpected answer', async () => {
    expect(await setup({ status: 200, body: '<html>' }).run()).toEqual({ ok: false, kind: 'unknown' });
  });
});

describe('fetchAccountUsage: failures (US2, research R3)', () => {
  it('reports a key without User: Read as missing-permission, not as rejected', async () => {
    expect(await setup(recorded('user-read-error')).run()).toEqual({ ok: false, kind: 'missing-permission' });
  });

  it('detects user_read in a string detail on any status', async () => {
    const answer = { status: 403, body: { detail: 'key is missing user_read' } };
    expect(await setup(answer).run()).toEqual({ ok: false, kind: 'missing-permission' });
  });

  it.each([
    ['invalid-key fixture', 'invalid', recorded('invalid-key-error')],
    ['401 with a non-JSON body', 'invalid', { status: 401, body: 'Unauthorized' }],
    ['429', 'rate-limited', { status: 429, body: { detail: 'too many requests' } }],
    ['500', 'unknown', { status: 500, body: { detail: 'oops' } }],
  ] as const)('%s → %s', async (_name, kind, answer) => {
    expect(await setup(answer).run()).toEqual({ ok: false, kind });
  });

  it('reports a fetch that throws as network', async () => {
    const { run } = setup(() => Promise.reject(new TypeError(`Failed to fetch with ${KEY}`)));
    expect(await run()).toEqual({ ok: false, kind: 'network' });
  });

  it('answers missing without a request when no key is saved', async () => {
    const { fetch, run } = setup(recorded('success'), null);
    expect(await run()).toEqual({ ok: false, kind: 'missing' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['user-read-error', 'missing-permission (HTTP 401)'],
    ['invalid-key-error', 'invalid (HTTP 401)'],
  ])('logs %s once with kind and status, never the key', async (name, text) => {
    const { lines, run } = setup(recorded(name));
    const reply = await run();
    expect(lines).toEqual([[`account status unavailable: ${text}`]]);
    expect(JSON.stringify([lines, reply])).not.toContain(KEY);
  });

  it('logs a network failure without the error text', async () => {
    const { lines, run } = setup(() => Promise.reject(new TypeError(`Failed to fetch with ${KEY}`)));
    await run();
    expect(lines).toEqual([['account status unavailable: network']]);
  });
});
