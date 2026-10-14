// The status line as data (006 research R2, data-model.md "StatusDot"): one dot per dependency with its state in
// words (constitution IV), and which of them are problems — the only thing that expands the line (FR-007). Every
// status string the panel shows lives here (copy-review K21, K33, R5–R8, R11, R12).
import {
  CALL_ENDED_REASON,
  MUTE_UNREADABLE_REASON,
  type StatusSnapshot,
  type StreamStatus,
} from '../../core/status/status';

export type Tone = 'ok' | 'busy' | 'idle' | 'error';

export interface StatusDot {
  key: 'capture' | 'transcription' | 'speakerNames' | 'mic';
  label: string;
  tone: Tone;
  /** The state, with ` — {reason}` when there is one. */
  text: string;
  /** The button shown with the expanded problem. */
  action?: 'allow-mic';
}

export interface StatusView {
  dots: StatusDot[];
  /** Dots the line expands for, in dot order. */
  problems: StatusDot[];
}

const withReason = (text: string, reason: string | undefined) => (reason ? `${text} — ${reason}` : text);

function capture(c: StatusSnapshot['capture']): StatusDot {
  const d = (text: string, tone: Tone): StatusDot => ({ key: 'capture', label: 'Capture', text, tone });
  switch (c.state) {
    case 'idle':
      return d('Not capturing', 'idle');
    case 'starting':
      return d('Starting…', 'busy');
    case 'active':
      return d('Capturing the meeting tab', 'ok');
    case 'stopped':
      return d(withReason('Stopped', c.reason), 'idle');
    case 'failed':
      return d(withReason('Failed', c.reason), 'error');
  }
}

function transcription(s: StreamStatus): StatusDot {
  const d = (text: string, tone: Tone): StatusDot => ({ key: 'transcription', label: 'Transcription', text, tone });
  switch (s.state) {
    case 'idle':
      return d('Not running', 'idle');
    case 'connecting':
      return d('Connecting…', 'busy');
    case 'active':
      return d(withReason('Transcribing', s.reason), 'ok');
    case 'reconnecting':
      return d(withReason('Reconnecting…', s.reason), 'busy');
    case 'failed':
      return d(withReason('Stopped working', s.reason), 'error');
    case 'stopped':
      return d('Stopped', 'idle');
  }
}

function speakerNames(s: StatusSnapshot['speakerNames']): StatusDot {
  const d = (text: string, tone: Tone): StatusDot => ({ key: 'speakerNames', label: 'Speaker names', text, tone });
  switch (s.state) {
    case 'idle':
      return d('Not running', 'idle');
    case 'starting':
      return d(s.reason, 'busy');
    case 'active':
      return d('On', 'ok');
    case 'degraded':
      return d(withReason('Unavailable', s.reason), 'error');
    case 'unavailable':
      return d(withReason('Not available', s.reason), 'idle');
  }
}

function mic(m: StatusSnapshot['mic']): StatusDot {
  const d = (text: string, tone: Tone): StatusDot => ({ key: 'mic', label: 'Microphone', text, tone });
  switch (m.state) {
    case 'active':
      return d(withReason('Live', m.reason), 'ok');
    case 'muted':
      // The reason says it all: "Muted in Meet — not sent", "Checking Meet's mute state — not sent", or K33.
      return d(m.reason ?? 'Muted — not sent', 'idle');
    case 'off':
      return d('Off', 'idle');
    case 'unavailable':
      return { ...d(withReason('Not available', m.reason), 'error'), action: 'allow-mic' };
  }
}

/** `running`: a meeting is being transcribed, so missing speaker names explain every "Others" line. */
export function statusDots(status: StatusSnapshot, { running }: { running: boolean }): StatusView {
  const dots = [
    capture(status.capture),
    transcription(status.transcription),
    speakerNames(status.speakerNames),
    mic(status.mic),
  ];
  const isProblem = (d: StatusDot) =>
    d.tone === 'error' ||
    (d.key === 'speakerNames' && running && status.speakerNames.state === 'unavailable') ||
    // Design decision 34: the user's own speech is withheld; the line says so instead of only a tooltip.
    (d.key === 'mic' && status.mic.state === 'muted' && status.mic.reason === MUTE_UNREADABLE_REASON) ||
    // Design decision 36: the meeting stopped without the user pressing Stop; the line says why (K34).
    (d.key === 'capture' && status.capture.state === 'stopped' && status.capture.reason === CALL_ENDED_REASON);
  return { dots, problems: dots.filter(isProblem) };
}
