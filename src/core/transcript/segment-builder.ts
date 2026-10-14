// Turns the meeting's (single, mixed) stream of provider events into stored segments (data-model.md TranscriptSegment, research R3).
// Pure: the caller supplies meeting-relative times, so the runtime decides how the clock is read.
import type { ProviderWord } from '../transcription/provider';
import { segmentId, type LanguageMode, type SegmentWord, type TranscriptSegment } from './model';

/** A commit whose timestamps message has not arrived after this long is stored with estimated times. */
export const DETAIL_TIMEOUT_MS = 2000;

export const OTHERS_LABEL = 'Others';

export interface SegmentBuilderOptions {
  meetingId: string;
  language: LanguageMode;
  /** Epoch ms, for createdAt. */
  now(): number;
}

interface PendingCommit {
  text: string;
  /** Meeting-relative ms when the commit arrived. */
  atMs: number;
}

/** How many expired commit texts are remembered so a late detail for them is dropped, not duplicated. */
const EXPIRED_MEMORY = 8;

export class SegmentBuilder {
  private seq = 0;
  private sessionId = '';
  private audioOriginMs = 0;
  private pending: PendingCommit[] = [];
  private expired: string[] = [];

  constructor(private readonly opts: SegmentBuilderOptions) {}

  /** A new provider session began; its first audio sample was sent at meeting time `audioOriginMs`. */
  startSession(sessionId: string, audioOriginMs: number): void {
    this.sessionId = sessionId;
    this.audioOriginMs = audioOriginMs;
  }

  /** `committed`: remember it until its detail arrives or it expires. Empty text is dropped. */
  committed(text: string, atMs: number): void {
    if (text.trim() === '') return;
    this.pending.push({ text, atMs });
  }

  /** `committed-detail`: the segment to store, or null (empty text, or its commit was already stored). */
  detail(text: string, language: string | null, words: readonly ProviderWord[]): TranscriptSegment | null {
    if (text.trim() === '') return null;
    const i = this.pending.findIndex((p) => p.text === text);
    const commit = i >= 0 ? this.pending.splice(i, 1)[0] : undefined;
    if (!commit) {
      const e = this.expired.indexOf(text);
      if (e >= 0) {
        this.expired.splice(e, 1);
        return null;
      }
    }
    const segmentWords = words
      .filter((w) => w.text.trim() !== '')
      .map<SegmentWord>((w) => ({
        text: w.text,
        startMs: Math.round(this.audioOriginMs + w.startSec * 1000),
        endMs: Math.round(this.audioOriginMs + w.endSec * 1000),
      }));
    const first = segmentWords[0];
    const last = segmentWords[segmentWords.length - 1];
    if (!first || !last) return this.build(text, language, commit?.atMs ?? this.audioOriginMs, [], 'estimated');
    return this.build(text, language, first.startMs, segmentWords, 'words', last.endMs);
  }

  /** Commits older than DETAIL_TIMEOUT_MS at meeting time `nowMs`, stored with estimated times. */
  expire(nowMs: number): TranscriptSegment[] {
    const due = this.pending.filter((p) => nowMs - p.atMs >= DETAIL_TIMEOUT_MS);
    this.pending = this.pending.filter((p) => nowMs - p.atMs < DETAIL_TIMEOUT_MS);
    return due.map((p) => this.estimate(p));
  }

  /** Every pending commit, stored with estimated times (Stop must not lose a finished line). */
  flush(): TranscriptSegment[] {
    const due = this.pending;
    this.pending = [];
    return due.map((p) => this.estimate(p));
  }

  private estimate(p: PendingCommit): TranscriptSegment {
    this.expired.push(p.text);
    if (this.expired.length > EXPIRED_MEMORY) this.expired.shift();
    return this.build(p.text, null, p.atMs, [], 'estimated');
  }

  private build(
    text: string,
    language: string | null,
    startMs: number,
    words: SegmentWord[],
    timing: TranscriptSegment['timing'],
    endMs: number = startMs,
  ): TranscriptSegment {
    const { meetingId } = this.opts;
    const seq = this.seq++;
    const fixed = this.opts.language.kind === 'fixed' ? this.opts.language.code : null;
    return {
      id: segmentId(meetingId, 'mixed', seq),
      meetingId,
      stream: 'mixed',
      seq,
      startMs: Math.max(0, startMs),
      endMs: Math.max(0, startMs, endMs),
      text,
      language: language ?? fixed,
      // One mixed stream cannot tell the user apart: every 001 line is the fallback (FR-010, constitution IV).
      speakerLabel: OTHERS_LABEL,
      labelSource: 'fallback',
      captionName: null,
      captionSelf: false,
      labelOverride: null,
      words,
      timing,
      sessionId: this.sessionId,
      createdAt: this.opts.now(),
      schemaVersion: 2,
    };
  }
}
