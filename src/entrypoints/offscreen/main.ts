// Offscreen document entry (T067, T105): wires the host to the mixed tab + mic capture, IndexedDB and ElevenLabs (one
// session per meeting, constitution v1.1.0). The store (./store.ts) also keeps a Meet call's caption text (013). In e2e builds the "tab" is Chrome's fake audio device (Playwright cannot
// click the toolbar icon that grants tab capture) and the provider replays fixtures; everything else is the
// production path.
import { browserCaptureDeps } from '../../audio/browser-deps';
import { captureMixed, tabConstraints } from '../../audio/capture';
import { BridgedMeetAdapter } from '../../core/platform/meet-bridge-adapter';
import { createPlatformRegistry } from '../../core/platform/registry';
import type { AlignmentTraceRecorder } from '../../core/speakers/alignment-trace';
import type { MeetingRuntimeDeps } from '../../core/session/meeting-runtime';
import type { TranscriptionProvider } from '../../core/transcription/provider';
import { RelayCredentialSource } from '../../providers/credentials/relay-source';
import { ElevenLabsRealtimeProvider } from '../../providers/transcription/elevenlabs/realtime-provider';
import type { WebSocketCtor } from '../../providers/transcription/socket';
import { openLiveAssistDb } from '../../storage/db';
import { MeetingRepo } from '../../storage/meeting-repo';
import { createOffscreenHost } from './host';
import { offscreenStore } from './store';

const E2E = import.meta.env.MODE === 'e2e';
/** Spike builds record an alignment trace for the dev-only spike recorder page (002 T067). */
const SPIKE = import.meta.env.MODE === 'spike';

/** Research R5; final values may change with the echo spike (T048). */
const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const capture = browserCaptureDeps();
const repo = openLiveAssistDb().then((db) => new MeetingRepo(db));

async function makeProvider(source: { title: string }): Promise<TranscriptionProvider> {
  if (E2E) return (await import('./e2e-provider')).e2eProvider(source.title);
  return new ElevenLabsRealtimeProvider({
    // Offscreen documents have no chrome.storage: the service worker mints each token from the stored key.
    credentials: new RelayCredentialSource((request) => chrome.runtime.sendMessage(request)),
    // The browser WebSocket is a structural superset of WebSocketLike; its handler signatures are just narrower.
    WebSocket: WebSocket as unknown as WebSocketCtor,
  });
}

/** e2e builds: the mic level as it leaves the mute gate (002 T054); compiled out of production. */
let micTap: MeetingRuntimeDeps['onMixerInput'] | null = null;
if (E2E) void import('./e2e-mic-tap').then((m) => (micTap = m.installMicTap()));

/**
 * Spike builds: the trace recorder, and how to hand the finished meeting's trace to the service worker (T100). The
 * meeting waits for it before it is created (real trace 2026-10-08): the recorder must learn the meeting start.
 */
const spikeTrace: Promise<{ recorder: AlignmentTraceRecorder; save: () => void }> | null = SPIKE
  ? import('./spike-trace').then((m) => {
      const recorder = m.installAlignmentTrace((l) => host.onPlatformPort(l));
      return { recorder, save: () => m.saveTraceOnEnd(recorder) };
    })
  : null;
let trace: AlignmentTraceRecorder | null = null;
let saveTrace: (() => void) | null = null;
void spikeTrace?.then((t) => {
  trace = t.recorder;
  saveTrace = t.save;
});

// Listeners are registered synchronously on load: the service worker messages this document as soon as it exists.
const host = createOffscreenHost({
  provider: makeProvider,
  store: offscreenStore(
    repo,
    SPIKE
      ? {
          onCreate: async (m) => void (await spikeTrace)?.recorder.begin(m),
          onSegment: (s) => trace?.segment(s),
          onEnd: () => saveTrace?.(),
        }
      : {},
  ),
  // Meet calls get the bridged adapter (002); every other site the generic one. The factory runs at Start, after
  // `host` exists. Platform ports are real chrome.runtime.Ports, which carry the onMessage the adapter reads.
  registry: createPlatformRegistry([
    () =>
      new BridgedMeetAdapter({
        connect: (listener) => host.onPlatformPort((port) => listener(port as chrome.runtime.Port)),
        now: () => Date.now(),
      }),
  ]),
  sourceFor: (tabStreamId) => (onFrames) =>
    captureMixed(
      { tab: E2E ? { audio: true, video: false } : tabConstraints(tabStreamId), mic: MIC_CONSTRAINTS },
      capture,
      onFrames,
    ),
  now: () => Date.now(),
  notifyEnded: (reason) => void chrome.runtime.sendMessage({ type: 'offscreen/ended', reason }).catch(() => undefined),
  ...(E2E ? { onMixerInput: (frame) => micTap?.(frame) } : {}),
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) =>
  host.onMessage(message, sendResponse),
);
chrome.runtime.onConnect.addListener((port) => host.onConnect(port));

if (E2E) void import('./e2e-bridge-stats').then((m) => m.installBridgeStats((l) => host.onPlatformPort(l)));
