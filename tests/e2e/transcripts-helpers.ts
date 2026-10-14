// 012: stored meetings for the Transcripts screen's e2e specs, written straight into the panel's own IndexedDB (same
// extension origin), and a reader for the every-store scan after a deletion (SC-003).
import type { Page } from '@playwright/test';
import type { StoredCaptionTurn } from '@/core/captions/model';
import type { MeetingContextRecord } from '@/core/chat/notes';
import type { ChatTurn } from '@/core/chat/turn';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';

/** One stored meeting with everything it owns. Records are plain data in the shapes of src/core. */
export interface SeededMeeting {
  meeting: Meeting;
  segments?: TranscriptSegment[];
  chatTurns?: ChatTurn[];
  /** Its `meetingContexts` record (008). */
  notes?: MeetingContextRecord;
  /** Its kept caption turns (013); the meeting record then carries `hasCaptions`. */
  captionTurns?: StoredCaptionTurn[];
}

export interface SeedOptions {
  /** Replace what is stored (default) or add to it. */
  keep?: boolean;
  /** `e2eScenario` for the next fixture meeting (as `seedSettings`). */
  scenario?: string;
  /**
   * 3 writes the database as it was before 013: no `captionTurns` store (caption turns cannot be seeded then). The
   * panel upgrades it when it opens it.
   */
  dbVersion?: 3 | 4;
}

/**
 * Writes settings that are ready to start and the given meetings into IndexedDB `live-assist` (version 4 since 013),
 * with the same upgrade as src/storage/db.ts, then reloads the panel.
 */
export async function seedStoredMeetings(
  panel: Page,
  meetings: readonly SeededMeeting[],
  options: SeedOptions = {},
): Promise<void> {
  await panel.evaluate(
    async ({ meetings, keep, scenario, dbVersion }) => {
      await chrome.storage.local.set({
        e2eScenario: scenario,
        settings: {
          schemaVersion: 1,
          userName: 'Alex',
          keyterms: [],
          consentReminder: false,
          firstRunComplete: true,
          headphonesNoticeDismissed: false,
          chat: {
            provider: 'anthropic',
            models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
            setupComplete: true,
          },
        },
        credentials: { elevenLabsApiKey: 'sk_test_fixture_e2e_tx_0001' },
      });
      // An older version cannot be opened over the newer database the panel made when it loaded: start from none.
      if (dbVersion < 4)
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase('live-assist');
          req.onsuccess = () => resolve();
          req.onerror = () => reject(new Error(String(req.error)));
        });
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        // Same version and upgrade as src/storage/db.ts (v4 since 013), so the panel opens it without a VersionError.
        const req = indexedDB.open('live-assist', dbVersion);
        req.onupgradeneeded = (event) => {
          if (event.oldVersion < 1) {
            const meetingStore = req.result.createObjectStore('meetings', { keyPath: 'id' });
            meetingStore.createIndex('startedAt', 'startedAt');
            const segments = req.result.createObjectStore('segments', { keyPath: 'id' });
            segments.createIndex('meetingId', 'meetingId');
            segments.createIndex('meetingStart', ['meetingId', 'startMs']);
          }
          if (event.oldVersion < 2) {
            const chatTurns = req.result.createObjectStore('chatTurns', { keyPath: 'id' });
            chatTurns.createIndex('meetingId', 'meetingId');
            chatTurns.createIndex('meetingSeq', ['meetingId', 'seq']);
          }
          if (event.oldVersion < 3) req.result.createObjectStore('meetingContexts', { keyPath: 'meetingId' });
          if (dbVersion >= 4 && event.oldVersion < 4)
            req.result.createObjectStore('captionTurns', { keyPath: ['meetingId', 'seq'] });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error(String(req.error)));
      });
      const stores = ['meetings', 'segments', 'chatTurns', 'meetingContexts'];
      if (db.objectStoreNames.contains('captionTurns')) stores.push('captionTurns');
      const tx = db.transaction(stores, 'readwrite');
      if (!keep) for (const store of stores) tx.objectStore(store).clear();
      for (const m of meetings) {
        tx.objectStore('meetings').put(m.meeting);
        for (const s of m.segments ?? []) tx.objectStore('segments').put(s);
        for (const t of m.chatTurns ?? []) tx.objectStore('chatTurns').put(t);
        if (m.notes) tx.objectStore('meetingContexts').put(m.notes);
        for (const c of m.captionTurns ?? []) tx.objectStore('captionTurns').put(c);
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error(String(tx.error)));
      });
      db.close();
    },
    {
      meetings: [...meetings],
      keep: options.keep ?? false,
      scenario: options.scenario ?? '',
      dbVersion: options.dbVersion ?? 4,
    },
  );
  await panel.reload();
}

/** Every record of every object store, by store name. It names no store, so one added later is read too. */
export async function readAllStores(panel: Page): Promise<Record<string, unknown[]>> {
  return panel.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('live-assist');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(String(req.error)));
    });
    const out: Record<string, unknown[]> = {};
    for (const name of Array.from(db.objectStoreNames)) {
      out[name] = await new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result as unknown[]);
        req.onerror = () => reject(new Error(String(req.error)));
      });
    }
    db.close();
    return out;
  });
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `7 Oct 2026` and `14:30` for a start, from the local clock (the browser shares the test's time zone). */
export function when(startedAt: number): { date: string; time: string } {
  const d = new Date(startedAt);
  return {
    date: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

/** The name of a transcript downloaded from the panel (013 decision 70), for a start. */
export function fileName(startedAt: number): string {
  const d = new Date(startedAt);
  return `Meeting — ${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} at ${pad2(d.getHours())}h${pad2(d.getMinutes())} — Transcript.txt`;
}

export const transcriptsButton = (panel: Page) => panel.getByRole('button', { name: 'Transcripts', exact: true });
export const transcriptsScreen = (panel: Page) => panel.locator('section.transcripts-screen');
export const rows = (panel: Page) => panel.getByRole('list', { name: 'Transcripts' }).getByRole('listitem');
export const row = (panel: Page, id: string) => panel.locator(`.transcripts-list [data-meeting-id="${id}"]`);
/** A row's opening control, by the meeting's start. */
export const openControl = (panel: Page, startedAt: number) => {
  const { date, time } = when(startedAt);
  return panel.getByRole('button', { name: `Open transcript of ${date}, ${time}`, exact: true });
};
