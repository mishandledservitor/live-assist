import type { TranscriptSegment } from './model';

/** FR-013: by startMs, ties by seq. */
export function compareSegments(a: TranscriptSegment, b: TranscriptSegment): number {
  return a.startMs - b.startMs || a.seq - b.seq;
}

export function sortSegments(segments: readonly TranscriptSegment[]): TranscriptSegment[] {
  return [...segments].sort(compareSegments);
}
