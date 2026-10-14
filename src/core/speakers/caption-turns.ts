// Caption turns on the meeting clock (002 data-model.md "Caption turn", research R5). In memory only, never stored;
// a turn holds a name and when it was seen, never caption text.
import type { CaptionActivity } from '../platform/adapter';

/** A stretch of a turn's activity: meeting ms of its first and last change. */
export type Burst = readonly [fromMs: number, toMs: number];

export interface CaptionTurn {
  turnKey: string;
  speakerName: string;
  /** The platform's self hint; null = cannot tell. */
  self: boolean | null;
  /** Meeting ms (observedAt − meeting.startedAt; the page and the offscreen document share the machine clock). */
  firstSeenMs: number;
  lastSeenMs: number;
  /**
   * The turn's bursts of activity, ascending (retest 2026-10-08): a quiet spell longer than ACTIVITY_GAP_MS ends one.
   * Absent = one burst from first to last seen.
   */
  bursts?: readonly Burst[];
}

/** Turns that ended this long before the oldest pending segment can no longer change any attribution. */
export const PRUNE_MARGIN_MS = 60_000;
/**
 * A turn quiet this long between two changes has paused: the time between is not credited to it (research R6,
 * retest 2026-10-08). Longer than the longest stall of Meet's updates while someone keeps talking in the timeline
 * fixtures (4.5 s, `dropped-older-text`). Real trace 2026-10-08: at least 5,406 ms (a pause inside a clear line that
 * must stay one burst) and below 5,772 ms (a pause holding only a filler with no caption of its own, which must stay
 * "Others"); both margins are pinned by tests.
 */
export const ACTIVITY_GAP_MS = 5500;

/** Adds one instant to ascending, non-overlapping bursts, merging any it bridges. */
function addToBursts(bursts: readonly Burst[], at: number, gapMs: number): Burst[] {
  let from = at;
  let to = at;
  const kept: Burst[] = [];
  for (const [a, b] of bursts) {
    if (at >= a - gapMs && at <= b + gapMs) {
      from = Math.min(from, a);
      to = Math.max(to, b);
    } else kept.push([a, b]);
  }
  return [...kept, [from, to] as Burst].sort((x, y) => x[0] - y[0]);
}

export class CaptionTurnTracker {
  private readonly turns = new Map<string, CaptionTurn>();

  private readonly gapMs: number;

  /** `activityGapMs` exists for the margin tests (research R6); the app always uses ACTIVITY_GAP_MS. */
  constructor(
    private readonly startedAt: number,
    options: { activityGapMs?: number } = {},
  ) {
    this.gapMs = options.activityGapMs ?? ACTIVITY_GAP_MS;
  }

  add(a: CaptionActivity): CaptionTurn {
    const at = a.observedAt - this.startedAt;
    const known = this.turns.get(a.turnKey);
    const turn: CaptionTurn = known
      ? {
          ...known,
          firstSeenMs: Math.min(known.firstSeenMs, at),
          lastSeenMs: Math.max(known.lastSeenMs, at),
          bursts: addToBursts(known.bursts ?? [], at, this.gapMs),
        }
      : {
          turnKey: a.turnKey,
          speakerName: a.speakerName,
          self: a.self,
          firstSeenMs: at,
          lastSeenMs: at,
          bursts: [[at, at]],
        };
    this.turns.set(a.turnKey, turn);
    return turn;
  }

  all(): CaptionTurn[] {
    return [...this.turns.values()];
  }

  /** Turns whose seen span [first, last] touches [fromMs, toMs]. */
  inWindow(fromMs: number, toMs: number): CaptionTurn[] {
    return this.all().filter((t) => t.lastSeenMs >= fromMs && t.firstSeenMs <= toMs);
  }

  prune(oldestPendingStartMs: number): void {
    for (const [key, t] of this.turns)
      if (t.lastSeenMs < oldestPendingStartMs - PRUNE_MARGIN_MS) this.turns.delete(key);
  }
}
