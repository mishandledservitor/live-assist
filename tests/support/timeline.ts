// Alignment timeline fixtures (tests/fixtures/meet/timelines/*.json): caption turns and mixed-stream segments on one
// meeting clock, with the label each segment should get. Names and timing only — a caption turn never has text.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '../fixtures/meet/timelines');

export interface TimelineCaption {
  turnKey: string;
  speakerName: string;
  /** The page's self hint ("You"); null = cannot tell. */
  self: boolean | null;
  /** Meeting ms of each activity event for this turn, ascending. */
  observedAtMs: number[];
}

export interface TimelineSegment {
  id: string;
  startMs: number;
  endMs: number;
  timing: 'words' | 'estimated';
  words: { text: string; startMs: number; endMs: number }[];
}

export interface Timeline {
  userName: string;
  /** True when turns do not overlap: counts towards SC-001's ≥ 90 % correct. */
  clearTurns: boolean;
  captions: TimelineCaption[];
  segments: TimelineSegment[];
  /**
   * Segment id → a caption name, `$user` (the user's settings name) or `Others`; or, for a line expected to split
   * (real call 2026-10-09), its pieces in order with their word counts.
   */
  expected: Record<string, string | ExpectedPiece[]>;
  /** Optional: segment id → who spoke each word (a caption name, `$user`, or `?` when unknown). */
  spokenBy?: Record<string, string[]>;
}

export interface ExpectedPiece {
  label: string;
  words: number;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function fail(where: string, what: string): never {
  throw new Error(`Invalid timeline: ${where}: ${what}`);
}

function onlyKeys(v: Rec, keys: readonly string[], where: string): void {
  for (const k of Object.keys(v)) if (!keys.includes(k)) fail(where, `unexpected field "${k}"`);
}

function parseCaption(v: unknown, i: number): TimelineCaption {
  const where = `captions[${i}]`;
  if (!isRec(v)) fail(where, 'not an object');
  onlyKeys(v, ['turnKey', 'speakerName', 'self', 'observedAtMs'], where);
  if (!isText(v.turnKey)) fail(where, 'turnKey');
  if (!isText(v.speakerName)) fail(where, 'speakerName');
  if (!(v.self === null || typeof v.self === 'boolean')) fail(where, 'self must be true, false or null');
  const seen = v.observedAtMs;
  if (!Array.isArray(seen) || seen.length === 0 || !seen.every(isNum)) fail(where, 'observedAtMs');
  if (seen.some((t, j) => j > 0 && t < (seen[j - 1] as number))) fail(where, 'observedAtMs out of order');
  return { turnKey: v.turnKey, speakerName: v.speakerName, self: v.self, observedAtMs: seen };
}

function parseSegment(v: unknown, i: number): TimelineSegment {
  const where = `segments[${i}]`;
  if (!isRec(v)) fail(where, 'not an object');
  onlyKeys(v, ['id', 'startMs', 'endMs', 'timing', 'words'], where);
  if (!isText(v.id)) fail(where, 'id');
  if (!isNum(v.startMs) || !isNum(v.endMs) || v.endMs < v.startMs) fail(where, 'startMs/endMs');
  if (v.timing !== 'words' && v.timing !== 'estimated') fail(where, 'timing');
  const words = v.words;
  if (!Array.isArray(words)) fail(where, 'words');
  for (const w of words)
    if (!isRec(w) || typeof w.text !== 'string' || !isNum(w.startMs) || !isNum(w.endMs)) fail(where, 'words');
  return {
    id: v.id,
    startMs: v.startMs,
    endMs: v.endMs,
    timing: v.timing,
    words: (words as Rec[]).map((w) => ({
      text: w.text as string,
      startMs: w.startMs as number,
      endMs: w.endMs as number,
    })),
  };
}

export function parseTimeline(v: unknown): Timeline {
  if (!isRec(v)) fail('root', 'not an object');
  onlyKeys(v, ['userName', 'clearTurns', 'captions', 'segments', 'expected', 'spokenBy'], 'root');
  if (!isText(v.userName)) fail('root', 'userName');
  if (typeof v.clearTurns !== 'boolean') fail('root', 'clearTurns');
  if (!Array.isArray(v.captions)) fail('root', 'captions');
  if (!Array.isArray(v.segments)) fail('root', 'segments');
  if (!isRec(v.expected)) fail('root', 'expected');
  const captions = v.captions.map(parseCaption);
  const segments = v.segments.map(parseSegment);
  const ids = new Set(segments.map((s) => s.id));
  const wordCount = new Map(segments.map((s) => [s.id, s.words.length]));
  const expected: Record<string, string | ExpectedPiece[]> = {};
  for (const [id, label] of Object.entries(v.expected)) {
    if (!ids.has(id)) fail('expected', `unknown segment "${id}"`);
    if (Array.isArray(label)) {
      const pieces = label.map((p: unknown) => {
        if (!isRec(p) || !isText(p.label) || !isNum(p.words) || p.words < 1) fail('expected', `pieces for "${id}"`);
        return { label: p.label, words: p.words };
      });
      if (pieces.reduce((n, p) => n + p.words, 0) !== wordCount.get(id))
        fail('expected', `pieces for "${id}" must cover its words`);
      expected[id] = pieces;
    } else {
      if (!isText(label)) fail('expected', `label for "${id}"`);
      expected[id] = label;
    }
  }
  for (const id of ids) if (!(id in expected)) fail('expected', `no label for segment "${id}"`);
  const spokenBy: Record<string, string[]> = {};
  if (v.spokenBy !== undefined) {
    if (!isRec(v.spokenBy)) fail('spokenBy', 'not an object');
    for (const [id, who] of Object.entries(v.spokenBy)) {
      if (!ids.has(id)) fail('spokenBy', `unknown segment "${id}"`);
      if (!Array.isArray(who) || !who.every(isText) || who.length !== wordCount.get(id))
        fail('spokenBy', `"${id}" needs one speaker per word`);
      spokenBy[id] = who;
    }
  }
  const base = { userName: v.userName, clearTurns: v.clearTurns, captions, segments, expected };
  return v.spokenBy === undefined ? base : { ...base, spokenBy };
}

/** Reads `tests/fixtures/meet/timelines/<name>.json`. */
export function loadTimeline(name: string): Timeline {
  let raw: string;
  try {
    raw = readFileSync(join(DIR, `${name}.json`), 'utf8');
  } catch {
    throw new Error(`No timeline fixture named "${name}" in tests/fixtures/meet/timelines/`);
  }
  return parseTimeline(JSON.parse(raw));
}

const resolve = (t: Timeline, label: string) => (label === '$user' ? t.userName : label);

/** The label a segment should end up with (the first piece's for a split line), `$user` resolved. */
export function expectedLabel(t: Timeline, segmentId: string): string {
  const label = t.expected[segmentId];
  if (label === undefined) throw new Error(`No expected label for "${segmentId}"`);
  return resolve(t, typeof label === 'string' ? label : label[0]!.label);
}

/** The pieces a line should end up as, `$user` resolved; an unsplit line is one piece of all its words. */
export function expectedPieces(t: Timeline, segmentId: string): ExpectedPiece[] {
  const label = t.expected[segmentId];
  if (label === undefined) throw new Error(`No expected label for "${segmentId}"`);
  if (typeof label !== 'string') return label.map((p) => ({ label: resolve(t, p.label), words: p.words }));
  const words = t.segments.find((s) => s.id === segmentId)?.words.length ?? 0;
  return [{ label: resolve(t, label), words }];
}

/** Who spoke each word: `spokenBy` if given, else the expected labels with "Others" as unknown (`?`). */
export function truthOf(t: Timeline, segmentId: string): string[] {
  const given = t.spokenBy?.[segmentId];
  if (given) return given.map((who) => (who === '?' ? '?' : resolve(t, who)));
  return expectedPieces(t, segmentId).flatMap((p) => Array<string>(p.words).fill(p.label === 'Others' ? '?' : p.label));
}
