// ElevenLabs realtime wire messages (research R2).
import type { ProviderWord } from '../provider';
import { classifyErrorType, sanitizeServerText } from './errors';

export const PREVIOUS_TEXT_MAX = 50;

/** Serialises input_audio_chunk; previous_text rides on the first chunk of a session only (later → server error). */
export class AudioChunkEncoder {
  private previousText: string | null;

  constructor(
    private readonly sampleRate: number,
    previousText?: string,
  ) {
    this.previousText = previousText ? previousText.slice(-PREVIOUS_TEXT_MAX) : null;
  }

  encode(audioBase64: string): string {
    const msg: Record<string, unknown> = {
      message_type: 'input_audio_chunk',
      audio_base_64: audioBase64,
      commit: false,
      sample_rate: this.sampleRate,
    };
    if (this.previousText !== null) {
      msg.previous_text = this.previousText;
      this.previousText = null;
    }
    return JSON.stringify(msg);
  }
}

export type ServerMessage =
  | { type: 'started'; sessionId: string }
  | { type: 'partial'; text: string }
  | { type: 'committed'; text: string }
  | { type: 'committed-detail'; text: string; language: string | null; words: ProviderWord[] }
  | { type: 'server-error'; errorType: string; text: string }
  | { type: 'ignored' };

const IGNORED: ServerMessage = { type: 'ignored' };
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseWords(raw: unknown): ProviderWord[] {
  if (!Array.isArray(raw)) return [];
  const words: ProviderWord[] = [];
  for (const w of raw as unknown[]) {
    if (typeof w !== 'object' || w === null) continue;
    const { text, start, end, type } = w as Record<string, unknown>;
    if (type !== 'word' || !isStr(text) || !isNum(start) || !isNum(end)) continue;
    words.push({ text, startSec: start, endSec: end });
  }
  return words;
}

/** Unknown types and malformed data are ignored, never thrown (contract behaviour 6). */
export function parseServerMessage(data: string): ServerMessage {
  let m: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return IGNORED;
    m = parsed as Record<string, unknown>;
  } catch {
    return IGNORED;
  }
  const type = m.message_type;
  if (!isStr(type)) return IGNORED;

  switch (type) {
    case 'session_started':
      return isStr(m.session_id) ? { type: 'started', sessionId: m.session_id } : IGNORED;
    case 'partial_transcript':
      return isStr(m.text) ? { type: 'partial', text: m.text } : IGNORED;
    case 'committed_transcript':
      return isStr(m.text) ? { type: 'committed', text: m.text } : IGNORED;
    case 'committed_transcript_with_timestamps':
      return isStr(m.text)
        ? {
            type: 'committed-detail',
            text: m.text,
            language: isStr(m.language_code) && m.language_code !== '' ? m.language_code : null,
            words: parseWords(m.words),
          }
        : IGNORED;
    default:
      if (classifyErrorType(type) === null) return IGNORED;
      return { type: 'server-error', errorType: type, text: sanitizeServerText(isStr(m.error) ? m.error : '') };
  }
}
