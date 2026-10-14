// Meet bridge protocol (002 contracts/meet-bridge.md): content script ↔ service worker ↔ offscreen document.
// Validated at every receiving end with createReceiver: unknown or malformed messages are dropped and counted, and a
// parsed message is rebuilt from its known fields only. No message carries audio, keys or tokens. Caption text travels
// in one message only, `meet/caption-text` (013, page → offscreen, for storage; never used for naming), with its own
// validation and size limits; every other message with a `text` or `append` field is dropped whole (002 FR-004).
import type { CaptionsState } from '../platform/adapter';
import { containsSecretField } from './protocol';

/** The port the Meet content script opens; accepted only by the offscreen host. */
export const MEET_PORT_NAME = 'platform:meet';

/** Messages bigger than this (as JSON) are dropped. */
export const MAX_MESSAGE_BYTES = 2048;
/** 013: the longest `append` of one `meet/caption-text`; a longer change goes out as consecutive messages. */
export const MAX_APPEND_CHARS = 8000;
/** 013: the longest `meet/caption-text` message, as JSON characters. */
export const MAX_CAPTION_TEXT_MESSAGE = 16_384;
/** 013: the largest `keep`, and the longest text the adapter holds for one turn. */
export const MAX_TURN_CHARS = 1_000_000;
/** `observedAt` further than this from the receiver's clock is dropped. */
export const MAX_CLOCK_SKEW_MS = 3_600_000;
/**
 * 013: how far back a turn's `firstSeenAt` may lie. It is when the turn appeared, and stays the same while Meet keeps
 * writing into the turn (one person talking for hours), so it is not held to the hour that bounds the time of an event.
 * A day is longer than any meeting and still rejects a time in the wrong unit or from a clock that was never set.
 */
export const MAX_TURN_AGE_MS = 86_400_000;

/** Every speaker-names reason the Meet page and its adapter report (research R4, R12); shown in the status area. */
export const MEET_REASONS = Object.freeze({
  starting: 'Turning on Meet captions…',
  lobby: 'Join the call to get speaker names',
  cantTurnOn: "Couldn't turn on Meet captions",
  turnedOff: 'Captions were turned off',
  connecting: 'Connecting to the Meet page…',
  cantConnect: "Couldn't connect to the Meet page — reload the Meet tab",
  reloaded: 'The Meet page reloaded — reconnecting…',
});

const MAX_NAME = 200;
const MAX_KEY = 64;
const MAX_TITLE = 300;
const MAX_REASON = 300;

// ── Attach: service worker ↔ content script (one-shot messages) ──
// `showCaptions` / `show` is Settings → Show Meet captions (002 FR-028, FR-029): the only thing about captions the page
// is told besides enable and restore. Absent reads as hidden.
export type AttachMessage =
  | { type: 'meet/attach'; meetingId: string; showCaptions: boolean }
  | { type: 'meet/ready' }
  | { type: 'meet/detach' }
  /** The setting changed during the meeting. */
  | { type: 'meet/show-captions'; show: boolean };

/** Reply to `meet/ready`. */
export type ReadyReply = { attach: true; meetingId: string; showCaptions: boolean } | { attach: false };

// ── Port `platform:meet`: content script → offscreen ──
export type FromPage =
  | { type: 'meet/hello'; meetingId: string; pageId: string; inCall: boolean }
  | ({ type: 'meet/captions-state' } & CaptionsState)
  | { type: 'meet/caption'; turnKey: string; speakerName: string; self: boolean | null; observedAt: number }
  /**
   * 013: the one message that carries caption text, as a bounded difference: the receiver's text for the turn becomes
   * `text.slice(0, keep) + append` (specs/013-captions-download/contracts/captions-capture.md). For storage only.
   */
  | {
      type: 'meet/caption-text';
      turnKey: string;
      speakerName: string;
      self: boolean | null;
      firstSeenAt: number;
      keep: number;
      append: string;
    }
  | { type: 'meet/mute'; muted: boolean | null; observedAt: number }
  | { type: 'meet/metadata'; title?: string; meetingCode?: string }
  /** 002 FR-024: the in-call controls have been gone long enough — the user left the call. */
  | { type: 'meet/call-ended'; observedAt: number };

// ── Port `platform:meet`: offscreen → content script ──
export type ToPage = { type: 'meet/enable-captions' } | { type: 'meet/restore-captions' } | { type: 'meet/detach' };

// ── Validation ──
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isMeetingId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isOptionalFlag = (v: unknown): v is boolean | undefined => v === undefined || typeof v === 'boolean';
const isText =
  (max: number) =>
  (v: unknown): v is string =>
    typeof v === 'string' && v.trim() !== '' && v.length <= max;
const isName = isText(MAX_NAME);
const isKey = isText(MAX_KEY);
const isTitle = isText(MAX_TITLE);
const isReason = isText(MAX_REASON);

function size(raw: unknown): number {
  try {
    return JSON.stringify(raw)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * The checks every bridge message but `meet/caption-text` passes first: an object, small, no secret-looking field and
 * neither of the two fields that could hold caption text.
 */
function envelope(raw: unknown): Rec | null {
  if (!isRec(raw) || 'text' in raw || 'append' in raw || containsSecretField(raw)) return null;
  return size(raw) <= MAX_MESSAGE_BYTES ? raw : null;
}

type CaptionTextMessage = Extract<FromPage, { type: 'meet/caption-text' }>;

/** 013: the one message with caption text, on its own path (contracts/captions-capture.md "Bridge message"). */
function parseCaptionText(raw: Rec, now: number): CaptionTextMessage | null {
  if ('text' in raw || containsSecretField(raw) || size(raw) > MAX_CAPTION_TEXT_MESSAGE) return null;
  const { turnKey, speakerName, self, firstSeenAt, keep, append } = raw;
  if (!isKey(turnKey) || !isName(speakerName) || !(self === null || typeof self === 'boolean')) return null;
  // When the turn first appeared: at most the clock skew ahead of the receiver, at most a day behind it.
  if (!isNum(firstSeenAt) || firstSeenAt - now > MAX_CLOCK_SKEW_MS || now - firstSeenAt > MAX_TURN_AGE_MS) return null;
  if (!isNum(keep) || !Number.isInteger(keep) || keep < 0 || keep > MAX_TURN_CHARS) return null;
  if (typeof append !== 'string' || append.length > MAX_APPEND_CHARS) return null;
  return { type: 'meet/caption-text', turnKey, speakerName, self, firstSeenAt, keep, append };
}

function parseCaptionsState(m: Rec): CaptionsState | null {
  switch (m.state) {
    case 'on':
      return { state: 'on' };
    case 'starting':
    case 'unavailable':
    case 'off-by-user':
      return isReason(m.reason) ? { state: m.state, reason: m.reason } : null;
    default:
      return null;
  }
}

/** Content script → offscreen. `now` is the receiver's clock, for the `observedAt` skew check. */
export function parseFromPage(raw: unknown, now: number): FromPage | null {
  const timely = (t: unknown): t is number => isNum(t) && Math.abs(t - now) <= MAX_CLOCK_SKEW_MS;
  if (isRec(raw) && raw.type === 'meet/caption-text') return parseCaptionText(raw, now);
  const m = envelope(raw);
  if (!m) return null;
  switch (m.type) {
    case 'meet/hello':
      return isMeetingId(m.meetingId) && isKey(m.pageId) && typeof m.inCall === 'boolean'
        ? { type: 'meet/hello', meetingId: m.meetingId, pageId: m.pageId, inCall: m.inCall }
        : null;
    case 'meet/captions-state': {
      const state = parseCaptionsState(m);
      return state ? { type: 'meet/captions-state', ...state } : null;
    }
    case 'meet/caption':
      return isKey(m.turnKey) &&
        isName(m.speakerName) &&
        (m.self === null || typeof m.self === 'boolean') &&
        timely(m.observedAt)
        ? {
            type: 'meet/caption',
            turnKey: m.turnKey,
            speakerName: m.speakerName,
            self: m.self,
            observedAt: m.observedAt,
          }
        : null;
    case 'meet/mute':
      return (m.muted === null || typeof m.muted === 'boolean') && timely(m.observedAt)
        ? { type: 'meet/mute', muted: m.muted, observedAt: m.observedAt }
        : null;
    case 'meet/call-ended':
      return timely(m.observedAt) ? { type: 'meet/call-ended', observedAt: m.observedAt } : null;
    case 'meet/metadata': {
      if (m.title !== undefined && !isTitle(m.title)) return null;
      if (m.meetingCode !== undefined && !isKey(m.meetingCode)) return null;
      return {
        type: 'meet/metadata',
        ...(m.title !== undefined && { title: m.title }),
        ...(m.meetingCode !== undefined && { meetingCode: m.meetingCode }),
      };
    }
    default:
      return null;
  }
}

/** Offscreen → content script. */
export function parseToPage(raw: unknown): ToPage | null {
  const m = envelope(raw);
  switch (m?.type) {
    case 'meet/enable-captions':
    case 'meet/restore-captions':
    case 'meet/detach':
      return { type: m.type };
    default:
      return null;
  }
}

/** Service worker ↔ content script one-shot messages. */
export function parseAttach(raw: unknown): AttachMessage | null {
  const m = envelope(raw);
  switch (m?.type) {
    case 'meet/attach':
      return isMeetingId(m.meetingId) && isOptionalFlag(m.showCaptions)
        ? { type: 'meet/attach', meetingId: m.meetingId, showCaptions: m.showCaptions === true }
        : null;
    case 'meet/show-captions':
      return typeof m.show === 'boolean' ? { type: 'meet/show-captions', show: m.show } : null;
    case 'meet/ready':
      return { type: 'meet/ready' };
    case 'meet/detach':
      return { type: 'meet/detach' };
    default:
      return null;
  }
}

export function parseReadyReply(raw: unknown): ReadyReply | null {
  if (!isRec(raw)) return null;
  if (raw.attach === false) return { attach: false };
  return raw.attach === true && isMeetingId(raw.meetingId) && isOptionalFlag(raw.showCaptions)
    ? { attach: true, meetingId: raw.meetingId, showCaptions: raw.showCaptions === true }
    : null;
}
