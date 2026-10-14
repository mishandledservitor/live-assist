// Plain-language results of the key check (FR-002, FR-022): what happened and what to do next.
import type { CredentialErrorKind } from '../../core/messaging/protocol';

export const KEY_ERROR_MESSAGES: Record<CredentialErrorKind, string> = {
  missing: 'Enter your ElevenLabs API key.',
  invalid:
    'ElevenLabs rejected this key. Check that you copied the whole key, or create a new one in your ElevenLabs account.',
  forbidden:
    'This key is not allowed to use speech-to-text. In your ElevenLabs account, edit the key and enable Speech to Text, then try again.',
  network: 'Could not reach ElevenLabs. Check your internet connection and try again.',
  'rate-limited': 'ElevenLabs is limiting requests right now. Wait a minute and try again.',
  unknown: 'ElevenLabs returned an unexpected response. Try again in a moment.',
};

export const maskedKey = (hint: string) => `••••${hint}`;
