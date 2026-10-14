// Stored meetings and lines for 012's tests (T002), in the shapes of src/core/transcript/model.ts. Unit, integration
// and dom tests build their fixtures from these so a new field on Meeting or TranscriptSegment is one edit.
import type { StoredCaptionTurn } from '@/core/captions/model';
import { segmentId, type Meeting, type TranscriptSegment } from '@/core/transcript/model';

/** 14:30 on 7 October 2026, local time: the start the spec's examples use (`7 Oct 2026 · 14:30`). */
export const STORED_START = new Date(2026, 9, 7, 14, 30).getTime();

/** A Meet tab's title at Start for a call with a name (012 FR-029). */
export const meetTitle = (name: string) => `Meet - ${name}`;

/** `source` for a Meet call with a name: its row shows `name` as its first line (design decision 76). */
export const titled = (name: string): Meeting['source'] => ({
  url: 'https://meet.google.com/abc-defg-hij',
  title: meetTitle(name),
  platform: 'meet',
});

/**
 * A meeting stopped by the user after 45 minutes; pass `endedAt: null, endReason: null` for an open record. It is a Meet
 * call without a name, so its tab was titled with the meeting code and its row has no title line.
 */
export function storedMeeting(overrides: Partial<Meeting> = {}): Meeting {
  const startedAt = overrides.startedAt ?? STORED_START;
  return {
    id: 'm1',
    startedAt,
    endedAt: startedAt + 45 * 60_000,
    endReason: 'user-stop',
    source: { url: 'https://meet.google.com/abc-defg-hij', title: meetTitle('abc-defg-hij'), platform: 'meet' },
    languageMode: { kind: 'auto' },
    userName: 'Alex',
    speakerRenames: {},
    schemaVersion: 2,
    ...overrides,
  };
}

/** One "Others" line, two seconds after the one before it; overrides name the speaker or change the text. */
export function storedSegment(
  meetingId: string,
  seq: number,
  overrides: Partial<TranscriptSegment> = {},
): TranscriptSegment {
  const startMs = overrides.startMs ?? seq * 2_000;
  return {
    id: segmentId(meetingId, 'mixed', seq),
    meetingId,
    stream: 'mixed',
    seq,
    startMs,
    endMs: startMs + 1_500,
    text: `Line ${seq}.`,
    language: null,
    speakerLabel: 'Others',
    labelSource: 'fallback',
    captionName: null,
    captionSelf: false,
    labelOverride: null,
    words: [],
    timing: 'estimated',
    sessionId: 's1',
    createdAt: 0,
    schemaVersion: 2,
    ...overrides,
  };
}

/** A line Meet's captions named. */
export const spokenBy = (name: string): Partial<TranscriptSegment> => ({
  speakerLabel: name,
  labelSource: 'caption',
  captionName: name,
});

/** A line Meet's captions marked as the user's own, labelled with the meeting's userName. */
export const spokenBySelf = (userName = 'Alex'): Partial<TranscriptSegment> => ({
  speakerLabel: userName,
  labelSource: 'caption',
  captionName: 'You',
  captionSelf: true,
});

/** 013: a stored caption turn, four seconds after the one before it; the sentence is invented. */
export function storedCaptionTurn(
  meetingId: string,
  seq: number,
  overrides: Partial<StoredCaptionTurn> = {},
): StoredCaptionTurn {
  return {
    meetingId,
    seq,
    startMs: seq * 4_000,
    speakerName: 'Sarah Brown',
    self: false,
    text: `Invented caption sentence number ${seq}.`,
    schemaVersion: 1,
    ...overrides,
  };
}

/** 013: a stored meeting that has kept captions. */
export const meetingWithCaptions = (overrides: Partial<Meeting> = {}): Meeting =>
  storedMeeting({ hasCaptions: true, ...overrides });

const LONG_SPEAKERS = ['Jane', 'Mike', 'Tom'];

/** `lines` lines about 2.16 s apart (5,000 make a 3-hour meeting), from three named speakers and "Others" in turn. */
export function longTranscript(meetingId: string, lines: number): TranscriptSegment[] {
  return Array.from({ length: lines }, (_, i) => {
    const speaker = LONG_SPEAKERS[i % 4];
    return storedSegment(meetingId, i, {
      startMs: i * 2_160,
      text: `Line ${i} with about a hundred characters of ordinary meeting speech in it, give or take a few.`,
      ...(speaker ? spokenBy(speaker) : {}),
    });
  });
}
