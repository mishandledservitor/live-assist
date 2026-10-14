// T100 (retest 2026-10-08): spike builds save the alignment trace and its names key by themselves when a meeting ends.
// The offscreen document sends them; the service worker (which has the spike build's downloads permission) saves them.
import { describe, expect, it } from 'vitest';
import { saveTrace } from '@/entrypoints/background/spike-trace-save';

const AT = new Date(2026, 9, 8, 14, 5);

function fakeDownloads() {
  const saved: { url: string; filename: string }[] = [];
  return { saved, download: (f: { url: string; filename: string }) => Promise.resolve(void saved.push(f)) };
}

describe('saveTrace (spike builds)', () => {
  it('saves the trace and its names key under Downloads/live-assist-meet/ as data URLs', async () => {
    const d = fakeDownloads();
    const ok = await saveTrace(
      { type: 'spike/save-trace', trace: { format: 't', segments: [] }, key: { 'Participant A': 'Τζέιν' } },
      { download: d.download, now: () => AT },
    );
    expect(ok).toBe(true);
    expect(d.saved.map((f) => f.filename)).toEqual([
      'live-assist-meet/20261008-1405-trace.json',
      'live-assist-meet/20261008-1405-trace-names-key-DO-NOT-COMMIT.txt',
    ]);
    expect(d.saved.every((f) => f.url.startsWith('data:'))).toBe(true);
    expect(decodeURIComponent(d.saved[1]!.url.slice(d.saved[1]!.url.indexOf(',') + 1))).toContain('Τζέιν');
  });

  it.each([
    ['another message', { type: 'spike/alignment-trace' }],
    ['no key', { type: 'spike/save-trace', trace: {} }],
    ['a key with a non-text name', { type: 'spike/save-trace', trace: {}, key: { 'Participant A': 3 } }],
    ['no trace', { type: 'spike/save-trace', key: {} }],
  ])('ignores %s', async (_, message) => {
    const d = fakeDownloads();
    expect(await saveTrace(message, { download: d.download, now: () => AT })).toBe(false);
    expect(d.saved).toEqual([]);
  });
});
