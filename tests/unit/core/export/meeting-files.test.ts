// 012 T005 (FR-014, FR-015, SC-005; research R7): the one seam every Download goes through.
// 013 T040 (FR-012–FR-018, decisions 67–70; contracts/files-and-storage.md "Core: files"): a meeting has up to two
// files, the transcript and then Meet's captions, each only when it has a line. The transcript's body is 007's; its
// download name gains "— Transcript". Every caption sentence is invented.
import { describe, expect, it } from 'vitest';
import { captionsFile } from '@/core/export/captions-file';
import { meetingFiles, type MeetingFileSource } from '@/core/export/meeting-files';
import { transcriptFile, transcriptFileName } from '@/core/export/transcript-file';
import {
  spokenBy,
  spokenBySelf,
  storedCaptionTurn,
  storedMeeting,
  storedSegment,
} from '../../../support/stored-meetings';

const TRANSCRIPT_NAME = 'Meeting — 07-10-2026 at 14h30 — Transcript.txt';
const CAPTIONS_NAME = 'Meeting — 07-10-2026 at 14h30 — Meet captions.txt';

describe('meetingFiles', () => {
  it('transcript only: one file of kind transcript, 007’s body under the download name', () => {
    const meeting = storedMeeting();
    const segments = [storedSegment('m1', 0, spokenBy('Jane')), storedSegment('m1', 1, spokenBySelf())];
    const files = meetingFiles({ meeting, segments });
    expect(files).toEqual([
      { kind: 'transcript', name: TRANSCRIPT_NAME, body: '[00:00] Jane: Line 0.\n\n[00:02] Alex: Line 1.\n' },
    ]);
    expect(files[0]?.body).toBe(transcriptFile(meeting, segments).body);
    // Decision 70: the inbox name is no panel download's name.
    expect(files[0]?.name).not.toBe(transcriptFileName(meeting.startedAt));
    expect(meetingFiles({ meeting, segments, captionTurns: [] })).toEqual(files);
  });

  it('both: the transcript, then the captions', () => {
    const meeting = storedMeeting();
    const segments = [storedSegment('m1', 0, spokenBy('Jane'))];
    const captionTurns = [
      storedCaptionTurn('m1', 2, { speakerName: 'You', self: true, text: 'I can bring the tide tables.' }),
      storedCaptionTurn('m1', 1, { speakerName: 'Jane', text: 'The harbour survey starts on Monday.' }),
    ];
    expect(meetingFiles({ meeting, segments, captionTurns })).toEqual([
      { kind: 'transcript', name: TRANSCRIPT_NAME, body: '[00:00] Jane: Line 0.\n' },
      {
        kind: 'captions',
        name: CAPTIONS_NAME,
        body: '[00:04] Jane: The harbour survey starts on Monday.\n\n[00:08] Alex: I can bring the tide tables.\n',
      },
    ]);
    expect(meetingFiles({ meeting, segments, captionTurns })[1]).toEqual({
      kind: 'captions',
      ...captionsFile(meeting, captionTurns),
    });
  });

  it('captions only: one file of kind captions', () => {
    const meeting = storedMeeting();
    const captionTurns = [storedCaptionTurn('m1', 1, { text: 'The harbour survey starts on Monday.' })];
    const expected = [
      { kind: 'captions', name: CAPTIONS_NAME, body: '[00:04] Sarah Brown: The harbour survey starts on Monday.\n' },
    ];
    expect(meetingFiles({ meeting, segments: [], captionTurns })).toEqual(expected);
    // Lines that would not be written (007 FR-006) are no transcript.
    expect(meetingFiles({ meeting, segments: [storedSegment('m1', 0, { labelPending: true })], captionTurns })).toEqual(
      expected,
    );
  });

  it('neither: no file', () => {
    const meeting = storedMeeting();
    expect(meetingFiles({ meeting, segments: [] })).toEqual([]);
    expect(meetingFiles({ meeting, segments: [], captionTurns: [] })).toEqual([]);
    expect(
      meetingFiles({
        meeting,
        segments: [storedSegment('m1', 0, { text: '' }), storedSegment('m1', 1, { text: ' \n' })],
        captionTurns: [storedCaptionTurn('m1', 1, { text: '  ' })],
      }),
    ).toEqual([]);
    expect(meetingFiles({ meeting, segments: [storedSegment('m1', 0, { labelPending: true })] })).toEqual([]);
  });

  it('writes renames, single-line corrections, "Others" and Greek text in the transcript as 007 does', () => {
    const meeting = storedMeeting({
      startedAt: new Date(2027, 0, 3, 9, 5).getTime(),
      speakerRenames: { 'caption:jane': { name: 'Τζέιν Ντο', origin: 'manual' } },
    });
    const segments = [
      storedSegment('m1', 2, { startMs: 4_512_000, text: 'Late.' }),
      storedSegment('m1', 0, { ...spokenBy('Jane'), text: 'Καλημέρα σε όλους, let us start.' }),
      storedSegment('m1', 1, { labelOverride: 'Mike', text: '  Two\nlines ' }),
    ];
    const [file, ...rest] = meetingFiles({ meeting, segments });
    expect(rest).toEqual([]);
    expect(file?.name).toBe('Meeting — 03-01-2027 at 09h05 — Transcript.txt');
    expect(file?.body).toBe(transcriptFile(meeting, segments).body);
    expect(file?.body).toBe(
      '[00:00] Τζέιν Ντο: Καλημέρα σε όλους, let us start.\n\n[00:02] Mike: Two lines\n\n[75:12] Others: Late.\n',
    );
  });

  it('is built from the meeting, its lines and its caption turns only: no place for questions, answers or notes', () => {
    const source: MeetingFileSource = {
      meeting: storedMeeting(),
      segments: [storedSegment('m1', 0)],
      captionTurns: [storedCaptionTurn('m1', 1)],
    };
    expect(Object.keys(source).sort()).toEqual(['captionTurns', 'meeting', 'segments']);
    // @ts-expect-error chat turns are not part of what a file is built from (constitution II)
    const withChat: MeetingFileSource = { ...source, chatTurns: [] };
    // @ts-expect-error nor are notes
    const withNotes: MeetingFileSource = { ...source, notes: 'NOTES-SENTINEL' };
    for (const s of [withChat, withNotes]) expect(meetingFiles(s)).toEqual(meetingFiles(source));
    expect(JSON.stringify(meetingFiles(withNotes))).not.toContain('NOTES-SENTINEL');
  });

  it('does not change what it is given', () => {
    const source = {
      meeting: storedMeeting(),
      segments: [storedSegment('m1', 1), storedSegment('m1', 0)],
      captionTurns: [storedCaptionTurn('m1', 2), storedCaptionTurn('m1', 1)],
    };
    const before = structuredClone(source);
    meetingFiles(source);
    expect(source).toEqual(before);
  });
});
