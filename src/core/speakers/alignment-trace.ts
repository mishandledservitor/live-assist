// DEV-ONLY (spike build): records an alignment trace of a real call (002 research R11, tasks T067/T078) — caption turns
// and segment timing with placeholder names and no text of any kind — so `pnpm spike:meet-trace` can turn it into a
// timeline fixture for the R6 rules. The placeholder → name key is returned separately for the user's review only.
import type { CaptionActivity } from '../platform/adapter';
import type { LabelSource, SpeakerKey, TranscriptSegment } from '../transcript/model';
import { analyse, attribute, ATTRIBUTION } from './attribution';
import { CaptionTurnTracker, type CaptionTurn } from './caption-turns';

/**
 * Format 2 (real trace 2026-10-08): carries `meetingStartedAtMs`, and every time in it is meeting-relative. Format 1
 * traces could hold epoch caption times next to meeting-relative lines; `spike:meet-trace --origin` converts them.
 */
export const TRACE_FORMAT = 'live-assist-alignment-trace/2';
export const TRACE_FORMAT_V1 = 'live-assist-alignment-trace/1';
/** Stands in for the user's settings name; `$user` labels refer to it. */
export const TRACE_USER = 'The user';

export interface TraceCaption {
  turnKey: string;
  speakerName: string;
  self: boolean | null;
  observedAtMs: number[];
}

export interface TraceSegment {
  id: string;
  startMs: number;
  endMs: number;
  timing: 'words' | 'estimated';
  /** Word text is `w0`, `w1`…: only the times are kept. */
  words: { text: string; startMs: number; endMs: number }[];
  /** The attributed label (renames and overrides left out): a placeholder, `$user` or `Others`. */
  label: string;
  labelSource: LabelSource;
  /** Why, by the R6 rules over every caption recorded (retest 2026-10-08); absent in traces from before then. */
  why?: TraceWhy;
  /**
   * Real call 2026-10-09 (FR-027): the line was split; each piece by the index of its first word in `words`, with its
   * label. `label` above is then the first piece's. Absent when the line was not split.
   */
  pieces?: { firstWord: number; label: string; labelSource: LabelSource }[];
}

/**
 * `named`: one speaker clearly dominates well-covered words. `no-captions`: no caption activity near the words.
 * `low-coverage`: captions cover too little of the words. `no-clear-speaker`: more than one speaker, none dominant.
 */
export type TraceReason = 'named' | 'no-captions' | 'low-coverage' | 'no-clear-speaker';

export interface TraceWhy {
  reason: TraceReason;
  /** What the rules give now, with every caption known: a placeholder, `$user` or `Others`. */
  rulesLabel: string;
  /** Share of the word time covered by any caption window, 2 decimals. */
  coverage: number;
  /** Each speaker's share of the covered time by placeholder (or `$user`), 2 decimals. */
  shares: Record<string, number>;
}

export interface AlignmentTrace {
  format: typeof TRACE_FORMAT;
  userName: typeof TRACE_USER;
  /**
   * Epoch ms of the meeting's clock zero. Null when the recorder never learned it: captions then stay epoch ms and no
   * line gets a `why`, so the two clocks are never compared.
   */
  meetingStartedAtMs: number | null;
  /** Meeting ms when `meetingStartedAtMs` is known, else epoch ms. */
  captions: TraceCaption[];
  segments: TraceSegment[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The R6 rules re-run on a traced segment, in placeholder terms. */
function whyOf(s: TraceSegment, turns: readonly CaptionTurn[]): TraceWhy {
  const { coverage, shares, names } = analyse(s, turns);
  const a = attribute(s, turns);
  const nameOf = (key: SpeakerKey) => (key === 'self' ? '$user' : (names.get(key) ?? key));
  const top = Math.max(0, ...shares.values());
  const reason: TraceReason =
    a.kind === 'caption'
      ? 'named'
      : shares.size === 0
        ? 'no-captions'
        : s.timing === 'estimated'
          ? shares.size > 1
            ? 'no-clear-speaker'
            : 'low-coverage'
          : top < ATTRIBUTION.DOMINANCE
            ? 'no-clear-speaker'
            : 'low-coverage';
  return {
    reason,
    rulesLabel: a.kind === 'others' ? 'Others' : a.self ? '$user' : a.captionName,
    coverage: round2(coverage),
    shares: Object.fromEntries([...shares].map(([k, v]) => [nameOf(k), round2(v)])),
  };
}

const letters = (i: number): string =>
  (i < 26 ? '' : letters(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));

interface RecordedCaption {
  turnKey: string;
  /** The real name, in memory only; the export holds a placeholder (or the self word). */
  name: string;
  self: boolean | null;
  /** Epoch ms as observed: converted to meeting time once, at export. */
  observedAt: number[];
}

export class AlignmentTraceRecorder {
  /** Epoch ms of the meeting start; null until `begin()`. */
  private startedAt: number | null = null;
  private meetingId: string | null = null;
  private captions = new Map<string, RecordedCaption>();
  /** The line as first stored (all its words), by seq. */
  private segments = new Map<number, TranscriptSegment>();
  /** The latest version of each line or piece, by seq then id (pieces share their line's seq). */
  private versions = new Map<number, Map<string, TranscriptSegment>>();

  /**
   * The meeting has started (real trace 2026-10-08). Captions seen before this call are kept if they belong to it
   * (observed at or after its start), so a late `begin()` loses nothing; older captions and other meetings' lines go.
   */
  begin(meeting: { id?: string; startedAt: number; userName: string }): void {
    const { id, startedAt } = meeting;
    this.startedAt = startedAt;
    this.meetingId = id ?? null;
    const kept = new Map<string, RecordedCaption>();
    for (const [key, c] of this.captions) {
      const observedAt = c.observedAt.filter((at) => at >= startedAt);
      if (observedAt.length > 0) kept.set(key, { ...c, observedAt });
    }
    this.captions = kept;
    this.segments = new Map([...this.segments].filter(([, s]) => id !== undefined && s.meetingId === id));
    this.versions = new Map([...this.versions].filter(([seq]) => this.segments.has(seq)));
  }

  caption(a: CaptionActivity): void {
    const turn = this.captions.get(a.turnKey);
    if (turn) turn.observedAt.push(a.observedAt);
    else
      this.captions.set(a.turnKey, {
        turnKey: a.turnKey,
        name: a.speakerName,
        self: a.self,
        observedAt: [a.observedAt],
      });
  }

  segment(s: TranscriptSegment): void {
    if (this.meetingId !== null && s.meetingId !== this.meetingId) return;
    const first = this.segments.get(s.seq);
    // Keep the whole line's words: a split stores its first piece, with fewer words, over the same id.
    if (!first || (s.id === first.id && s.words.length >= first.words.length)) this.segments.set(s.seq, s);
    const byId = this.versions.get(s.seq) ?? new Map<string, TranscriptSegment>();
    byId.set(s.id, s);
    this.versions.set(s.seq, byId);
  }

  export(): { trace: AlignmentTrace; key: Record<string, string> } {
    const placeholders = new Map<string, string>();
    const placeholder = (name: string): string => {
      let p = placeholders.get(name);
      if (!p) {
        p = `Participant ${letters(placeholders.size)}`;
        placeholders.set(name, p);
      }
      return p;
    };
    const origin = this.startedAt;
    // The one place caption times change clock: epoch → meeting ms, and only once the start is known.
    const captions: TraceCaption[] = [...this.captions.values()]
      .map((c) => ({ ...c, observedAt: [...c.observedAt].sort((a, b) => a - b) }))
      .sort((a, b) => a.observedAt[0]! - b.observedAt[0]!)
      .map((c) => ({
        turnKey: c.turnKey,
        speakerName: c.self === true ? c.name : placeholder(c.name),
        self: c.self,
        observedAtMs: c.observedAt.map((at) => (origin === null ? at : at - origin)),
      }));
    const segments: TraceSegment[] = [...this.segments.values()]
      .sort((a, b) => a.startMs - b.startMs)
      .map((whole) => {
        const labelOf = (s: TranscriptSegment) =>
          s.labelSource !== 'caption'
            ? 'Others'
            : s.captionSelf
              ? '$user'
              : placeholder(s.captionName ?? s.speakerLabel);
        const latest = [...(this.versions.get(whole.seq)?.values() ?? [whole])];
        const head = latest.find((v) => v.id === whole.id) ?? whole;
        const label = labelOf(head);
        const out: TraceSegment = {
          id: `seg-${whole.seq}`,
          startMs: whole.startMs,
          endMs: whole.endMs,
          timing: whole.timing,
          words: whole.words.map((w, i) => ({ text: `w${i}`, startMs: w.startMs, endMs: w.endMs })),
          label,
          labelSource: label === 'Others' ? 'fallback' : 'caption',
        };
        if (latest.length > 1)
          out.pieces = latest
            .map((v) => {
              const l = labelOf(v);
              const firstWord = whole.words.findIndex((w) => w.startMs === v.words[0]?.startMs);
              const labelSource: LabelSource = l === 'Others' ? 'fallback' : 'caption';
              return { firstWord, label: l, labelSource };
            })
            .sort((a, b) => a.firstWord - b.firstWord);
        return out;
      });
    // Reasons only in one clock. The captions carry placeholders by now, so the rules' names are placeholders too.
    if (origin !== null) {
      const tracker = new CaptionTurnTracker(0);
      for (const c of captions)
        for (const at of c.observedAtMs)
          tracker.add({ turnKey: c.turnKey, speakerName: c.speakerName, self: c.self, observedAt: at });
      const turns = tracker.all();
      for (const s of segments) s.why = whyOf(s, turns);
    }
    const trace: AlignmentTrace = {
      format: TRACE_FORMAT,
      userName: TRACE_USER,
      meetingStartedAtMs: origin,
      captions,
      segments,
    };
    const key = Object.fromEntries([...placeholders].map(([name, p]) => [p, name]));
    return { trace, key };
  }
}
