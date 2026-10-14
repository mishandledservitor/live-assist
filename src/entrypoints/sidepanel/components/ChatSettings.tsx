// Settings → Questions (003 FR-011–FR-013, contracts/ask-ui.md rows 4a–4c): which provider answers, its model, and
// a key per provider. A key is written once as a candidate and checked by the service worker; the panel only ever
// sees its last four characters (FR-014a).
import { useId, useState, type FormEvent } from 'react';
import { CHAT_KEY_WORKS, chatKeyResultText, KEY_PRODUCT_NAMES, type ChatKeyFailure } from '../../../core/chat/messages';
import { CHAT_PROVIDERS, modelsFor, type ChatProviderId } from '../../../core/chat/models';
import type { ChatKeyHintsReply } from '../../../core/messaging/protocol';
import type { ChatSettings as ChatSettingsData, Settings } from '../../../core/settings/schema';
import { maskedKey } from '../key-messages';
import type { SettingsApi } from '../settings-api';

export interface ChatSettingsProps {
  api: SettingsApi;
  chat: ChatSettingsData;
  hints: ChatKeyHintsReply;
  onSettings: (settings: Settings) => void;
  onHints: (hints: ChatKeyHintsReply) => void;
}

/** `Answers from`: the provider radios, shared with first-run setup. */
export function ProviderRadios({
  value,
  onChange,
  name,
}: {
  value: ChatProviderId;
  onChange: (provider: ChatProviderId) => void;
  name: string;
}) {
  const labelId = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="provider-radios">
      <span id={labelId}>Answers from</span> {/* OpenAI first: the default (design decision 40). */}
      {(['openai', 'anthropic'] as const).map((p) => (
        <label key={p}>
          <input type="radio" name={name} value={p} checked={value === p} onChange={() => onChange(p)} />{' '}
          {KEY_PRODUCT_NAMES[p]}
        </label>
      ))}
    </div>
  );
}

function ChatKeySection({
  provider,
  hint,
  api,
  onHint,
}: {
  provider: ChatProviderId;
  hint: string | null;
  api: SettingsApi;
  onHint: (hint: string | null) => void;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const heading = `${KEY_PRODUCT_NAMES[provider]} API key`;

  const fail = (kind: ChatKeyFailure) => setMessage({ error: true, text: chatKeyResultText(provider, kind) });

  async function replace(e: FormEvent) {
    e.preventDefault();
    const candidate = value.trim();
    if (candidate === '') return fail('missing-key');
    setChecking(true);
    setMessage(null);
    try {
      const result = await api.replaceChatKey(provider, candidate);
      if (!result.ok) return fail(result.kind);
      onHint(result.hint);
      setMessage({ error: false, text: CHAT_KEY_WORKS });
    } finally {
      // The key never stays on screen, whatever the result.
      setValue('');
      setChecking(false);
    }
  }

  async function remove() {
    await api.removeChatKey(provider);
    onHint(null);
    setMessage({ error: false, text: 'Key removed.' });
  }

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>{heading}</h3>
      <p>
        {hint === null ? (
          'No key saved.'
        ) : (
          <>
            Saved key: <code>{maskedKey(hint)}</code>
          </>
        )}
      </p>
      <form onSubmit={(e) => void replace(e)} noValidate>
        <label htmlFor={`${id}-key`}>New key</label>{' '}
        <input
          id={`${id}-key`}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />{' '}
        <button type="submit" disabled={checking}>
          {checking ? 'Checking key…' : 'Check and replace key'}
        </button>
      </form>
      {hint !== null && (
        <button type="button" onClick={() => void remove()}>
          Remove key
        </button>
      )}
      {message && <p role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    </section>
  );
}

export function ChatSettings({ api, chat: initial, hints: initialHints, onSettings, onHints }: ChatSettingsProps) {
  const [chat, setChat] = useState(initial);
  const [hints, setHints] = useState(initialHints);

  async function save(change: { provider: ChatProviderId; model?: string }) {
    const next = { ...chat, provider: change.provider };
    if (change.model !== undefined) next.models = { ...chat.models, [change.provider]: change.model };
    setChat(next);
    const saved = await api.saveChatSettings(change);
    setChat(saved.chat);
    onSettings(saved);
  }

  const setHint = (provider: ChatProviderId, hint: string | null) => {
    const next = { ...hints, [provider]: hint };
    setHints(next);
    onHints(next);
  };

  return (
    <>
      <h3>Questions</h3>
      <ProviderRadios name="settings-provider" value={chat.provider} onChange={(p) => void save({ provider: p })} />
      <p>
        <label htmlFor="settings-model">Model</label>{' '}
        <select
          id="settings-model"
          value={chat.models[chat.provider]}
          onChange={(e) => void save({ provider: chat.provider, model: e.target.value })}
        >
          {modelsFor(chat.provider).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </p>
      {CHAT_PROVIDERS.map((p) => (
        <ChatKeySection key={p} provider={p} hint={hints[p]} api={api} onHint={(h) => setHint(p, h)} />
      ))}
    </>
  );
}
