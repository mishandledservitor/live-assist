// The Meet page's half of the bridge (002 contracts/meet-bridge.md): once attached, it opens the `platform:meet` port,
// says hello with the page state, and serves the offscreen document's requests. It never talks to anything but the
// extension (the content script hands it the port). Caption text leaves the page in one message only,
// `meet/caption-text` (013): the text of turns that appear while captions are followed, as the difference from what
// was sent before. Every other message carries names, states and times, as before.
import {
  MAX_APPEND_CHARS,
  MAX_CAPTION_TEXT_MESSAGE,
  parseToPage,
  type FromPage,
} from '../../core/messaging/meet-bridge';
import { observeCallPresence } from './call-presence';
import { CaptionsControl } from './captions-control';
import { observeCaptions, type CaptionTextUpdate } from './caption-observer';
import { inCall, meetingCode, meetingTitle } from './locators';
import { observeMute } from './mute-observer';

/** The slice of chrome.runtime.Port the agent uses. */
export interface PagePort {
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  disconnect(): void;
}

export interface PageAgentDeps {
  doc: Document;
  /** Opens a new `platform:meet` port. */
  connect(): PagePort;
  now?: () => number;
  /** Prefixes turn keys; a reloaded page (a new agent) gets a new one. */
  pageId?: string;
}

export interface PageAgent {
  attach(meetingId: string): void;
  detach(): void;
  /**
   * Settings → Show Meet captions (002 FR-028, FR-029), from the service worker: applies at once, attached or not, and
   * is kept for the next attach. Nothing is sent and nothing but the hiding changes.
   */
  showCaptions(show: boolean): void;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

/** Length of what two texts share at their start, never ending inside a surrogate pair. */
function commonPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let n = 0;
  while (n < max && a.charCodeAt(n) === b.charCodeAt(n)) n += 1;
  return n > 0 && isHighSurrogate(a.charCodeAt(n - 1)) ? n - 1 : n;
}

/** Where a piece of `text` starting at `from` and at most `size` long ends, never inside a surrogate pair. */
function pieceEnd(text: string, from: number, size: number): number {
  const end = Math.min(text.length, from + size);
  // A piece is never emptied to avoid the split: one character always goes out.
  return end < text.length && end - from > 1 && isHighSurrogate(text.charCodeAt(end - 1)) ? end - 1 : end;
}

export function createPageAgent(deps: PageAgentDeps): PageAgent {
  const { doc } = deps;
  const now = deps.now ?? (() => Date.now());
  const pageId = deps.pageId ?? crypto.randomUUID().slice(0, 8);
  let port: PagePort | null = null;
  let captionObserver: { stop(): void } | null = null;
  /** Mute is followed for as long as the page is attached (research R7): the gate needs every change. */
  let muteObserver: { stop(): void } | null = null;
  let callPresence: { stop(): void } | null = null;

  const send = (m: FromPage) => {
    try {
      port?.postMessage(m);
    } catch {
      // The other end went away; onDisconnect cleans up.
    }
  };

  const control = new CaptionsControl({ doc, now, onState: (s) => send({ type: 'meet/captions-state', ...s }) });

  /** 013: turn numbers for the page's life, so an observer created after a restore never reuses a key. */
  let turnNumber = 0;
  /** 013: per kept turn, the text the offscreen side has. Forgotten with the port: the next message is whole. */
  const sentText = new Map<string, string>();

  /** 013: a kept turn's text changed. Posts only the changed tail, in pieces the bridge accepts. */
  const sendText = (update: CaptionTextUpdate) => {
    const { text, ...turn } = update;
    const sent = sentText.get(turn.turnKey);
    if (sent === text) return;
    let keep = commonPrefix(sent ?? '', text);
    do {
      let end = pieceEnd(text, keep, MAX_APPEND_CHARS);
      let message: FromPage = { type: 'meet/caption-text', ...turn, keep, append: text.slice(keep, end) };
      // Text that grows when written as JSON (quotes, control characters) goes out in smaller pieces.
      while (end - keep > 1 && JSON.stringify(message).length > MAX_CAPTION_TEXT_MESSAGE) {
        end = pieceEnd(text, keep, Math.ceil((end - keep) / 2));
        message = { ...message, append: text.slice(keep, end) };
      }
      send(message);
      keep = end;
    } while (keep < text.length);
    sentText.set(turn.turnKey, text);
  };

  const stopObserving = () => {
    captionObserver?.stop();
    captionObserver = null;
  };

  const enable = () => {
    control.enable();
    captionObserver ??= observeCaptions({
      doc,
      pageId,
      now,
      onActivity: (a) => send({ type: 'meet/caption', ...a }),
      onText: sendText,
      nextTurnNumber: () => (turnNumber += 1),
    });
  };

  const restore = () => {
    stopObserving();
    control.restore();
  };

  const stopMute = () => {
    muteObserver?.stop();
    muteObserver = null;
    // Leaving the call is followed for as long as the page is attached, like mute (FR-024).
    callPresence?.stop();
    callPresence = null;
  };

  const close = () => {
    stopObserving();
    stopMute();
    const open = port;
    port = null;
    open?.disconnect();
  };

  return {
    attach(meetingId) {
      if (port) return;
      const opened = deps.connect();
      port = opened;
      // Whoever reads this port has none of the text sent on an earlier one.
      sentText.clear();
      opened.onMessage.addListener((raw) => {
        if (port !== opened) return;
        const m = parseToPage(raw);
        if (m?.type === 'meet/enable-captions') enable();
        else if (m?.type === 'meet/restore-captions') restore();
        else if (m?.type === 'meet/detach') close();
      });
      opened.onDisconnect.addListener(() => {
        if (port !== opened) return;
        port = null;
        stopMute();
        // The offscreen document is gone (meeting over or crashed): never leave captions hidden or forced on.
        restore();
      });
      send({ type: 'meet/hello', meetingId, pageId, inCall: inCall(doc).value });
      send({ type: 'meet/captions-state', ...control.state() });
      muteObserver = observeMute({ doc, now, onReading: (r) => send({ type: 'meet/mute', ...r }) });
      callPresence = observeCallPresence({
        doc,
        now,
        onLeft: (observedAt) => send({ type: 'meet/call-ended', observedAt }),
      });
      const title = meetingTitle(doc).value?.slice(0, 300) ?? null;
      const code = meetingCode(doc.location).value;
      send({ type: 'meet/metadata', ...(title !== null && { title }), ...(code !== null && { meetingCode: code }) });
    },
    detach: close,
    showCaptions: (show) => control.setShown(show),
  };
}
