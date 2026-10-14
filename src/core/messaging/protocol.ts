// Cross-context message protocol (contracts/extension-messages.md). Every receiver validates at its boundary:
// unknown or malformed messages are dropped and counted, never thrown. Keys and tokens never travel in a message.
import { ACCOUNT_ERROR_KINDS, type AccountUsageReply } from '../account/usage';
import { CHAT_PROVIDERS, type ChatProviderId } from '../chat/models';
import { validateNotes, type NotesInput } from '../chat/notes';
import { isChatErrorKind, type ChatErrorKind } from '../chat/provider';
import { MAX_QUESTION_LENGTH, type AnswerStatus, type ChatTurnView } from '../chat/turn';
import type { SpeakerNameMapping } from '../settings/schema';
import type { StatusSnapshot } from '../status/status';
import {
  isRenamableKey,
  type EndReason,
  type LanguageMode,
  type Meeting,
  type RenamableKey,
  type SpeakerKey,
  type SpeakerRename,
  type StreamId,
  type TranscriptSegment,
} from '../transcript/model';

export type CredentialErrorKind = 'missing' | 'invalid' | 'forbidden' | 'network' | 'rate-limited' | 'unknown';

export type StartError =
  'settings-incomplete' | 'not-invoked' | 'tab-not-capturable' | 'already-running' | 'offscreen-failed';

// ── Commands: side panel → service worker ──
export type Command =
  | { type: 'meeting/start'; tabId: number; language: LanguageMode }
  | { type: 'meeting/stop' }
  | { type: 'settings/validate-key' }
  /** Red-team 2026-10-08 (001 FR-003a): the saved key's last four characters; reply KeyHintReply. */
  | { type: 'settings/key-hint' }
  /** 005: the ElevenLabs account status; reply AccountUsageReply (specs/005-account-usage/contracts). */
  | { type: 'account/usage' }
  /** 003: both chat keys' last four characters; reply ChatKeyHintsReply (contracts/chat-messages.md). */
  | { type: 'settings/chat-key-hints' }
  /** 003: check the pending chat key, promote or discard it; reply ValidateChatKeyReply. */
  | { type: 'settings/validate-chat-key'; provider: ChatProviderId }
  /** 008: add or replace notes; reply NotesSetReply (specs/008-meeting-context/contracts/notes-messages.md). */
  | { type: 'context/set'; target: NotesTarget; notes: NotesInput }
  /** 008: remove notes; reply NotesRemoveReply. */
  | { type: 'context/remove'; target: NotesTarget };

/** 008: whose notes — the next meeting to start, or a stored meeting. */
export type NotesTarget = { kind: 'next' } | { kind: 'meeting'; meetingId: string };
export type NotesSetErrorKind = 'empty' | 'too-long' | 'not-text' | 'wrong-type' | 'unknown-meeting' | 'save-failed';
export type NotesSetReply = { ok: true; version: number } | { ok: false; kind: NotesSetErrorKind };
export type NotesRemoveReply = { ok: true } | { ok: false; kind: 'unknown-meeting' | 'save-failed' };

export type StartResult = { ok: true; meetingId: string } | { ok: false; error: StartError; runningTabTitle?: string };
export type StopResult = { ok: true };
export type KeyHintReply = { hint: string | null };
export type ValidateKeyResult = { ok: true; hint: string } | { ok: false; kind: CredentialErrorKind };
export type ChatKeyHintsReply = Record<ChatProviderId, string | null>;
export type ValidateChatKeyKind = 'invalid-key' | 'forbidden' | 'network' | 'unknown' | 'missing-key';
export type ValidateChatKeyReply = { ok: true; hint: string } | { ok: false; kind: ValidateChatKeyKind };

// ── Internal: service worker → offscreen ──
export type InternalMessage =
  | {
      type: 'offscreen/begin';
      meetingId: string;
      tabStreamId: string;
      language: LanguageMode;
      keyterms: string[];
      userName: string;
      /** The captured tab, for the meeting record. */
      source: { url: string; title: string };
      /** 002: Settings → Remembered names, since the offscreen document cannot read chrome.storage. Absent = []. */
      speakerNameMappings: SpeakerNameMapping[];
      /** Design decision 41: Settings → clean transcript (ElevenLabs `no_verbatim`). Absent = on. */
      cleanTranscript: boolean;
    }
  | { type: 'offscreen/end'; reason: EndReason };

/** A remembered caption name → display name (002 data-model.md Settings). */
export type { SpeakerNameMapping };

// ── Credential requests: offscreen → service worker ──
// Offscreen documents get only chrome.runtime (no chrome.storage), so they cannot read the key. The service worker
// mints the single-use transcription token and returns it as the direct reply to the offscreen document only; the
// key itself never leaves the service worker, and no broadcast message ever carries a token.
export type OffscreenRequest = { type: 'credentials/transcription-token' } | { type: 'credentials/status' };

export type TokenReply =
  { ok: true; credential: { token: string; expiresAt: number } } | { ok: false; kind: CredentialErrorKind };

/**
 * The offscreen document ended the meeting by itself (transcription failed for good), so the service worker can
 * close the document and forget the running meeting. Reply: `{ ok: true }`.
 */
export type OffscreenNotice = { type: 'offscreen/ended'; reason: EndReason };

export type CredentialStatusReply = { configured: boolean; hint?: string };

/** Offscreen replies. `message` is a plain error text with no secrets. */
export type BeginResult = { ok: true } | { ok: false; message: string };
export type EndResult = { ok: true };

// ── Live updates: offscreen → side panel over the `live` port ──
export const LIVE_PORT_NAME = 'live';

export interface PartialLine {
  stream: StreamId;
  text: string;
}

export type LiveEvent =
  | {
      type: 'live/snapshot';
      meeting: Meeting | null;
      segments: TranscriptSegment[];
      partials: PartialLine[];
      status: StatusSnapshot;
    }
  | { type: 'live/segment'; segment: TranscriptSegment }
  | { type: 'live/partial'; stream: StreamId; text: string }
  | { type: 'live/status'; status: StatusSnapshot }
  /** 002: a stored segment changed (attribution resolved, override set or cleared); replaces the one with its id. */
  | { type: 'live/segment-updated'; segment: TranscriptSegment }
  /** 002: the meeting's renames after any change; replaces the panel's copy. */
  | { type: 'live/labels'; meetingId: string; speakerRenames: Meeting['speakerRenames'] }
  /** 013: the meeting now has stored caption turns. No caption text, name or count ever travels on this port. */
  | { type: 'live/captions-kept'; meetingId: string };

// ── Label commands: side panel → offscreen over the `live` port (002 contracts/live-port-and-labels.md) ──
export const MAX_LABEL_LENGTH = 60;

export type LabelCommand =
  /** Never `others` (red-team 2026-10-08, decision 35): "Others" lines are corrected one at a time. */
  | { type: 'labels/rename'; meetingId: string; speakerKey: RenamableKey; name: string }
  | { type: 'labels/override'; meetingId: string; segmentId: string; name: string | null };

// ── Chat: side panel ↔ service worker over the `chat` port (003 contracts/chat-messages.md) ──
export const CHAT_PORT_NAME = 'chat';

export type ChatPortIn =
  { type: 'chat/ask'; meetingId: string; question: string } | { type: 'chat/stop'; turnId: string };

export type ChatRejectKind = 'empty-transcript' | 'missing-key' | 'busy' | 'unknown-meeting';
export type ChatEndStatus = Exclude<AnswerStatus, 'streaming'>;

export type ChatPortOut =
  | { type: 'chat/rejected'; kind: ChatRejectKind }
  | { type: 'chat/turn'; turn: ChatTurnView }
  | { type: 'chat/model'; turnId: string; model: string }
  | { type: 'chat/delta'; turnId: string; text: string }
  | { type: 'chat/end'; turnId: string; status: ChatEndStatus; error: ChatErrorKind | null };

// ── Validation helpers ──
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isStream = (v: unknown): v is StreamId => v === 'mixed';
const oneOf =
  <T extends string>(...values: readonly T[]) =>
  (v: unknown): v is T =>
    values.includes(v as T);

const isEndReason = oneOf<EndReason>('user-stop', 'tab-closed', 'tab-navigated', 'call-ended', 'failed', 'crashed');
const isLabelSource = oneOf('fallback', 'caption', 'manual');

/** A name the user typed: one line, 1–60 chars once trimmed. Returns the trimmed name. */
export function parseLabelName(v: unknown): string | null {
  if (!isStr(v)) return null;
  const name = v.trim();
  return name.length >= 1 && name.length <= MAX_LABEL_LENGTH && !/[\r\n]/.test(name) ? name : null;
}

const MAX_CAPTION_NAME = 200;

function isSpeakerKey(v: unknown): v is SpeakerKey {
  if (v === 'self' || v === 'others') return true;
  return isStr(v) && v.startsWith('caption:') && v.length > 'caption:'.length && v.length <= 8 + MAX_CAPTION_NAME;
}

function isSpeakerRename(v: unknown): v is SpeakerRename {
  return isRec(v) && parseLabelName(v.name) === v.name && (v.origin === 'manual' || v.origin === 'remembered');
}

function isSpeakerRenames(v: unknown): v is Meeting['speakerRenames'] {
  return isRec(v) && Object.entries(v).every(([k, r]) => isSpeakerKey(k) && isSpeakerRename(r));
}

function parseMappings(v: unknown): SpeakerNameMapping[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return null;
  const out: SpeakerNameMapping[] = [];
  for (const m of v) {
    if (!isRec(m) || !isStr(m.captionName) || m.captionName.trim() === '' || m.captionName.length > MAX_CAPTION_NAME)
      return null;
    if (parseLabelName(m.displayName) !== m.displayName || !isNum(m.updatedAt)) return null;
    out.push({ captionName: m.captionName, displayName: m.displayName as string, updatedAt: m.updatedAt });
  }
  return out;
}

/** Field names that look like secrets. `keyterms` is deliberately not matched. */
const SECRET_FIELD = /^(key|apikey|.*api[-_]?key.*|.*token.*|.*secret.*|.*password.*|authorization)$/i;

export function containsSecretField(v: unknown, depth = 0): boolean {
  if (depth > 8) return true; // refuse absurdly deep payloads
  if (Array.isArray(v)) return v.some((x) => containsSecretField(x, depth + 1));
  if (!isRec(v)) return false;
  return Object.entries(v).some(([k, x]) => SECRET_FIELD.test(k) || containsSecretField(x, depth + 1));
}

function parseLanguage(v: unknown): LanguageMode | null {
  if (!isRec(v)) return null;
  if (v.kind === 'auto') return { kind: 'auto' };
  if (v.kind === 'fixed' && isStr(v.code) && v.code.length > 0) return { kind: 'fixed', code: v.code };
  return null;
}

function isSegment(v: unknown): v is TranscriptSegment {
  return (
    isRec(v) &&
    isStr(v.id) &&
    isStr(v.meetingId) &&
    isStream(v.stream) &&
    isNum(v.seq) &&
    isNum(v.startMs) &&
    isNum(v.endMs) &&
    isStr(v.text) &&
    (v.language === null || isStr(v.language)) &&
    isStr(v.speakerLabel) &&
    isLabelSource(v.labelSource) &&
    // 002 fields: absent on records stored before 002 (normalised on read, data-model.md).
    (v.captionName === undefined || v.captionName === null || isStr(v.captionName)) &&
    (v.captionSelf === undefined || typeof v.captionSelf === 'boolean') &&
    (v.labelOverride === undefined || v.labelOverride === null || isStr(v.labelOverride)) &&
    (v.schemaVersion === undefined || v.schemaVersion === 1 || v.schemaVersion === 2) &&
    (v.labelPending === undefined || typeof v.labelPending === 'boolean') &&
    Array.isArray(v.words) &&
    v.words.every((w) => isRec(w) && isStr(w.text) && isNum(w.startMs) && isNum(w.endMs)) &&
    (v.timing === 'words' || v.timing === 'estimated') &&
    isStr(v.sessionId) &&
    isNum(v.createdAt)
  );
}

function isMeeting(v: unknown): v is Meeting {
  return (
    isRec(v) &&
    isStr(v.id) &&
    isNum(v.startedAt) &&
    (v.endedAt === null || isNum(v.endedAt)) &&
    (v.endReason === null || isEndReason(v.endReason)) &&
    isRec(v.source) &&
    isStr(v.source.url) &&
    isStr(v.source.title) &&
    isStr(v.source.platform) &&
    parseLanguage(v.languageMode) !== null &&
    isStr(v.userName) &&
    (v.speakerRenames === undefined || isSpeakerRenames(v.speakerRenames)) &&
    // 013: a mark, never anything about the captions themselves.
    (v.hasCaptions === undefined || v.hasCaptions === true) &&
    (v.schemaVersion === 1 || v.schemaVersion === 2)
  );
}

function isStatus(v: unknown): v is StatusSnapshot {
  return (
    isRec(v) &&
    isRec(v.capture) &&
    isRec(v.transcription) &&
    isStr(v.transcription.state) &&
    isNum(v.transcription.reconnects) &&
    isRec(v.speakerNames) &&
    isRec(v.mic) &&
    isRec(v.retention)
  );
}

function guarded<T>(parse: (m: Rec) => T | null): (raw: unknown) => T | null {
  return (raw) => (isRec(raw) && !containsSecretField(raw) ? parse(raw) : null);
}

export const parseCommand = guarded<Command>((m) => {
  switch (m.type) {
    case 'meeting/start': {
      const language = parseLanguage(m.language);
      return isNum(m.tabId) && language ? { type: 'meeting/start', tabId: m.tabId, language } : null;
    }
    case 'meeting/stop':
      return { type: 'meeting/stop' };
    case 'settings/validate-key':
      return { type: 'settings/validate-key' };
    case 'settings/key-hint':
      return { type: 'settings/key-hint' };
    case 'account/usage':
      return { type: 'account/usage' };
    case 'settings/chat-key-hints':
      return { type: 'settings/chat-key-hints' };
    case 'settings/validate-chat-key':
      return isChatProvider(m.provider) ? { type: 'settings/validate-chat-key', provider: m.provider } : null;
    case 'context/set': {
      const target = parseNotesTarget(m.target);
      const notes = validateNotes(m.notes);
      return target && notes.ok ? { type: 'context/set', target, notes: notes.notes } : null;
    }
    case 'context/remove': {
      const target = parseNotesTarget(m.target);
      return target ? { type: 'context/remove', target } : null;
    }
    default:
      return null;
  }
});

function parseNotesTarget(v: unknown): NotesTarget | null {
  if (!isRec(v)) return null;
  if (v.kind === 'next') return { kind: 'next' };
  return v.kind === 'meeting' && isStr(v.meetingId) && v.meetingId !== ''
    ? { kind: 'meeting', meetingId: v.meetingId }
    : null;
}

export const parseInternal = guarded<InternalMessage>((m) => {
  switch (m.type) {
    case 'offscreen/begin': {
      const language = parseLanguage(m.language);
      const source = m.source;
      if (!isStr(m.meetingId) || !isStr(m.tabStreamId) || !language || !isStrArray(m.keyterms) || !isStr(m.userName))
        return null;
      if (!isRec(source) || !isStr(source.url) || !isStr(source.title)) return null;
      const speakerNameMappings = parseMappings(m.speakerNameMappings);
      if (!speakerNameMappings) return null;
      if (m.cleanTranscript !== undefined && typeof m.cleanTranscript !== 'boolean') return null;
      return {
        type: 'offscreen/begin',
        meetingId: m.meetingId,
        tabStreamId: m.tabStreamId,
        language,
        keyterms: [...m.keyterms],
        userName: m.userName,
        source: { url: source.url, title: source.title },
        speakerNameMappings,
        cleanTranscript: m.cleanTranscript !== false,
      };
    }
    case 'offscreen/end':
      return isEndReason(m.reason) ? { type: 'offscreen/end', reason: m.reason } : null;
    default:
      return null;
  }
});

export const parseLive = guarded<LiveEvent>((m) => {
  switch (m.type) {
    case 'live/snapshot': {
      const okMeeting = m.meeting === null || isMeeting(m.meeting);
      const okSegments = Array.isArray(m.segments) && m.segments.every(isSegment);
      const okPartials =
        Array.isArray(m.partials) && m.partials.every((p) => isRec(p) && isStream(p.stream) && isStr(p.text));
      if (!okMeeting || !okSegments || !okPartials || !isStatus(m.status)) return null;
      return {
        type: 'live/snapshot',
        meeting: m.meeting as Meeting | null,
        segments: m.segments as TranscriptSegment[],
        partials: m.partials as PartialLine[],
        status: m.status,
      };
    }
    case 'live/segment':
      return isSegment(m.segment) ? { type: 'live/segment', segment: m.segment } : null;
    case 'live/partial':
      return isStream(m.stream) && isStr(m.text) ? { type: 'live/partial', stream: m.stream, text: m.text } : null;
    case 'live/status':
      return isStatus(m.status) ? { type: 'live/status', status: m.status } : null;
    case 'live/segment-updated':
      return isSegment(m.segment) ? { type: 'live/segment-updated', segment: m.segment } : null;
    case 'live/labels':
      return isStr(m.meetingId) && isSpeakerRenames(m.speakerRenames)
        ? { type: 'live/labels', meetingId: m.meetingId, speakerRenames: m.speakerRenames }
        : null;
    case 'live/captions-kept':
      return isStr(m.meetingId) ? { type: 'live/captions-kept', meetingId: m.meetingId } : null;
    default:
      return null;
  }
});

export const parseLabelCommand = guarded<LabelCommand>((m) => {
  if (!isStr(m.meetingId)) return null;
  switch (m.type) {
    case 'labels/rename': {
      const name = parseLabelName(m.name);
      return isSpeakerKey(m.speakerKey) && isRenamableKey(m.speakerKey) && name
        ? { type: 'labels/rename', meetingId: m.meetingId, speakerKey: m.speakerKey, name }
        : null;
    }
    case 'labels/override': {
      if (!isStr(m.segmentId)) return null;
      if (m.name === null)
        return { type: 'labels/override', meetingId: m.meetingId, segmentId: m.segmentId, name: null };
      const name = parseLabelName(m.name);
      return name ? { type: 'labels/override', meetingId: m.meetingId, segmentId: m.segmentId, name } : null;
    }
    default:
      return null;
  }
});

export const parseOffscreenRequest = guarded<OffscreenRequest>((m) =>
  m.type === 'credentials/transcription-token' || m.type === 'credentials/status' ? { type: m.type } : null,
);

export const parseOffscreenNotice = guarded<OffscreenNotice>((m) =>
  m.type === 'offscreen/ended' && isEndReason(m.reason) ? { type: 'offscreen/ended', reason: m.reason } : null,
);

const isCredentialErrorKind = oneOf<CredentialErrorKind>(
  'missing',
  'invalid',
  'forbidden',
  'network',
  'rate-limited',
  'unknown',
);

/** The one reply allowed to carry a token (see OffscreenRequest); read only by the offscreen document. */
export function parseTokenReply(v: unknown): TokenReply | null {
  if (!isRec(v)) return null;
  if (v.ok === false) return isCredentialErrorKind(v.kind) ? { ok: false, kind: v.kind } : null;
  const c = v.credential;
  if (v.ok !== true || !isRec(c) || !isStr(c.token) || c.token === '' || !isNum(c.expiresAt)) return null;
  return { ok: true, credential: { token: c.token, expiresAt: c.expiresAt } };
}

const isCount = (v: unknown): v is number => isNum(v) && v >= 0;

/** 005: the service worker's reply to `account/usage`, read by the panel. Only the derived fields survive. */
export const parseAccountUsageReply = guarded<AccountUsageReply>((m) => {
  if (m.ok === false) return oneOf(...ACCOUNT_ERROR_KINDS)(m.kind) ? { ok: false, kind: m.kind } : null;
  const u = m.usage;
  if (m.ok !== true || !isRec(u)) return null;
  if (!(u.tier === null || isStr(u.tier)) || !isCount(u.creditsUsed) || !isCount(u.creditsLimit)) return null;
  if (!(u.resetAt === null || isNum(u.resetAt))) return null;
  return {
    ok: true,
    usage: { tier: u.tier, creditsUsed: u.creditsUsed, creditsLimit: u.creditsLimit, resetAt: u.resetAt },
  };
});

// ── Chat (003) ──
const isChatProvider = (v: unknown): v is ChatProviderId => CHAT_PROVIDERS.includes(v as ChatProviderId);
const isAnswerStatus = oneOf<AnswerStatus>('streaming', 'complete', 'stopped', 'cut-off', 'failed');
const isEndStatus = oneOf<ChatEndStatus>('complete', 'stopped', 'cut-off', 'failed');
const isRejectKind = oneOf<ChatRejectKind>('empty-transcript', 'missing-key', 'busy', 'unknown-meeting');
const isNonEmptyStr = (v: unknown): v is string => isStr(v) && v !== '';

/** Exactly these fields: anything else (the prompt text, a key) makes the view invalid. */
const TURN_VIEW_FIELDS = new Set<string>([
  'id',
  'meetingId',
  'seq',
  'question',
  'askedAt',
  'transcriptUntilMs',
  'provider',
  'requestedModel',
  'answeredBy',
  'answer',
  'status',
  'error',
  'updatedAt',
  'schemaVersion',
]);

function isTurnView(v: unknown): v is ChatTurnView {
  return (
    isRec(v) &&
    Object.keys(v).every((k) => TURN_VIEW_FIELDS.has(k)) &&
    isNonEmptyStr(v.id) &&
    isNonEmptyStr(v.meetingId) &&
    isNum(v.seq) &&
    isStr(v.question) &&
    isNum(v.askedAt) &&
    isNum(v.transcriptUntilMs) &&
    isChatProvider(v.provider) &&
    isNonEmptyStr(v.requestedModel) &&
    (v.answeredBy === null || isNonEmptyStr(v.answeredBy)) &&
    isStr(v.answer) &&
    isAnswerStatus(v.status) &&
    (v.error === null || isChatErrorKind(v.error)) &&
    isNum(v.updatedAt) &&
    v.schemaVersion === 1
  );
}

/** The service worker's check of what the panel sends on the `chat` port. */
export const parseChatPortIn = guarded<ChatPortIn>((m) => {
  switch (m.type) {
    case 'chat/ask': {
      if (!isNonEmptyStr(m.meetingId) || !isStr(m.question)) return null;
      const question = m.question.trim();
      return question.length >= 1 && question.length <= MAX_QUESTION_LENGTH
        ? { type: 'chat/ask', meetingId: m.meetingId, question }
        : null;
    }
    case 'chat/stop':
      return isNonEmptyStr(m.turnId) ? { type: 'chat/stop', turnId: m.turnId } : null;
    default:
      return null;
  }
});

/** The panel's check of what the service worker sends on the `chat` port. */
export const parseChatPortOut = guarded<ChatPortOut>((m) => {
  switch (m.type) {
    case 'chat/rejected':
      return isRejectKind(m.kind) ? { type: 'chat/rejected', kind: m.kind } : null;
    case 'chat/turn':
      return isTurnView(m.turn) ? { type: 'chat/turn', turn: m.turn } : null;
    case 'chat/model':
      return isNonEmptyStr(m.turnId) && isNonEmptyStr(m.model)
        ? { type: 'chat/model', turnId: m.turnId, model: m.model }
        : null;
    case 'chat/delta':
      return isNonEmptyStr(m.turnId) && isStr(m.text) ? { type: 'chat/delta', turnId: m.turnId, text: m.text } : null;
    case 'chat/end':
      return isNonEmptyStr(m.turnId) && isEndStatus(m.status) && (m.error === null || isChatErrorKind(m.error))
        ? { type: 'chat/end', turnId: m.turnId, status: m.status, error: m.error }
        : null;
    default:
      return null;
  }
});

/** A key hint: one to four characters; anything else (a whole key by mistake) reads as no key. */
const hint = (v: unknown): string | null => (isStr(v) && v !== '' && v.length <= 4 ? v : null);

/** The panel's check of a `settings/chat-key-hints` reply. */
export function parseChatKeyHintsReply(raw: unknown): ChatKeyHintsReply {
  const r = isRec(raw) ? raw : {};
  return { anthropic: hint(r.anthropic), openai: hint(r.openai) };
}

const isValidateChatKeyKind = oneOf<ValidateChatKeyKind>(
  'invalid-key',
  'forbidden',
  'network',
  'unknown',
  'missing-key',
);

/** The panel's check of a `settings/validate-chat-key` reply; anything malformed reads as `unknown`. */
export function parseValidateChatKeyReply(raw: unknown): ValidateChatKeyReply {
  const unknown: ValidateChatKeyReply = { ok: false, kind: 'unknown' };
  if (!isRec(raw) || containsSecretField(raw)) return unknown;
  if (raw.ok === true) {
    const h = hint(raw.hint);
    return h === null ? unknown : { ok: true, hint: h };
  }
  return raw.ok === false && isValidateChatKeyKind(raw.kind) ? { ok: false, kind: raw.kind } : unknown;
}

const isNotesSetErrorKind = oneOf<NotesSetErrorKind>(
  'empty',
  'too-long',
  'not-text',
  'wrong-type',
  'unknown-meeting',
  'save-failed',
);

/** Replies never carry notes: anything with more than the listed fields reads as a failed save. */
const onlyKeys = (r: Rec, keys: readonly string[]) => Object.keys(r).every((k) => keys.includes(k));

/** The panel's check of a `context/set` reply (008); anything malformed reads as `save-failed`. */
export function parseNotesSetReply(raw: unknown): NotesSetReply {
  const failed: NotesSetReply = { ok: false, kind: 'save-failed' };
  if (!isRec(raw) || !onlyKeys(raw, ['ok', 'version', 'kind'])) return failed;
  if (raw.ok === true) return isNum(raw.version) ? { ok: true, version: raw.version } : failed;
  return raw.ok === false && isNotesSetErrorKind(raw.kind) ? { ok: false, kind: raw.kind } : failed;
}

/** The panel's check of a `context/remove` reply (008). */
export function parseNotesRemoveReply(raw: unknown): NotesRemoveReply {
  const failed: NotesRemoveReply = { ok: false, kind: 'save-failed' };
  if (!isRec(raw) || !onlyKeys(raw, ['ok', 'kind'])) return failed;
  if (raw.ok === true) return { ok: true };
  return raw.ok === false && (raw.kind === 'unknown-meeting' || raw.kind === 'save-failed')
    ? { ok: false, kind: raw.kind }
    : failed;
}

/** Wraps a parser with a drop counter for the receiving boundary. */
export function createReceiver<T>(parse: (raw: unknown) => T | null): {
  accept(raw: unknown): T | null;
  dropped(): number;
} {
  let dropped = 0;
  return {
    accept(raw) {
      const parsed = parse(raw);
      if (parsed === null) dropped += 1;
      return parsed;
    },
    dropped: () => dropped,
  };
}

/** The panel's check of a `settings/key-hint` reply: at most four characters, anything else reads as no key. */
export function parseKeyHintReply(raw: unknown): KeyHintReply {
  const hint = isRec(raw) ? raw.hint : null;
  return { hint: isStr(hint) && hint !== '' && hint.length <= 4 ? hint : null };
}
