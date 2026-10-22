// Settings schema (data-model.md "Settings"). Credentials are stored separately and never appear here.
import { DEFAULT_CHAT_PROVIDER, defaultModel, isModelOf, type ChatProviderId } from '../chat/models';
import { normaliseName } from '../transcript/labels';

/** A remembered caption name → display name (002 FR-022, data-model.md Settings, design decision 20). */
export interface SpeakerNameMapping {
  captionName: string;
  displayName: string;
  /** Epoch ms of the last change. */
  updatedAt: number;
}

export const MAX_SPEAKER_NAME_MAPPINGS = 500;
/** Same rule as a label typed in the panel (contracts/live-port-and-labels.md). */
export const MAX_DISPLAY_NAME_LENGTH = 60;
const MAX_CAPTION_NAME_LENGTH = 200;

/** 003 data-model ChatSettings: which provider answers, the model chosen per provider, and the setup step. No key. */
export interface ChatSettings {
  provider: ChatProviderId;
  models: Record<ChatProviderId, string>;
  /** The first-run chat step is done (research R16, FR-011a); false on installs set up before 003. */
  setupComplete: boolean;
}

export const DEFAULT_CHAT_SETTINGS: Readonly<ChatSettings> = Object.freeze({
  provider: DEFAULT_CHAT_PROVIDER,
  models: Object.freeze({ anthropic: defaultModel('anthropic'), openai: defaultModel('openai') }),
  setupComplete: false,
});

export interface Settings {
  schemaVersion: 1;
  userName: string;
  keyterms: string[];
  consentReminder: boolean;
  firstRunComplete: boolean;
  headphonesNoticeDismissed: boolean;
  /** 002: Settings → Remembered names. */
  speakerNameMappings: SpeakerNameMapping[];
  /** 003: Settings → Questions. */
  chat: ChatSettings;
  /** Design decision 41 (001 FR-011b): ask ElevenLabs to leave out fillers and false starts. Default on. */
  cleanTranscript: boolean;
  /** 002 FR-028 (design decision 61): leave Meet's captions visible while transcribing. Default off (hidden). */
  showMeetCaptions: boolean;
  /** 017 FR-001 (design decision 103): Settings → Questions → Ask questions about the meeting. Default on. */
  askEnabled: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  schemaVersion: 1,
  userName: '',
  keyterms: [],
  consentReminder: true,
  firstRunComplete: false,
  headphonesNoticeDismissed: false,
  speakerNameMappings: [],
  chat: DEFAULT_CHAT_SETTINGS,
  cleanTranscript: true,
  showMeetCaptions: false,
  askEnabled: true,
});

export const MAX_USER_NAME_LENGTH = 60;

export type UserNameResult = { ok: true; value: string } | { ok: false; error: 'empty' | 'too-long' };

export function validateUserName(input: string): UserNameResult {
  const value = input.trim();
  if (value === '') return { ok: false, error: 'empty' };
  if (value.length > MAX_USER_NAME_LENGTH) return { ok: false, error: 'too-long' };
  return { ok: true, value };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Reads whatever is stored, field by field, falling back to defaults; unknown fields are dropped. */
export function parseSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isRecord(raw)) return { ...d, keyterms: [], speakerNameMappings: [], chat: parseChatSettings(undefined) };
  return {
    schemaVersion: 1,
    userName: typeof raw.userName === 'string' ? raw.userName : d.userName,
    keyterms: Array.isArray(raw.keyterms) ? raw.keyterms.filter((t): t is string => typeof t === 'string') : [],
    consentReminder: bool(raw.consentReminder, d.consentReminder),
    firstRunComplete: bool(raw.firstRunComplete, d.firstRunComplete),
    headphonesNoticeDismissed: bool(raw.headphonesNoticeDismissed, d.headphonesNoticeDismissed),
    speakerNameMappings: parseSpeakerNameMappings(raw.speakerNameMappings),
    chat: parseChatSettings(raw.chat),
    cleanTranscript: bool(raw.cleanTranscript, d.cleanTranscript),
    showMeetCaptions: bool(raw.showMeetCaptions, d.showMeetCaptions),
    askEnabled: bool(raw.askEnabled, d.askEnabled),
  };
}

/** Field by field with defaults; only the three known fields survive, so nothing named like a key can (003 T006). */
export function parseChatSettings(raw: unknown): ChatSettings {
  const chat = isRecord(raw) ? raw : {};
  const models = isRecord(chat.models) ? chat.models : {};
  const model = (provider: ChatProviderId): string => {
    const id = models[provider];
    return typeof id === 'string' && isModelOf(provider, id) ? id : defaultModel(provider);
  };
  return {
    provider: chat.provider === 'openai' || chat.provider === 'anthropic' ? chat.provider : DEFAULT_CHAT_PROVIDER,
    models: { anthropic: model('anthropic'), openai: model('openai') },
    setupComplete: bool(chat.setupComplete, false),
  };
}

/** A display name: one line, 1–60 chars once trimmed; null when invalid. */
function displayName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim();
  return name.length >= 1 && name.length <= MAX_DISPLAY_NAME_LENGTH && !/[\r\n]/.test(name) ? name : null;
}

function parseMapping(v: unknown): SpeakerNameMapping | null {
  if (!isRecord(v) || typeof v.captionName !== 'string') return null;
  const captionName = v.captionName;
  if (captionName.trim() === '' || captionName.length > MAX_CAPTION_NAME_LENGTH) return null;
  const name = displayName(v.displayName);
  if (name === null || typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt)) return null;
  return { captionName, displayName: name, updatedAt: v.updatedAt };
}

/**
 * Stored mappings, cleaned: invalid entries dropped, one per normalised caption name (the newest wins), mappings that
 * change nothing removed, and at most MAX_SPEAKER_NAME_MAPPINGS (the oldest dropped). Order is kept.
 */
export function parseSpeakerNameMappings(raw: unknown): SpeakerNameMapping[] {
  if (!Array.isArray(raw)) return [];
  const newest = new Map<string, SpeakerNameMapping>();
  for (const entry of raw) {
    const m = parseMapping(entry);
    if (!m) continue;
    const key = normaliseName(m.captionName);
    const seen = newest.get(key);
    if (!seen || m.updatedAt >= seen.updatedAt) {
      newest.delete(key);
      newest.set(key, m);
    }
  }
  let list = [...newest.entries()].filter(([key, m]) => key !== normaliseName(m.displayName)).map(([, m]) => m);
  if (list.length > MAX_SPEAKER_NAME_MAPPINGS) {
    const keep = new Set([...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SPEAKER_NAME_MAPPINGS));
    list = list.filter((m) => keep.has(m));
  }
  return list;
}

/** Adds or replaces the mapping for `captionName`; a display name equal to the caption name removes it. */
export function rememberMapping(
  list: readonly SpeakerNameMapping[],
  captionName: string,
  name: string,
  now: number,
): SpeakerNameMapping[] {
  const display = displayName(name);
  if (display === null) throw new Error('A display name is 1–60 characters on one line.');
  const rest = forgetMapping(list, captionName);
  return parseSpeakerNameMappings([...rest, { captionName, displayName: display, updatedAt: now }]);
}

export function forgetMapping(list: readonly SpeakerNameMapping[], captionName: string): SpeakerNameMapping[] {
  const key = normaliseName(captionName);
  return list.filter((m) => normaliseName(m.captionName) !== key);
}

/** FR-001: Start needs a saved name, a saved (validated) key and completed first run. */
export function isReadyToStart(settings: Settings, keyPresent: boolean): boolean {
  return keyPresent && settings.firstRunComplete && validateUserName(settings.userName).ok;
}
