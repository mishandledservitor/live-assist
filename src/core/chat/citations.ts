// Citations in an answer (003 research R7, data-model "Citation"). Derived at render time from the current segments,
// so a citation to a line that arrives later still resolves; only an exact match with a shown time becomes a link,
// and not when its sentence quotes something the cited lines do not say (quotation guard, real call 2026-10-09).
import { formatOffset, type TranscriptSegment } from '../transcript/model';
import { sortSegments } from '../transcript/ordering';
import { normaliseNotesLabels, notesPassages, separateNotesPassages } from './notes-passages';

export type AnswerPart =
  | { kind: 'text'; text: string }
  /** `label` is the time as written, e.g. '12:40' or '75:12'. */
  | { kind: 'citation'; label: string; segmentId: string }
  /** A well-formed time that matches no line: shown as written, never a link (FR-005). */
  | { kind: 'unmatched'; text: string };

const CITATION = /\[(\d{1,3}):([0-5]\d)(?::([0-5]\d))?\]/g;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** The transcript's own format for a written time; `75:12` reads as 1:15:12. */
function normalise(first: string, second: string, third: string | undefined): string {
  if (third !== undefined) {
    const hours = Number(first);
    return hours > 0 ? `${hours}:${second}:${third}` : `${second}:${third}`;
  }
  const minutes = Number(first);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${pad2(minutes % 60)}:${second}` : `${pad2(minutes)}:${second}`;
}

/** Case, punctuation and spacing do not count when a quotation is compared with a line. */
const fold = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const QUOTATION = /"([^"\n]+)"|“([^”\n]+)”|«([^»\n]+)»/g;
const ELLIPSIS = /…|\.{3}/;
/** Sentence-ending punctuation (and a closing quote after it) right before a citation belongs to the cited sentence. */
const TRAILING_END = /[.!?;]+(["”»]?)\s*$/u;
const SENTENCE_BREAK = /[.!?;]["”»]?\s+|\n/g;

/**
 * The sentence a citation group closes (from `from` to `to`) supports it unless it quotes something and none of its
 * quotations is in the cited lines. No well-formed quotation, nothing to check: the guard fails open (R7).
 */
function quotationSupported(answer: string, from: number, to: number, lines: readonly string[]): boolean {
  const head = answer.slice(from, to).replace(/\s+$/u, '').replace(TRAILING_END, '$1');
  let start = 0;
  for (const m of head.matchAll(SENTENCE_BREAK)) start = m.index + m[0].length;
  const quotations = [...head.slice(start).matchAll(QUOTATION)]
    .map((m) => (m[1] ?? m[2] ?? m[3] ?? '').split(ELLIPSIS).map(fold).filter(Boolean))
    .filter((fragments) => fragments.length > 0);
  if (quotations.length === 0) return true;
  const cited = fold(lines.join(' '));
  return quotations.some((fragments) => fragments.every((f) => cited.includes(f)));
}

export function parseAnswer(written: string, segments: readonly TranscriptSegment[]): AnswerPart[] {
  // 008 (real call 2026-10-10): a notes passage is its own paragraph, and a citation inside it is dropped. A
  // half-translated Greek label is written in Greek first (eval 2026-10-12), so it is a passage like any other.
  const answer = separateNotesPassages(normaliseNotesLabels(written));
  const passages = notesPassages(answer);
  const inNotes = (index: number) => passages.some(([from, to]) => index >= from && index < to);
  const byTime = new Map<string, string>();
  const textsAt = new Map<string, string[]>();
  for (const s of sortSegments(segments)) {
    const time = formatOffset(s.startMs);
    if (!byTime.has(time)) byTime.set(time, s.id);
    textsAt.set(time, [...(textsAt.get(time) ?? []), s.text]);
  }

  // Citations separated only by spaces form one group, e.g. `[03:45] [04:02]`; a group is checked as one.
  interface Found {
    written: string;
    index: number;
    time: string;
  }
  const groups: Found[][] = [];
  for (const match of answer.matchAll(CITATION)) {
    const [written, first, second, third] = match;
    const found = { written, index: match.index, time: normalise(first!, second!, third) };
    const group = groups.at(-1);
    const last = group?.at(-1);
    if (group && last && /^\s*$/.test(answer.slice(last.index + last.written.length, match.index))) group.push(found);
    else groups.push([found]);
  }

  const parts: AnswerPart[] = [];
  const pushText = (text: string) => {
    if (text === '') return;
    const last = parts.at(-1);
    if (last?.kind === 'text') last.text += text;
    else parts.push({ kind: 'text', text });
  };

  let at = 0;
  for (const group of groups) {
    if (inNotes(group[0]!.index)) {
      pushText(answer.slice(at, group[0]!.index).replace(/[ \t]+$/u, ''));
      const last = group.at(-1)!;
      at = last.index + last.written.length;
      continue;
    }
    const lines = group.flatMap((c) => textsAt.get(c.time) ?? []);
    const supported = lines.length === 0 || quotationSupported(answer, at, group[0]!.index, lines);
    for (const c of group) {
      pushText(answer.slice(at, c.index));
      at = c.index + c.written.length;
      const segmentId = supported ? byTime.get(c.time) : undefined;
      if (segmentId) parts.push({ kind: 'citation', label: c.written.slice(1, -1), segmentId });
      else parts.push({ kind: 'unmatched', text: c.written });
    }
  }
  pushText(answer.slice(at));
  return parts;
}
