// 013 T053 (SC-009, FR-020, plan "Permission impact"): a pinning test. Keeping and downloading Meet's captions adds no
// shipped dependency (the zip is written in src/core/export/zip.ts) and no host the extension may reach.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../../../wxt.config';

type ManifestFn = (env: { mode: string }) => { host_permissions?: string[] };

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'),
) as { dependencies?: Record<string, string> };

describe('what ships', () => {
  it('has exactly the five dependencies it had before 013', () => {
    expect(Object.keys(packageJson.dependencies ?? {}).sort()).toEqual([
      '@anthropic-ai/sdk',
      'idb',
      'openai',
      'react',
      'react-dom',
    ]);
  });

  it.each(['production', 'e2e', 'spike'])('the %s build may reach the three provider hosts and no other', (mode) => {
    expect((config.manifest as ManifestFn)({ mode }).host_permissions).toEqual([
      'https://api.elevenlabs.io/*',
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
    ]);
  });
});
