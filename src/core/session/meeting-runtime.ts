// One meeting from Start to Stop (plan "MeetingRuntime"): one audio source (tab and mic as paired frames, gated by the
// mute gate and mixed here) and one transcription session (constitution v1.1.0, FR-008), segments persisted as they arrive and broadcast
// only after they are stored (FR-016, data-model.md). Everything outside core is injected: provider, store, adapter,
// clock and the audio source. On a platform with captions it also keeps their text (013): the adapter's text events go
// to a CaptionLog and from there to the store, and to nothing else here — not the attributor, the watchdog, the
// segment builder, the session or a live event.
import { CaptionLog } from '../captions/caption-log';
import type { StoredCaptionTurn } from '../captions/model';
import { createLogger, type Logger } from '../log';
import type { LabelCommand, LiveEvent, PartialLine, SpeakerNameMapping } from '../messaging/protocol';
import type { CaptionsState, PlatformAdapter } from '../platform/adapter';
import { SpeakerAttributor, type LabelFields } from '../speakers/speaker-attributor';
import { CaptionsWatchdog, WATCHDOG_REASON } from '../speakers/watchdog';
import {
  CALL_ENDED_REASON,
  initialStatus,
  reduceStatus,
  type StatusEvent,
  type StatusSnapshot,
} from '../status/status';
import type { TranscriptionProvider } from '../transcription/provider';
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
import { normaliseName, speakerKey } from '../transcript/labels';
import { DETAIL_TIMEOUT_MS, SegmentBuilder } from '../transcript/segment-builder';
import { mixFrames, MuteGate, type GateFrame, type GateMode } from './mute-gate';
import { ReconnectingSession, type ReconnectingEvent } from './reconnecting-session';

/** Length of one audio frame (100 ms at 16 kHz, research R5). */
const FRAME_MS = 100;
/** How long the end waits for the page to restore captions; a closed tab never answers (002 T036). */
export const RESTORE_TIMEOUT_MS = 1000;
/** 013: how long the end waits for the last caption write; a store that never answers does not hold up the end. */
export const CAPTIONS_CLOSE_TIMEOUT_MS = 2000;

export interface FrameSourceHandle {
  stop(): Promise<void>;
}

/** Whether the microphone is part of the mix; when not, the mix is the tab alone and `error` says why. */
export type MicInput = { ok: true } | { ok: false; error: unknown };

/** The tab + mic capture (src/audio/capture.ts captureMixed in the browser). */
export interface MixedSourceHandle extends FrameSourceHandle {
  readonly mic: MicInput;
}

/** One 100 ms PCM16 frame of the tab and of the mic, over the same samples; `mic` is null without a mic. */
export type FramePairListener = (tab: Int16Array, mic: Int16Array | null) => void;

/**
 * Opens the tab (rejecting if it cannot) and the mic, and calls onFrames with paired 100 ms frames. The runtime gates
 * the mic (002 mute gate) and mixes them into the one stream (constitution v1.1.0 I: the mic is silenced before
 * mixing, so muted audio never reaches the session or the reconnect replay buffer).
 */
export type MixedFrameSource = (onFrames: FramePairListener) => Promise<MixedSourceHandle>;

/** What the runtime writes; MeetingRepo satisfies it. */
export interface MeetingStore {
  createMeeting(meeting: Meeting): Promise<void>;
  appendSegment(segment: TranscriptSegment): Promise<void>;
  /** 002: a stored segment's attribution changed (same id, whole record). */
  updateSegment(segment: TranscriptSegment): Promise<void>;
  /** 002: a meeting-level rename by speaker key; null removes it. */
  setSpeakerRename(meetingId: string, key: SpeakerKey, entry: SpeakerRename | null): Promise<void>;
  endMeeting(id: string, endedAt: number, reason: EndReason): Promise<void>;
  /**
   * 013: writes the meeting's changed caption turns; false = the meeting is gone or has ended (research R7). A store
   * without it keeps no captions: the runtime then makes no caption log and never listens for caption text.
   */
  putCaptionTurns?(meetingId: string, turns: readonly StoredCaptionTurn[]): Promise<boolean>;
}

export interface MeetingRuntimeDeps {
  provider: TranscriptionProvider;
  store: MeetingStore;
  adapter: PlatformAdapter;
  /** Epoch ms. */
  now(): number;
  /** Defaults to the console through the redacting logger. */
  log?: Logger;
  /** Sees each frame pair as it enters the mixer, mic already gated (SC-004 tests and the e2e mic tap). */
  onMixerInput?(frame: GateFrame): void;
}

export interface BeginParams {
  meetingId: string;
  source: { url: string; title: string };
  language: LanguageMode;
  /** Already planned (≤50 × ≤20 chars). */
  keyterms: readonly string[];
  /** Snapshotted into the meeting; 002 shows it for the platform's own caption label for the user. */
  userName: string;
  audio: MixedFrameSource;
  /** 002: Settings → Remembered names at Start (FR-022). */
  speakerNameMappings?: readonly SpeakerNameMapping[];
  /** Design decision 41 (001 FR-011b): leave out fillers and false starts. Absent = on. */
  cleanTranscript?: boolean;
}

export type LiveSnapshot = Omit<Extract<LiveEvent, { type: 'live/snapshot' }>, 'type'>;

/** The only stream: tab and mic mixed locally (data-model.md). */
const STREAM: StreamId = 'mixed';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const TAB_ONLY = 'Only the meeting tab is being transcribed; your own speech is not.';

/** Plain-language mic problem with the fix (FR-020, US3-5). */
export function micProblem(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return `Microphone permission needed. ${TAB_ONLY}`;
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return `No microphone found — connect one and press Start again. ${TAB_ONLY}`;
  return `The microphone could not be opened (${errorText(e)}). ${TAB_ONLY}`;
}

export class MeetingRuntime {
  private meeting: Meeting | null = null;
  private status: StatusSnapshot = initialStatus();
  private segments: TranscriptSegment[] = [];
  private partial = '';
  private builder: SegmentBuilder | null = null;
  private session: ReconnectingSession | null = null;
  private source: MixedSourceHandle | null = null;
  private gate: MuteGate | null = null;
  /** The gate's last status event, re-applied once the mic is known to be part of the mix. */
  private muteStatus: StatusEvent | null = null;
  private attributor: SpeakerAttributor | null = null;
  private captionsEnabled = false;
  /** The adapter's last captions state; caption activity is trusted only while it is `on` (constitution IV). */
  private captionsState: CaptionsState | null = null;
  private watchdog: CaptionsWatchdog | null = null;
  /** 013: the meeting's kept caption turns on their way to the store; null when nothing keeps them. */
  private captionLog: CaptionLog | null = null;
  private readonly unsubscribes: (() => void)[] = [];
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private listeners = new Set<(e: LiveEvent) => void>();
  private writes: Promise<void> = Promise.resolve();
  private ended = false;
  private resolveEnded: (reason: EndReason) => void = () => {};
  private readonly endedPromise = new Promise<EndReason>((r) => (this.resolveEnded = r));

  private readonly log: Logger;

  constructor(private readonly deps: MeetingRuntimeDeps) {
    this.log = deps.log ?? createLogger('runtime');
  }

  /** Resolves once the meeting has ended and its end is stored, however it ended. */
  whenEnded(): Promise<EndReason> {
    return this.endedPromise;
  }

  subscribe(listener: (e: LiveEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): LiveSnapshot {
    const partials: PartialLine[] = this.partial === '' ? [] : [{ stream: STREAM, text: this.partial }];
    return { meeting: this.meeting, segments: [...this.segments], partials, status: this.status };
  }

  /** Starts the meeting. Rejects (after recording the meeting as failed) if the tab cannot be transcribed. */
  async begin(p: BeginParams): Promise<Meeting> {
    const meeting: Meeting = {
      id: p.meetingId,
      startedAt: this.deps.now(),
      endedAt: null,
      endReason: null,
      source: { ...p.source, platform: this.deps.adapter.id },
      languageMode: p.language,
      userName: p.userName,
      speakerRenames: {},
      schemaVersion: 2,
    };
    this.meeting = meeting;
    await this.deps.store.createMeeting(meeting);
    this.setStatus({ type: 'capture', state: 'starting' });
    this.setStatus({ type: 'adapter', captions: this.deps.adapter.captions, mute: this.deps.adapter.mute });
    this.followCaptions(meeting, p.speakerNameMappings ?? []);
    this.followCall();

    try {
      await this.startTranscription(p);
    } catch (e) {
      this.setStatus({
        type: 'capture',
        state: 'failed',
        reason: `The meeting tab could not be transcribed: ${errorText(e)}`,
      });
      await this.end('failed');
      throw e;
    }
    this.setStatus({ type: 'capture', state: 'active' });
    return meeting;
  }

  /** Ends the meeting: no frame is sent once this is called (FR-025); pending lines are stored. */
  async end(reason: EndReason): Promise<void> {
    if (this.ended || !this.meeting) return;
    this.ended = true;
    const endedAt = this.deps.now();
    // Held frames are dropped: nothing is sent once the end is called (FR-025).
    this.gate?.dispose();
    for (const t of this.timers) clearTimeout(t);
    this.session?.close();
    for (const s of this.builder?.flush() ?? []) this.store(s);
    await this.source?.stop().catch(() => undefined);
    // Lines still pending get their final attribution, stored before the meeting is marked ended.
    await this.writes;
    this.attributor?.finish();
    this.attributor?.dispose();
    this.watchdog?.dispose();
    await this.restorePlatform();
    // A failed transcription keeps showing why it failed (FR-022).
    if (this.status.transcription.state !== 'failed') this.setStatus({ type: 'transcription', state: 'stopped' });
    if (this.status.capture.state !== 'failed')
      this.setStatus({
        type: 'capture',
        state: 'stopped',
        ...(reason === 'call-ended' && { reason: CALL_ENDED_REASON }),
      });
    this.partial = '';
    await this.writes;
    // 013: the last caption changes are written while the meeting is still open; afterwards the store refuses them.
    await this.closeCaptionLog();
    await this.deps.store.endMeeting(this.meeting.id, endedAt, reason);
    this.meeting = { ...this.meeting, endedAt, endReason: reason };
    // Panels connected before the end learn it here; otherwise they would keep offering Stop until the offscreen
    // document closes (it lingers after a self-inflicted end so late panels still see the reason).
    this.emit({ type: 'live/snapshot', ...this.snapshot() });
    this.resolveEnded(reason);
  }

  /** Opens the mixed source (tab + mic), then the one transcription session. Rejects if the tab cannot be used. */
  private async startTranscription(p: BeginParams): Promise<void> {
    this.builder = new SegmentBuilder({ meetingId: p.meetingId, language: p.language, now: () => this.deps.now() });

    this.gate = this.startGate();
    let source: MixedSourceHandle;
    try {
      source = await p.audio((tab, mic) => this.onFrames(tab, mic));
    } catch (e) {
      this.setStatus({ type: 'transcription', state: 'stopped' });
      throw e;
    }
    this.source = source;
    // A missing mic leaves a tab-only mix running (US3-5).
    this.setStatus(
      source.mic.ok
        ? { type: 'mic', state: 'active' }
        : { type: 'mic', state: 'unavailable', reason: micProblem(source.mic.error) },
    );
    if (this.muteStatus) this.setStatus(this.muteStatus);

    this.setStatus({ type: 'transcription', state: 'connecting' });
    const session = new ReconnectingSession({
      provider: this.deps.provider,
      options: {
        sampleRate: 16000,
        language: p.language,
        keyterms: p.keyterms,
        noVerbatim: p.cleanTranscript !== false,
      },
    });
    session.on((e) => this.onSessionEvent(e));
    try {
      await session.start();
    } catch (e) {
      this.setStatus({ type: 'transcription', state: 'failed', reason: `Could not reach ElevenLabs: ${errorText(e)}` });
      throw e;
    }
    if (this.ended) {
      session.close();
      return;
    }
    this.session = session;
  }

  /** Captions are turned on once the transcription stream is active: only then is there a transcript to name (R4). */
  private enableCaptions(): void {
    const captions = this.deps.adapter.captions;
    if (this.captionsEnabled || this.ended || !captions.supported) return;
    this.captionsEnabled = true;
    captions.enable().catch((e: unknown) => this.log.warn('could not turn on captions', e));
  }

  /** 002 US1: follow the adapter's captions state and name lines from its caption activity. */
  private followCaptions(meeting: Meeting, mappings: readonly SpeakerNameMapping[]): void {
    const captions = this.deps.adapter.captions;
    if (!captions.supported) return;
    this.attributor = new SpeakerAttributor({
      startedAt: meeting.startedAt,
      now: () => this.deps.now(),
      userName: meeting.userName,
      mappings,
      hasRename: (key) => this.meeting?.speakerRenames[key] !== undefined,
      onUpdate: (id, fields) => this.relabel(id, fields),
      onRename: (key, rename) => this.rename(key, rename),
      onSplit: (id, pieces) => this.split(id, pieces),
      isOverridden: (id) => this.segments.find((s) => s.id === id)?.labelOverride != null,
    });
    this.watchdog = new CaptionsWatchdog({
      now: () => this.deps.now(),
      onChange: () => this.showCaptionsState(),
    });
    this.unsubscribes.push(
      captions.subscribeState((state) => this.onCaptionsState(state)),
      captions.subscribe((activity) => {
        if (this.ended || this.captionsState?.state !== 'on') return;
        this.watchdog?.caption();
        this.attributor?.caption(activity);
      }),
    );
    this.keepCaptions(meeting, mappings);
  }

  /**
   * 013: keeps the text of the platform's captions. Events are passed on while the meeting has not ended, whatever the
   * captions state (the page only sends while it has caption turns), and reach nothing but the caption log.
   */
  private keepCaptions(meeting: Meeting, mappings: readonly SpeakerNameMapping[]): void {
    const captions = this.deps.adapter.captions;
    const store = this.deps.store;
    if (!captions.supported || !store.putCaptionTurns) return;
    const remembered = new Map(mappings.map((m) => [normaliseName(m.captionName), m.displayName]));
    const log = new CaptionLog({
      meetingId: meeting.id,
      startedAt: meeting.startedAt,
      put: (turns) => store.putCaptionTurns?.(meeting.id, turns) ?? Promise.resolve(false),
      // Spec P2: a remembered name also reaches a person Meet captioned but no line was ever named after, so the
      // captions file shows it. Same rename, same rule as the attributor's: never over one the meeting has.
      onSpeaker: (captionName) => {
        const id = normaliseName(captionName);
        const name = remembered.get(id);
        const key: SpeakerKey = `caption:${id}`;
        if (name !== undefined && this.meeting?.speakerRenames[key] === undefined)
          this.rename(key, { name, origin: 'remembered' });
      },
      onKept: () => {
        if (!this.meeting) return;
        this.meeting = { ...this.meeting, hasCaptions: true };
        this.emit({ type: 'live/captions-kept', meetingId: meeting.id });
      },
      log: this.log,
    });
    this.captionLog = log;
    this.unsubscribes.push(
      captions.subscribeText((text) => {
        if (!this.ended) log.update(text);
      }),
    );
  }

  private async closeCaptionLog(): Promise<void> {
    if (!this.captionLog) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((r) => (timer = setTimeout(r, CAPTIONS_CLOSE_TIMEOUT_MS)));
    await Promise.race([this.captionLog.close(), timeout]);
    clearTimeout(timer);
  }

  /** 002 FR-024 (design decision 36): leaving the call ends the meeting as Stop does; the transcript stays. */
  private followCall(): void {
    const call = this.deps.adapter.call;
    if (!call) return;
    this.unsubscribes.push(
      call.subscribeEnded(() => {
        if (!this.ended) void this.end('call-ended');
      }),
    );
  }

  private onCaptionsState(state: CaptionsState): void {
    if (this.ended) return;
    this.captionsState = state;
    this.watchdog?.captionsOn(state.state === 'on');
    this.showCaptionsState();
  }

  /** The adapter's state, unless captions are on but silent while people talk (US2-2). */
  private showCaptionsState(): void {
    const state = this.captionsState;
    if (!state || this.ended) return;
    this.setStatus({
      type: 'captions',
      state: this.watchdog?.degraded() ? { state: 'unavailable', reason: WATCHDOG_REASON } : state,
    });
  }

  /** Puts the platform back as it was (captions off/unhidden); a page that never answers does not hold up the end. */
  private async restorePlatform(): Promise<void> {
    for (const off of this.unsubscribes.splice(0)) off();
    const captions = this.deps.adapter.captions;
    if (captions.supported) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((r) => (timer = setTimeout(r, RESTORE_TIMEOUT_MS)));
      await Promise.race([captions.restore().catch(() => undefined), timeout]);
      clearTimeout(timer);
    }
    this.deps.adapter.dispose();
  }

  /** A segment's attribution changed: store the whole record, then show it (write-before-show, FR-016). */
  private relabel(id: string, fields: LabelFields): void {
    this.writes = this.writes.then(async () => {
      const i = this.segments.findIndex((s) => s.id === id);
      const current = this.segments[i];
      if (!current) return;
      const next: TranscriptSegment = { ...current, ...fields };
      try {
        await this.deps.store.updateSegment(next);
      } catch (e) {
        this.log.error('could not store a speaker label', e);
        return;
      }
      this.segments[i] = next;
      this.emit({ type: 'live/segment-updated', segment: next });
    });
  }

  /**
   * 002 FR-027 (real call 2026-10-09): a line spoken by more than one person becomes pieces. The first is stored over
   * the line (same id) and broadcast as an update; each other piece is stored as a new line and then broadcast. A
   * line the user overrode in the meantime keeps its override and is not split (the attributor is told it is overridden
   * at resolution; this guards the race with a command already queued).
   */
  private split(id: string, pieces: TranscriptSegment[]): void {
    this.writes = this.writes.then(async () => {
      const i = this.segments.findIndex((s) => s.id === id);
      const current = this.segments[i];
      const [first, ...rest] = pieces;
      if (!current || !first || current.labelOverride) return;
      try {
        await this.deps.store.updateSegment(first);
        for (const p of rest) await this.deps.store.appendSegment(p);
      } catch (e) {
        this.log.error('could not store a split line', e);
        return;
      }
      this.segments.splice(i, 1, ...pieces);
      this.emit({ type: 'live/segment-updated', segment: first });
      for (const p of rest) this.emit({ type: 'live/segment', segment: p });
    });
  }

  /**
   * 002 US4: a label edit from the panel over the live port (contracts/live-port-and-labels.md). Stored, then
   * broadcast (the broadcast is the acknowledgement). Commands for another meeting are ignored. Resolves once stored.
   */
  command(c: LabelCommand): Promise<void> {
    const meeting = this.meeting;
    if (!meeting || c.meetingId !== meeting.id) return Promise.resolve();
    if (c.type === 'labels/rename') {
      // "Others" is never renamed everywhere (decision 35); the protocol already rejects it, this guards other callers.
      if (!isRenamableKey(c.speakerKey)) return Promise.resolve();
      // Renaming a key back to the label it had removes the rename.
      const back = c.name === this.originalLabel(c.speakerKey);
      this.rename(c.speakerKey, back ? null : { name: c.name, origin: 'manual' });
    } else {
      this.override(c.segmentId, c.name);
    }
    return this.writes;
  }

  /** The label a key's lines carry without any rename; null when no line of it is known yet. */
  private originalLabel(key: RenamableKey): string | null {
    if (key === 'self') return this.meeting?.userName ?? null;
    return this.segments.find((s) => speakerKey(s) === key)?.speakerLabel ?? null;
  }

  private override(segmentId: string, name: string | null): void {
    this.writes = this.writes.then(async () => {
      const i = this.segments.findIndex((s) => s.id === segmentId);
      const current = this.segments[i];
      if (!current) return;
      const next: TranscriptSegment = { ...current, labelOverride: name };
      try {
        await this.deps.store.updateSegment(next);
      } catch (e) {
        this.log.error('could not store a line override', e);
        return;
      }
      this.segments[i] = next;
      this.emit({ type: 'live/segment-updated', segment: next });
    });
  }

  /** Sets (or with null removes) a meeting-level rename: stored, then broadcast as live/labels. */
  private rename(key: SpeakerKey, rename: SpeakerRename | null): void {
    const meeting = this.meeting;
    if (!meeting) return;
    const { [key]: _old, ...rest } = meeting.speakerRenames;
    this.meeting = { ...meeting, speakerRenames: rename ? { ...rest, [key]: rename } : rest };
    this.writes = this.writes.then(async () => {
      try {
        await this.deps.store.setSpeakerRename(meeting.id, key, rename);
      } catch (e) {
        this.log.error('could not store a speaker rename', e);
        return;
      }
      if (this.meeting)
        this.emit({ type: 'live/labels', meetingId: meeting.id, speakerRenames: this.meeting.speakerRenames });
    });
  }

  private meetingMs(): number {
    return this.deps.now() - (this.meeting?.startedAt ?? 0);
  }

  /**
   * 002 US3: the mute gate in front of the mixer, driven by the platform's mute readings (research R8). On a platform
   * with no mute source it passes frames straight through and the mic is sent (001 behaviour, FR-017); on Meet a
   * missing reading keeps the mic silenced (fail closed, design decision 34).
   */
  private startGate(): MuteGate {
    const mute = this.deps.adapter.mute;
    const gate = new MuteGate({
      supported: mute.supported,
      now: () => this.deps.now(),
      release: (frame) => this.mix(frame),
      onMode: (mode, muted) => this.onGateMode(mode, muted),
    });
    if (mute.supported) {
      const current = mute.current();
      if (current.muted !== null) gate.reading(current);
      this.unsubscribes.push(mute.subscribe((r) => gate.reading(r)));
    }
    return gate;
  }

  private onGateMode(mode: GateMode, muted: boolean | null): void {
    if (mode === 'unsupported') return;
    this.muteStatus =
      mode === 'awaiting-first' || mode === 'stale-muted'
        ? { type: 'mute-checking' }
        : mode === 'unreadable'
          ? { type: 'mute-unreadable' }
          : { type: 'mute', muted };
    this.setStatus(this.muteStatus);
  }

  private onFrames(tab: Int16Array, mic: Int16Array | null): void {
    if (this.ended) return;
    // The frames hold the 100 ms of audio that ended just now.
    this.gate?.push({ tab, mic, atMs: this.deps.now() - FRAME_MS });
  }

  /** After the gate's hold: the mixer, then the session (and with it the reconnect replay buffer). */
  private mix(frame: GateFrame): void {
    this.deps.onMixerInput?.(frame);
    if (this.ended || !this.session) return;
    const startedAt = this.meeting?.startedAt ?? 0;
    this.session.sendAudio(mixFrames(frame.tab, frame.mic), Math.max(0, frame.atMs - startedAt));
  }

  private onSessionEvent(e: ReconnectingEvent): void {
    const builder = this.builder;
    if (this.ended || !builder) return;
    switch (e.type) {
      case 'origin':
        builder.startSession(e.sessionId, e.audioOriginMs);
        return;
      case 'state':
        this.setStatus(
          e.reason === undefined
            ? { type: 'transcription', state: e.state }
            : { type: 'transcription', state: e.state, reason: e.reason },
        );
        if (e.state === 'active') this.enableCaptions();
        if (e.state === 'failed') this.transcriptionFailed(e.reason);
        return;
      case 'partial':
        this.setPartial(e.text);
        return;
      case 'committed': {
        this.setPartial('');
        builder.committed(e.text, this.meetingMs());
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          for (const s of builder.expire(this.meetingMs())) this.store(s);
        }, DETAIL_TIMEOUT_MS);
        this.timers.add(timer);
        return;
      }
      case 'committed-detail': {
        const s = builder.detail(e.text, e.language, e.words);
        if (s) this.store(s);
        return;
      }
    }
  }

  /** With the one session gone for good there is nothing left to transcribe: the meeting ends (data-model.md). */
  private transcriptionFailed(reason: string | undefined): void {
    this.setStatus({
      type: 'capture',
      state: 'failed',
      reason: `Transcription of the meeting stopped. ${reason ?? ''}`.trim(),
    });
    void this.end('failed');
  }

  private setPartial(text: string): void {
    if (text !== '') this.watchdog?.speech();
    if (this.partial === text) return;
    this.partial = text;
    this.emit({ type: 'live/partial', stream: STREAM, text });
  }

  /** Writes are chained so lines are stored in arrival order; each is emitted only after its write. */
  private store(line: TranscriptSegment): void {
    // While names are active a new line shows "…" until it settles (design decision 37); otherwise "Others" at once.
    const segment = this.namesActive() ? { ...line, labelPending: true } : line;
    this.writes = this.writes.then(async () => {
      try {
        await this.deps.store.appendSegment(segment);
      } catch (e) {
        this.log.error('could not store a transcript line', e);
        return;
      }
      this.segments.push(segment);
      this.emit({ type: 'live/segment', segment });
      this.attributor?.add(segment);
      this.watchdog?.speech();
    });
  }

  /** Captions are on and being seen, so a new line can still be named (002 US1, US2). */
  private namesActive(): boolean {
    return this.attributor !== null && this.captionsState?.state === 'on' && this.watchdog?.degraded() !== true;
  }

  private setStatus(e: StatusEvent): void {
    const next = reduceStatus(this.status, e);
    if (next === this.status) return;
    this.status = next;
    this.emit({ type: 'live/status', status: next });
  }

  private emit(e: LiveEvent): void {
    for (const l of this.listeners) l(e);
  }
}
