// The merged transcript (016, design decisions 93–98; research R2–R4; contracts/merged-file.md): the realtime
// transcript's words, each given the speaker of the Meet caption word it lines up with, regrouped into speaker lines.
// A port of the reference merge the user measured on six real calls (its names list, file moving and second caption
// format left out). Built only for a download after the meeting; the live transcript is never touched (decision 94).
// The caption text decides speakers inside this module and is never written into the file. Platform-free and pure.
import type { StoredCaptionTurn } from '../captions/model';
import { displayLabel } from '../transcript/labels';
import type { Meeting, TranscriptSegment } from '../transcript/model';
import { OTHERS_LABEL } from '../transcript/segment-builder';
import { captionSpeaker } from './captions-file';
import { transcriptDownloadName } from './download-names';
import { matchingBlocks } from './matching-blocks';
import { exportTimestamp, writtenSegments } from './transcript-file';

/** A token that ends a sentence: `.`, `?`, `!` or `…`, maybe followed by a closing quote or bracket, or a dash. */
const SENTENCE_END = /(?:[.?!…]["”')]*|-)$/u;
/** A matched block of one word this short is as likely chance as a match (reference merge). */
const SHORT_MATCH = 4;
/** Words that alone do not carry a speaker across a gap (reference merge, `BACKCHANNEL`). */
const SHORT_REPLIES = new Set(
  'yeah yes yep no mmhmm mhm mm hmm okay ok right exactly sure thank you thanks nice'.split(' '),
);
const ANCHOR = 2;
const PROPORTIONAL = 1;
const HINT = 0.75;
const SAME_BOTH_SIDES = 0.5;
const UNPLACED_WEIGHT = 1;
const HINT_GAP = 12;
const FILL_GAP = 20;

/** Words the alignment cannot place; written as `Others` (decision 98). */
const UNPLACED = Symbol('unplaced');
type Who = string | typeof UNPLACED;

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * How two words are compared, never how they are written: lower case, accents dropped, only letters and digits of any
 * script kept (research R2 step 2). '' for a token with neither, which takes no part in the alignment.
 */
export function normaliseWord(token: string): string {
  return token
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export interface MergedLine {
  /** The start of the transcript line its first word is in (spec A6). */
  startMs: number;
  /** A display name, or `Others`. */
  speaker: string;
  /** The transcript's words, unchanged, joined by single spaces. */
  text: string;
}

export interface MergedTranscript {
  lines: MergedLine[];
  /** Written lines left out as repeated passages (FR-012), in time order. */
  removedSegmentIds: string[];
}

/** One written transcript line, as the merge sees it. */
interface Line {
  segment: TranscriptSegment;
  tokens: string[];
  norms: string[];
  /** A single-line correction: every word of the line is under it (spec A1). */
  correction: string | null;
  /** The live line's own name, when the captions use it (research R4). */
  hint: string | null;
}

/** Words as small integers, so the alignment compares numbers. */
class Words {
  private readonly ids = new Map<string, number>();
  id(word: string): number {
    let id = this.ids.get(word);
    if (id === undefined) {
      id = this.ids.size;
      this.ids.set(word, id);
    }
    return id;
  }
}

/** The caption words in the captions file's order, each with its turn's display name. */
function captionWords(
  meeting: Pick<Meeting, 'userName' | 'speakerRenames'>,
  turns: readonly StoredCaptionTurn[],
): { norms: string[]; names: string[] } {
  const norms: string[] = [];
  const names: string[] = [];
  const ordered = turns.filter((t) => oneLine(t.text) !== '').sort((a, b) => a.startMs - b.startMs || a.seq - b.seq);
  for (const turn of ordered) {
    const name = oneLine(captionSpeaker(turn, meeting));
    for (const token of oneLine(turn.text).split(' ')) {
      const norm = normaliseWord(token);
      if (norm === '') continue;
      norms.push(norm);
      names.push(name);
    }
  }
  return { norms, names };
}

function transcriptLines(
  meeting: Pick<Meeting, 'speakerRenames'>,
  segments: readonly TranscriptSegment[],
  captionNames: ReadonlySet<string>,
): Line[] {
  return writtenSegments(segments).map((segment) => {
    const tokens = oneLine(segment.text).split(' ');
    const correction = segment.labelOverride ? oneLine(segment.labelOverride) : null;
    const label = displayLabel(segment, meeting);
    const named = correction === null && label.source === 'caption' ? oneLine(label.text) : null;
    return {
      segment,
      tokens,
      norms: tokens.map(normaliseWord),
      correction,
      hint: named !== null && captionNames.has(named) ? named : null,
    };
  });
}

/** A speaker and how much it counts, for each normalised transcript word (research R2 steps 3 and 4). */
interface Placed {
  who: Who;
  weight: number;
}

/** The transcript words that take part, in order, with where each one is. */
interface Aligned {
  norms: string[];
  ids: Int32Array;
  hints: (string | null)[];
}

function alignable(lines: readonly Line[], words: Words): Aligned {
  const norms: string[] = [];
  const hints: (string | null)[] = [];
  for (const line of lines)
    for (const norm of line.norms)
      if (norm !== '') {
        norms.push(norm);
        hints.push(line.hint);
      }
  return { norms, ids: Int32Array.from(norms, (n) => words.id(n)), hints };
}

/** Pairs of matched positions `[transcript word, caption word]`, from the matching blocks (research R2 step 3). */
function anchorsOf(rec: Aligned, capIds: Int32Array): [number, number][] {
  const anchors: [number, number][] = [];
  for (const [a, b, size] of matchingBlocks(rec.ids, capIds)) {
    if (size === 1 && [...rec.norms[a]!].length < SHORT_MATCH) continue;
    for (let k = 0; k < size; k += 1) anchors.push([a + k, b + k]);
  }
  return anchors;
}

function place(rec: Aligned, captions: { names: string[] }, anchors: readonly [number, number][]): Placed[] {
  const n = rec.norms.length;
  const m = captions.names.length;
  const out: Placed[] = new Array<Placed>(n);
  const bounded: [number, number][] = [[-1, -1], ...anchors, [n, m]];
  for (let p = 0; p + 1 < bounded.length; p += 1) {
    const [r0, c0] = bounded[p]!;
    const [r1, c1] = bounded[p + 1]!;
    if (r1 >= 0 && r1 < n) out[r1] = { who: captions.names[c1]!, weight: ANCHOR };
    const g = r1 - r0 - 1;
    const h = c1 - c0 - 1;
    if (g <= 0) continue;
    const left = c0 >= 0 ? captions.names[c0]! : null;
    const right = c1 < m ? captions.names[c1]! : null;
    const onlyReplies = rec.norms.slice(r0 + 1, r1).every((w) => SHORT_REPLIES.has(w));
    for (let k = 0; k < g; k += 1) {
      const r = r0 + 1 + k;
      const hint = rec.hints[r] ?? null;
      if (h > 0 && g <= 3 * h + 8)
        out[r] = { who: captions.names[c0 + 1 + Math.floor((k * h) / g)]!, weight: PROPORTIONAL };
      else if (g <= HINT_GAP && hint !== null) out[r] = { who: hint, weight: HINT };
      else if (left !== null && left === right && g <= FILL_GAP && !onlyReplies)
        out[r] = { who: left, weight: SAME_BOTH_SIDES };
      else out[r] = { who: UNPLACED, weight: UNPLACED_WEIGHT };
    }
  }
  return out;
}

/** The speaker with the most weight; on a tie a name beats `Others`, then the first one met (reference merge). */
function majority(placed: readonly Placed[]): Who | null {
  const tally = new Map<Who, number>();
  for (const { who, weight } of placed) tally.set(who, (tally.get(who) ?? 0) + weight);
  let best: Who | null = null;
  let bestWeight = -1;
  for (const [who, weight] of tally)
    if (weight > bestWeight || (weight === bestWeight && best === UNPLACED && who !== UNPLACED)) {
      best = who;
      bestWeight = weight;
    }
  return best;
}

interface Piece {
  line: number;
  who: Who | null;
  tokens: string[];
}

/** Sentences of each line with their speakers, then speaker lines (research R2 steps 5–7). */
function speakerLines(lines: readonly Line[], placed: readonly Placed[]): MergedLine[] {
  const pieces: Piece[] = [];
  let r = 0;
  lines.forEach((line, index) => {
    let tokens: string[] = [];
    let words: Placed[] = [];
    line.tokens.forEach((token, t) => {
      tokens.push(token);
      if (line.norms[t] !== '') words.push(placed[r++]!);
      if (t === line.tokens.length - 1 || SENTENCE_END.test(token)) {
        pieces.push({ line: index, who: line.correction ?? majority(words), tokens });
        tokens = [];
        words = [];
      }
    });
  });
  // A sentence of punctuation only takes the speaker before it, else after it, else `Others`.
  pieces.forEach((piece, k) => {
    if (piece.who !== null) return;
    piece.who = pieces[k - 1]?.who ?? pieces[k + 1]?.who ?? UNPLACED;
  });

  const out: (MergedLine & { line: number; last: string })[] = [];
  for (const piece of pieces) {
    const speaker = piece.who === UNPLACED || piece.who === null ? OTHERS_LABEL : piece.who;
    const previous = out.at(-1);
    if (
      previous &&
      previous.speaker === speaker &&
      (previous.line === piece.line || !SENTENCE_END.test(previous.last))
    ) {
      previous.text = `${previous.text} ${piece.tokens.join(' ')}`;
      previous.line = piece.line;
    } else
      out.push({
        startMs: lines[piece.line]!.segment.startMs,
        speaker,
        text: piece.tokens.join(' '),
        line: piece.line,
        last: '',
      });
    out.at(-1)!.last = piece.tokens.at(-1)!;
  }
  return out.map(({ startMs, speaker, text }) => ({ startMs, speaker, text }));
}

/**
 * The merged transcript of a meeting: its written lines (007's), their words unchanged and in order, regrouped into
 * lines named from the kept caption turns, with the meeting's names as the transcript shows them now.
 */
export function mergedTranscript(
  meeting: Pick<Meeting, 'userName' | 'speakerRenames'>,
  segments: readonly TranscriptSegment[],
  captionTurns: readonly StoredCaptionTurn[],
): MergedTranscript {
  const words = new Words();
  const captions = captionWords(meeting, captionTurns);
  const capIds = Int32Array.from(captions.norms, (n) => words.id(n));
  const lines = transcriptLines(meeting, segments, new Set(captions.names));
  const rec = alignable(lines, words);
  const placed = place(rec, captions, anchorsOf(rec, capIds));
  return { lines: speakerLines(lines, placed), removedSegmentIds: [] };
}

/** The merged file: decision 70's transcript name; `[mm:ss] Speaker: text` lines one blank line apart; '' if none. */
export function mergedTranscriptFile(
  meeting: Pick<Meeting, 'startedAt' | 'userName' | 'speakerRenames'>,
  segments: readonly TranscriptSegment[],
  captionTurns: readonly StoredCaptionTurn[],
): { name: string; body: string } {
  const { lines } = mergedTranscript(meeting, segments, captionTurns);
  const body = lines.map((l) => `[${exportTimestamp(l.startMs)}] ${l.speaker}: ${l.text}`).join('\n\n');
  return { name: transcriptDownloadName(meeting.startedAt), body: lines.length === 0 ? '' : `${body}\n` };
}
