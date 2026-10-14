// 013 T054 (SC-008, plan "Performance Goals"; pinning): what one press builds for a three-hour meeting is ready well
// inside the 200 ms the panel may be busy, and a single very long caption turn costs next to nothing. Generated,
// invented text; the median of several runs, as the panel's other budgets are measured.
import { describe, expect, it } from 'vitest';
import { captionsFile } from '@/core/export/captions-file';
import { meetingDownload } from '@/core/export/meeting-download';
import { longTranscript, storedCaptionTurn, storedMeeting } from '../../../support/stored-meetings';

const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
function time(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

describe('building a download is quick', () => {
  it('a 3-hour meeting (5,000 lines, 1,200 caption turns): the zip within 200 ms and under 2 MB', () => {
    const meeting = storedMeeting({ hasCaptions: true });
    const segments = longTranscript('m1', 5_000);
    const captionTurns = Array.from({ length: 1_200 }, (_, i) =>
      storedCaptionTurn('m1', i + 1, {
        startMs: i * 9_000,
        speakerName: ['Jane', 'Mike', 'Tom', 'You'][i % 4]!,
        self: i % 4 === 3,
        text: `Caption turn ${i + 1} with about a hundred and thirty characters of ordinary invented meeting speech in it, give or take a few words.`,
      }),
    );
    const at = new Date(2026, 9, 12, 9, 41);
    let download = meetingDownload({ meeting, segments, captionTurns }, at);
    const times = Array.from({ length: 5 }, () =>
      time(() => {
        download = meetingDownload({ meeting, segments, captionTurns }, at);
      }),
    );
    expect(median(times)).toBeLessThan(200);
    expect(download?.type).toBe('application/zip');
    const bytes = download!.data as Uint8Array;
    expect(bytes.length).toBeGreaterThan(500_000);
    expect(bytes.length).toBeLessThan(2_000_000);
  });

  it('one caption turn of 200,000 characters: its file within 50 ms, on one line', () => {
    const meeting = storedMeeting({ hasCaptions: true });
    const sentence = 'An invented monologue about tide tables and ferry times goes on and on. ';
    const text = sentence
      .repeat(Math.ceil(200_000 / sentence.length))
      .slice(0, 200_000)
      .trim();
    const turns = [storedCaptionTurn('m1', 1, { text })];
    let file = captionsFile(meeting, turns);
    const times = Array.from({ length: 5 }, () =>
      time(() => {
        file = captionsFile(meeting, turns);
      }),
    );
    expect(median(times)).toBeLessThan(50);
    expect(file.body.split('\n')).toHaveLength(2);
    expect(file.body.length).toBeGreaterThan(199_000);
  });
});
