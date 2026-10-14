// Cutting one stored line into ordinary lines at its speaker runs (002 FR-027, data-model.md "Split lines", real call
// 2026-10-09). Pure. The first piece keeps the line's id; a piece starting at word k of the original line gets
// `${originalId}.w${k}`, so a split is idempotent and a piece can be split again with ids still derived from the original.
import type { LabelSource, TranscriptSegment } from './model';

export interface PieceFields {
  speakerLabel: string;
  labelSource: LabelSource;
  captionName: string | null;
  captionSelf: boolean;
}

/** Words [from, to) of the line, and the label they get. */
export interface Piece {
  from: number;
  to: number;
  fields: PieceFields;
}

const PIECE = /^(.*)\.w(\d+)$/;

/** The original line's id and the index, in it, of this line's first word. */
function origin(id: string): { base: string; offset: number } {
  const m = PIECE.exec(id);
  return m ? { base: m[1]!, offset: Number(m[2]) } : { base: id, offset: 0 };
}

/** The id of the piece starting at word `k` of the original line `baseId`. */
export function pieceId(baseId: string, k: number): string {
  return k === 0 ? baseId : `${baseId}.w${k}`;
}

/** Where each word starts in the text, or null if any word cannot be found in order. */
function wordStarts(text: string, words: readonly { text: string }[]): number[] | null {
  const starts: number[] = [];
  let cursor = 0;
  for (const w of words) {
    const at = text.indexOf(w.text.trim(), cursor);
    if (at < 0) return null;
    starts.push(at);
    cursor = at + w.text.trim().length;
  }
  return starts;
}

export function splitSegment(segment: TranscriptSegment, pieces: readonly Piece[]): TranscriptSegment[] {
  if (pieces.length <= 1) return [{ ...segment, ...pieces[0]?.fields, labelPending: false }];
  const { base, offset } = origin(segment.id);
  const starts = wordStarts(segment.text, segment.words);
  return pieces.map((p) => {
    const words = segment.words.slice(p.from, p.to);
    const text = starts
      ? segment.text.slice(starts[p.from], p.to < starts.length ? starts[p.to] : undefined).trim()
      : words.map((w) => w.text.trim()).join(' ');
    return {
      ...segment,
      ...p.fields,
      id: pieceId(base, offset + p.from),
      startMs: words[0]!.startMs,
      endMs: words[words.length - 1]!.endMs,
      text,
      words,
      labelOverride: null,
      labelPending: false,
    };
  });
}
