// A scripted Meet adapter for runtime tests: the test sets the captions state, plays caption activity and mute
// readings, and sees every enable/restore/dispose call (002 contracts/platform-adapter.md).
import type {
  CallCapability,
  CaptionActivity,
  CaptionsCapability,
  CaptionsState,
  CaptionText,
  MuteCapability,
  MuteReading,
  PlatformAdapter,
} from '@/core/platform/adapter';

export class FakeMeetAdapter implements PlatformAdapter {
  readonly id = 'meet' as const;
  readonly calls: string[] = [];
  /** Replaced by tests that need restore() to hang (a closed tab). */
  restoreImpl: () => Promise<void> = () => Promise.resolve();
  /** Runs inside enable(), e.g. to record the runtime's state at that moment. */
  onEnable: () => void = () => undefined;

  private state: CaptionsState;
  private reading: MuteReading;
  private readonly stateListeners = new Set<(s: CaptionsState) => void>();
  private readonly activityListeners = new Set<(a: CaptionActivity) => void>();
  private readonly muteListeners = new Set<(r: MuteReading) => void>();
  private readonly textListeners = new Set<(t: CaptionText) => void>();

  readonly captions: CaptionsCapability;
  readonly mute: MuteCapability;
  /** 002 FR-024: the page says the user left the call. */
  readonly call: CallCapability = {
    subscribeEnded: (l) => {
      this.callListeners.add(l);
      return () => void this.callListeners.delete(l);
    },
  };
  private readonly callListeners = new Set<(observedAt: number) => void>();

  constructor(initial: CaptionsState = { state: 'starting', reason: 'Connecting to the Meet page…' }) {
    this.state = initial;
    this.reading = { muted: null, observedAt: Date.now() };
    this.captions = {
      supported: true,
      enable: () => {
        this.calls.push('enable');
        this.onEnable();
        return Promise.resolve();
      },
      restore: () => {
        this.calls.push('restore');
        return this.restoreImpl();
      },
      subscribe: (l) => {
        this.activityListeners.add(l);
        return () => void this.activityListeners.delete(l);
      },
      subscribeState: (l) => {
        this.stateListeners.add(l);
        l(this.state);
        return () => void this.stateListeners.delete(l);
      },
      subscribeText: (l) => {
        this.textListeners.add(l);
        return () => void this.textListeners.delete(l);
      },
    };
    this.mute = {
      supported: true,
      current: () => this.reading,
      subscribe: (l) => {
        this.muteListeners.add(l);
        return () => void this.muteListeners.delete(l);
      },
    };
  }

  matches(url: URL): boolean {
    return url.hostname === 'meet.google.com';
  }

  metadata() {
    return Promise.resolve({});
  }

  dispose(): void {
    this.calls.push('dispose');
  }

  setState(state: CaptionsState): void {
    this.state = state;
    for (const l of this.stateListeners) l(state);
  }

  /** Caption activity for `turnKey`, observed now. */
  caption(turnKey: string, speakerName: string, self: boolean | null = null): void {
    const a: CaptionActivity = { turnKey, speakerName, self, observedAt: Date.now() };
    for (const l of this.activityListeners) l(a);
  }

  /** 013: a kept caption turn's whole text, first seen now unless `firstSeenAt` says otherwise. */
  emitText(
    turnKey: string,
    speakerName: string,
    text: string,
    over: { self?: boolean | null; firstSeenAt?: number } = {},
  ): void {
    const t: CaptionText = {
      turnKey,
      speakerName,
      self: over.self ?? null,
      firstSeenAt: over.firstSeenAt ?? Date.now(),
      text,
    };
    for (const l of this.textListeners) l(t);
  }

  /** The user leaves the call (Meet's in-call controls gone). */
  endCall(observedAt = Date.now()): void {
    for (const l of this.callListeners) l(observedAt);
  }

  /** A mute reading; `observedAt` defaults to now (pass an earlier time for a reading that arrives late). */
  setMuted(muted: boolean | null, observedAt = Date.now()): void {
    this.reading = { muted, observedAt };
    for (const l of this.muteListeners) l(this.reading);
  }
}
