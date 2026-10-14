// One question and its answer (003 data-model "ChatTurn"), stored in IndexedDB `chatTurns` by the service worker.
import type { ChatProviderId } from './models';
import type { ChatErrorKind } from './provider';

export type AnswerStatus = 'streaming' | 'complete' | 'stopped' | 'cut-off' | 'failed';

export const MAX_QUESTION_LENGTH = 2000;

/** A `streaming` turn with no update for longer than this was orphaned (research R1). */
export const STALE_STREAMING_MS = 60_000;

export interface ChatTurn {
  /** `${meetingId}:chat:${seq}`: deterministic, so writes are idempotent. */
  id: string;
  meetingId: string;
  /** 0, 1, 2… in asking order. */
  seq: number;
  /** Trimmed, 1–2,000 chars. */
  question: string;
  askedAt: number;
  /** The exact transcript block sent with this question (research R5); replayed byte-for-byte later. */
  contextBlock: string;
  /** Segment id → rendered line, as sent by this turn. */
  sentLines: Record<string, string>;
  /** The last sent segment's endMs. */
  transcriptUntilMs: number;
  provider: ChatProviderId;
  requestedModel: string;
  /** The model that wrote the answer (differs after a server-side fallback); null until known. */
  answeredBy: string | null;
  answer: string;
  status: AnswerStatus;
  /** Set when status is 'failed'. */
  error: ChatErrorKind | null;
  updatedAt: number;
  schemaVersion: 1;
  /**
   * 008: the notes block this turn carried, by reference only (never the text); null for none. Absent on turns stored
   * before 008 (read as null by normaliseTurn).
   */
  notesSent?: NotesSent | null;
}

/** Which notes version a turn's notes block was built from, and what it told the model (008 research N3, N4). */
export interface NotesSent {
  version: number;
  kind: 'added' | 'replaced' | 'removed';
}

export function normaliseTurn(turn: ChatTurn): ChatTurn & { notesSent: NotesSent | null } {
  return { ...turn, notesSent: turn.notesSent ?? null };
}

/** What the panel gets (contracts/chat-messages.md): never the prompt text. */
export type ChatTurnView = Omit<ChatTurn, 'contextBlock' | 'sentLines' | 'notesSent'>;

export function turnId(meetingId: string, seq: number): string {
  return `${meetingId}:chat:${seq}`;
}

/** Only finished turns with an answer are replayed to the model; failed or empty ones are not, nor counted as sent. */
export function replayable(turn: Pick<ChatTurn, 'status' | 'answer'>): boolean {
  return (
    (turn.status === 'complete' || turn.status === 'cut-off' || turn.status === 'stopped') && turn.answer.trim() !== ''
  );
}

/** The question was sent and no answer text has arrived yet (003 FR-003a): the panel shows that it is waiting. */
export function awaitsFirstText(turn: Pick<ChatTurn, 'status' | 'answer'>): boolean {
  return turn.status === 'streaming' && turn.answer === '';
}

export function isStale(turn: Pick<ChatTurn, 'status' | 'updatedAt'>, now: number): boolean {
  return turn.status === 'streaming' && now - turn.updatedAt > STALE_STREAMING_MS;
}

export function toTurnView(turn: ChatTurn): ChatTurnView {
  const { contextBlock: _context, sentLines: _sent, notesSent: _notes, ...view } = turn;
  return view;
}
