// Spike A run conditions and run.json format (research R7). Pure and browser-safe: shared by the dev-only recorder
// page (src/entrypoints/spike-recorder) and the Node scorer (spikes/echo.ts).

export type EchoConditionId = 'headphones-aec-on' | 'speakers-aec-on' | 'speakers-aec-off' | 'speakers-aec-all';

export interface EchoCondition {
  run: number;
  id: EchoConditionId;
  title: string;
  instructions: string;
  output: 'headphones' | 'speakers';
  /** Requested mic echoCancellation constraint. `'all'` exists only where Chrome reports it in getCapabilities. */
  echoCancellation: boolean | 'all';
}

export const ECHO_CONDITIONS: readonly EchoCondition[] = [
  {
    run: 1,
    id: 'headphones-aec-on',
    title: 'Headphones, echo cancellation on',
    instructions:
      'Wear headphones. Let the other person read for about 2 minutes; say a few sentences of your own in between.',
    output: 'headphones',
    echoCancellation: true,
  },
  {
    run: 2,
    id: 'speakers-aec-on',
    title: 'Laptop speakers, echo cancellation on',
    instructions:
      'Take the headphones off so the call plays from the laptop speakers at your normal volume. Same reading, about 2 minutes, a few sentences of your own.',
    output: 'speakers',
    echoCancellation: true,
  },
  {
    run: 3,
    id: 'speakers-aec-off',
    title: 'Laptop speakers, echo cancellation off',
    instructions: 'Still on speakers, same volume. Same reading, about 2 minutes.',
    output: 'speakers',
    echoCancellation: false,
  },
  {
    run: 4,
    id: 'speakers-aec-all',
    title: 'Laptop speakers, echo cancellation "all"',
    instructions:
      'Still on speakers. Only offered when this Chrome supports echoCancellation: "all" (cancels all system audio, not just this page).',
    output: 'speakers',
    echoCancellation: 'all',
  },
];

export interface RunMeta {
  schema: 1;
  condition: EchoConditionId;
  /** ISO time the recording started. */
  startedAt: string;
  durationMs: number;
  chromeVersion: string | null;
  /** Mic constraints the recorder asked for. */
  requestedMic: Record<string, unknown>;
  /** What Chrome actually applied (MediaStreamTrack.getSettings()). */
  appliedMic: Record<string, unknown>;
  sampleRate: 16000;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseRunMeta(raw: unknown): RunMeta | null {
  if (!isRec(raw)) return null;
  const { schema, condition, startedAt, durationMs, chromeVersion, requestedMic, appliedMic, sampleRate } = raw;
  if (schema !== 1 || sampleRate !== 16000) return null;
  if (!ECHO_CONDITIONS.some((c) => c.id === condition)) return null;
  if (typeof startedAt !== 'string' || typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return null;
  if (chromeVersion !== null && typeof chromeVersion !== 'string') return null;
  if (!isRec(requestedMic) || !isRec(appliedMic)) return null;
  return {
    schema: 1,
    condition: condition as EchoConditionId,
    startedAt,
    durationMs,
    chromeVersion,
    requestedMic,
    appliedMic,
    sampleRate: 16000,
  };
}
