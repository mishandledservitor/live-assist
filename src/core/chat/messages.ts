// What the Ask area says when an answer fails or a question cannot be sent (003 contracts/ask-ui.md "Strings").
// Each says what happened and, where there is one, what to do; none names a mechanism.
import { modelLabel, type ChatProviderId } from './models';
import type { ChatErrorKind, CheckKeyResult } from './provider';

export const PROVIDER_NAMES: Readonly<Record<ChatProviderId, string>> = Object.freeze({
  anthropic: 'Anthropic',
  openai: 'OpenAI',
});

/** The error under a failed answer. `model` is the model asked for; `hasNotes`: the meeting has notes (008). */
export function chatErrorText(
  kind: ChatErrorKind,
  provider: ChatProviderId,
  model: string,
  options: { hasNotes?: boolean } = {},
): string {
  const P = PROVIDER_NAMES[provider];
  const M = modelLabel(model);
  switch (kind) {
    case 'invalid-key':
      return `${P} rejected the API key. Replace it in Settings.`;
    case 'forbidden':
      return `This ${P} API key isn't allowed to use ${M}.`;
    case 'billing':
      return `${P} refused the request because of the account's billing or credit. Check your ${P} account.`;
    case 'model-unavailable':
      return `${M} isn't available to this ${P} account. Pick another model in Settings.`;
    case 'rate-limited':
      return `${P} is rate-limiting requests. Try again in a moment.`;
    case 'overloaded':
    case 'unavailable':
      return `${P} is busy or unavailable. Try again in a moment.`;
    case 'network':
      return `Couldn't reach ${P}.`;
    case 'too-large':
      return options.hasNotes
        ? `The meeting and your notes are too long to send to ${M} in full. Remove or shorten the notes.`
        : `The meeting is too long to send to ${M} in full.`;
    case 'declined':
      return `${M} declined to answer this question.`;
    // Which side stalled is not known, so no provider is named (003 FR-018a, design decision 80).
    case 'no-answer':
      return NO_ANSWER_TEXT;
    default:
      return `${P} returned an unexpected response.`;
  }
}

export const CUT_OFF_TEXT = 'The answer was cut off.';
export const NO_ANSWER_TEXT = 'No answer came back. Ask again.';
/** The accessible name of the mark a turn shows until the first text of its answer (003 FR-003a). */
export const WAITING_FOR_ANSWER = 'Waiting for the answer';
export const NOTHING_TRANSCRIBED = 'Nothing transcribed yet.';

/** The notice beside the box when the selected provider has no key (ask-ui "Strings"). */
export function missingKeyText(selected: ChatProviderId, hints: Record<ChatProviderId, string | null>): string {
  if (hints.anthropic === null && hints.openai === null)
    return 'Add a Claude or OpenAI key in Settings to ask questions.';
  return selected === 'anthropic'
    ? 'Add a Claude key in Settings to ask questions.'
    : 'Add an OpenAI key in Settings to ask questions.';
}

/** The key's product name, as the user knows it from the provider's console. */
export const KEY_PRODUCT_NAMES: Readonly<Record<ChatProviderId, string>> = Object.freeze({
  anthropic: 'Claude',
  openai: 'OpenAI',
});

export type ChatKeyFailure = Extract<CheckKeyResult, { ok: false }>['kind'] | 'missing-key';

/** Settings → {Claude|OpenAI} API key: why a key check failed (ask-ui rows 4b, 4c). */
export function chatKeyResultText(provider: ChatProviderId, kind: ChatKeyFailure): string {
  const P = PROVIDER_NAMES[provider];
  const K = KEY_PRODUCT_NAMES[provider];
  switch (kind) {
    case 'missing-key':
      return `Enter your ${K} API key.`;
    case 'invalid-key':
      return `${P} rejected the API key.`;
    case 'forbidden':
      return `This key isn't allowed to use the ${K} API.`;
    case 'network':
      return `Couldn't reach ${P}.`;
    default:
      return `${P} returned an unexpected response. Try again in a moment.`;
  }
}

export const CHAT_KEY_WORKS = 'Key works.';

/** First-run setup: why the chat key failed, and what to do next (ask-ui "First-run setup additions"). */
export function setupChatKeyErrorText(provider: ChatProviderId, kind: ChatKeyFailure): string {
  const P = PROVIDER_NAMES[provider];
  const K = KEY_PRODUCT_NAMES[provider];
  switch (kind) {
    case 'missing-key':
      return `Enter your ${K} API key.`;
    case 'invalid-key':
      return provider === 'anthropic'
        ? 'Anthropic rejected this key. Check that you copied the whole key, or create a new one in the Claude Console.'
        : 'OpenAI rejected this key. Check that you copied the whole key, or create a new one in your OpenAI account.';
    case 'forbidden':
      return `This key isn't allowed to use the ${K} API.`;
    case 'network':
      return `Could not reach ${P}. Check your internet connection and try again.`;
    default:
      return `${P} returned an unexpected response. Try again in a moment.`;
  }
}
