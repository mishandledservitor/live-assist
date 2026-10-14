// In-memory TranscriptsApi for side panel tests (012 T009): stored meetings with their lines, row details worked out by
// the real core rule and kept on the record as MeetingRepo.summarise does, and switches for the failures and the delay
// the Transcripts screen has to handle.
import { vi } from 'vitest';
import type { StoredCaptionTurn } from '@/core/captions/model';
import { summariseMeeting } from '@/core/history/meeting-summary';
import type { Meeting, MeetingSummary, TranscriptSegment } from '@/core/transcript/model';
import type { TranscriptsApi } from '@/entrypoints/sidepanel/transcripts-api';

export interface FakeStoredMeeting {
  meeting: Meeting;
  segments?: TranscriptSegment[];
  /** 013: its kept caption turns; read only for a meeting marked `hasCaptions`, as the real api does. */
  captionTurns?: StoredCaptionTurn[];
}

export function fakeTranscriptsApi(initial: readonly FakeStoredMeeting[] = []) {
  const entryOf = (s: FakeStoredMeeting) => ({
    meeting: s.meeting,
    segments: s.segments ?? [],
    captionTurns: s.captionTurns ?? [],
  });
  const stored = new Map(initial.map((s) => [s.meeting.id, entryOf(s)]));
  let captionsFail = false;
  let listFails = false;
  let removeFails = false;
  let held = false;
  let waiting: (() => void)[] = [];

  const api = {
    list: vi.fn(() => {
      if (listFails) {
        listFails = false;
        return Promise.reject(new Error('fake: the stored meetings cannot be read'));
      }
      return Promise.resolve([...stored.values()].map((s) => s.meeting).sort((a, b) => b.startedAt - a.startedAt));
    }),
    summarise: vi.fn(async (id: string): Promise<MeetingSummary | null> => {
      if (held) await new Promise<void>((resolve) => waiting.push(resolve));
      const entry = stored.get(id);
      if (!entry) return null;
      const summary = summariseMeeting(entry.meeting, entry.segments);
      if (entry.meeting.endedAt !== null) entry.meeting = { ...entry.meeting, summary };
      return summary;
    }),
    open: vi.fn((id: string) => {
      const entry = stored.get(id);
      if (!entry) return Promise.resolve(null);
      const { meeting, segments } = entry;
      if (meeting.hasCaptions !== true) return Promise.resolve({ meeting, segments, captionTurns: [] });
      if (captionsFail) {
        captionsFail = false;
        return Promise.reject(new Error('fake: the caption turns cannot be read'));
      }
      return Promise.resolve({ meeting, segments, captionTurns: [...entry.captionTurns] });
    }),
    remove: vi.fn((id: string) => {
      if (removeFails) {
        removeFails = false;
        return Promise.reject(new Error('fake: the meeting cannot be deleted'));
      }
      stored.delete(id);
      return Promise.resolve();
    }),
  } satisfies TranscriptsApi;

  return {
    api,
    /** The ids still stored. */
    ids: () => [...stored.keys()],
    /** Stores or replaces a meeting, as a Stop or another window would. */
    put(entry: FakeStoredMeeting) {
      stored.set(entry.meeting.id, entryOf(entry));
    },
    /** Removes a meeting behind the screen's back. */
    vanish(id: string) {
      stored.delete(id);
    },
    failNextList() {
      listFails = true;
    },
    failNextRemove() {
      removeFails = true;
    },
    /** 013: the next `open` of a meeting with kept captions rejects, as when the caption store cannot be read. */
    failNextCaptions() {
      captionsFail = true;
    },
    /** Every summarise from now on waits for releaseSummaries: rows are on screen before their details. */
    holdSummaries() {
      held = true;
    },
    /** Lets `count` waiting summarise calls go on (all of them, and every later one, when omitted). */
    releaseSummaries(count?: number) {
      if (count === undefined) {
        held = false;
        const all = waiting;
        waiting = [];
        for (const resolve of all) resolve();
        return;
      }
      for (const resolve of waiting.splice(0, count)) resolve();
    },
  };
}

/** A stored meeting whose row details are already on its record, as after the list was opened once. */
export function summarised(meeting: Meeting, segments: TranscriptSegment[] = []): FakeStoredMeeting {
  return { meeting: { ...meeting, summary: summariseMeeting(meeting, segments) }, segments };
}
