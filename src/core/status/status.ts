// Status snapshot and reducer (data-model.md "Status snapshot", "State transitions"). Principle IV: every
// dependency's state is visible. Invalid transitions are ignored so a late event cannot resurrect a dead stream.
import type { CaptionsCapability, CaptionsState, MuteCapability } from '../platform/adapter';

export type CaptureState = 'idle' | 'starting' | 'active' | 'stopped' | 'failed';
export type StreamState = 'idle' | 'connecting' | 'active' | 'reconnecting' | 'failed' | 'stopped';
/** `muted`: Meet says the user is muted (or the gate is still checking), so the mic is silenced before mixing (002). */
export type MicState = 'active' | 'muted' | 'unavailable' | 'off';

export interface StreamStatus {
  state: StreamState;
  reason?: string;
  reconnects: number;
}

export interface StatusSnapshot {
  capture: { state: CaptureState; reason?: string };
  /** The one transcription session of the mixed stream (constitution v1.1.0). */
  transcription: StreamStatus;
  /** `idle` before any meeting (006 FR-009): nothing to say about names yet. */
  speakerNames: { state: 'idle' | 'unavailable' | 'starting' | 'active' | 'degraded'; reason: string };
  mic: { state: MicState; reason?: string; muteFollowed: boolean };
  retention: { provider: 'elevenlabs'; summary: string; helpUrl: string };
}

export type StatusEvent =
  | { type: 'capture'; state: CaptureState; reason?: string }
  | { type: 'transcription'; state: StreamState; reason?: string }
  | { type: 'mic'; state: MicState; reason?: string }
  | { type: 'adapter'; captions: CaptionsCapability; mute: MuteCapability }
  /** 002: the adapter's captions state. */
  | { type: 'captions'; state: CaptionsState }
  /** 002: the mute gate follows a reading (null = Meet's mute state cannot be read; the mic is sent). */
  | { type: 'mute'; muted: boolean | null }
  /** 002: the gate is waiting for the first reading or holding a stale mute; the mic is silenced meanwhile. */
  | { type: 'mute-checking' }
  /** 002, design decision 34: Meet's mute state can't be read; the mic stays silenced (fail closed). */
  | { type: 'mute-unreadable' }
  | { type: 'reset' };

/** FR-021 wording (006 copy-review R12): a tab with no mute source sends the mic whatever the app's mute says. */
export const MUTE_UNKNOWN_REASON = 'sent even while muted';
/** 002 FR-014 wording. */
export const MUTED_REASON = 'Muted in Meet — not sent';
export const MUTE_CHECKING_REASON = "Checking Meet's mute state — not sent";
/** Design decision 34 wording: what happened, in the user's words; it clears itself when the button is back. */
export const MUTE_UNREADABLE_REASON = "Not sent — can't see Meet's mute button";
export const CAPTIONS_STARTING_REASON = 'Turning on Meet captions…';
/** Design decision 36: shown after "Stopped" when leaving the Meet call ended the meeting. */
export const CALL_ENDED_REASON = 'the call ended';

/** Design decision 19: truthful, no zero-retention claim (FR-005). */
export const RETENTION = Object.freeze({
  provider: 'elevenlabs' as const,
  summary:
    "Audio is sent to ElevenLabs for transcription. ElevenLabs may keep audio and transcripts under your account's settings and may use them to improve its models.",
  helpUrl: 'https://elevenlabs.io/privacy-policy',
});

const CAPTURE_NEXT: Record<CaptureState, readonly CaptureState[]> = {
  idle: ['starting'],
  starting: ['active', 'failed', 'stopped'],
  active: ['stopped', 'failed'],
  stopped: ['starting'],
  failed: ['starting', 'idle'],
};

const STREAM_NEXT: Record<StreamState, readonly StreamState[]> = {
  idle: ['connecting', 'stopped'],
  connecting: ['active', 'reconnecting', 'failed', 'stopped'],
  active: ['reconnecting', 'failed', 'stopped'],
  reconnecting: ['active', 'failed', 'stopped'],
  failed: ['stopped'],
  stopped: [],
};

const idleStream = (): StreamStatus => ({ state: 'idle', reconnects: 0 });

export function initialStatus(): StatusSnapshot {
  return {
    capture: { state: 'idle' },
    transcription: idleStream(),
    speakerNames: { state: 'idle', reason: '' },
    mic: { state: 'off', muteFollowed: false },
    retention: { ...RETENTION },
  };
}

const withReason = <T extends object>(base: T, reason: string | undefined) =>
  reason === undefined ? base : { ...base, reason };

function micStatus(state: MicState, reason: string | undefined, muteFollowed: boolean): StatusSnapshot['mic'] {
  const effective = reason ?? (state === 'active' && !muteFollowed ? MUTE_UNKNOWN_REASON : undefined);
  return withReason({ state, muteFollowed }, effective);
}

/** A mute reading moves the mic between active and muted; an unavailable or off mic keeps its state. */
function followMute(
  mic: StatusSnapshot['mic'],
  muted: boolean | null | 'checking' | 'unreadable',
): StatusSnapshot['mic'] {
  if (mic.state !== 'active' && mic.state !== 'muted') return mic;
  if (muted === 'checking') return { state: 'muted', reason: MUTE_CHECKING_REASON, muteFollowed: true };
  if (muted === 'unreadable') return { state: 'muted', reason: MUTE_UNREADABLE_REASON, muteFollowed: true };
  if (muted === true) return { state: 'muted', reason: MUTED_REASON, muteFollowed: true };
  if (muted === false) return { state: 'active', muteFollowed: true };
  return micStatus('active', undefined, false);
}

function speakerNamesFor(c: CaptionsState): StatusSnapshot['speakerNames'] {
  switch (c.state) {
    case 'starting':
      return { state: 'starting', reason: c.reason };
    case 'on':
      return { state: 'active', reason: '' };
    default:
      return { state: 'degraded', reason: c.reason };
  }
}

export function reduceStatus(s: StatusSnapshot, e: StatusEvent): StatusSnapshot {
  switch (e.type) {
    case 'capture':
      if (!CAPTURE_NEXT[s.capture.state].includes(e.state)) return s;
      return { ...s, capture: withReason({ state: e.state }, e.reason) };

    case 'transcription': {
      const prev = s.transcription;
      if (!STREAM_NEXT[prev.state].includes(e.state)) return s;
      const reconnects = prev.reconnects + (e.state === 'reconnecting' ? 1 : 0);
      return { ...s, transcription: withReason({ state: e.state, reconnects }, e.reason) };
    }

    case 'mic':
      return { ...s, mic: micStatus(e.state, e.reason, s.mic.muteFollowed) };

    case 'adapter': {
      const speakerNames: StatusSnapshot['speakerNames'] = e.captions.supported
        ? { state: 'starting', reason: CAPTIONS_STARTING_REASON }
        : { state: 'unavailable', reason: e.captions.reason };
      const muteFollowed = e.mute.supported;
      const keptReason = s.mic.reason === MUTE_UNKNOWN_REASON ? undefined : s.mic.reason;
      return { ...s, speakerNames, mic: micStatus(s.mic.state, keptReason, muteFollowed) };
    }

    case 'captions':
      return { ...s, speakerNames: speakerNamesFor(e.state) };

    case 'mute':
      return { ...s, mic: followMute(s.mic, e.muted) };

    case 'mute-checking':
      return { ...s, mic: followMute(s.mic, 'checking') };

    case 'mute-unreadable':
      return { ...s, mic: followMute(s.mic, 'unreadable') };

    case 'reset':
      return {
        ...s,
        capture: { state: 'idle' },
        transcription: idleStream(),
        mic: { state: 'off', muteFollowed: s.mic.muteFollowed },
      };
  }
}
