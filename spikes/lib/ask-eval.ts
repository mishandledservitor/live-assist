// Scoring for `pnpm eval:ask` (003 research R12): how grounded live answers are, measured on a tagged evaluation set.
// Pure; the runner in spikes/ask-eval.ts does the network part.
import { parseAnswer } from '../../src/core/chat/citations';
import { buildContext, buildRequest } from '../../src/core/chat/context';
import { buildNotes, type MeetingContextRecord } from '../../src/core/chat/notes';
import { notesPassages, separateNotesPassages } from '../../src/core/chat/notes-passages';
import type { ChatRequest } from '../../src/core/chat/provider';
import { turnId, type ChatTurn } from '../../src/core/chat/turn';
import { DEFAULT_CHAT_PROVIDER, defaultModel, isModelOf, type ChatProviderId } from '../../src/core/chat/models';
import { formatOffset, type Meeting, type TranscriptSegment } from '../../src/core/transcript/model';

export type EvalTag =
  | 'supported'
  | 'absent'
  | 'partial'
  | 'background'
  | 'others-attribution'
  | 'conversation'
  // 008 (research N8): the fact is only in the notes / asked whether it was said / notes name an "Others" speaker.
  | 'notes-only'
  | 'notes-vs-said'
  | 'notes-others'
  // Real call 2026-10-10: "which agenda items haven't we covered?": covered items cited, the rest a notes passage.
  | 'notes-coverage';

export interface EvalQuestion {
  id: string;
  lang: 'en' | 'el';
  tag: EvalTag;
  question: string;
  /** Line times an answer may cite, as the transcript shows them. */
  supports?: string[];
  /** others-attribution: the "Others" lines the question is about. */
  othersTimes?: string[];
  /** Questions and answers asked before this one in the same chat, replayed as the app replays them. */
  earlier?: { question: string; answer: string }[];
  /** 008 notes-only / notes-vs-said: text that appears only in the notes; a sentence holding it must cite nothing. */
  notesFact?: string;
  /** Several such texts (notes-coverage: the agenda items not covered). */
  notesFacts?: string[];
  /** Text only in the notes that an answer need not give (people the notes name); a sentence holding it is held to the same rule. */
  notesAlso?: string[];
  /** absent / notes-vs-said: lines that may be cited for what was said around the missing fact (a partial answer). */
  related?: string[];
  /** conversation: the word the answer must give (from the chat itself). */
  expect?: string;
}

export interface EvalSet {
  name: string;
  meeting: Meeting;
  segments: TranscriptSegment[];
  /** Everyone named in the meeting: none may be given to an "Others" line. */
  names: string[];
  questions: EvalQuestion[];
  /** 008: the person's notes for this meeting, sent as the app sends them. */
  notes?: { name: string; text: string };
}

export interface AnswerScore {
  id: string;
  tag: EvalTag;
  lang: 'en' | 'el';
  citations: number;
  /** Citations to a tagged time. */
  preciseCitations: number;
  /** absent only: said "not in the transcript" and cited nothing. */
  absentOk: boolean | null;
  /** absent only: cited a line anyway. */
  invented: boolean;
  languageOk: boolean;
  /** others-attribution only: no sentence citing an "Others" line names a person. */
  othersOk: boolean | null;
  /** background only: a cited tagged time and an uncited background part (FR-007). */
  backgroundOk: boolean | null;
  /** conversation only: no citation at all (a fact from the chat itself is not in the transcript), and the expected word. */
  conversationOk: boolean | null;
  /** 008 notes-only / notes-vs-said / notes-coverage: marked as from the notes (label or sentence), uncited, never presented as said. */
  notesOk?: boolean | null;
}

export interface EvalSummary {
  questions: number;
  citationPrecision: number;
  absentDetected: number;
  inventedAbsent: number;
  languageMatch: number;
  othersFailures: number;
  backgroundFailures: number;
  conversationCited: number;
  notesFailures: number;
}

export function loadEvalSet(
  raw: unknown,
  readMeeting: (name: string) => { meeting: Meeting; segments: TranscriptSegment[] },
): EvalSet {
  const r = raw as { meeting: string; names?: string[]; questions: EvalQuestion[]; notes?: EvalSet['notes'] };
  const { meeting, segments } = readMeeting(r.meeting);
  const set: EvalSet = { name: r.meeting, meeting, segments, names: r.names ?? [], questions: r.questions };
  return r.notes ? { ...set, notes: r.notes } : set;
}

/** The times an answer cites, in the transcript's own format (`[75:12]` reads as 1:15:12), matched or not. */
function cited(answer: string, segments: readonly TranscriptSegment[]): { matched: string[]; all: number } {
  const byId = new Map(segments.map((s) => [s.id, s]));
  const matched: string[] = [];
  let all = 0;
  for (const part of parseAnswer(answer, segments)) {
    if (part.kind === 'citation') {
      all += 1;
      const segment = byId.get(part.segmentId);
      if (segment) matched.push(formatOffset(segment.startMs));
    } else if (part.kind === 'unmatched') all += 1;
  }
  return { matched, all };
}

const NOT_IN_TRANSCRIPT = [
  /\b(?:isn't|is not|wasn't|was not|not)\b[^.]*\btranscript\b/i,
  /\btranscript\b[^.]*\b(?:doesn't|does not|didn't|did not)\b/i,
  /δεν[^.;]*(?:μεταγραφ|απομαγνητοφ|καταγραφ|κείμενο)/i,
];

/** The localised "not in the transcript" sentence family (research R7 rule 6). */
export function saysNotInTranscript(answer: string): boolean {
  return NOT_IN_TRANSCRIPT.some((re) => re.test(answer));
}

const NOT_SAID = [
  /\b(?:no|not|never|nobody|no one|none)\b[^.]*\b(?:mention|said|say|give|given|gave|specif|state|discuss|cover|raise)/i,
  /n['’]t\b[^.]*\b(?:mention|said|say|give|given|gave|specif|state|discuss|cover|raise)/i,
  /δεν[^.;]*(?:αναφέρ|ανέφερ|αναφορ|είπ|ειπώθηκε|συζητ|δόθηκε|έδωσ|δίνε|καλύφθηκε|καλύψ|διευκρινίσ)/i,
];

/** A partial answer's way of saying the asked fact was not given: "no amount was mentioned", "δεν αναφέρθηκε". */
export function deniesItWasSaid(answer: string): boolean {
  return NOT_SAID.some((re) => re.test(answer));
}

/** By script, ignoring citations and quoted text (quotes keep their original language, rule 8). */
export function answerLanguage(answer: string): 'en' | 'el' {
  const own = answer.replace(/\[[^\]]*\]/g, ' ').replace(/"[^"]*"|“[^”]*”|«[^»]*»/g, ' ');
  const greek = (own.match(/[Ͱ-Ͽἀ-῿]/g) ?? []).length;
  const latin = (own.match(/[A-Za-z]/g) ?? []).length;
  return greek > 0 && greek >= latin ? 'el' : 'en';
}

const BACKGROUND = /(?:^|\n|[.!?]\s+)(?:Background|Υπόβαθρο|Ιστορικό|Πλαίσιο|Επεξήγηση)\s*:([^\n]*)/iu;
const ANY_CITATION = /\[\d{1,3}:[0-5]\d(?::[0-5]\d)?\]/;

/** A "Background:" part (rule 7; the label may be translated) whose text, to the end of its line, cites nothing. */
export function hasUncitedBackground(answer: string): boolean {
  const m = BACKGROUND.exec(answer);
  return m !== null && !ANY_CITATION.test(m[1] ?? '');
}

const FROM_NOTES =
  /(?:^|\n|[.!?]\s+)(?:From your notes|Από τις σημειώσεις σας|Από τις σημειώσεις σου|Στις σημειώσεις σας|Στις σημειώσεις σου)\s*:([^\n]*)/iu;

/** 008: a "From your notes:" passage (the label may be translated) whose text, to the end of its line, cites nothing. */
export function hasUncitedNotesPassage(answer: string): boolean {
  const m = FROM_NOTES.exec(answer);
  return m !== null && !ANY_CITATION.test(m[1] ?? '');
}

// Design decision 77: a sentence that itself names the user's notes as the source of what it states is marked, like
// one inside a labelled passage. English and Greek, as for the label. "Your notes" must be the subject of a verb of
// stating or follow a source preposition; "the agenda mentions…" and "…matches your notes" are not attribution.
const EN_NOTES = String.raw`\byour\s+(?:own\s+|meeting\s+|attached\s+)?notes\b`;
const EN_STATES =
  'give|say|list|mention|state|show|have|include|put|set|record|contain|indicate|specify|name|describe|call|add|read|mark|refer';
const EL_NOTES = String.raw`σημειώσ(?:εις|εων|εών)\s+(?:σου|σας)(?!\p{L})`;
const EL_STATES =
  'γράφουν|αναφέρουν|δίνουν|λένε|περιλαμβάνουν|έχουν|δείχνουν|ορίζουν|καταγράφουν|σημειώνουν|προβλέπουν|απαριθμούν|βάζουν|αναγράφουν';
const NOTES_AS_SOURCE = [
  new RegExp(String.raw`${EN_NOTES}(?:\s+(?:also|only|just|still))?\s+(?:${EN_STATES})\b`, 'iu'),
  new RegExp(String.raw`\b(?:in|from|according\s+to|per|based\s+on)\s+${EN_NOTES}`, 'iu'),
  new RegExp(String.raw`(?<!\p{L})οι\s+${EL_NOTES}(?:\s+(?:επίσης|μόνο|ακόμα|και))?\s+(?:${EL_STATES})(?!\p{L})`, 'iu'),
  new RegExp(
    String.raw`(?<!\p{L})(?:στις|από\s+τις|σύμφωνα\s+με\s+τις|με\s+βάση\s+τις|βάσει\s+των)\s+${EL_NOTES}`,
    'iu',
  ),
];

/** The sentence names the user's notes as the source of what it states (design decision 77). */
export function namesNotesAsSource(sentence: string): boolean {
  return NOTES_AS_SOURCE.some((re) => re.test(sentence));
}

const CITATION_SOURCE = String.raw`\[\d{1,3}:[0-5]\d(?::[0-5]\d)?\]`;
/** A sentence within a line, with a citation group written after its end punctuation: "…come up. [00:12] [02:00]". */
const SENTENCE = new RegExp(String.raw`[^\n]+?(?:[.!?;]["”»]?(?:[ \t]*${CITATION_SOURCE})*(?=[ \t]|$)|$)`, 'gmu');
const ALL_CITATIONS = new RegExp(CITATION_SOURCE, 'g');

/**
 * Notes-only content is kept apart from what was said: every sentence holding one of `facts` cites nothing and is
 * either inside a labelled notes passage or names the notes as its source (decision 77). `given` is whether any
 * sentence holds one of `required`. Read on the model's raw answer: a half-translated label is not a label here.
 */
function notesStatements(
  answer: string,
  facts: readonly string[],
  required: readonly string[],
): { keptApart: boolean; given: boolean } {
  const laid = separateNotesPassages(answer);
  const passages = notesPassages(laid);
  const holds = (text: string, list: readonly string[]) => list.some((f) => text.includes(f.toLowerCase()));
  let keptApart = true;
  let given = false;
  for (const m of laid.matchAll(SENTENCE)) {
    const sentence = m[0];
    // A cited time such as [00:40] is not the fact "40".
    const words = sentence.replace(ALL_CITATIONS, ' ').toLowerCase();
    if (!holds(words, facts)) continue;
    if (holds(words, required)) given = true;
    const start = m.index + (sentence.length - sentence.trimStart().length);
    const marked = passages.some(([from, to]) => start >= from && start < to) || namesNotesAsSource(sentence);
    if (!marked || ANY_CITATION.test(sentence)) keptApart = false;
  }
  return { keptApart, given };
}

const factsOf = (q: EvalQuestion): string[] => [...(q.notesFact ? [q.notesFact] : []), ...(q.notesFacts ?? [])];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function namesOthers(answer: string, question: EvalQuestion, segments: readonly TranscriptSegment[], names: string[]) {
  const others = new Set(question.othersTimes ?? []);
  const sentences = answer.split(/(?<=[.!?;])\s+|\n+/);
  return sentences.some((sentence) => {
    if (!cited(sentence, segments).matched.some((t) => others.has(t))) return false;
    return names.some((name) => new RegExp(`(^|[^\\p{L}])${escape(name)}([^\\p{L}]|$)`, 'u').test(sentence));
  });
}

export function scoreAnswer(
  question: EvalQuestion,
  answer: string,
  segments: readonly TranscriptSegment[],
  names: string[],
): AnswerScore {
  const { matched, all } = cited(answer, segments);
  const supports = new Set(question.supports ?? []);
  const absent = question.tag === 'absent';
  const related = new Set(question.related ?? []);
  // Citations outside the related lines, counted on the raw answer so none is hidden by a guard.
  const unrelated = all - matched.filter((t) => related.has(t)).length;
  const denies = saysNotInTranscript(answer) || deniesItWasSaid(answer);
  const required = factsOf(question);
  const notes = notesStatements(answer, [...required, ...(question.notesAlso ?? [])], required);
  return {
    id: question.id,
    tag: question.tag,
    lang: question.lang,
    citations: all,
    preciseCitations: matched.filter((t) => supports.has(t)).length,
    absentOk: absent ? unrelated === 0 && denies : null,
    invented: absent && unrelated > 0,
    languageOk: answerLanguage(answer) === question.lang,
    othersOk:
      question.tag === 'others-attribution' || question.tag === 'notes-others'
        ? !namesOthers(answer, question, segments, names)
        : null,
    backgroundOk:
      question.tag === 'background' ? matched.some((t) => supports.has(t)) && hasUncitedBackground(answer) : null,
    conversationOk:
      question.tag === 'conversation'
        ? all === 0 && (!question.expect || answer.toLowerCase().includes(question.expect.toLowerCase()))
        : null,
    notesOk:
      question.tag === 'notes-only' || question.tag === 'notes-coverage'
        ? notes.given && notes.keptApart
        : question.tag === 'notes-vs-said'
          ? denies && unrelated === 0 && notes.keptApart
          : null,
  };
}

const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d);

export function summarize(rows: readonly AnswerScore[]): EvalSummary {
  const citing = rows.filter((r) => r.tag !== 'absent' && r.tag !== 'notes-only' && r.tag !== 'notes-vs-said');
  const absent = rows.filter((r) => r.tag === 'absent');
  return {
    questions: rows.length,
    citationPrecision: ratio(
      citing.reduce((n, r) => n + r.preciseCitations, 0),
      citing.reduce((n, r) => n + r.citations, 0),
    ),
    absentDetected: ratio(absent.filter((r) => r.absentOk).length, absent.length),
    inventedAbsent: absent.filter((r) => r.invented).length,
    languageMatch: ratio(rows.filter((r) => r.languageOk).length, rows.length),
    othersFailures: rows.filter((r) => r.othersOk === false).length,
    backgroundFailures: rows.filter((r) => r.backgroundOk === false).length,
    conversationCited: rows.filter((r) => r.conversationOk === false).length,
    notesFailures: rows.filter((r) => r.notesOk === false).length,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const yes = (ok: boolean) => (ok ? 'yes' : 'no');

/** The table that goes into specs/003-ask-the-transcript/manual-check.md. */
export function renderSummary(s: EvalSummary, run: { provider: string; model: string }): string {
  return [
    `Provider ${run.provider}, model ${run.model}, ${s.questions} questions.`,
    '',
    '| Measure | Result | Target | Met |',
    '|---|---|---|---|',
    `| Citation precision (SC-002) | ${pct(s.citationPrecision)} | ≥ 95% | ${yes(s.citationPrecision >= 0.95)} |`,
    `| Absent detected (SC-003) | ${pct(s.absentDetected)} | ≥ 95% | ${yes(s.absentDetected >= 0.95)} |`,
    `| Invented answers to absent questions (SC-003) | ${s.inventedAbsent} | 0 | ${yes(s.inventedAbsent === 0)} |`,
    `| Answer in the question language (SC-005) | ${pct(s.languageMatch)} | 100% | ${yes(s.languageMatch === 1)} |`,
    `| "Others" lines given a name | ${s.othersFailures} | 0 | ${yes(s.othersFailures === 0)} |`,
    `| Term questions without a cited mention and uncited background (FR-007) | ${s.backgroundFailures} | 0 | ${yes(s.backgroundFailures === 0)} |`,
    `| Facts from the chat itself cited or not given (SC-002) | ${s.conversationCited} | 0 | ${yes(s.conversationCited === 0)} |`,
    `| Notes statements unmarked, cited or presented as said (SC-002, SC-003) | ${s.notesFailures} | 0 | ${yes(s.notesFailures === 0)} |`,
    '',
  ].join('\n');
}

export interface EvalRun {
  provider: ChatProviderId;
  model: string;
  /** `--set <name>`: one evaluation file (its name without .json); all when absent. */
  set?: string;
}

/** `--provider anthropic|openai` (default: the app default) and `--model <curated id>` (default: its default). */
export function parseEvalArgs(argv: readonly string[]): EvalRun {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const provider = value('--provider') ?? DEFAULT_CHAT_PROVIDER;
  if (provider !== 'anthropic' && provider !== 'openai') throw new Error('--provider must be anthropic or openai.');
  const model = value('--model') ?? defaultModel(provider);
  if (!isModelOf(provider, model)) throw new Error(`${model} is not an ${provider} model in the app's list.`);
  const set = value('--set');
  return set ? { provider, model, set } : { provider, model };
}

const KEY_VARIABLES: Record<ChatProviderId, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };

/** The key comes from the shell only, never a file (same rule as the spikes). */
export function requireChatKey(provider: ChatProviderId, env: Record<string, string | undefined>): string {
  const name = KEY_VARIABLES[provider];
  const key = env[name]?.trim();
  if (!key)
    throw new Error(`${name} is not set. In this shell run: export ${name}=<your key> (never put the key in a file).`);
  return key;
}

/**
 * The request the app would send for this question (contracts: append-only context, research R5). Earlier turns are
 * replayed as answered turns: the first carries the whole transcript, later ones "no new lines", as in a chat where
 * the transcript did not move between questions.
 */
export function evalRequest(
  set: Pick<EvalSet, 'meeting' | 'segments' | 'notes'>,
  question: EvalQuestion,
  model: string,
): ChatRequest {
  // 008: the set's notes, as the app sends notes added before the first question: they go with the first question
  // asked, an earlier turn or this one (real call 2026-10-10: the notes were attached before Start).
  const record: MeetingContextRecord | undefined = set.notes && {
    meetingId: set.meeting.id,
    version: 1,
    notes: { ...set.notes, source: 'file', addedAt: 0 },
    updatedAt: 0,
    schemaVersion: 1,
  };
  const earlier: ChatTurn[] = [];
  for (const [seq, e] of (question.earlier ?? []).entries()) {
    const built = buildContext(set.meeting, set.segments, earlier);
    const { sent } = buildNotes(record, earlier);
    earlier.push({
      id: turnId(set.meeting.id, seq),
      meetingId: set.meeting.id,
      seq,
      question: e.question,
      askedAt: seq,
      contextBlock: built.contextBlock,
      sentLines: built.sentLines,
      transcriptUntilMs: built.transcriptUntilMs,
      ...(sent ? { notesSent: sent } : {}),
      provider: 'openai',
      requestedModel: model,
      answeredBy: model,
      answer: e.answer,
      status: 'complete',
      error: null,
      updatedAt: seq,
      schemaVersion: 1,
    });
  }
  const context = buildContext(set.meeting, set.segments, earlier);
  return buildRequest({
    model,
    earlier,
    context: context.contextBlock,
    question: question.question,
    notes: record,
    newNotes: buildNotes(record, earlier).block,
  });
}
