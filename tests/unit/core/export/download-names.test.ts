// 013 T035 (FR-013, decisions 69 and 70): the names of what a press saves. Start times are built from local
// components so the tests pass in any time zone (007 research R4).
import { describe, expect, it } from 'vitest';
import {
  captionsFileName,
  downloadZipName,
  meetingBaseName,
  transcriptDownloadName,
} from '@/core/export/download-names';
import { transcriptFileName } from '@/core/export/transcript-file';

const START = new Date(2026, 9, 7, 14, 30, 59).getTime();

describe('download names', () => {
  it('the base name is the local date and time the meeting started', () => {
    expect(meetingBaseName(START)).toBe('Meeting — 07-10-2026 at 14h30');
  });

  it('pads day, month, hour and minute, on the 24-hour clock', () => {
    expect(meetingBaseName(new Date(2027, 0, 3, 0, 5).getTime())).toBe('Meeting — 03-01-2027 at 00h05');
    expect(meetingBaseName(new Date(2026, 11, 31, 23, 59).getTime())).toBe('Meeting — 31-12-2026 at 23h59');
  });

  it('the three download names are the base plus what each file is', () => {
    expect(transcriptDownloadName(START)).toBe('Meeting — 07-10-2026 at 14h30 — Transcript.txt');
    expect(captionsFileName(START)).toBe('Meeting — 07-10-2026 at 14h30 — Meet captions.txt');
    expect(downloadZipName(START)).toBe('Meeting — 07-10-2026 at 14h30.zip');
    for (const name of [transcriptDownloadName(START), captionsFileName(START), downloadZipName(START)])
      expect(name.startsWith(meetingBaseName(START))).toBe(true);
  });

  it("the inbox name is still the base plus .txt (004's name, no panel download uses it)", () => {
    expect(transcriptFileName(START)).toBe(`${meetingBaseName(START)}.txt`);
    expect(transcriptFileName(START)).toBe('Meeting — 07-10-2026 at 14h30.txt');
  });

  it('every dash is an em dash (U+2014) with a space on each side', () => {
    for (const name of [
      meetingBaseName(START),
      transcriptDownloadName(START),
      captionsFileName(START),
      downloadZipName(START),
    ]) {
      expect(name).not.toMatch(/[–−]| - /);
      for (const match of name.matchAll(/.—./g)) expect(match[0]).toBe(' — ');
    }
    expect(transcriptDownloadName(START).split('—')).toHaveLength(3);
    expect(downloadZipName(START).split('—')).toHaveLength(2);
  });

  it('no name holds a path separator or a character a file system refuses', () => {
    for (const name of [transcriptDownloadName(START), captionsFileName(START), downloadZipName(START)])
      expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });
});
