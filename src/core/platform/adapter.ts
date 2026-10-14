// Meeting-platform adapter contract, revision 3 (specs/002-meet-speaker-names/contracts/platform-adapter.md; revision 3
// adds captions.subscribeText, specs/013-captions-download/contracts/captions-capture.md).
// Core never touches a platform's DOM (Constitution V).
import type { PlatformId } from '../transcript/model';

export type { PlatformId };

export interface Unsupported {
  supported: false;
  /** Shown in the status area. */
  reason: string;
}

/**
 * One caption turn showed activity. Names and timing only — never the caption text (FR-004, research R5): naming
 * works from this alone. The text of kept turns travels separately, as CaptionText, for storage only (013).
 */
export interface CaptionActivity {
  /** Stable per caption item for the page's life. */
  turnKey: string;
  /** Whitespace-normalised, as the platform shows it. */
  speakerName: string;
  /** The platform labels this turn as the user's own (how the user's lines are named, decision 29); null = cannot tell. */
  self: boolean | null;
  /** Epoch ms. */
  observedAt: number;
}

/** 013: a kept caption turn and its whole text. For storage only; naming never sees it. */
export interface CaptionText {
  /** As CaptionActivity.turnKey. */
  turnKey: string;
  speakerName: string;
  self: boolean | null;
  /** Epoch ms when the turn first appeared. */
  firstSeenAt: number;
  /** The turn's whole text now; may be '' before the first words. */
  text: string;
}

export type CaptionsState =
  /** e.g. "Turning on Meet captions…", "Join the call to get speaker names". */
  | { state: 'starting'; reason: string }
  | { state: 'on' }
  /** Couldn't turn on / can't read / page not connected. */
  | { state: 'unavailable'; reason: string }
  /** "Captions were turned off". */
  | { state: 'off-by-user'; reason: string };

export interface MuteReading {
  /** null = cannot be read right now. */
  muted: boolean | null;
  /** Epoch ms when the page state was observed. */
  observedAt: number;
}

export type CaptionsCapability =
  | Unsupported
  | {
      supported: true;
      /** Turn on if off and hide the overlay, remembering the prior state. Resolves once the request is under way. */
      enable(): Promise<void>;
      /** Put captions and overlay back as they were before enable(); idempotent. */
      restore(): Promise<void>;
      subscribe(listener: (e: CaptionActivity) => void): () => void;
      /** Replays the current state on subscribe. */
      subscribeState(listener: (s: CaptionsState) => void): () => void;
      /**
       * 013: kept turns with their whole text, each time it changes. Never replays; never fires for turns from before
       * it could see them.
       */
      subscribeText(listener: (t: CaptionText) => void): () => void;
    };

export type MuteCapability =
  | Unsupported
  | {
      supported: true;
      current(): MuteReading;
      subscribe(listener: (r: MuteReading) => void): () => void;
    };

/** 002 FR-024 (design decision 36): the platform says the user left the call. */
export interface CallCapability {
  /** Called once, with the epoch ms when the call was seen gone. */
  subscribeEnded(listener: (observedAt: number) => void): () => void;
}

export interface PlatformAdapter {
  readonly id: PlatformId;
  /** Pure URL check; no DOM. */
  matches(url: URL): boolean;
  captions: CaptionsCapability;
  mute: MuteCapability;
  /** Absent when the platform cannot tell that the user left (every site but Meet). */
  call?: CallCapability;
  metadata(): Promise<{ title?: string; meetingCode?: string }>;
  /** Idempotent; detaches from the page, restores nothing by itself. */
  dispose(): void;
}

export interface PlatformRegistry {
  /** First adapter whose matches() is true; GenericAdapter always matches last. */
  forUrl(url: URL): PlatformAdapter;
}
