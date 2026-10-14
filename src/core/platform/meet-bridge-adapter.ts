// The offscreen side of the Meet adapter (002 contracts/platform-adapter.md "BridgedMeetAdapter"): it implements the
// platform contract by talking to the Meet content script over `platform:meet` ports (contracts/meet-bridge.md).
// Every inbound message is validated; the newest port wins; a lost port degrades visibly and a new one recovers.
import { createReceiver } from '../messaging/protocol';
import { MAX_TURN_CHARS, MEET_REASONS, parseFromPage, type ToPage } from '../messaging/meet-bridge';
import type {
  CallCapability,
  CaptionActivity,
  CaptionsCapability,
  CaptionsState,
  CaptionText,
  MuteCapability,
  MuteReading,
  PlatformAdapter,
} from './adapter';
import { isMeetCallUrl } from './meet-url';

/** No port this long after the adapter starts → the page could not be reached (research R3). */
export const ATTACH_TIMEOUT_MS = 5000;
/** Captions neither on nor waiting in the lobby this long after enable() → unavailable (SC-003's 10 s, research R4). */
export const NAMES_DEADLINE_MS = 9000;

/** The slice of chrome.runtime.Port the adapter uses. */
export interface BridgePort {
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

/** Hands every new `platform:meet` port to the listener; returns an unsubscribe. The offscreen host supplies it. */
export type BridgeConnector = (listener: (port: BridgePort) => void) => () => void;

export interface BridgedMeetAdapterDeps {
  connect: BridgeConnector;
  /** Epoch ms. */
  now(): number;
}

const inLobby = (s: CaptionsState) => s.state === 'starting' && s.reason === MEET_REASONS.lobby;

export class BridgedMeetAdapter implements PlatformAdapter {
  readonly id = 'meet' as const;
  readonly captions: CaptionsCapability;
  readonly mute: MuteCapability;

  private active = false;
  private disposed = false;
  private port: BridgePort | null = null;
  private everConnected = false;
  private enableRequested = false;
  private state: CaptionsState = { state: 'starting', reason: MEET_REASONS.connecting };
  private reading: MuteReading;
  private meta: { title?: string; meetingCode?: string } = {};
  private unsubscribeConnector: (() => void) | null = null;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly stateListeners = new Set<(s: CaptionsState) => void>();
  private readonly activityListeners = new Set<(a: CaptionActivity) => void>();
  private readonly muteListeners = new Set<(r: MuteReading) => void>();
  private readonly callListeners = new Set<(observedAt: number) => void>();
  private readonly textListeners = new Set<(t: CaptionText) => void>();
  /** 013: each kept turn's whole text, rebuilt from the page's keep/append messages; lives until dispose(). */
  private readonly texts = new Map<string, string>();
  private textDrops = 0;
  /** When the page said the user left the call; reported once (FR-024). */
  private callEndedAt: number | null = null;
  readonly call: CallCapability = {
    subscribeEnded: (listener) => {
      this.activate();
      this.callListeners.add(listener);
      return () => void this.callListeners.delete(listener);
    },
  };
  private readonly receiver = createReceiver((raw) => parseFromPage(raw, this.deps.now()));

  constructor(private readonly deps: BridgedMeetAdapterDeps) {
    this.reading = { muted: null, observedAt: deps.now() };
    this.captions = {
      supported: true,
      enable: () => {
        this.activate();
        if (!this.enableRequested) {
          this.enableRequested = true;
          this.after(NAMES_DEADLINE_MS, () => this.deadline());
        }
        this.send({ type: 'meet/enable-captions' });
        return Promise.resolve();
      },
      restore: () => {
        this.enableRequested = false;
        this.send({ type: 'meet/restore-captions' });
        return Promise.resolve();
      },
      subscribe: (listener) => {
        this.activate();
        this.activityListeners.add(listener);
        return () => void this.activityListeners.delete(listener);
      },
      subscribeState: (listener) => {
        this.activate();
        this.stateListeners.add(listener);
        listener(this.state);
        return () => void this.stateListeners.delete(listener);
      },
      subscribeText: (listener) => {
        this.activate();
        this.textListeners.add(listener);
        return () => void this.textListeners.delete(listener);
      },
    };
    this.mute = {
      supported: true,
      current: () => this.reading,
      subscribe: (listener) => {
        this.activate();
        this.muteListeners.add(listener);
        return () => void this.muteListeners.delete(listener);
      },
    };
  }

  matches(url: URL): boolean {
    return isMeetCallUrl(url);
  }

  metadata(): Promise<{ title?: string; meetingCode?: string }> {
    return Promise.resolve({ ...this.meta });
  }

  /** 013: `meet/caption-text` messages that could not be applied (their `keep` lay beyond the text held). */
  droppedCaptionTexts(): number {
    return this.textDrops;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.send({ type: 'meet/detach' });
    this.port = null;
    this.unsubscribeConnector?.();
    this.unsubscribeConnector = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.stateListeners.clear();
    this.activityListeners.clear();
    this.muteListeners.clear();
    this.callListeners.clear();
    this.textListeners.clear();
    this.texts.clear();
  }

  /** Starts listening for ports on first use, so an adapter the registry only asked about has no side effects. */
  private activate(): void {
    if (this.active || this.disposed) return;
    this.active = true;
    this.unsubscribeConnector = this.deps.connect((port) => this.adopt(port));
    this.after(ATTACH_TIMEOUT_MS, () => {
      if (!this.everConnected) this.setState({ state: 'unavailable', reason: MEET_REASONS.cantConnect });
    });
  }

  private after(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private deadline(): void {
    if (!this.enableRequested || this.state.state === 'on' || inLobby(this.state)) return;
    if (!this.port) this.setState({ state: 'unavailable', reason: MEET_REASONS.cantConnect });
    else if (this.state.state === 'starting') this.setState({ state: 'unavailable', reason: MEET_REASONS.cantTurnOn });
    // unavailable / off-by-user already carry the latest reason.
  }

  private adopt(port: BridgePort): void {
    if (this.disposed) return;
    this.port = port;
    this.everConnected = true;
    port.onMessage.addListener((raw) => {
      if (this.port === port) this.onPageMessage(raw);
    });
    port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      this.port = null;
      this.setState({ state: 'unavailable', reason: MEET_REASONS.reloaded });
      this.setReading({ muted: null, observedAt: this.deps.now() });
    });
    if (this.enableRequested) this.send({ type: 'meet/enable-captions' });
  }

  private onPageMessage(raw: unknown): void {
    const m = this.receiver.accept(raw);
    switch (m?.type) {
      case 'meet/captions-state': {
        const { type: _type, ...state } = m;
        this.setState(state);
        return;
      }
      case 'meet/caption': {
        const activity: CaptionActivity = {
          turnKey: m.turnKey,
          speakerName: m.speakerName,
          self: m.self,
          observedAt: m.observedAt,
        };
        for (const l of this.activityListeners) l(activity);
        return;
      }
      case 'meet/caption-text': {
        const current = this.texts.get(m.turnKey) ?? '';
        // The page and this side disagree about what was sent: the turn waits for its next whole text (keep 0).
        if (m.keep > current.length) {
          this.textDrops += 1;
          return;
        }
        const text = (current.slice(0, m.keep) + m.append).slice(0, MAX_TURN_CHARS);
        this.texts.set(m.turnKey, text);
        const event: CaptionText = {
          turnKey: m.turnKey,
          speakerName: m.speakerName,
          self: m.self,
          firstSeenAt: m.firstSeenAt,
          text,
        };
        for (const l of this.textListeners) l(event);
        return;
      }
      case 'meet/mute':
        this.setReading({ muted: m.muted, observedAt: m.observedAt });
        return;
      case 'meet/call-ended':
        if (this.callEndedAt !== null) return;
        this.callEndedAt = m.observedAt;
        for (const l of this.callListeners) l(m.observedAt);
        return;
      case 'meet/metadata':
        this.meta = {
          ...(m.title !== undefined && { title: m.title }),
          ...(m.meetingCode !== undefined && { meetingCode: m.meetingCode }),
        };
        return;
      default:
        // meet/hello carries nothing the adapter needs beyond the port itself.
        return;
    }
  }

  private setState(state: CaptionsState): void {
    this.state = state;
    for (const l of this.stateListeners) l(state);
  }

  private setReading(reading: MuteReading): void {
    this.reading = reading;
    for (const l of this.muteListeners) l(reading);
  }

  private send(message: ToPage): void {
    try {
      this.port?.postMessage(message);
    } catch {
      // A port that just closed; its onDisconnect handles the state.
    }
  }
}
