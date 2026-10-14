// 012 T003 (FR-005–FR-007, SC-006; data-model.md "Meeting.summary", "MeetingState", "Row"): what a Transcripts row shows,
// derived from a stored meeting. Start times are built from local components so the tests pass in any time zone.
import { describe, expect, it } from 'vitest';
import { transcriptFileLines } from '@/core/export/transcript-file';
import {
  SUMMARY_VERSION,
  currentSummary,
  formatDuration,
  formatMeetingDate,
  formatMeetingTime,
  meetingDurationMs,
  meetingState,
  rowNames,
  summariseMeeting,
} from '@/core/history/meeting-summary';
import type { MeetingSummary } from '@/core/transcript/model';
import {
  STORED_START,
  longTranscript,
  spokenBy,
  spokenBySelf,
  storedMeeting,
  storedSegment,
} from '../../../support/stored-meetings';

const MIN = 60_000;
const HOUR = 60 * MIN;

describe('summariseMeeting', () => {
  it('lists confirmed names in order of first appearance, over the lines in time order', () => {
    const meeting = storedMeeting();
    const summary = summariseMeeting(meeting, [
      storedSegment('m1', 3, { startMs: 9_000, ...spokenBy('Jane') }),
      storedSegment('m1', 2, { startMs: 6_000, ...spokenBySelf() }),
      storedSegment('m1', 1, { startMs: 3_000 }),
      storedSegment('m1', 0, { startMs: 0, ...spokenBy('Jane') }),
    ]);
    expect(summary.names).toEqual(['Jane', 'Alex']);
    expect(summary.v).toBe(SUMMARY_VERSION);
  });

  it('applies renames and single-line corrections', () => {
    const meeting = storedMeeting({ speakerRenames: { 'caption:jane': { name: 'Jane D.', origin: 'manual' } } });
    const summary = summariseMeeting(meeting, [
      storedSegment('m1', 0, spokenBy('Jane')),
      storedSegment('m1', 1, { ...spokenBy('Jane'), labelOverride: 'Mike' }),
      storedSegment('m1', 2, spokenBy('Jane')),
    ]);
    expect(summary.names).toEqual(['Jane D.', 'Mike']);
  });

  it('never lists "Others", but lists an "Others" line the user corrected by hand', () => {
    const meeting = storedMeeting();
    expect(summariseMeeting(meeting, [storedSegment('m1', 0), storedSegment('m1', 1)]).names).toEqual([]);
    expect(
      summariseMeeting(meeting, [storedSegment('m1', 0), storedSegment('m1', 1, { labelOverride: 'Sarah' })]).names,
    ).toEqual(['Sarah']);
  });

  it('ignores a rename of "Others" stored by an earlier build', () => {
    const meeting = storedMeeting({ speakerRenames: { others: { name: 'Team', origin: 'manual' } } });
    expect(summariseMeeting(meeting, [storedSegment('m1', 0)]).names).toEqual([]);
  });

  it('drops exact duplicates only', () => {
    const summary = summariseMeeting(storedMeeting(), [
      storedSegment('m1', 0, spokenBy('Tom')),
      storedSegment('m1', 1, { labelOverride: 'Tom' }),
      storedSegment('m1', 2, { labelOverride: 'tom' }),
    ]);
    expect(summary.names).toEqual(['Tom', 'tom']);
  });

  it('keeps every name; the row cuts them', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    const summary = summariseMeeting(
      storedMeeting(),
      names.map((n, i) => storedSegment('m1', i, spokenBy(n))),
    );
    expect(summary.names).toEqual(names);
  });

  it('counts the lines the transcript file would hold', () => {
    const meeting = storedMeeting();
    const segments = [
      storedSegment('m1', 0, spokenBy('Jane')),
      storedSegment('m1', 1, { text: ' \n ' }),
      storedSegment('m1', 2),
      storedSegment('m1', 3, { text: '' }),
    ];
    const summary = summariseMeeting(meeting, segments);
    expect(summary.fileLines).toBe(2);
    expect(summary.fileLines).toBe(transcriptFileLines(meeting, segments).length);
    expect(summariseMeeting(meeting, [storedSegment('m1', 0, { text: '  ' })]).fileLines).toBe(0);
  });

  it('takes the end of the last line as the largest endMs', () => {
    const summary = summariseMeeting(storedMeeting(), [
      storedSegment('m1', 0, { startMs: 0, endMs: 90_000 }),
      storedSegment('m1', 1, { startMs: 10_000, endMs: 12_000 }),
    ]);
    expect(summary.lastLineEndMs).toBe(90_000);
  });

  it('has no names, no file line and no last line for a meeting without lines', () => {
    expect(summariseMeeting(storedMeeting(), [])).toEqual({ v: 1, names: [], fileLines: 0, lastLineEndMs: null });
  });

  it('does not change what it is given', () => {
    const meeting = storedMeeting({ speakerRenames: { self: { name: 'S.', origin: 'manual' } } });
    const segments = [storedSegment('m1', 1, { startMs: 5_000 }), storedSegment('m1', 0, spokenBySelf())];
    const before = structuredClone({ meeting, segments });
    summariseMeeting(meeting, segments);
    expect({ meeting, segments }).toEqual(before);
  });

  it('summarises a 3-hour, 5,000-line meeting in under 200 ms (SC-006)', () => {
    const segments = longTranscript('m1', 5_000);
    const t0 = performance.now();
    const summary = summariseMeeting(storedMeeting(), segments);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(summary).toEqual({
      v: 1,
      names: ['Jane', 'Mike', 'Tom'],
      fileLines: 5_000,
      lastLineEndMs: 4_999 * 2_160 + 1_500,
    });
  });
});

describe('currentSummary', () => {
  const summary: MeetingSummary = { v: 1, names: ['Jane'], fileLines: 3, lastLineEndMs: 9_000 };

  it('returns the stored summary when its version is current', () => {
    expect(currentSummary({ summary })).toBe(summary);
  });

  it('reads a missing summary, or one of another version, as none', () => {
    expect(currentSummary({})).toBeNull();
    expect(currentSummary({ summary: { ...summary, v: 2 } as unknown as MeetingSummary })).toBeNull();
    expect(currentSummary({ summary: { names: [], fileLines: 0 } as unknown as MeetingSummary })).toBeNull();
  });
});

describe('meetingState', () => {
  const open = storedMeeting({ endedAt: null, endReason: null });

  it('is in-progress for the running meeting', () => {
    expect(meetingState(open, 'm1')).toBe('in-progress');
  });

  it('is interrupted for a meeting marked as crashed', () => {
    expect(meetingState(storedMeeting({ endReason: 'crashed' }), null)).toBe('interrupted');
    expect(meetingState(storedMeeting({ endReason: 'crashed' }), 'other')).toBe('interrupted');
  });

  it('is interrupted for an open record that is not the running meeting', () => {
    expect(meetingState(open, null)).toBe('interrupted');
    expect(meetingState(open, 'other')).toBe('interrupted');
  });

  it.each(['user-stop', 'tab-closed', 'tab-navigated', 'call-ended', 'failed'] as const)(
    'is stopped for a meeting ended by %s',
    (endReason) => {
      expect(meetingState(storedMeeting({ endReason }), null)).toBe('stopped');
    },
  );
});

describe('meetingDurationMs', () => {
  const summary = (lastLineEndMs: number | null): MeetingSummary => ({ v: 1, names: [], fileLines: 0, lastLineEndMs });

  it('is end minus start for a stopped meeting, with or without a summary', () => {
    const meeting = storedMeeting({ endedAt: STORED_START + 45 * MIN });
    expect(meetingDurationMs(meeting, 'stopped', null)).toBe(45 * MIN);
    expect(meetingDurationMs(meeting, 'stopped', summary(10 * MIN))).toBe(45 * MIN);
  });

  it('is the end of the last line for an interrupted meeting, never the time its record was closed', () => {
    const closedDaysLater = storedMeeting({ endedAt: STORED_START + 72 * HOUR, endReason: 'crashed' });
    expect(meetingDurationMs(closedDaysLater, 'interrupted', summary(20 * MIN))).toBe(20 * MIN);
    const stillOpen = storedMeeting({ endedAt: null, endReason: null });
    expect(meetingDurationMs(stillOpen, 'interrupted', summary(5 * MIN))).toBe(5 * MIN);
  });

  it('is unknown for an interrupted meeting without a summary or without a line', () => {
    const meeting = storedMeeting({ endReason: 'crashed' });
    expect(meetingDurationMs(meeting, 'interrupted', null)).toBeNull();
    expect(meetingDurationMs(meeting, 'interrupted', summary(null))).toBeNull();
  });

  it('is not given for the running meeting', () => {
    const meeting = storedMeeting({ endedAt: null, endReason: null });
    expect(meetingDurationMs(meeting, 'in-progress', null)).toBeNull();
    expect(meetingDurationMs(meeting, 'in-progress', summary(5 * MIN))).toBeNull();
  });

  it('is unknown for a stopped state on a record with no end time', () => {
    expect(meetingDurationMs(storedMeeting({ endedAt: null }), 'stopped', null)).toBeNull();
  });
});

describe('formatDuration', () => {
  it.each([
    [0, 'under 1 min'],
    [59_999, 'under 1 min'],
    [-5 * MIN, 'under 1 min'],
    [MIN, '1 min'],
    [2 * MIN - 1, '1 min'],
    [45 * MIN, '45 min'],
    [59 * MIN + 59_999, '59 min'],
    [HOUR, '1 h'],
    [HOUR + 59_999, '1 h'],
    [2 * HOUR, '2 h'],
    [HOUR + 15 * MIN, '1 h 15 min'],
    [HOUR + 15 * MIN + 59_000, '1 h 15 min'],
    [3 * HOUR + MIN, '3 h 1 min'],
    [26 * HOUR + 5 * MIN, '26 h 5 min'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatMeetingDate and formatMeetingTime', () => {
  it('write the local date as d Mon yyyy and the local time as HH:MM', () => {
    const at = new Date(2026, 9, 7, 14, 30, 59).getTime();
    expect(formatMeetingDate(at)).toBe('7 Oct 2026');
    expect(formatMeetingTime(at)).toBe('14:30');
  });

  it('pad the time, not the day, and use the 24-hour clock', () => {
    expect(formatMeetingTime(new Date(2026, 9, 7, 9, 5).getTime())).toBe('09:05');
    expect(formatMeetingTime(new Date(2026, 9, 7, 0, 0).getTime())).toBe('00:00');
    expect(formatMeetingTime(new Date(2026, 11, 31, 23, 59).getTime())).toBe('23:59');
    expect(formatMeetingDate(new Date(2027, 0, 3, 0, 5).getTime())).toBe('3 Jan 2027');
    expect(formatMeetingDate(new Date(2026, 11, 31, 23, 59).getTime())).toBe('31 Dec 2026');
  });

  it('names all twelve months in English, three letters each', () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    expect(months.map((_, month) => formatMeetingDate(new Date(2026, month, 15, 12).getTime()))).toEqual(
      months.map((name) => `15 ${name} 2026`),
    );
  });
});

describe('rowNames', () => {
  it('shows up to four names and counts the rest', () => {
    expect(rowNames([])).toEqual({ shown: [], more: 0 });
    expect(rowNames(['Jane', 'Alex'])).toEqual({ shown: ['Jane', 'Alex'], more: 0 });
    expect(rowNames(['A', 'B', 'C', 'D'])).toEqual({ shown: ['A', 'B', 'C', 'D'], more: 0 });
    expect(rowNames(['A', 'B', 'C', 'D', 'E', 'F'])).toEqual({ shown: ['A', 'B', 'C', 'D'], more: 2 });
  });

  it('takes another limit', () => {
    expect(rowNames(['A', 'B', 'C'], 2)).toEqual({ shown: ['A', 'B'], more: 1 });
  });

  it('does not change the list it is given', () => {
    const names = ['A', 'B', 'C', 'D', 'E'];
    rowNames(names);
    expect(names).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});
