// 007 T006 (FR-003, FR-009, FR-011; research R1): the panel saves a file with a local blob and an anchor download —
// no permission, no network. Chrome picks a numbered name itself when the file already exists.
// 013 T042 (FR-012, FR-020; contracts/files-and-storage.md "Side panel"): what is saved is one download, a text file or
// a zip, so one press is one anchor and Chrome's multiple-downloads prompt cannot appear.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeetingDownload } from '@/core/export/meeting-download';
import { saveDownload } from '@/entrypoints/sidepanel/save-file';

const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:chrome-extension://x/1');
const revokeObjectURL = vi.fn<(url: string) => void>();
let clicked: HTMLAnchorElement[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  clicked = [];
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const TEXT: MeetingDownload = {
  name: 'Meeting — 07-10-2026 at 14h30 — Transcript.txt',
  type: 'text/plain;charset=utf-8',
  data: '[00:02] Tom: Καλημέρα.\n',
};
/** Not a real archive: any bytes, including ones that are not valid UTF-8, must arrive unchanged. */
const ZIP: MeetingDownload = {
  name: 'Meeting — 07-10-2026 at 14h30.zip',
  type: 'application/zip',
  data: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x80, 0xce, 0x9a]),
};

describe('saveDownload', () => {
  it('a text download: one anchor with the download’s name and a local blob of UTF-8 plain text', async () => {
    saveDownload(TEXT);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe(TEXT.name);
    expect(clicked[0]?.getAttribute('href')).toBe('blob:chrome-extension://x/1');
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe('text/plain;charset=utf-8');
    expect(await blob?.text()).toBe('[00:02] Tom: Καλημέρα.\n');
  });

  it('a zip download: one anchor with the zip’s name and a blob of type application/zip holding exactly its bytes', async () => {
    saveDownload(ZIP);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe(ZIP.name);
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe('application/zip');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(ZIP.data);
  });

  it('leaves nothing in the page and frees the blob afterwards', () => {
    saveDownload(ZIP);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:chrome-extension://x/1');
  });

  it('hands name, data and type to an injected save, once, and clicks nothing itself', () => {
    const save = vi.fn();
    saveDownload(TEXT, save);
    saveDownload(ZIP, save);
    expect(save.mock.calls).toEqual([
      [TEXT.name, TEXT.data, TEXT.type],
      [ZIP.name, ZIP.data, ZIP.type],
    ]);
    expect(clicked).toHaveLength(0);
  });
});
