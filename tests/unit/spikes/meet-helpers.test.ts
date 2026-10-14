// T067: file names and inputs of the spike recorder's Meet helpers (Save Meet snapshot, Save alignment trace).
import { describe, expect, it } from 'vitest';
import {
  MEET_DOWNLOAD_DIR,
  dataUrl,
  keyFileText,
  meetDownloadPath,
  parseNameList,
  traceFiles,
} from '@/entrypoints/spike-recorder/meet-helpers';

const AT = new Date(2026, 9, 8, 14, 5);

describe('spike recorder Meet helpers', () => {
  it('saves into Downloads/live-assist-meet/ with a safe, dated name', () => {
    expect(MEET_DOWNLOAD_DIR).toBe('live-assist-meet');
    expect(meetDownloadPath('snapshot', 'In call, captions ON!', AT)).toBe(
      'live-assist-meet/20261008-1405-in-call-captions-on.html',
    );
    expect(meetDownloadPath('snapshot', '', AT)).toBe('live-assist-meet/20261008-1405-snapshot.html');
    expect(meetDownloadPath('trace', 'x', AT)).toBe('live-assist-meet/20261008-1405-trace.json');
    expect(meetDownloadPath('key', 'in-call', AT)).toBe(
      'live-assist-meet/20261008-1405-in-call-names-key-DO-NOT-COMMIT.txt',
    );
  });

  it('reads the extra names list one per line or comma-separated', () => {
    expect(parseNameList(' Mary Smith \n\nJohn Doe, Jane D.\n')).toEqual(['Mary Smith', 'John Doe', 'Jane D.']);
    expect(parseNameList('')).toEqual([]);
  });

  it('writes the placeholder key as a plain list with a warning first', () => {
    expect(keyFileText({ 'Participant A': 'Emma Jones' })).toBe(
      'Placeholder key for your own review. Never commit this file or copy it into the repo.\n\nParticipant A = Emma Jones\n',
    );
  });

  // T100 (retest 2026-10-08): the trace and its key are saved by themselves when a meeting ends.
  it('names the two files a saved trace is made of', () => {
    const files = traceFiles({ trace: { format: 'x' }, key: { 'Participant A': 'Τζέιν' } }, AT);
    expect(files).toEqual([
      {
        filename: 'live-assist-meet/20261008-1405-trace.json',
        text: '{\n  "format": "x"\n}\n',
        type: 'application/json',
      },
      {
        filename: 'live-assist-meet/20261008-1405-trace-names-key-DO-NOT-COMMIT.txt',
        text: keyFileText({ 'Participant A': 'Τζέιν' }),
        type: 'text/plain',
      },
    ]);
  });

  it('encodes a file as a UTF-8 data URL (the service worker has no blob URLs)', () => {
    const url = dataUrl('Τζέιν = Participant A', 'text/plain');
    expect(url.startsWith('data:text/plain;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toBe('Τζέιν = Participant A');
  });
});
