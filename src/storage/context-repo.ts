// Meeting notes in IndexedDB (008 data-model "Rules", research N2–N3). The service worker writes them; the panel reads.
import { NEXT_MEETING_KEY, type MeetingContextRecord, type NotesInput } from '../core/chat/notes';
import type { LiveAssistDb } from './db';

export class ContextRepo {
  constructor(private readonly db: LiveAssistDb) {}

  async get(key: string): Promise<MeetingContextRecord | undefined> {
    return this.db.get('meetingContexts', key);
  }

  /**
   * Adds or replaces the notes; resolves the new version, or null (writing nothing) when `key` is a meeting that does
   * not exist (012 FR-018: notes saved as their meeting is deleted must not come back). The check and the write share
   * one transaction. `next` is always written.
   */
  async set(key: string, notes: NotesInput, now: number): Promise<number | null> {
    const tx = this.db.transaction(['meetings', 'meetingContexts'], 'readwrite');
    if (key !== NEXT_MEETING_KEY && (await tx.objectStore('meetings').getKey(key)) === undefined) {
      await tx.done;
      return null;
    }
    const store = tx.objectStore('meetingContexts');
    const current = await store.get(key);
    const version = (current?.version ?? 0) + 1;
    await store.put({
      meetingId: key,
      version,
      notes: { ...notes, addedAt: now },
      updatedAt: now,
      schemaVersion: 1,
    });
    await tx.done;
    return version;
  }

  /**
   * A meeting's notes become a tombstone (the version moves on, the text is gone) so the next question can say they
   * were removed. Pending notes were never sent, so their record is simply deleted.
   */
  async remove(key: string, now: number): Promise<void> {
    const tx = this.db.transaction('meetingContexts', 'readwrite');
    const current = await tx.store.get(key);
    if (key === NEXT_MEETING_KEY) await tx.store.delete(key);
    else if (current)
      await tx.store.put({
        meetingId: key,
        version: current.version + 1,
        notes: null,
        updatedAt: now,
        schemaVersion: 1,
      });
    await tx.done;
  }

  /** At Start: pending notes become version 1 of the meeting. Returns whether there were any. */
  async applyPending(meetingId: string, now: number): Promise<boolean> {
    const tx = this.db.transaction('meetingContexts', 'readwrite');
    const pending = await tx.store.get(NEXT_MEETING_KEY);
    if (pending?.notes) {
      await tx.store.put({ meetingId, version: 1, notes: pending.notes, updatedAt: now, schemaVersion: 1 });
      await tx.store.delete(NEXT_MEETING_KEY);
    }
    await tx.done;
    return Boolean(pending?.notes);
  }
}
