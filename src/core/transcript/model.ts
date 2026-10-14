// Transcript data model (specs/001-capture-live-transcript/data-model.md). Platform-free.

/**
 * The audio a line came from: always the one locally mixed stream (tab + gated mic, constitution v1.1.0).
 * Records from pre-2026-10-08 development builds may carry 'mic'/'tab'; nothing branches on the value.
 */
export type StreamId = 'mixed';

/** 001 ships 'generic' only; 'meet' arrives with 002. */
export type PlatformId = 'generic' | 'meet';

export type LanguageMode = { kind: 'auto' } | { kind: 'fixed'; code: string };

/**
 * Confirmed = caption (including the platform's label for the user, from 002) | manual; fallback = a guess, never
 * shown as a name (Principle II). 001 writes only 'fallback'.
 */
export type LabelSource = 'fallback' | 'caption' | 'manual';

/** A meeting-wide rename of one speaker key (002 research R9). `remembered` = copied from Settings. */
export interface SpeakerRename {
  /** 1–60 chars, trimmed. */
  name: string;
  origin: 'manual' | 'remembered';
}

/** Derived from a segment's stored fields (src/core/transcript/labels.ts); never stored on the segment. */
export type SpeakerKey = 'self' | 'others' | `caption:${string}`;

/**
 * Keys that can be renamed everywhere. Not `others`: since design decision 29 it holds the user's own lines and
 * everyone the captions could not name, so a rename would present a guess as a confirmed name (red-team 2026-10-08,
 * decision 35). An "Others" line is corrected with a single-line override only.
 */
export type RenamableKey = Exclude<SpeakerKey, 'others'>;

export function isRenamableKey(key: SpeakerKey): key is RenamableKey {
  return key !== 'others';
}

/** `call-ended`: the user left the Meet call (002 FR-024, design decision 36). */
export type EndReason = 'user-stop' | 'tab-closed' | 'tab-navigated' | 'call-ended' | 'failed' | 'crashed';

/**
 * 012: what a Transcripts row needs from a meeting's lines (data-model.md "Meeting.summary"), cached on the stopped
 * meeting's own record so the list reads the lines once. Derived, never sent anywhere.
 */
export interface MeetingSummary {
  /** SUMMARY_VERSION (src/core/history/meeting-summary.ts); any other value reads as no summary. */
  v: 1;
  /** Confirmed display labels in order of first appearance; "Others" is never one. */
  names: string[];
  /** How many lines 007's transcript file would hold; 0 means nothing to download. */
  fileLines: number;
  /** The largest endMs among the lines, relative to the meeting start; null with no line. */
  lastLineEndMs: number | null;
}

export interface Meeting {
  id: string;
  /** Epoch ms; meeting clock zero for every segment offset. */
  startedAt: number;
  endedAt: number | null;
  endReason: EndReason | null;
  source: { url: string; title: string; platform: PlatformId };
  languageMode: LanguageMode;
  /** Snapshot of settings at Start. */
  userName: string;
  /** 002: renames by speaker key. Absent on v1 records (normalised to {} on read). */
  speakerRenames: Partial<Record<SpeakerKey, SpeakerRename>>;
  /** 2 for meetings created from 002 on. */
  schemaVersion: 1 | 2;
  /** 012: row details derived from the lines; absent until the stopped meeting is first listed. */
  summary?: MeetingSummary;
  /**
   * 013: the meeting has at least one stored caption turn. Set with the first one, never unset; absent on every
   * meeting without kept captions. The panel learns this much and never what the captions say.
   */
  hasCaptions?: true;
}

export interface SegmentWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSegment {
  /** `${meetingId}:${stream}:${seq}` — deterministic so a retried write is idempotent. */
  id: string;
  meetingId: string;
  stream: StreamId;
  seq: number;
  startMs: number;
  endMs: number;
  text: string;
  language: string | null;
  /** The attributed label: the meeting userName (Meet's self label), a caption name, or "Others". Never renamed. */
  speakerLabel: string;
  labelSource: LabelSource;
  /** 002: the caption name as Meet showed it when labelSource is 'caption' ("You" for the user's own lines), else null. */
  captionName: string | null;
  /** 002: the attributed caption turn is Meet's label for the user. */
  captionSelf: boolean;
  /** 002: a single-line override (1–60 chars trimmed); survives renames. */
  labelOverride: string | null;
  words: SegmentWord[];
  timing: 'words' | 'estimated';
  sessionId: string;
  createdAt: number;
  /** Absent on v1 records (normalised to 1 on read). */
  schemaVersion: 1 | 2;
  /**
   * Real trace 2026-10-08 (design decision 37, 002 FR-026): the name is not settled yet, so the panel shows a
   * placeholder; `speakerLabel` stays "Others" meanwhile. Set only while names are active; absent = false; dropped
   * on read from storage.
   */
  labelPending?: boolean;
}

export function segmentId(meetingId: string, stream: StreamId, seq: number): string {
  return `${meetingId}:${stream}:${seq}`;
}

export function isConfirmedLabel(source: LabelSource): boolean {
  return source !== 'fallback';
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `mm:ss` below one hour, `h:mm:ss` from one hour; matches the `[mm:ss]` citations of 003/004. */
export function formatOffset(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`;
}
