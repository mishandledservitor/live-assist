// What the side panel needs to run and show meetings, behind one interface so components are tested with fakes.
import type { StoredCaptionTurn } from '../../core/captions/model';
import {
  LIVE_PORT_NAME,
  parseLabelName,
  type Command,
  type LabelCommand,
  type StartError,
  type StartResult,
  type StopResult,
} from '../../core/messaging/protocol';
import { showsOnMain } from '../../core/history/main-view';
import { isRenamableKey, type LanguageMode, type RenamableKey } from '../../core/transcript/model';
import type { MainViewStore } from '../../storage/main-view-store';
import type { MeetingRepo } from '../../storage/meeting-repo';
import type { LiveApi } from './hooks/useLive';

export interface MeetingApi {
  /** Starts transcribing the tab this panel belongs to. */
  start(language: LanguageMode): Promise<StartResult>;
  stop(): Promise<StopResult>;
  /** Real deletion of a stored meeting and its lines (FR-029, Principle I). */
  deleteMeeting(id: string): Promise<void>;
  /**
   * 013: the meeting's stored caption turns, read at the moment of a download; [] when it has none. Rejects when
   * storage cannot be read. The caller builds one file from them and keeps nothing.
   */
  captionTurns(meetingId: string): Promise<StoredCaptionTurn[]>;
  /**
   * 002 US4: renames every line of a speaker (FR-018); renaming back to `original` removes the rename. A caption
   * name's rename is also remembered for future meetings (FR-022). Rejects an invalid name without sending anything.
   */
  renameSpeaker(target: EditTarget, speaker: RenameTarget, name: string): Promise<void>;
  /** 002 US4: overrides one line's speaker (FR-019); null clears the override. */
  overrideLine(target: EditTarget, segmentId: string, name: string | null): Promise<void>;
  /** 012: the meeting the main view showed was deleted; the main view shows no stored meeting until the next Start. */
  clearMainView(): Promise<void>;
  /** 012: the main view was cleared, here or in another window's panel; returns an unsubscriber. */
  onMainViewCleared(listener: () => void): () => void;
}

/** Which meeting is edited, and whether it is running (then edits go to the offscreen document, its only writer). */
export interface EditTarget {
  meetingId: string;
  live: boolean;
}

export interface RenameTarget {
  /** Never `others`: "Others" lines are overridden one at a time (decision 35). */
  key: RenamableKey;
  /** The label the speaker's lines carry without a rename. */
  original: string;
  /** Meet's caption name for a `caption:` key; remembered names are keyed by it. */
  captionName: string | null;
}

export interface LivePort {
  onMessage: { addListener(l: (m: unknown) => void): void };
  postMessage(message: unknown): void;
  onDisconnect: { addListener(l: () => void): void };
  disconnect(): void;
}

export interface MeetingApiDeps {
  activeTabId(): Promise<number | undefined>;
  sendCommand(command: Command): Promise<unknown>;
  repo(): Promise<
    Pick<
      MeetingRepo,
      'deleteMeeting' | 'latestMeeting' | 'listSegments' | 'listCaptionTurns' | 'setSpeakerRename' | 'setLabelOverride'
    >
  >;
  connect(name: string): LivePort;
  /** SettingsApi.rememberSpeakerName (002 FR-022). */
  rememberSpeakerName(captionName: string, displayName: string): Promise<void>;
  /** 012: the moment the main view was last cleared (FR-026). */
  mainView: Pick<MainViewStore, 'clearedAt' | 'clear' | 'onChange'>;
  now(): number;
}

function validName(name: string): string {
  const parsed = parseLabelName(name);
  if (parsed === null) throw new Error('A name is 1–60 characters on one line.');
  return parsed;
}

const START_ERRORS: readonly StartError[] = [
  'settings-incomplete',
  'not-invoked',
  'tab-not-capturable',
  'already-running',
  'offscreen-failed',
];

function asStartResult(v: unknown): StartResult {
  const r = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  if (r.ok === true && typeof r.meetingId === 'string') return { ok: true, meetingId: r.meetingId };
  if (r.ok === false && START_ERRORS.includes(r.error as StartError)) {
    const out: StartResult = { ok: false, error: r.error as StartError };
    if (typeof r.runningTabTitle === 'string') out.runningTabTitle = r.runningTabTitle;
    return out;
  }
  return { ok: false, error: 'offscreen-failed' };
}

export function createMeetingApi(deps: MeetingApiDeps): MeetingApi & LiveApi {
  /** The open live port, if any: label edits for a running meeting go over it. */
  let livePort: LivePort | null = null;

  /** Sends a command to the running meeting; false when no port is open (the meeting is not running here). */
  const sendLive = (c: LabelCommand): boolean => {
    if (!livePort) return false;
    livePort.postMessage(c);
    return true;
  };

  return {
    async start(language) {
      const tabId = await deps.activeTabId();
      if (tabId === undefined) return { ok: false, error: 'tab-not-capturable' };
      try {
        return asStartResult(await deps.sendCommand({ type: 'meeting/start', tabId, language }));
      } catch {
        return { ok: false, error: 'offscreen-failed' };
      }
    },
    async stop() {
      try {
        await deps.sendCommand({ type: 'meeting/stop' });
      } catch {
        // Nothing running to answer; the panel falls back to stored data either way.
      }
      return { ok: true };
    },
    async deleteMeeting(id) {
      await (await deps.repo()).deleteMeeting(id);
    },
    async captionTurns(meetingId) {
      return (await deps.repo()).listCaptionTurns(meetingId);
    },
    async renameSpeaker(target, speaker, raw) {
      // "Others" is never renamed everywhere (red-team 2026-10-08, decision 35): it holds the user's lines too.
      if (!isRenamableKey(speaker.key)) throw new Error('"Others" is corrected one line at a time.');
      const name = validName(raw);
      const command: LabelCommand = {
        type: 'labels/rename',
        meetingId: target.meetingId,
        speakerKey: speaker.key,
        name,
      };
      if (!(target.live && sendLive(command))) {
        const entry = name === speaker.original ? null : ({ name, origin: 'manual' } as const);
        await (await deps.repo()).setSpeakerRename(target.meetingId, speaker.key, entry);
      }
      // Only caption names are remembered: the user's own name lives in settings.
      if (speaker.key.startsWith('caption:') && speaker.captionName)
        await deps.rememberSpeakerName(speaker.captionName, name);
    },
    async overrideLine(target, segmentId, raw) {
      const name = raw === null ? null : validName(raw);
      const command: LabelCommand = { type: 'labels/override', meetingId: target.meetingId, segmentId, name };
      if (target.live && sendLive(command)) return;
      await (await deps.repo()).setLabelOverride(target.meetingId, segmentId, name);
    },
    connect(onEvent, onDisconnect) {
      const port = deps.connect(LIVE_PORT_NAME);
      livePort = port;
      port.onMessage.addListener(onEvent);
      port.onDisconnect.addListener(() => {
        if (livePort === port) livePort = null;
        onDisconnect();
      });
      return () => {
        if (livePort === port) livePort = null;
        port.disconnect();
      };
    },
    // 012 FR-020, FR-026: after the meeting shown on the main view was deleted, no stored meeting shows there until
    // one is started later. A marker that cannot be read counts as absent: an error never hides a transcript.
    async latestStored() {
      const repo = await deps.repo();
      const meeting = await repo.latestMeeting();
      if (!meeting) return null;
      const clearedAt = await deps.mainView.clearedAt().catch(() => null);
      if (!showsOnMain(meeting, clearedAt)) return null;
      return { meeting, segments: await repo.listSegments(meeting.id) };
    },
    async clearMainView() {
      await deps.mainView.clear(deps.now());
    },
    onMainViewCleared(listener) {
      return deps.mainView.onChange(listener);
    },
  };
}
