// T089 privacy guard (FR-003, FR-024, Constitution I): no real-looking ElevenLabs, Anthropic or OpenAI key or token in
// the repo or the built extension, host permissions limited to ElevenLabs and the two chat providers (003 research R10),
// no other network destination in src, chat SDK clients pointed only at the base-URL constants, the side panel never
// naming a chat-key reader, and no storage.sync in src, however reached. Every detector is proven against planted
// violations (red-team 2026-10-08).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANTHROPIC_BASE_URL, OPENAI_BASE_URL } from '@/providers/chat/base-urls';
import wxtConfig from '../../../wxt.config';

const ROOT = join(import.meta.dirname, '../../..');
const BUILD_DIRS = ['.output/chrome-mv3', '.output/chrome-mv3-e2e'].map((d) => join(ROOT, d));
// CI builds before it tests and sets this, so the build-output checks can never be skipped there.
const REQUIRE_BUILD = process.env.LIVE_ASSIST_REQUIRE_BUILD === '1';

// Real ElevenLabs keys are `sk_` + 48 hex characters; single-use tokens are `sutkn_` + a long opaque id. 003: Anthropic
// keys are `sk-ant-api03-` (or `-admin01-`) + ~95 characters; OpenAI keys are `sk-proj-` / `sk-svcacct-` + a long id,
// or legacy `sk-` + 48 letters and digits. Fixtures use short, hyphenated fakes (`sk-ant-test-…`), which cannot match.
const SECRET_SHAPES =
  /\b(?:sk_[a-f0-9]{32,}|sutkn_[A-Za-z0-9_-]{20,}|sk-ant-[a-z]+\d{2}-[A-Za-z0-9_-]{60,}|sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{60,}|sk-[A-Za-z0-9]{40,})/g;
// Fake keys are written `sk_test_…`, which cannot match the hex key shape. Fake tokens must start with exactly this
// prefix; nothing else is waved through (red-team 2026-10-08: a word anywhere in the match let ~1 % of real keys by).
const FIXTURE_TOKEN_PREFIX = 'sutkn_fixture_';

function secretsIn(text: string): string[] {
  return [...text.matchAll(SECRET_SHAPES)].map((m) => m[0]).filter((s) => !s.startsWith(FIXTURE_TOKEN_PREFIX));
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out
    .split('\0')
    .filter(Boolean)
    .map((f) => join(ROOT, f))
    .filter((f) => existsSync(f));
}

function findSecrets(files: string[]): string[] {
  return files.flatMap((file) => {
    const text = readFileSync(file).toString('latin1');
    return secretsIn(text).map((s) => `${relative(ROOT, file)}: ${s.slice(0, 10)}…`);
  });
}

const builtDirs = BUILD_DIRS.filter((d) => existsSync(join(d, 'manifest.json')));

// `sync` reached on a storage object: dotted or optional chaining, bracket access, or destructuring (red-team 2026-10-08).
const SYNC_ACCESS = [
  /\bstorage\s*(?:\?\.|\.)\s*sync\b/,
  /\bstorage\s*(?:\?\.)?\s*\[\s*['"`]sync['"`]\s*\]/,
  /\{[^{}]*\bsync\b[^{}]*\}\s*=\s*[\w.?]*\bstorage\b/,
  /\bstorage\s*:\s*\{[^{}]*\bsync\b/,
  // Behind a cast or a wrapper: any `["sync"]` key, or `.sync` straight after a closing parenthesis.
  /\[\s*['"`]sync['"`]\s*\]/,
  /\)\s*(?:\?\.|\.)\s*sync\b/,
];

function syncAccessIn(text: string): boolean {
  const code = codeLines(text).join('\n');
  return SYNC_ACCESS.some((re) => re.test(code));
}

/**
 * The only hosts the extension talks to (Constitution I: the speech-to-text provider and the chat providers; the
 * manifest's host permissions say the same). Adding one needs a constitution amendment.
 */
const NETWORK_HOSTS = ['api.elevenlabs.io', 'api.anthropic.com', 'api.openai.com'];
/**
 * URL literals in src that are not network destinations, each with why. Anything else must be NETWORK_HOST.
 * Adding to this list needs a reason a reviewer can check: the URL is never fetched by the extension.
 */
const NON_NETWORK_URLS: Record<string, { host: string; why: string }[]> = {
  'src/core/status/status.ts': [{ host: 'elevenlabs.io', why: 'privacy-policy link the user can open' }],
  'src/entrypoints/sidepanel/components/ChatRetention.tsx': [
    { host: 'privacy.claude.com', why: 'Anthropic retention-policy link the user can open (003 FR-016)' },
    { host: 'developers.openai.com', why: 'OpenAI data-controls link the user can open (003 FR-016)' },
  ],
  'src/entrypoints/meet.content/index.ts': [{ host: 'meet.google.com', why: 'content-script match pattern' }],
  'src/platforms/meet/snapshot.ts': [
    { host: 'example.invalid', why: 'placeholder replacing avatar URLs in dev snapshots' },
  ],
};
/** What a fetch/WebSocket/EventSource/sendBeacon call may be given: ElevenLabs endpoints, or a pass-through. */
const ALLOWED_DESTINATIONS = [/^TOKEN_URL$/, /^SUBSCRIPTION_URL$/, /^buildRealtimeUrl\(/, /^input$/];
const NETWORK_CALL = /(?:\bfetch|\bsendBeacon|\bEventSource|\bWebSocket|\bXMLHttpRequest)\s*\(\s*([^\s,)]*)/g;
const URL_LITERAL = /\b(?:https?|wss?):\/\/([A-Za-z0-9.-]+)/g;

/** Comment-only lines are skipped: they name pages for readers, they send nothing. */
const codeLines = (text: string) => text.split('\n').filter((l) => !/^\s*(?:\/\/|\/?\*)/.test(l));

function networkViolations(path: string, text: string): string[] {
  const allowed = NON_NETWORK_URLS[path] ?? [];
  const out: string[] = [];
  for (const line of codeLines(text)) {
    for (const [, host] of line.matchAll(URL_LITERAL))
      if (!NETWORK_HOSTS.includes(host ?? '') && !allowed.some((a) => a.host === host))
        out.push(`${path}: URL to ${host}`);
    for (const [call, arg = ''] of line.matchAll(NETWORK_CALL))
      if (!ALLOWED_DESTINATIONS.some((re) => re.test(arg))) out.push(`${path}: ${call.trim()}`);
  }
  return out;
}

// 003 (research R10): a chat SDK client gets its destination from `baseURL`, so every `baseURL` in src must be one of
// the two constants, and every client construction must pass its own.
const BASE_URL_CONSTANTS = ['ANTHROPIC_BASE_URL', 'OPENAI_BASE_URL'];
const SDK_CLIENTS: Record<string, string> = { Anthropic: 'ANTHROPIC_BASE_URL', OpenAI: 'OPENAI_BASE_URL' };

function baseUrlViolations(path: string, text: string): string[] {
  const code = codeLines(text).join('\n');
  const out: string[] = [];
  for (const m of code.matchAll(/\bbaseURL\b(\s*:\s*([\w.$]+))?/g)) {
    const value = m[2];
    if (!m[1] || value === undefined || !BASE_URL_CONSTANTS.includes(value)) out.push(`${path}: ${m[0].trim()}`);
  }
  for (const m of code.matchAll(/\bnew\s+(Anthropic|OpenAI)\s*\(([^)]*)\)/g)) {
    const [, client = '', args = ''] = m;
    if (!new RegExp(`\\bbaseURL\\s*:\\s*${SDK_CLIENTS[client]}\\b`).test(args))
      out.push(`${path}: new ${client} without its base URL`);
  }
  return out;
}

// 003 FR-014a: the side panel may write a chat-key candidate or remove a key, but never names a reader or a saved slot.
const PANEL_FORBIDDEN =
  /\b(?:readChatKey|readPendingChatKey|anthropicCredential|openaiCredential|CHAT_CREDENTIAL_KEYS)\b/g;
const panelKeyViolations = (path: string, text: string) =>
  [...codeLines(text).join('\n').matchAll(PANEL_FORBIDDEN)].map((m) => `${path}: ${m[0]}`);

/** The manifest `wxt.config.ts` produces for a build mode. */
function manifestFor(mode: string): { host_permissions?: string[]; optional_host_permissions?: string[] } {
  const manifest = wxtConfig.manifest as unknown as (env: { mode: string }) => {
    host_permissions?: string[];
    optional_host_permissions?: string[];
  };
  return manifest({ mode });
}

const HOST_PERMISSIONS = ['https://api.elevenlabs.io/*', 'https://api.anthropic.com/*', 'https://api.openai.com/*'];

const srcFiles = () =>
  filesUnder(join(ROOT, 'src')).map((f) => ({ path: relative(ROOT, f), text: readFileSync(f, 'utf8') }));

describe('privacy guard: secret detector', () => {
  it('flags real-shaped keys and tokens but not the fixture token prefix', () => {
    const realKey = `sk_${'a1'.repeat(24)}`;
    const realToken = `sutkn_${'Ab3'.repeat(10)}`;
    expect(secretsIn(`key=${realKey} token=${realToken}`)).toEqual([realKey, realToken]);
    expect(secretsIn('sk_test_fixture_bg_key_b4c1 sutkn_fixture_minted_000000000000')).toEqual([]);
  });

  // Red-team 2026-10-08 (001 T113): about 1 % of real `sk_` + 48-hex keys contain "e2e" and were waved through.
  it.each([
    `sk_${'e2e'}${'a'.repeat(45)}`,
    `sk_${'a'.repeat(20)}e2e${'b'.repeat(25)}`,
    `sutkn_${'test'}${'Ab3'.repeat(8)}`,
    `sutkn_Fake${'Ab3'.repeat(8)}`,
    `sutkn_x_fixture_${'Ab3'.repeat(8)}`,
  ])('flags a real-shaped secret whatever words it happens to contain: %s', (secret) => {
    expect(secretsIn(`value=${secret}`)).toEqual([secret]);
  });
});

// 003 T018: Anthropic and OpenAI key shapes, built at run time so this file holds no real-looking key.
describe('privacy guard: chat key detector', () => {
  const body = (n: number) => 'Ab3_x9-Z'.repeat(Math.ceil(n / 8)).slice(0, n);
  it.each([
    `sk-ant-api03-${body(93)}AA`,
    `sk-ant-admin01-${body(93)}AA`,
    `sk-proj-${body(120)}`,
    `sk-svcacct-${body(120)}`,
    `sk-${'T3BlbkFJ'.repeat(6)}`,
  ])('flags a real-shaped chat key: %s', (secret) => {
    expect(secretsIn(`const k = "${secret}";`)).toEqual([secret]);
  });

  it.each([
    'sk-ant-test-fixture-key-ab12',
    'sk-ant-api03-fixture-not-a-real-key',
    'sk-test-fixture-openai-key-cd34',
    'sk-test-other-ffff',
    'task-specific',
  ])('does not flag the short fixture fakes: %s', (fake) => {
    expect(secretsIn(`const k = "${fake}";`)).toEqual([]);
  });
});

describe('privacy guard: chat SDK base URLs (planted violations)', () => {
  it('the constants are the two chat providers', () => {
    expect(ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
    expect(OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
  });

  it.each([
    'new Anthropic({ apiKey, baseURL: "https://proxy.example.com", fetch });',
    'new OpenAI({ apiKey, baseURL: url, fetch });',
    'new Anthropic({ apiKey, baseURL, fetch });',
    'new Anthropic({ apiKey, fetch });',
    'new OpenAI({ apiKey, baseURL: ANTHROPIC_BASE_URL });',
    'const options = { baseURL: other };',
  ])('flags %s', (code) => expect(baseUrlViolations('src/x.ts', code)).not.toEqual([]));

  it.each([
    'new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0, baseURL: ANTHROPIC_BASE_URL, fetch });',
    'new OpenAI({ apiKey, baseURL: OPENAI_BASE_URL, fetch });',
    '// baseURL: see research R10',
  ])('does not flag %s', (code) => expect(baseUrlViolations('src/x.ts', code)).toEqual([]));
});

describe('privacy guard: side panel and chat keys (planted violations)', () => {
  it.each([
    'await store.readChatKey("anthropic");',
    'const k = await s.readPendingChatKey(p);',
    'chrome.storage.local.get("anthropicCredential")',
    "area.get(['openaiCredential'])",
    'CHAT_CREDENTIAL_KEYS.openai.saved',
  ])('flags %s', (code) => expect(panelKeyViolations('src/entrypoints/sidepanel/x.ts', code)).not.toEqual([]));

  it.each(['await store.writePendingChatKey("openai", key);', 'await store.removeChatKey("anthropic");'])(
    'does not flag %s',
    (code) => expect(panelKeyViolations('src/entrypoints/sidepanel/x.ts', code)).toEqual([]),
  );
});

describe('privacy guard: storage.sync detector (planted violations)', () => {
  it.each([
    'chrome.storage.sync.set({ a: 1 });',
    "chrome.storage['sync'].set({ a: 1 });",
    'chrome.storage["sync"].get("a");',
    'chrome.storage?.sync?.get("a");',
    'const { sync } = chrome.storage;',
    'const { local, sync: area } = chrome.storage;',
    'const { storage: { sync } } = chrome;',
    'const s = browser.storage.sync;',
    "const s = (chrome.storage as unknown as Record<string, unknown>)['sync'];",
    'const s = (chrome.storage as Areas).sync;',
  ])('flags %s', (code) => expect(syncAccessIn(code)).toBe(true));

  it.each(['async function f() {}', '// called synchronously', 'chrome.storage.local.get("sync");'])(
    'does not flag %s',
    (code) => expect(syncAccessIn(code)).toBe(false),
  );
});

describe('privacy guard: network destinations detector (planted violations)', () => {
  it.each([
    ['src/x.ts', 'export const URL_X = "https://telemetry.example.com/collect";'],
    ['src/x.ts', "const ws = new WebSocket('wss://api.elevenlabs.io.evil.net/v1');"],
    ['src/x.ts', 'await fetch(`https://${host}/v1/user`);'],
    ['src/x.ts', 'await fetch(someUrl, { method: "POST" });'],
    ['src/x.ts', 'navigator.sendBeacon(endpoint, body);'],
    ['src/x.ts', 'const es = new EventSource(streamUrl);'],
    ['src/x.ts', 'const ws = new this.deps.WebSocket(otherUrl);'],
    ['src/core/status/status.ts', 'const u = "https://analytics.example.org/x";'],
  ])('flags %s: %s', (path, code) => expect(networkViolations(path, code)).not.toEqual([]));

  it.each([
    ['src/x.ts', "export const TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';"],
    ['src/x.ts', 'response = await this.deps.fetch(TOKEN_URL, { method: "POST" });'],
    ['src/x.ts', 'fetch: (input, init) => fetch(input, init),'],
    ['src/x.ts', 'const ws = new this.deps.WebSocket(buildRealtimeUrl({ token }));'],
    ['src/x.ts', '// see https://elevenlabs.io/pricing for the numbers'],
  ])('does not flag %s: %s', (path, code) => expect(networkViolations(path, code)).toEqual([]));
});

describe('privacy guard: repository', () => {
  it('has no real-looking ElevenLabs, Anthropic or OpenAI key or token in any tracked file (fixtures included)', () => {
    expect(findSecrets(trackedFiles())).toEqual([]);
  });

  it('never uses chrome.storage.sync in src, directly or indirectly', () => {
    expect(
      srcFiles()
        .filter((f) => syncAccessIn(f.text))
        .map((f) => f.path),
    ).toEqual([]);
  });

  // Red-team 2026-10-08 (001 T113, Constitution I): ElevenLabs and the chat providers are the only destinations.
  it('the network allowlist is exactly ElevenLabs, Anthropic and OpenAI (003 research R10)', () => {
    expect(NETWORK_HOSTS).toEqual(['api.elevenlabs.io', 'api.anthropic.com', 'api.openai.com']);
  });

  it('sends nothing anywhere but the allowed hosts', () => {
    expect(srcFiles().flatMap((f) => networkViolations(f.path, f.text))).toEqual([]);
  });

  it('points every chat SDK client at a base-URL constant (003 research R10)', () => {
    expect(srcFiles().flatMap((f) => baseUrlViolations(f.path, f.text))).toEqual([]);
  });

  it('the side panel never names a chat-key reader or a saved chat-key slot (003 FR-014a)', () => {
    expect(
      srcFiles()
        .filter((f) => f.path.startsWith('src/entrypoints/sidepanel/'))
        .flatMap((f) => panelKeyViolations(f.path, f.text)),
    ).toEqual([]);
  });

  it.each(['production', 'e2e', 'spike'])(
    'the %s manifest asks host access to ElevenLabs and the two chat providers only',
    (mode) => {
      expect(manifestFor(mode).host_permissions).toEqual(HOST_PERMISSIONS);
      expect(manifestFor(mode).optional_host_permissions).toBeUndefined();
    },
  );
});

describe('privacy guard: built extension', () => {
  it('has build output to check when required', () => {
    if (REQUIRE_BUILD)
      expect(builtDirs.map((d) => relative(ROOT, d))).toEqual(['.output/chrome-mv3', '.output/chrome-mv3-e2e']);
  });

  it.skipIf(builtDirs.length === 0)('contains no real-looking key or token', () => {
    expect(findSecrets(builtDirs.flatMap(filesUnder))).toEqual([]);
  });

  it.skipIf(builtDirs.length === 0)('requests host access to ElevenLabs and the chat providers only (FR-024)', () => {
    for (const dir of builtDirs) {
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
        host_permissions?: string[];
        optional_host_permissions?: string[];
      };
      expect(manifest.host_permissions).toEqual(HOST_PERMISSIONS);
      expect(manifest.optional_host_permissions).toBeUndefined();
    }
  });

  // 002 T067: the Meet snapshot and alignment trace helpers are spike-build only.
  it.skipIf(builtDirs.length === 0)('contains none of the dev-only Meet snapshot and trace helpers', () => {
    const markers = [
      'live-assist-meet',
      'spike/meet-snapshot',
      'spike/alignment-trace',
      'spike/save-trace',
      'no-clear-speaker',
      'Caption text ',
      'Participant ',
    ];
    for (const dir of builtDirs) {
      const text = filesUnder(dir)
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');
      expect(
        markers.filter((m) => text.includes(m)),
        relative(ROOT, dir),
      ).toEqual([]);
    }
  });

  // 002 research R2: one content script, on Meet only, after the page is idle. A content script's `matches` grants no
  // host permission, so the ElevenLabs-only rule above still holds.
  it.skipIf(builtDirs.length === 0)('has exactly one content script, on Google Meet only', () => {
    for (const dir of builtDirs) {
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
        content_scripts?: { matches?: string[]; run_at?: string }[];
      };
      expect(manifest.content_scripts).toHaveLength(1);
      expect(manifest.content_scripts?.[0]?.matches).toEqual(['https://meet.google.com/*']);
      expect(manifest.content_scripts?.[0]?.run_at).toBe('document_idle');
    }
  });
});

// 002 T074: caption text never crosses the Meet bridge (FR-004), and the Meet layer logs nothing of its own.
describe('privacy guard: Meet bridge and Meet layer', () => {
  const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

  it('no message type in the Meet bridge protocol has a text field', () => {
    const source = read('src/core/messaging/meet-bridge.ts');
    const blocks = [...source.matchAll(/export type (\w+) =([\s\S]*?);\n/g)].map(([, name, body]) => ({ name, body }));
    expect(blocks.map((b) => b.name)).toEqual(
      expect.arrayContaining(['AttachMessage', 'ReadyReply', 'FromPage', 'ToPage']),
    );
    for (const { name, body } of blocks) expect(body, name).not.toMatch(/\btext\??\s*:/);
  });

  it('the Meet content script and Meet layer never call console directly (src/core/log.ts only, tiers not names)', () => {
    const files = [
      'src/entrypoints/meet.content/index.ts',
      ...readdirSync(join(ROOT, 'src/platforms/meet')).map((f) => `src/platforms/meet/${f}`),
    ];
    for (const f of files) expect(read(f), f).not.toMatch(/\bconsole\./);
  });
});
