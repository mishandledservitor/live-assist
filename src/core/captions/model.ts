// A kept turn of the meeting platform's own captions (013 data-model.md). Platform-free. Stored in IndexedDB
// `captionTurns` under ['meetingId', 'seq']; read only to build the captions file of a download. Nothing in
// src/core/chat, src/core/speakers or src/core/transcript may import this folder (decision 72, SC-006).

export interface StoredCaptionTurn {
  /** The meeting it belongs to; exactly one. */
  meetingId: string;
  /** From 1, in the order turns were first received; never reused in a meeting. */
  seq: number;
  /** When the turn first appeared, on the meeting clock; never below 0. */
  startMs: number;
  /** As the platform showed it. Renames are applied when a file is built, never stored here. */
  speakerName: string;
  /** The platform labelled the turn as the user's own; "cannot tell" is stored as false. */
  self: boolean;
  /** Everything the platform showed for the turn, latest version. Never empty. */
  text: string;
  schemaVersion: 1;
}
