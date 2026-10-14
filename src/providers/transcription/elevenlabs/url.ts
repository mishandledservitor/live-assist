import type { LanguageMode } from '../../../core/transcript/model';

export const REALTIME_ENDPOINT = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

/** Seconds of silence that end a committed line (001 research R3, "Real call 2026-10-09"). */
export const VAD_SILENCE_THRESHOLD_SECS = '1.0';

export interface RealtimeUrlOptions {
  /** Single-use realtime_scribe token (research R1). */
  token: string;
  language: LanguageMode;
  keyterms: readonly string[];
  /** Design decision 41 (001 FR-011b): `no_verbatim=true` — fillers and false starts left out. */
  noVerbatim?: boolean;
  /** Spike B only (research R8). */
  secondaryLanguages?: readonly string[];
}

/**
 * Array parameters are encoded as repeated query keys. Unverified against a live session_started.config echo;
 * the first manual check confirms it (contracts/transcription-provider.md).
 */
export function buildRealtimeUrl(opts: RealtimeUrlOptions): string {
  const params = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    token: opts.token,
    audio_format: 'pcm_16000',
    commit_strategy: 'vad',
    // 001 FR-011a (real call 2026-10-09, research R3): end a line after 1.0 s of silence instead of the service default.
    vad_silence_threshold_secs: VAD_SILENCE_THRESHOLD_SECS,
    include_timestamps: 'true',
    include_language_detection: 'true',
  });
  if (opts.noVerbatim === true) params.set('no_verbatim', 'true');
  if (opts.language.kind === 'fixed') params.set('language_code', opts.language.code);
  for (const term of opts.keyterms) params.append('keyterms', term);
  for (const code of opts.secondaryLanguages ?? []) params.append('secondary_languages', code);
  return `${REALTIME_ENDPOINT}?${params.toString()}`;
}
