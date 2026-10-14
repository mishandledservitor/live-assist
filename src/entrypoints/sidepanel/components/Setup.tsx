// First-run setup (US2, FR-001/002/005; 003 FR-011a): name, ElevenLabs key and the chat provider with its key, each
// key checked by the service worker and then shown only masked, with what each provider keeps; then the one-time
// microphone permission. Installs set up before 003 get the chat step alone, once (`mode="chat"`, research R16).
import { useState, type FormEvent } from 'react';
import { KEY_PRODUCT_NAMES, setupChatKeyErrorText } from '../../../core/chat/messages';
import type { ChatProviderId } from '../../../core/chat/models';
import { MAX_USER_NAME_LENGTH, validateUserName } from '../../../core/settings/schema';
import { KEY_ERROR_MESSAGES, maskedKey } from '../key-messages';
import type { LoadedSettings, SettingsApi } from '../settings-api';
import { ChatRetention } from './ChatRetention';
import { ProviderRadios } from './ChatSettings';
import { RetentionNotice } from './RetentionNotice';

export interface SetupProps {
  api: SettingsApi;
  /** What was loaded before setup: the chat settings to keep (per-provider models) and any saved hints. */
  initial: LoadedSettings;
  /** `chat`: only the chat provider and key (an install set up before 003). */
  mode?: 'full' | 'chat';
  onComplete: (loaded: LoadedSettings) => void;
}

const NAME_ERRORS = {
  empty: 'Enter your name.',
  'too-long': `Use at most ${MAX_USER_NAME_LENGTH} characters for your name.`,
} as const;

export function Setup({ api, initial, mode = 'full', onComplete }: SetupProps) {
  const full = mode === 'full';
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [provider, setProvider] = useState<ChatProviderId>(initial.settings.chat.provider);
  const [chatKey, setChatKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState<LoadedSettings | null>(null);
  /** The ElevenLabs key that already passed (promoted), so a re-submit does not check it again. */
  const [passed, setPassed] = useState<{ candidate: string; hint: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const nameResult = full ? validateUserName(name) : null;
    if (nameResult && !nameResult.ok) return setError(NAME_ERRORS[nameResult.error]);
    const candidate = key.trim();
    if (full && candidate === '') return setError(KEY_ERROR_MESSAGES.missing);
    const chatCandidate = chatKey.trim();
    if (chatCandidate === '') return setError(setupChatKeyErrorText(provider, 'missing-key'));

    setError(null);
    setChecking(true);
    try {
      let keyHint = initial.keyHint;
      if (full) {
        if (passed?.candidate === candidate) keyHint = passed.hint;
        else {
          const result = await api.validateKey(candidate);
          if (!result.ok) return setError(KEY_ERROR_MESSAGES[result.kind]);
          setPassed({ candidate, hint: result.hint });
          keyHint = result.hint;
        }
      }
      const chatResult = await api.replaceChatKey(provider, chatCandidate);
      if (!chatResult.ok) return setError(setupChatKeyErrorText(provider, chatResult.kind));

      // The whole chat object, so each provider's model survives the shallow settings merge.
      const chat = { ...initial.settings.chat, provider, setupComplete: true };
      const settings = await api.saveSettings(
        nameResult?.ok ? { userName: nameResult.value, firstRunComplete: true, chat } : { chat },
      );
      setKey('');
      setChatKey('');
      setSaved({ settings, keyHint, chatKeyHints: { ...initial.chatKeyHints, [provider]: chatResult.hint } });
    } finally {
      setChecking(false);
    }
  }

  if (saved) {
    const chatHint = saved.chatKeyHints[saved.settings.chat.provider] ?? '';
    return (
      <section aria-labelledby="setup-heading">
        <h2 id="setup-heading">Set up live-assist</h2>
        {full ? (
          <>
            <p>
              Keys saved on this computer only: ElevenLabs <code>{maskedKey(saved.keyHint ?? '')}</code>,{' '}
              {KEY_PRODUCT_NAMES[saved.settings.chat.provider]} <code>{maskedKey(chatHint)}</code>
            </p>
            <p>
              live-assist also transcribes your microphone. Chrome asks for microphone access once, in a separate tab;
              after that it is used only while you transcribe.
            </p>
            <button type="button" onClick={() => void api.openMicPermission()}>
              Allow microphone
            </button>{' '}
          </>
        ) : (
          <p>
            Key saved on this computer only: <code>{maskedKey(chatHint)}</code>
          </p>
        )}
        <button type="button" onClick={() => onComplete(saved)}>
          Done
        </button>
      </section>
    );
  }

  const keyLabel = `${KEY_PRODUCT_NAMES[provider]} API key`;
  const button = full
    ? checking
      ? 'Checking keys…'
      : 'Check keys and save'
    : checking
      ? 'Checking key…'
      : 'Check key and save';

  return (
    <section aria-labelledby="setup-heading">
      <h2 id="setup-heading">Set up live-assist</h2>
      <form onSubmit={(e) => void submit(e)} noValidate>
        {full && (
          <>
            <p>
              <label htmlFor="setup-name">Your name</label>
              <br />
              <input
                id="setup-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                aria-describedby="setup-name-help"
              />
              <br />
              <small id="setup-name-help">Your own lines are labelled with this name.</small>
            </p>
            <p>
              <label htmlFor="setup-key">ElevenLabs API key</label>
              <br />
              <input
                id="setup-key"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="setup-key-help"
              />
              <br />
              <small id="setup-key-help">
                Stored only in this browser on this computer (never synced). It needs Speech to Text access.
              </small>
            </p>
          </>
        )}
        <ProviderRadios name="setup-provider" value={provider} onChange={setProvider} />
        <p>
          <label htmlFor="setup-chat-key">{keyLabel}</label>
          <br />
          <input
            id="setup-chat-key"
            type="password"
            value={chatKey}
            onChange={(e) => setChatKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="setup-chat-key-help"
          />
          <br />
          <small id="setup-chat-key-help">Stored only in this browser on this computer (never synced).</small>
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={checking}>
          {button}
        </button>
      </form>
      {full && <RetentionNotice />}
      <ChatRetention provider={provider} headingLevel={2} />
    </section>
  );
}
