// Chat turns in IndexedDB (003 data-model "IndexedDB schema v2"). The service worker writes them; the panel reads.
import { isStale, type ChatTurn } from '../core/chat/turn';
import type { LiveAssistDb } from './db';

export class ChatRepo {
  constructor(private readonly db: LiveAssistDb) {}

  /** In asking order. */
  async listTurns(meetingId: string): Promise<ChatTurn[]> {
    const range = IDBKeyRange.bound([meetingId, -Infinity], [meetingId, Infinity]);
    return this.db.getAllFromIndex('chatTurns', 'meetingSeq', range);
  }

  /**
   * Writes the turn only while its meeting exists; resolves false, writing nothing, when it does not (012 FR-018: an
   * answer still streaming when its meeting is deleted must not put the question, the answer or the transcript text it
   * carries back). The check and the write share one transaction, so a delete cannot land between them. Idempotent:
   * the id is deterministic, so a repeated write replaces itself.
   */
  async putTurn(turn: ChatTurn): Promise<boolean> {
    const tx = this.db.transaction(['meetings', 'chatTurns'], 'readwrite');
    const exists = (await tx.objectStore('meetings').getKey(turn.meetingId)) !== undefined;
    if (exists) await tx.objectStore('chatTurns').put(turn);
    await tx.done;
    return exists;
  }

  async nextSeq(meetingId: string): Promise<number> {
    const range = IDBKeyRange.bound([meetingId, -Infinity], [meetingId, Infinity]);
    const last = await this.db.transaction('chatTurns').store.index('meetingSeq').openCursor(range, 'prev');
    return last ? last.value.seq + 1 : 0;
  }

  /** Orphaned `streaming` turns (no update for 60 s) become `stopped`, keeping their answer. Returns their ids. */
  async markStaleStreaming(now: number): Promise<string[]> {
    const tx = this.db.transaction('chatTurns', 'readwrite');
    const marked: string[] = [];
    for (const turn of await tx.store.getAll()) {
      if (isStale(turn, now)) {
        await tx.store.put({ ...turn, status: 'stopped', updatedAt: now });
        marked.push(turn.id);
      }
    }
    await tx.done;
    return marked;
  }
}
