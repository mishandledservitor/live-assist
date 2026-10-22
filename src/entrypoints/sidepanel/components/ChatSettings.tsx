// Settings → Questions (003 FR-011–FR-013, contracts/ask-ui.md rows 4a–4c): which provider answers, its model, and
// the selected provider's key with what it keeps (018, decisions 105-107). A key is written once as a candidate and
// checked by the service worker; the panel only ever sees its last four characters (FR-014a).
import { useId, useState } from 'react';
import { CHAT_KEY_WORKS, chatKeyResultText, KEY_PRODUCT_NAMES } from '../../../core/chat/messages';
import { modelsFor, type ChatProviderId } from '../../../core/chat/models';
import type { ChatKeyHintsReply } from '../../../core/messaging/protocol';
import type { ChatSettings as ChatSettingsData, Settings } from '../../../core/settings/schema';
import type { SettingsApi } from '../settings-api';
import { ChatRetention } from './ChatRetention';
import { KeyBlock } from './KeyBlock';

export interface ChatSettingsProps {
  api: SettingsApi;
  chat: ChatSettingsData;
  hints: ChatKeyHintsReply;
  onSettings: (settings: Settings) => void;
  onHints: (hints: ChatKeyHintsReply) => void;
  /** 017 (design decision 103): Ask on; off leaves only the heading and the tick box. */
  askEnabled: boolean;
  onAskEnabled: (askEnabled: boolean) => void;
  /** 018: the id of the `Questions` heading, which names its Settings group. */
  headingId?: string;
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

export function ChatSettings({
  api,
  chat: initial,
  hints: initialHints,
  onSettings,
  onHints,
  askEnabled,
  onAskEnabled,
  headingId,
}: ChatSettingsProps) {
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
      <h3 id={headingId}>Questions</h3>
      {/* 017 (design decision 103, copy-review K48): first under the heading; nothing says what turning it off hides. */}
      <label className="setting-row">
        <input type="checkbox" checked={askEnabled} onChange={(e) => onAskEnabled(e.target.checked)} /> Ask questions
        about the meeting
      </label>
      {askEnabled && (
        <>
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
          {/* 018 (decision 107): the selected provider's key only; the other provider's stays stored. */}
          <KeyBlock
            key={chat.provider}
            heading={`${KEY_PRODUCT_NAMES[chat.provider]} key`}
            hint={hints[chat.provider]}
            check={async (candidate) => {
              const result = await api.replaceChatKey(chat.provider, candidate);
              return result.ok
                ? { ok: true, hint: result.hint }
                : { ok: false, text: chatKeyResultText(chat.provider, result.kind) };
            }}
            emptyText={chatKeyResultText(chat.provider, 'missing-key')}
            savedText={CHAT_KEY_WORKS}
            remove={() => api.removeChatKey(chat.provider)}
            onHint={(h) => setHint(chat.provider, h)}
          />
          <ChatRetention provider={chat.provider} collapsible />
        </>
      )}
    </>
  );
}
