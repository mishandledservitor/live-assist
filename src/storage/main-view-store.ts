// The clean main view's one remembered value (012 FR-026, design decision 64; research R5): the moment the main view was
// last cleared by deleting the meeting it showed, in chrome.storage.local under its own key so it outlives the panel and
// the browser session. It names no meeting, so nothing of a deleted meeting is kept. Written by the side panel only,
// never removed, overwritten by the next clear.
import type { StorageAreaLike } from './preferences-store';

export const MAIN_VIEW_CLEARED_KEY = 'mainViewClearedAt';

/** Storage changes by key, in any context: the side panel wires chrome.storage.onChanged (area `local`) to this. */
export interface StorageChanges {
  subscribe(listener: (key: string) => void): () => void;
}

export class MainViewStore {
  constructor(
    private readonly area: StorageAreaLike,
    private readonly changes?: StorageChanges,
  ) {}

  /** null when absent or not a finite number. Rejects when the area cannot be read; the caller then shows the meeting. */
  async clearedAt(): Promise<number | null> {
    const value = (await this.area.get(MAIN_VIEW_CLEARED_KEY))[MAIN_VIEW_CLEARED_KEY];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  async clear(at: number): Promise<void> {
    await this.area.set({ [MAIN_VIEW_CLEARED_KEY]: at });
  }

  /** Fires when the key changes, in any context; returns an unsubscriber. A no-op without `changes`. */
  onChange(listener: () => void): () => void {
    if (!this.changes) return () => undefined;
    return this.changes.subscribe((key) => {
      if (key === MAIN_VIEW_CLEARED_KEY) listener();
    });
  }
}
