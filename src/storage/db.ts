// IndexedDB schema (001 data-model.md, research R9; 003 research R13; 008 research N2; 013 research R5). Writers: the
// offscreen document writes meetings, segments and caption turns (013); the service worker writes chat turns (003) and
// meeting notes (008). Every context opens the same version.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { StoredCaptionTurn } from '../core/captions/model';
import type { MeetingContextRecord } from '../core/chat/notes';
import type { ChatTurn } from '../core/chat/turn';
import type { Meeting, TranscriptSegment } from '../core/transcript/model';

export const DB_NAME = 'live-assist';
/** 2: adds `chatTurns` (003). 3: adds `meetingContexts` (008). 4: adds `captionTurns` (013). */
export const DB_VERSION = 4;

export interface LiveAssistSchema extends DBSchema {
  meetings: {
    key: string;
    value: Meeting;
    indexes: { startedAt: number };
  };
  segments: {
    key: string;
    value: TranscriptSegment;
    indexes: { meetingId: string; meetingStart: [string, number] };
  };
  chatTurns: {
    key: string;
    value: ChatTurn;
    indexes: { meetingId: string; meetingSeq: [string, number] };
  };
  /** 008: one notes record per meeting, plus `next` for notes waiting for the next Start. */
  meetingContexts: {
    key: string;
    value: MeetingContextRecord;
  };
  /** 013: the meeting platform's own captions, one row per kept turn; a key range reads or deletes a meeting's. */
  captionTurns: {
    key: [string, number];
    value: StoredCaptionTurn;
  };
}

export type LiveAssistDb = IDBPDatabase<LiveAssistSchema>;

export async function openLiveAssistDb(name: string = DB_NAME): Promise<LiveAssistDb> {
  const db = await openDB<LiveAssistSchema>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const meetings = db.createObjectStore('meetings', { keyPath: 'id' });
        meetings.createIndex('startedAt', 'startedAt');
        const segments = db.createObjectStore('segments', { keyPath: 'id' });
        segments.createIndex('meetingId', 'meetingId');
        segments.createIndex('meetingStart', ['meetingId', 'startMs']);
      }
      if (oldVersion < 2) {
        const chatTurns = db.createObjectStore('chatTurns', { keyPath: 'id' });
        chatTurns.createIndex('meetingId', 'meetingId');
        chatTurns.createIndex('meetingSeq', ['meetingId', 'seq']);
      }
      if (oldVersion < 3) db.createObjectStore('meetingContexts', { keyPath: 'meetingId' });
      if (oldVersion < 4) db.createObjectStore('captionTurns', { keyPath: ['meetingId', 'seq'] });
    },
  });
  // A page still holding an older connection must never block a newer version's upgrade (research R13).
  db.addEventListener('versionchange', () => db.close());
  return db;
}
