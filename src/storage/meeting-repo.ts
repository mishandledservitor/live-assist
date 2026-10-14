import type { StoredCaptionTurn } from '../core/captions/model';
import { normaliseMeeting, normaliseSegment } from '../core/transcript/labels';
import type {
  EndReason,
  Meeting,
  MeetingSummary,
  SpeakerKey,
  SpeakerRename,
  TranscriptSegment,
} from '../core/transcript/model';
import { sortSegments } from '../core/transcript/ordering';
import type { LiveAssistDb } from './db';

/** The record without its cached row details (012): what every label edit writes back. */
function withoutSummary(meeting: Meeting): Meeting {
  const { summary: _summary, ...rest } = meeting;
  return rest;
}

const segmentsOf = (meetingId: string) => IDBKeyRange.bound([meetingId, -Infinity], [meetingId, Infinity]);
/** 013: a meeting's caption turns, by their key `[meetingId, seq]`. */
const captionTurnsOf = segmentsOf;

/**
 * Meetings and their segments in IndexedDB. One transaction per write so a crash loses at most one line (SC-004).
 * Records stored before 002 are normalised on read (002 data-model.md; no IndexedDB version bump).
 */
export class MeetingRepo {
  constructor(private readonly db: LiveAssistDb) {}

  async createMeeting(meeting: Meeting): Promise<void> {
    await this.db.add('meetings', meeting);
  }

  async getMeeting(id: string): Promise<Meeting | undefined> {
    const m = await this.db.get('meetings', id);
    return m && normaliseMeeting(m);
  }

  /** Idempotent: the segment id is deterministic, so a retried write replaces itself. */
  async appendSegment(segment: TranscriptSegment): Promise<void> {
    await this.db.put('segments', segment);
  }

  /** FR-013 order: startMs, then tab before mic, then seq. */
  async listSegments(meetingId: string): Promise<TranscriptSegment[]> {
    const stored = await this.db.getAllFromIndex('segments', 'meetingStart', segmentsOf(meetingId));
    return sortSegments(stored.map(normaliseSegment));
  }

  /** 012: every stored meeting, newest first by startedAt. Rejects when the store cannot be read. */
  async listMeetings(): Promise<Meeting[]> {
    const oldestFirst = await this.db.getAllFromIndex('meetings', 'startedAt');
    return oldestFirst.reverse().map(normaliseMeeting);
  }

  /**
   * 012 (research R3): reads the meeting and its lines and computes its summary in one readwrite transaction, so a
   * label edit cannot land between the read and the write. Stores it on the record only when the meeting has ended:
   * lines still arrive for an open one. Resolves null when the meeting does not exist.
   */
  async summarise(
    id: string,
    compute: (meeting: Meeting, segments: TranscriptSegment[]) => MeetingSummary,
  ): Promise<MeetingSummary | null> {
    const tx = this.db.transaction(['meetings', 'segments'], 'readwrite');
    const meetings = tx.objectStore('meetings');
    const current = await meetings.get(id);
    if (!current) {
      await tx.done;
      return null;
    }
    const stored = await tx.objectStore('segments').index('meetingStart').getAll(segmentsOf(id));
    const summary = compute(normaliseMeeting(current), sortSegments(stored.map(normaliseSegment)));
    if (current.endedAt !== null) await meetings.put({ ...current, summary });
    await tx.done;
    return summary;
  }

  /** 002: a segment's attribution or override changed. Same as appendSegment, named for intent. */
  async updateSegment(segment: TranscriptSegment): Promise<void> {
    await this.db.put('segments', segment);
  }

  /**
   * 002: sets (or, with null, removes) one speaker key's rename, in one transaction. 012: the record it writes carries
   * no summary, so the row's names are worked out again.
   */
  async setSpeakerRename(meetingId: string, key: SpeakerKey, entry: SpeakerRename | null): Promise<void> {
    const tx = this.db.transaction('meetings', 'readwrite');
    const current = await tx.store.get(meetingId);
    if (current) {
      const speakerRenames = { ...normaliseMeeting(current).speakerRenames };
      if (entry) speakerRenames[key] = entry;
      else delete speakerRenames[key];
      await tx.store.put({ ...withoutSummary(current), speakerRenames });
    }
    await tx.done;
  }

  /**
   * 002: sets (or, with null, clears) one line's override, in one transaction. 012: the same transaction removes the
   * meeting's summary.
   */
  async setLabelOverride(meetingId: string, segmentId: string, name: string | null): Promise<void> {
    const tx = this.db.transaction(['segments', 'meetings'], 'readwrite');
    const segments = tx.objectStore('segments');
    const current = await segments.get(segmentId);
    if (current?.meetingId === meetingId) {
      await segments.put({ ...normaliseSegment(current), labelOverride: name });
      const meetings = tx.objectStore('meetings');
      const meeting = await meetings.get(meetingId);
      if (meeting?.summary) await meetings.put(withoutSummary(meeting));
    }
    await tx.done;
  }

  /**
   * 013 (research R5, R7): writes the turns only while their meeting exists and has not ended, and sets the meeting's
   * `hasCaptions` with the first, in one transaction over `meetings` and `captionTurns`. Resolves false, writing
   * nothing, otherwise: a flush that arrives after the meeting ended or was deleted puts nothing back. An empty list
   * resolves true and writes nothing. Every turn must carry `meetingId`.
   */
  async putCaptionTurns(meetingId: string, turns: readonly StoredCaptionTurn[]): Promise<boolean> {
    if (turns.some((t) => t.meetingId !== meetingId)) throw new Error('A caption turn belongs to another meeting.');
    if (turns.length === 0) return true;
    const tx = this.db.transaction(['meetings', 'captionTurns'], 'readwrite');
    const meetings = tx.objectStore('meetings');
    const meeting = await meetings.get(meetingId);
    const open = meeting !== undefined && meeting.endedAt === null;
    if (open) {
      const rows = tx.objectStore('captionTurns');
      await Promise.all([
        ...turns.map((t) => rows.put(t)),
        ...(meeting.hasCaptions === true ? [] : [meetings.put({ ...meeting, hasCaptions: true })]),
      ]);
    }
    await tx.done;
    return open;
  }

  /** 013: the meeting's caption turns in `seq` order; [] when it has none. */
  listCaptionTurns(meetingId: string): Promise<StoredCaptionTurn[]> {
    return this.db.getAll('captionTurns', captionTurnsOf(meetingId));
  }

  countSegments(): Promise<number> {
    return this.db.count('segments');
  }

  /** Sets endedAt/endReason once; a meeting that already ended keeps its first reason. */
  async endMeeting(id: string, endedAt: number, endReason: EndReason): Promise<void> {
    const tx = this.db.transaction('meetings', 'readwrite');
    const current = await tx.store.get(id);
    if (current && current.endedAt === null) await tx.store.put({ ...current, endedAt, endReason });
    await tx.done;
  }

  /** On start-up: every open meeting other than the live one did not end cleanly. Returns the ids marked. */
  async markOrphanedCrashed(liveMeetingId: string | null, now: number): Promise<string[]> {
    const tx = this.db.transaction('meetings', 'readwrite');
    const marked: string[] = [];
    for (const m of await tx.store.getAll()) {
      if (m.endedAt === null && m.id !== liveMeetingId) {
        await tx.store.put({ ...m, endedAt: now, endReason: 'crashed' });
        marked.push(m.id);
      }
    }
    await tx.done;
    return marked;
  }

  /**
   * Real deletion (Principle I): the meeting, every one of its segments, its chat (003 FR-022), its notes (008
   * FR-017) and its caption turns (013 FR-010), in one transaction.
   */
  async deleteMeeting(id: string): Promise<void> {
    const tx = this.db.transaction(
      ['meetings', 'segments', 'chatTurns', 'meetingContexts', 'captionTurns'],
      'readwrite',
    );
    const segments = tx.objectStore('segments');
    const chatTurns = tx.objectStore('chatTurns');
    const segmentKeys = await segments.index('meetingId').getAllKeys(id);
    const turnKeys = await chatTurns.index('meetingId').getAllKeys(id);
    await Promise.all([
      ...segmentKeys.map((k) => segments.delete(k)),
      ...turnKeys.map((k) => chatTurns.delete(k)),
      tx.objectStore('meetings').delete(id),
      tx.objectStore('meetingContexts').delete(id),
      tx.objectStore('captionTurns').delete(captionTurnsOf(id)),
    ]);
    await tx.done;
  }

  async latestMeeting(): Promise<Meeting | undefined> {
    const cursor = await this.db.transaction('meetings').store.index('startedAt').openCursor(null, 'prev');
    return cursor?.value && normaliseMeeting(cursor.value);
  }
}
