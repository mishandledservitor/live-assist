// 016 T004: invented meetings for the merged download's tests (constitution III: no real speech, no real names). A
// seeded generator writes what was "said" as speaker turns of invented sentences, then the two records live-assist
// keeps of it: the realtime transcript's lines (cut where the service cuts, not where speakers change, some labelled
// "Others" or wrongly) and Meet's caption turns (one per speaker turn, with Meet-like differences in the words). It can
// also write passages twice into the transcript, as the realtime transcript sometimes does (016 research R3).
import type { StoredCaptionTurn } from '@/core/captions/model';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';
import { spokenBy, spokenBySelf, storedCaptionTurn, storedMeeting, storedSegment } from './stored-meetings';

/** xorshift32: small, fast and the same everywhere. */
export function random(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x1_0000_0000;
  };
}

const SYLLABLES = ['ka', 'lo', 'mi', 'ner', 'tos', 'va', 'rin', 'del', 'po', 'sha', 'gu', 'fen', 'tri', 'bo', 'zel'];

/** An invented vocabulary: a few short common words, then made-up longer ones, used with a Zipf-like spread. */
function vocabulary(next: () => number, size: number): string[] {
  const common = ['the', 'a', 'and', 'to', 'we', 'it', 'is', 'so', 'that', 'on', 'for', 'in', 'of', 'this', 'with'];
  const words = new Set(common);
  while (words.size < size) {
    const n = 2 + Math.floor(next() * 3);
    words.add(Array.from({ length: n }, () => SYLLABLES[Math.floor(next() * SYLLABLES.length)]).join(''));
  }
  return [...words];
}

export interface SyntheticSpeaker {
  /** As Meet shows it; 'You' for the user. */
  captionName: string;
  self: boolean;
}

export const SYNTHETIC_SPEAKERS: readonly SyntheticSpeaker[] = [
  { captionName: 'Sarah Brown', self: false },
  { captionName: 'Mike Chen', self: false },
  { captionName: 'Priya Nair', self: false },
  { captionName: 'You', self: true },
];

export interface SyntheticOptions {
  seed: number;
  /** About how many words the transcript holds. */
  words: number;
  /** Lines written a second time, 4 to 8 lines after the first, under another speaker's label (research R3). */
  replays?: number;
  /** Share of live lines labelled "Others" instead of their speaker. */
  othersShare?: number;
  meetingId?: string;
}

export interface SyntheticMeeting {
  meeting: Meeting;
  segments: TranscriptSegment[];
  captionTurns: StoredCaptionTurn[];
  /** The display name each transcript word was really said by, in the order of the lines (replayed lines included). */
  truth: string[];
  /** Ids of the lines written as replays. */
  replayIds: string[];
}

const USER_NAME = 'Alex';
const displayName = (s: SyntheticSpeaker) => (s.self ? USER_NAME : s.captionName);
const sentenceEnd = (next: () => number) => (next() < 0.8 ? '.' : next() < 0.5 ? '?' : '!');

export function syntheticMeeting(options: SyntheticOptions): SyntheticMeeting {
  const next = random(options.seed);
  const meetingId = options.meetingId ?? 'm1';
  const vocab = vocabulary(next, 800);
  const zipf = () => vocab[Math.min(vocab.length - 1, Math.floor(vocab.length * next() ** 3))]!;

  // What was said: turns of sentences, each word with its speaker and time.
  interface Said {
    word: string;
    speaker: SyntheticSpeaker;
    ms: number;
    endsSentence: boolean;
  }
  const said: Said[] = [];
  const turns: { speaker: SyntheticSpeaker; from: number; to: number; ms: number }[] = [];
  let ms = 3_000;
  let speaker = SYNTHETIC_SPEAKERS[0]!;
  while (said.length < options.words) {
    const from = said.length;
    const sentences = 1 + Math.floor(next() * 4);
    for (let s = 0; s < sentences; s += 1) {
      const length = 4 + Math.floor(next() * 14);
      for (let w = 0; w < length; w += 1) {
        let word = zipf();
        if (w === 0) word = word[0]!.toUpperCase() + word.slice(1);
        const last = w === length - 1;
        if (!last && next() < 0.08) word += ',';
        said.push({ word: last ? word + sentenceEnd(next) : word, speaker, ms, endsSentence: last });
        ms += 300 + Math.floor(next() * 200);
      }
    }
    turns.push({ speaker, from, to: said.length, ms: said[from]!.ms });
    ms += 600;
    const others = SYNTHETIC_SPEAKERS.filter((x) => x !== speaker);
    speaker = others[Math.floor(next() * others.length)]!;
  }

  // Meet's captions: one turn per speaker turn, the words lower-cased without punctuation now and then, some
  // substituted, dropped or added; shown a second after the words began.
  const captionTurns = turns.map((t, i) => {
    const words: string[] = [];
    for (const { word } of said.slice(t.from, t.to)) {
      const r = next();
      if (r < 0.03) continue;
      if (r < 0.09) words.push(zipf());
      else words.push(next() < 0.3 ? word.toLowerCase().replace(/[.,?!]/g, '') : word);
      if (next() < 0.03) words.push(zipf());
    }
    return storedCaptionTurn(meetingId, i + 1, {
      startMs: t.ms + 1_000,
      speakerName: t.speaker.captionName,
      self: t.speaker.self,
      text: words.join(' ') || 'mm',
    });
  });

  // The realtime transcript: lines of 6 to 30 words cut at a sentence end where one comes near, else anywhere, so a
  // line can hold the end of one speaker's turn and the start of the next. Labelled by the line's first word's speaker,
  // or "Others".
  const segments: TranscriptSegment[] = [];
  const truth: string[] = [];
  const replayIds: string[] = [];
  const lines: { from: number; to: number }[] = [];
  for (let from = 0; from < said.length;) {
    let to = Math.min(said.length, from + 6 + Math.floor(next() * 24));
    for (let k = from + 5; k < to; k += 1)
      if (said[k]!.endsSentence && next() < 0.6) {
        to = k + 1;
        break;
      }
    lines.push({ from, to });
    from = to;
  }
  const replayAt = new Map<number, number>();
  for (let r = 0; r < (options.replays ?? 0); r += 1) {
    const source = 2 + Math.floor(next() * Math.max(1, lines.length - 12));
    replayAt.set(source + 4 + Math.floor(next() * 5), source);
  }
  let seq = 0;
  const push = (
    line: { from: number; to: number },
    startMs: number,
    labelSpeaker: SyntheticSpeaker,
    replay: boolean,
  ) => {
    const words = said.slice(line.from, line.to);
    const others = next() < (options.othersShare ?? 0.15);
    const label = others ? {} : labelSpeaker.self ? spokenBySelf(USER_NAME) : spokenBy(labelSpeaker.captionName);
    const segment = storedSegment(meetingId, seq, {
      startMs,
      endMs: startMs + 400 * words.length,
      text: words.map((w) => w.word).join(' '),
      ...label,
    });
    seq += 1;
    segments.push(segment);
    truth.push(...words.map((w) => displayName(w.speaker)));
    if (replay) replayIds.push(segment.id);
  };
  lines.forEach((line, i) => {
    push(line, said[line.from]!.ms, said[line.from]!.speaker, false);
    const source = replayAt.get(i);
    if (source !== undefined) {
      const wrong = SYNTHETIC_SPEAKERS.find((s) => s !== said[lines[source]!.from]!.speaker)!;
      push(lines[source]!, said[line.to - 1]!.ms + 200, wrong, true);
    }
  });

  return {
    meeting: storedMeeting({ id: meetingId, userName: USER_NAME, hasCaptions: true }),
    segments,
    captionTurns,
    truth,
    replayIds,
  };
}
