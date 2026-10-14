// The offscreen document's job (research R5): it owns audio, sockets and DB writes for the one running meeting,
// so transcription survives the side panel closing (FR-018). The service worker drives it with offscreen/begin|end;
// side panels follow it over the `live` port (contracts/extension-messages.md).
import { MEET_PORT_NAME } from '../../core/messaging/meet-bridge';
import {
  createReceiver,
  LIVE_PORT_NAME,
  parseInternal,
  parseLabelCommand,
  type BeginResult,
  type EndResult,
  type InternalMessage,
  type LiveEvent,
} from '../../core/messaging/protocol';
import type { PlatformRegistry } from '../../core/platform/adapter';
import {
  MeetingRuntime,
  type LiveSnapshot,
  type MeetingRuntimeDeps,
  type MeetingStore,
  type MixedFrameSource,
} from '../../core/session/meeting-runtime';
import { initialStatus } from '../../core/status/status';
import type { EndReason } from '../../core/transcript/model';
import type { TranscriptionProvider } from '../../core/transcription/provider';

/** Crash recovery (T076): meetings still open when no runtime is live were cut off by a crash. */
export interface CrashRecovery {
  markOrphanedCrashed(liveMeetingId: string | null, now: number): Promise<unknown>;
}

export interface HostDeps {
  /** The meeting's source is passed so e2e builds can pick a scripted scenario; production ignores it. */
  provider: (source: { url: string; title: string }) => TranscriptionProvider | Promise<TranscriptionProvider>;
  store: MeetingStore & CrashRecovery;
  registry: PlatformRegistry;
  /** The meeting's mixed tab + mic source; it opens the forwarded (single-use) tab stream id. */
  sourceFor(tabStreamId: string): MixedFrameSource;
  now(): number;
  /** Tells the service worker the meeting ended without it asking (offscreen/ended). */
  notifyEnded(reason: EndReason): void;
  /** e2e builds: sees each frame pair entering the mixer, mic already gated (002 T054). */
  onMixerInput?: MeetingRuntimeDeps['onMixerInput'];
}

/** The slice of chrome.runtime.Port the host uses. */
export interface HostPort {
  readonly name: string;
  postMessage(message: unknown): void;
  onDisconnect: { addListener(l: () => void): void };
  /** Panels send label commands on the live port (002 contracts/live-port-and-labels.md). */
  onMessage?: { addListener(l: (message: unknown) => void): void };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function urlOrNull(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function createOffscreenHost(deps: HostDeps) {
  const messages = createReceiver(parseInternal);
  const labelCommands = createReceiver(parseLabelCommand);
  const ports = new Set<HostPort>();
  const platformListeners = new Set<(port: HostPort) => void>();
  let runtime: MeetingRuntime | null = null;
  let running = false;
  /** Set when the service worker asked for the end, so only a self-inflicted end is reported back. */
  let endRequested = false;

  const broadcast = (e: LiveEvent) => {
    for (const p of ports) p.postMessage(e);
  };

  async function begin(m: Extract<InternalMessage, { type: 'offscreen/begin' }>): Promise<BeginResult> {
    if (running) return { ok: false, message: 'A meeting is already being transcribed.' };
    running = true;
    endRequested = false;
    // No runtime is live in this document yet, so any meeting still open was cut off by a crash.
    await deps.store.markOrphanedCrashed(null, deps.now()).catch(() => undefined);

    const adapter = deps.registry.forUrl(urlOrNull(m.source.url) ?? new URL('about:blank'));
    const next = new MeetingRuntime({
      provider: await deps.provider(m.source),
      store: deps.store,
      adapter,
      now: () => deps.now(),
      ...(deps.onMixerInput ? { onMixerInput: deps.onMixerInput } : {}),
    });
    runtime = next;
    next.subscribe(broadcast);
    try {
      await next.begin({
        meetingId: m.meetingId,
        source: m.source,
        language: m.language,
        keyterms: m.keyterms,
        userName: m.userName,
        audio: deps.sourceFor(m.tabStreamId),
        speakerNameMappings: m.speakerNameMappings,
        cleanTranscript: m.cleanTranscript,
      });
      void next.whenEnded().then((reason) => {
        if (runtime !== next) return;
        running = false;
        if (!endRequested) deps.notifyEnded(reason);
      });
      return { ok: true };
    } catch (e) {
      running = false;
      return { ok: false, message: errorText(e) };
    }
  }

  async function end(m: Extract<InternalMessage, { type: 'offscreen/end' }>): Promise<EndResult> {
    endRequested = true;
    await runtime?.end(m.reason);
    running = false;
    return { ok: true };
  }

  function snapshot(): LiveSnapshot {
    return runtime?.snapshot() ?? { meeting: null, segments: [], partials: [], status: initialStatus() };
  }

  return {
    /** chrome.runtime.onMessage handler: true when it will reply asynchronously. */
    onMessage(raw: unknown, sendResponse: (r: BeginResult | EndResult) => void): boolean {
      const m = messages.accept(raw);
      if (!m) return false;
      void (m.type === 'offscreen/begin' ? begin(m) : end(m)).then(sendResponse);
      return true;
    },

    /** Meet page ports (`platform:meet`, 002 contracts/meet-bridge.md) go to these listeners. */
    onPlatformPort(listener: (port: HostPort) => void): () => void {
      platformListeners.add(listener);
      return () => platformListeners.delete(listener);
    },

    /** chrome.runtime.onConnect handler for side panels and Meet pages. */
    onConnect(port: HostPort): void {
      if (port.name === MEET_PORT_NAME) {
        for (const l of platformListeners) l(port);
        return;
      }
      if (port.name !== LIVE_PORT_NAME) return;
      ports.add(port);
      port.onDisconnect.addListener(() => ports.delete(port));
      // The runtime ignores commands for another meeting; with none running there is nothing to edit live.
      port.onMessage?.addListener((raw) => {
        const c = labelCommands.accept(raw);
        if (c && running) void runtime?.command(c);
      });
      port.postMessage({ type: 'live/snapshot', ...snapshot() } satisfies LiveEvent);
    },
  };
}
