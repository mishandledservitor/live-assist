// The meeting's kept caption turns on their way to storage (013 data-model.md "Caption log", research R5). It receives
// each kept turn's whole text from the platform adapter, numbers the turns in arrival order, and every
// CAPTION_STORE_FLUSH_MS writes the ones that changed in one call. Platform-free; the store is injected. Nothing here
// reaches naming, the transcript, Ask or a log line: a failed write is reported by count only (FR-009).
import type { Logger } from '../log';
import type { CaptionText } from '../platform/adapter';
import { normaliseName } from '../transcript/labels';
import type { StoredCaptionTurn } from './model';

/** How often changed turns are written while anything changed. With the page's one-second throttle: about 3 s behind. */
export const CAPTION_STORE_FLUSH_MS = 2000;
/** A bound against a misbehaving page (16 times a three-hour call): further new turns are dropped. */
export const MAX_CAPTION_TURNS = 20_000;

export interface CaptionLogDeps {
  meetingId: string;
  /** Epoch ms of the meeting's clock zero. */
  startedAt: number;
  /** Writes the changed turns; false = the meeting is gone or has ended. */
  put(turns: StoredCaptionTurn[]): Promise<boolean>;
  /** The first kept turn of a caption name that is not the user's. */
  onSpeaker?(speakerName: string): void;
  /** The first successful write. */
  onKept?(): void;
  log: Logger;
}

export class CaptionLog {
  /** The meeting's turns as last received, by the adapter's turn key. */
  private readonly turns = new Map<string, StoredCaptionTurn>();
  /** Turn keys changed since they were last handed to the store. */
  private readonly dirty = new Set<string>();
  /** Normalised caption names already reported through onSpeaker. */
  private readonly seenNames = new Set<string>();
  private nextSeq = 1;
  private dropped = 0;
  /** close() was called, or the store refused a write: no update is accepted. */
  private closed = false;
  /** The store answered false: nothing more is written, not even what is dirty. */
  private refused = false;
  private kept = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Writes run one after the other on this chain, so two never overlap. */
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly deps: CaptionLogDeps) {}

  update(event: CaptionText): void {
    if (this.closed) return;
    const known = this.turns.get(event.turnKey);
    // A kept turn keeps its last text: an empty read never empties it, and never creates one (FR-002).
    if (event.text === '' || known?.text === event.text) return;
    if (known) {
      this.turns.set(event.turnKey, { ...known, text: event.text });
    } else {
      if (this.turns.size >= MAX_CAPTION_TURNS) {
        this.dropped += 1;
        return;
      }
      const self = event.self === true;
      this.turns.set(event.turnKey, {
        meetingId: this.deps.meetingId,
        seq: this.nextSeq,
        startMs: Math.max(0, event.firstSeenAt - this.deps.startedAt),
        speakerName: event.speakerName,
        self,
        text: event.text,
        schemaVersion: 1,
      });
      this.nextSeq += 1;
      if (!self) this.reportSpeaker(event.speakerName);
    }
    this.dirty.add(event.turnKey);
    this.schedule();
  }

  /** Writes what is dirty now. Resolves when stored (or refused). */
  flush(): Promise<void> {
    this.writes = this.writes.then(() => this.write());
    return this.writes;
  }

  /** Flushes, then accepts nothing more. Idempotent. */
  close(): Promise<void> {
    this.closed = true;
    this.cancelTimer();
    return this.flush();
  }

  private reportSpeaker(speakerName: string): void {
    const id = normaliseName(speakerName);
    if (this.seenNames.has(id)) return;
    this.seenNames.add(id);
    this.deps.onSpeaker?.(speakerName);
  }

  private schedule(): void {
    if (this.timer !== null || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, CAPTION_STORE_FLUSH_MS);
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async write(): Promise<void> {
    if (this.refused || this.dirty.size === 0) return;
    const keys = [...this.dirty];
    this.dirty.clear();
    const turns = keys
      .map((k) => this.turns.get(k))
      .filter((t) => t !== undefined)
      .sort((a, b) => a.seq - b.seq);
    let stored: boolean;
    try {
      stored = await this.deps.put(turns);
    } catch (e) {
      // Still dirty: the next flush writes them. The error's own text is not logged; it could quote what it failed on.
      for (const k of keys) this.dirty.add(k);
      this.deps.log.warn('could not store caption turns; they are written again with the next ones', {
        turns: turns.length,
        error: e instanceof Error ? e.name : typeof e,
      });
      this.schedule();
      return;
    }
    if (!stored) {
      // The meeting ended or was deleted (research R7): nothing of it is written from here on.
      this.refused = true;
      this.closed = true;
      this.dirty.clear();
      this.cancelTimer();
      return;
    }
    if (!this.kept) {
      this.kept = true;
      this.deps.onKept?.();
    }
    if (this.dirty.size > 0) this.schedule();
  }
}
