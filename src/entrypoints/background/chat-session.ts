// The service worker's side of the `chat` port (003 contracts/chat-messages.md, research R1): one session per side
// panel port. It reads the meeting and its chat from IndexedDB, gets a ready provider from the credential source (never
// a key), streams the answer back as deltas and stores the turn as it goes. It writes chat turns only (FR-020).
import { buildContext, buildRequest, fitsBudget } from '../../core/chat/context';
import { findModel } from '../../core/chat/models';
import { buildNotes } from '../../core/chat/notes';
import { ChatError, type ChatCredentialSource, type ChatErrorKind, type ChatUsage } from '../../core/chat/provider';
import { toTurnView, turnId, type ChatTurn } from '../../core/chat/turn';
import type { Logger } from '../../core/log';
import {
  CHAT_PORT_NAME,
  parseChatPortIn,
  type ChatEndStatus,
  type ChatPortIn,
  type ChatPortOut,
} from '../../core/messaging/protocol';
import type { ChatSettings } from '../../core/settings/schema';
import type { ChatRepo } from '../../storage/chat-repo';
import type { ContextRepo } from '../../storage/context-repo';
import type { MeetingRepo } from '../../storage/meeting-repo';

/** What a request did with the notes, for the log (008 contracts/notes-messages.md): never a name or text. */
type NotesLogFlag = 'none' | 'kept' | 'added' | 'replaced' | 'removed';

/** The stored answer is refreshed at most this often while it streams (data-model "Writes"). */
export const ANSWER_WRITE_MS = 250;

/**
 * How long a request may run without any answer text before the session gives up on it (003 FR-018a, design decision
 * 80). A limit on the wait for the first text only: once text has started, an answer is never cut by it.
 */
export const FIRST_TEXT_LIMIT_MS = 45_000;

/** How a question ended, for the log (FR-018b). */
type EndReason = 'done' | 'stopped' | 'panel-closed' | 'no-first-text' | 'error';

/** Timings of one request, for the log (FR-018b): milliseconds from handing it to the provider; null: never happened. */
interface RequestTrace {
  end: EndReason;
  firstEventMs: number | null;
  firstTextMs: number | null;
  totalMs: number;
}

export interface ChatSessionDeps {
  meetings: Pick<MeetingRepo, 'getMeeting' | 'listSegments'>;
  chats: Pick<ChatRepo, 'listTurns' | 'putTurn' | 'nextSeq' | 'markStaleStreaming'>;
  /** 008: the meeting's notes; absent, questions carry no notes (as in 003). */
  contexts?: Pick<ContextRepo, 'get'>;
  chatSettings(): Promise<ChatSettings>;
  credentials: ChatCredentialSource;
  now(): number;
  /** Receives only error kind, model, status and usage counts. */
  logger: Logger;
  /** To the panel; a closed port is not an error. */
  post(message: ChatPortOut): void;
  timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
  /** The first-text limit, when it is not FIRST_TEXT_LIMIT_MS: only the e2e build sets it, so a test need not wait. */
  firstTextLimitMs?(): Promise<number>;
}

export interface ChatSession {
  /** Resolves when the message is handled; for `chat/ask`, when the turn has ended. */
  handle(message: ChatPortIn): Promise<void>;
  /** The panel went away: any answer in progress stops and is kept as stopped. */
  disconnect(): void;
}

const defaultTimers = {
  set: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
  clear: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createChatSession(deps: ChatSessionDeps): ChatSession {
  const timers = deps.timers ?? defaultTimers;
  let active: { id: string | null; controller: AbortController } | null = null;
  let closed = false;

  const post = (message: ChatPortOut) => {
    if (closed) return;
    try {
      deps.post(message);
    } catch {
      // The panel closed between our check and the post.
    }
  };

  /** Numbers and fixed tags only: never a question, an answer, a transcript line or a key. */
  function log(turn: ChatTurn, usage: ChatUsage | null, notes: NotesLogFlag, trace: RequestTrace | null) {
    deps.logger.info('chat answer', {
      status: turn.status,
      notes,
      kind: turn.error,
      model: turn.answeredBy ?? turn.requestedModel,
      ...trace,
      usage: usage && {
        input: usage.inputTokens,
        output: usage.outputTokens,
        cacheRead: usage.cacheReadTokens,
        cacheWrite: usage.cacheWriteTokens,
      },
    });
  }

  async function ask(meetingId: string, question: string, controller: AbortController): Promise<void> {
    const { meetings, chats } = deps;
    await chats.markStaleStreaming(deps.now());

    const meeting = await meetings.getMeeting(meetingId);
    if (!meeting) return post({ type: 'chat/rejected', kind: 'unknown-meeting' });
    const segments = await meetings.listSegments(meetingId);
    if (segments.length === 0) return post({ type: 'chat/rejected', kind: 'empty-transcript' });

    const settings = await deps.chatSettings();
    const provider = await deps.credentials.providerFor(settings.provider);
    if (!provider) return post({ type: 'chat/rejected', kind: 'missing-key' });

    const earlier = await chats.listTurns(meetingId);
    const context = buildContext(meeting, segments, earlier);
    const model = settings.models[settings.provider];
    // 008: the meeting's notes; the request carries them as a separate block, the turn only a version reference.
    const notesRecord = await deps.contexts?.get(meetingId);
    const notes = buildNotes(notesRecord, earlier);
    const request = buildRequest({
      model,
      earlier,
      context: context.contextBlock,
      question,
      notes: notesRecord,
      newNotes: notes.block,
    });
    const notesFlag: NotesLogFlag =
      notes.sent?.kind ?? (request.turns.some((t) => t.role === 'user' && t.notes !== undefined) ? 'kept' : 'none');
    const seq = await chats.nextSeq(meetingId);
    const now = deps.now();
    const turn: ChatTurn = {
      id: turnId(meetingId, seq),
      meetingId,
      seq,
      question,
      askedAt: now,
      contextBlock: context.contextBlock,
      sentLines: context.sentLines,
      transcriptUntilMs: context.transcriptUntilMs,
      provider: settings.provider,
      requestedModel: model,
      answeredBy: null,
      answer: '',
      status: 'streaming',
      error: null,
      updatedAt: now,
      schemaVersion: 1,
      notesSent: notes.sent,
    };
    if (active) active.id = turn.id;

    const budget = findModel(model);
    if (budget && !fitsBudget(request, budget)) {
      Object.assign(turn, { status: 'failed', error: 'too-large' });
      if (!(await chats.putTurn(turn))) return post({ type: 'chat/rejected', kind: 'unknown-meeting' });
      post({ type: 'chat/turn', turn: toTurnView(turn) });
      post({ type: 'chat/end', turnId: turn.id, status: 'failed', error: 'too-large' });
      log(turn, null, notesFlag, null);
      return;
    }

    // 012 FR-018: the meeting was deleted while this question was being prepared. Nothing is stored or sent.
    if (!(await chats.putTurn(turn))) return post({ type: 'chat/rejected', kind: 'unknown-meeting' });
    post({ type: 'chat/turn', turn: toTurnView(turn) });

    // 012 FR-018: set when a write finds the meeting deleted mid-answer. The answer stops, and nothing more is posted
    // or written for the turn (the write itself stored nothing).
    let meetingGone = false;
    // Writes are chained so the final state always lands last.
    let writes: Promise<void> = Promise.resolve();
    const write = () => {
      const snapshot = { ...turn, updatedAt: deps.now() };
      writes = writes
        .then(async () => {
          if (meetingGone || (await chats.putTurn(snapshot))) return;
          meetingGone = true;
          controller.abort();
        })
        .catch(() => undefined);
    };
    let timer: unknown = null;
    const scheduleWrite = () => {
      if (timer !== null) return;
      timer = timers.set(() => {
        timer = null;
        write();
      }, ANSWER_WRITE_MS);
    };

    let usage: ChatUsage | null = null;
    let status: ChatEndStatus = 'stopped';
    let error: ChatErrorKind | null = null;

    // FR-018a: the wait for the first answer text is limited; everything after it is not. The callback does nothing
    // once text has started or the request is already aborted (Stop, panel closed, meeting deleted), so a clear that
    // loses a race cannot give a turn two outcomes.
    const limitMs = (await deps.firstTextLimitMs?.()) ?? FIRST_TEXT_LIMIT_MS;
    const sentAt = deps.now();
    let firstEventMs: number | null = null;
    let firstTextMs: number | null = null;
    let noFirstText = false;
    let failed = false;
    let limit: unknown = timers.set(() => {
      limit = null;
      if (firstTextMs !== null || controller.signal.aborted) return;
      noFirstText = true;
      controller.abort();
    }, limitMs);
    const stopLimit = () => {
      if (limit !== null) timers.clear(limit);
      limit = null;
    };

    // The stream is read in a race with the abort, so a provider that does not notice the abort cannot hold the turn
    // open, and whatever it yields afterwards is never read.
    const aborted = new Promise<null>((resolve) => {
      if (controller.signal.aborted) return resolve(null);
      controller.signal.addEventListener('abort', () => resolve(null), { once: true });
    });
    try {
      const events = provider.stream(request, controller.signal)[Symbol.asyncIterator]();
      for (;;) {
        const next = await Promise.race([events.next(), aborted]);
        if (next === null || controller.signal.aborted || next.done || meetingGone) break;
        const event = next.value;
        firstEventMs ??= deps.now() - sentAt;
        if (event.type === 'model') {
          turn.answeredBy = event.model;
          post({ type: 'chat/model', turnId: turn.id, model: event.model });
        } else if (event.type === 'text') {
          if (firstTextMs === null) {
            firstTextMs = deps.now() - sentAt;
            stopLimit();
          }
          turn.answer += event.text;
          post({ type: 'chat/delta', turnId: turn.id, text: event.text });
          scheduleWrite();
        } else {
          status = event.finish;
          usage = event.usage;
        }
      }
    } catch (e) {
      failed = true;
      status = 'failed';
      error = e instanceof ChatError ? e.kind : 'unknown';
      // A declined answer is not an answer: text streamed before the decline is not kept or replayed (US2).
      if (error === 'declined') turn.answer = '';
    }
    stopLimit();
    if (noFirstText) {
      status = 'failed';
      error = 'no-answer';
    }
    if (timer !== null) timers.clear(timer);
    timer = null;
    Object.assign(turn, { status, error });
    write();
    await writes;
    if (meetingGone) return;
    post({ type: 'chat/end', turnId: turn.id, status, error });
    let end: EndReason = 'done';
    if (noFirstText) end = 'no-first-text';
    else if (failed) end = 'error';
    else if (status === 'stopped') end = closed ? 'panel-closed' : 'stopped';
    log(turn, usage, notesFlag, { end, firstEventMs, firstTextMs, totalMs: deps.now() - sentAt });
  }

  return {
    async handle(message) {
      if (message.type === 'chat/stop') {
        if (active && active.id === message.turnId) active.controller.abort();
        return;
      }
      if (active) return post({ type: 'chat/rejected', kind: 'busy' });
      const controller = new AbortController();
      active = { id: null, controller };
      try {
        await ask(message.meetingId, message.question, controller);
      } finally {
        active = null;
      }
    },
    disconnect() {
      closed = true;
      active?.controller.abort();
    },
  };
}

/** The part of chrome.runtime.Port this needs. */
export interface ChatPortLike {
  name: string;
  sender?: { id?: string | undefined; url?: string | undefined } | undefined;
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export interface AcceptChatPortDeps {
  runtimeId: string;
  /** chrome.runtime.getURL('/sidepanel.html'). */
  sidePanelUrl: string;
  createSession(post: (message: ChatPortOut) => void): ChatSession;
  /** Ports with other names, meant for the offscreen document (foreign-ports.ts). */
  foreign(port: ChatPortLike): void;
}

/**
 * chrome.runtime.onConnect handler. A `chat` port is accepted only from this extension's side panel page (any query
 * string allowed: the e2e build opens it with one); any other `chat` port is disconnected. Ports with other names
 * (the offscreen document's `live`, Meet's) go to `foreign`, which never disconnects them while the offscreen
 * document holds the other end (that would close them for their opener). Returns whether a session started.
 */
export function acceptChatPort(port: ChatPortLike, deps: AcceptChatPortDeps): boolean {
  if (port.name !== CHAT_PORT_NAME) {
    deps.foreign(port);
    return false;
  }
  const url = port.sender?.url?.split(/[?#]/)[0];
  if (port.sender?.id !== deps.runtimeId || url !== deps.sidePanelUrl) {
    port.disconnect();
    return false;
  }
  const session = deps.createSession((message) => port.postMessage(message));
  port.onMessage.addListener((raw) => {
    const message = parseChatPortIn(raw);
    if (message) void session.handle(message);
  });
  port.onDisconnect.addListener(() => session.disconnect());
  return true;
}
