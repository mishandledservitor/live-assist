// 007 SC-004 (research R1): the download needs no permission, so the production manifest keeps exactly the permissions
// it had before 007 — no `downloads`, no new install or update warning. `downloads` stays in the spike build only.
import { describe, expect, it } from 'vitest';
import config from '../../../wxt.config';

type ManifestFn = (env: { mode: string }) => { permissions?: string[] };

const permissions = (mode: string) => (config.manifest as ManifestFn)({ mode }).permissions;

describe('manifest permissions', () => {
  it('production asks for exactly the pre-007 permissions', () => {
    expect(permissions('production')).toEqual(['sidePanel', 'tabCapture', 'offscreen', 'storage', 'activeTab']);
  });

  it('only the dev-only spike build asks for downloads', () => {
    expect(permissions('e2e')).not.toContain('downloads');
    expect(permissions('spike')).toContain('downloads');
  });
});
