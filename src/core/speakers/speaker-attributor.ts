// Names segments over time (002 research R6 "Pending and settling", FR-009). A segment is stored as "Others" at once
// (shown as "…" while names are active, design decision 37); it is resolved when caption knowledge for it has settled (end + SETTLE_MS), re-resolved while late caption
// activity may still change it, and final at end + RESOLVE_DEADLINE_MS. Only changes are reported; the runtime stores
// each before it is shown. Remembered names (FR-022) become meeting renames the first time their caption key resolves.
// Real call 2026-10-09 (FR-027): a line whose words hold more than one speaker run is reported as a split into pieces;
// each piece then continues as its own pending line until the original's deadline. Pieces are never merged back.
import type { SpeakerNameMapping } from '../messaging/protocol';
import type { CaptionActivity } from '../platform/adapter';
import { normaliseName } from '../transcript/labels';
import type { SpeakerKey, SpeakerRename, TranscriptSegment } from '../transcript/model';
import { splitSegment } from '../transcript/split';
import { ATTRIBUTION, labelFields, speakerRuns, type AttributionConstants } from './attribution';
import { CaptionTurnTracker } from './caption-turns';

/** `labelPending: false` comes with the first resolution of a line shown as pending (design decision 37). */
export type LabelFields = ReturnType<typeof labelFields> & { labelPending?: false };

export interface SpeakerAttributorDeps {
  /** Epoch ms of the meeting's clock zero. */
  startedAt: number;
  /** Epoch ms. */
  now(): number;
  /** The meeting's user name: shown for Meet's own label for the user (decision 29). */
  userName: string;
  mappings: readonly SpeakerNameMapping[];
  /** Whether the meeting already has a rename for this key (a remembered name never replaces it). */
  hasRename(key: SpeakerKey): boolean;
  onUpdate(segmentId: string, fields: LabelFields): void;
  onRename(key: SpeakerKey, rename: SpeakerRename): void;
  /**
   * FR-027: the line `segmentId` becomes `pieces` (the first keeps its id), labels applied, placeholder cleared.
   * Without it, a line holding more than one speaker run resolves to "Others".
   */
  onSplit?(segmentId: string, pieces: TranscriptSegment[]): void;
  /** Whether the user has overridden this line: such a line is never split (its override stands for all of it). */
  isOverridden?(segmentId: string): boolean;
  constants?: AttributionConstants;
}

interface Pending {
  segment: TranscriptSegment;
  fields: LabelFields;
  /** Stored with `labelPending`: its first resolution clears the placeholder, changed label or not. */
  showsPending: boolean;
  settled: boolean;
  /** Meeting ms after which the line (or, once split, each of its pieces) is final: the original's end + deadline. */
  deadlineMs: number;
  /**
   * A piece split off as "Others" (words no speaker could be placed on): re-resolving its words alone would drop the
   * context that made them unplaceable and could name them after a neighbour, so it stays "Others" (FR-027).
   */
  othersOnly?: true;
  timers: ReturnType<typeof setTimeout>[];
}

const fieldsOf = (s: TranscriptSegment): LabelFields => ({
  speakerLabel: s.speakerLabel,
  labelSource: s.labelSource,
  captionName: s.captionName,
  captionSelf: s.captionSelf,
});

const sameFields = (a: LabelFields, b: LabelFields) =>
  a.speakerLabel === b.speakerLabel &&
  a.labelSource === b.labelSource &&
  a.captionName === b.captionName &&
  a.captionSelf === b.captionSelf;

export class SpeakerAttributor {
  private readonly turns: CaptionTurnTracker;
  private readonly pending = new Map<string, Pending>();
  private readonly finalised = new Set<string>();
  private readonly remembered = new Map<string, string>();
  private readonly c: AttributionConstants;

  constructor(private readonly deps: SpeakerAttributorDeps) {
    this.turns = new CaptionTurnTracker(deps.startedAt);
    this.c = deps.constants ?? ATTRIBUTION;
    for (const m of deps.mappings) this.remembered.set(normaliseName(m.captionName), m.displayName);
  }

  state(segmentId: string): 'pending' | 'final' | undefined {
    if (this.pending.has(segmentId)) return 'pending';
    return this.finalised.has(segmentId) ? 'final' : undefined;
  }

  add(segment: TranscriptSegment): void {
    if (this.pending.has(segment.id) || this.finalised.has(segment.id)) return;
    const p: Pending = {
      segment,
      fields: fieldsOf(segment),
      showsPending: segment.labelPending === true,
      settled: false,
      deadlineMs: segment.endMs + this.c.RESOLVE_DEADLINE_MS,
      timers: [],
    };
    this.pending.set(segment.id, p);
    p.timers.push(
      this.at(segment.endMs + this.c.SETTLE_MS, () => {
        p.settled = true;
        this.resolve(p);
      }),
      this.at(p.deadlineMs, () => this.finalise(p)),
    );
  }

  caption(activity: CaptionActivity): void {
    this.turns.add(activity);
    for (const p of [...this.pending.values()]) if (p.settled && this.pending.get(p.segment.id) === p) this.resolve(p);
  }

  /** Meeting end: every pending segment is resolved once more and finalised. */
  finish(): void {
    for (const p of [...this.pending.values()]) this.finalise(p);
  }

  dispose(): void {
    for (const p of this.pending.values()) for (const t of p.timers) clearTimeout(t);
    this.pending.clear();
  }

  /** Runs `fn` at meeting time `meetingMs` (at once if that has passed). */
  private at(meetingMs: number, fn: () => void): ReturnType<typeof setTimeout> {
    return setTimeout(fn, Math.max(0, this.deps.startedAt + meetingMs - this.deps.now()));
  }

  private finalise(p: Pending): void {
    const pieces = this.resolve(p);
    for (const t of p.timers) clearTimeout(t);
    if (pieces) {
      for (const q of pieces) this.finalise(q);
      return;
    }
    this.pending.delete(p.segment.id);
    this.finalised.add(p.segment.id);
    const oldest = Math.min(...[...this.pending.values()].map((x) => x.segment.startMs), p.segment.endMs);
    this.turns.prune(oldest);
  }

  /** Resolves one line; when it splits, returns the pending pieces that replace it. */
  private resolve(p: Pending): Pending[] | null {
    if (p.othersOnly) return null;
    const { startMs, endMs } = p.segment;
    const turns = this.turns.inWindow(startMs - this.c.TAIL_MS, endMs + Math.max(this.c.LEAD_MS, this.c.LAG_MAX_MS));
    const runs = speakerRuns(p.segment, turns, this.c);
    for (const r of runs)
      if (r.attribution.kind === 'caption' && !r.attribution.self) this.applyRemembered(r.attribution.captionName);
    const canSplit = this.deps.onSplit !== undefined && this.deps.isOverridden?.(p.segment.id) !== true;
    if (runs.length > 1 && canSplit) return this.split(p, runs);
    // One label for the whole line: its only run, or "Others" when it holds more than one speaker run.
    const fields = labelFields(runs.length === 1 ? runs[0]!.attribution : { kind: 'others' }, this.deps.userName);
    if (p.showsPending) {
      p.showsPending = false;
      p.fields = fields;
      this.deps.onUpdate(p.segment.id, { ...fields, labelPending: false });
      return null;
    }
    if (sameFields(fields, p.fields)) return null;
    p.fields = fields;
    this.deps.onUpdate(p.segment.id, fields);
    return null;
  }

  /** FR-027: the line becomes pieces; each is pending (already settled) until the original's deadline. */
  private split(p: Pending, runs: ReturnType<typeof speakerRuns>): Pending[] {
    const pieces = splitSegment(
      p.segment,
      runs.map((r) => ({ from: r.from, to: r.to, fields: labelFields(r.attribution, this.deps.userName) })),
    );
    for (const t of p.timers) clearTimeout(t);
    this.pending.delete(p.segment.id);
    const next = pieces.map((segment) => {
      const q: Pending = {
        segment,
        fields: fieldsOf(segment),
        showsPending: false,
        settled: true,
        deadlineMs: p.deadlineMs,
        ...(segment.labelSource === 'fallback' && { othersOnly: true as const }),
        timers: [],
      };
      this.pending.set(segment.id, q);
      q.timers.push(this.at(p.deadlineMs, () => this.finalise(q)));
      return q;
    });
    this.deps.onSplit?.(p.segment.id, pieces);
    return next;
  }

  private applyRemembered(captionName: string): void {
    const id = normaliseName(captionName);
    const name = this.remembered.get(id);
    if (name === undefined) return;
    this.remembered.delete(id); // first time only
    const key: SpeakerKey = `caption:${id}`;
    if (!this.deps.hasRename(key)) this.deps.onRename(key, { name, origin: 'remembered' });
  }
}
