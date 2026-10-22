// Settings (US2, FR-004): name, replace/remove key, key terms (over-limit terms kept but flagged), consent reminder,
// and a way back to the microphone permission page.
import { useState, type ClipboardEvent, type FormEvent, type ReactNode } from 'react';
import {
  MAX_KEYTERM_LENGTH,
  MAX_KEYTERMS,
  addKeyterms,
  insertKeytermList,
  normalizeKeyterms,
  planKeyterms,
} from '../../../core/settings/keyterms';
import { MAX_USER_NAME_LENGTH, validateUserName, type Settings as SettingsData } from '../../../core/settings/schema';
import type { SettingsPatch } from '../../../storage/panel-settings-store';
import { KEY_ERROR_MESSAGES, maskedKey } from '../key-messages';
import type { LoadedSettings, SettingsApi } from '../settings-api';
import { ChatSettings } from './ChatSettings';
import { RememberedNames } from './RememberedNames';

export interface SettingsProps {
  api: SettingsApi;
  loaded: LoadedSettings;
  onChange: (loaded: LoadedSettings) => void;
  /** 006: the ElevenLabs account section, placed after the key (contracts/panel-ui.md). */
  account?: ReactNode;
}

const NAME_ERRORS = {
  empty: 'Enter your name.',
  'too-long': `Use at most ${MAX_USER_NAME_LENGTH} characters for your name.`,
} as const;

const FLAG_TEXT = {
  'too-long': `is longer than ${MAX_KEYTERM_LENGTH} characters`,
  'too-many': `is over the ${MAX_KEYTERMS}-term limit`,
} as const;

export function Settings({ api, loaded, onChange, account }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsData>(loaded.settings);
  const [keyHint, setKeyHint] = useState<string | null>(loaded.keyHint);
  const [chatKeyHints, setChatKeyHints] = useState(loaded.chatKeyHints);

  const [name, setName] = useState(loaded.settings.userName);
  const [nameMsg, setNameMsg] = useState<{ error: boolean; text: string } | null>(null);

  const [newKey, setNewKey] = useState('');
  const [keyMsg, setKeyMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [drafts, setDrafts] = useState<string[]>(loaded.settings.keyterms);
  const [newTerms, setNewTerms] = useState('');

  function publish(next: SettingsData, hint: string | null, chatHints = chatKeyHints) {
    setSettings(next);
    setKeyHint(hint);
    setChatKeyHints(chatHints);
    onChange({ settings: next, keyHint: hint, chatKeyHints: chatHints });
  }

  async function save(patch: SettingsPatch): Promise<SettingsData> {
    const next = await api.saveSettings(patch);
    publish(next, keyHint);
    return next;
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const result = validateUserName(name);
    if (!result.ok) return setNameMsg({ error: true, text: NAME_ERRORS[result.error] });
    await save({ userName: result.value });
    setName(result.value);
    setNameMsg({ error: false, text: 'Name saved.' });
  }

  async function replaceKey(e: FormEvent) {
    e.preventDefault();
    const candidate = newKey.trim();
    if (candidate === '') return setKeyMsg({ error: true, text: KEY_ERROR_MESSAGES.missing });
    setChecking(true);
    setKeyMsg(null);
    try {
      const result = await api.validateKey(candidate);
      if (!result.ok) return setKeyMsg({ error: true, text: KEY_ERROR_MESSAGES[result.kind] });
      setNewKey('');
      publish(settings, result.hint);
      setKeyMsg({ error: false, text: 'Key replaced.' });
    } finally {
      setChecking(false);
    }
  }

  async function removeKey() {
    await api.removeKey();
    setConfirmRemove(false);
    publish(settings, null);
    setKeyMsg({ error: false, text: 'Key removed.' });
  }

  async function saveTerms(terms: readonly string[]) {
    const next = normalizeKeyterms(terms);
    setDrafts(next);
    await save({ keyterms: next });
  }

  // FR-004a: the field takes a list (commas or lines); the whole list is one save.
  async function addTerms(e: FormEvent) {
    e.preventDefault();
    const next = addKeyterms(drafts, newTerms);
    setNewTerms('');
    if (next.join('\n') !== settings.keyterms.join('\n')) await saveTerms(next);
  }

  // A single-line field drops pasted line breaks, so a pasted column of names goes in comma-separated.
  function pasteTerms(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (!/[\r\n]/.test(text)) return;
    e.preventDefault();
    const field = e.currentTarget;
    const at = field.value.length;
    setNewTerms(insertKeytermList(field.value, field.selectionStart ?? at, field.selectionEnd ?? at, text));
  }

  const flagged = planKeyterms(settings.keyterms).flagged;

  return (
    <>
      <form onSubmit={(e) => void saveName(e)} noValidate>
        <label htmlFor="settings-name">Your name</label>{' '}
        <input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />{' '}
        <button type="submit">Save name</button>
        {nameMsg && <p role={nameMsg.error ? 'alert' : 'status'}>{nameMsg.text}</p>}
      </form>

      <section aria-labelledby="elevenlabs-key-heading">
        <h3 id="elevenlabs-key-heading">ElevenLabs API key</h3>
        <p>
          {keyHint === null ? (
            'No key saved.'
          ) : (
            <>
              Saved key: <code>{maskedKey(keyHint)}</code>
            </>
          )}
        </p>
        <form onSubmit={(e) => void replaceKey(e)} noValidate>
          <label htmlFor="settings-key">New key</label>{' '}
          <input
            id="settings-key"
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />{' '}
          <button type="submit" disabled={checking}>
            {checking ? 'Checking key…' : 'Check and replace key'}
          </button>
        </form>
        {keyHint !== null &&
          (confirmRemove ? (
            <p>
              Remove the saved key? Transcription cannot start without one.{' '}
              <button type="button" onClick={() => void removeKey()}>
                Yes, remove
              </button>{' '}
              <button type="button" onClick={() => setConfirmRemove(false)}>
                Cancel
              </button>
            </p>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)}>
              Remove key
            </button>
          ))}
        {keyMsg && <p role={keyMsg.error ? 'alert' : 'status'}>{keyMsg.text}</p>}
      </section>

      {account}

      <h3 id="keyterms-heading">Key terms</h3>
      <p>
        Names and words that should be recognised correctly (at most {MAX_KEYTERMS}, each up to {MAX_KEYTERM_LENGTH}{' '}
        characters). Used from the next Start.
      </p>
      <ul aria-label="Key terms">
        {drafts.map((term, i) => (
          <li key={i}>
            <input
              aria-label={`Key term ${i + 1}`}
              value={term}
              onChange={(e) => setDrafts((d) => d.map((t, j) => (j === i ? e.target.value : t)))}
              onBlur={() => {
                if (drafts.join('\n') !== settings.keyterms.join('\n')) void saveTerms(drafts);
              }}
            />{' '}
            <button
              type="button"
              aria-label={`Remove ${term}`}
              onClick={() => void saveTerms(drafts.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {flagged.length > 0 && (
        <ul aria-label="Key terms not used">
          {flagged.map((f) => (
            <li key={f.term}>
              &ldquo;{f.term}&rdquo; {FLAG_TEXT[f.reason]} — kept here but not sent for transcription.
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void addTerms(e)}>
        <label htmlFor="settings-new-terms">New key terms, separated by commas or one per line</label>{' '}
        <input
          id="settings-new-terms"
          value={newTerms}
          onChange={(e) => setNewTerms(e.target.value)}
          onPaste={pasteTerms}
        />{' '}
        <button type="submit">Add terms</button>
      </form>

      <ChatSettings
        api={api}
        chat={settings.chat}
        hints={chatKeyHints}
        onSettings={(next) => publish(next, keyHint)}
        onHints={(hints) => publish(settings, keyHint, hints)}
        askEnabled={settings.askEnabled}
        onAskEnabled={(askEnabled) => {
          setSettings((s) => ({ ...s, askEnabled }));
          void save({ askEnabled });
        }}
      />

      <h3>Consent reminder</h3>
      <label>
        <input
          type="checkbox"
          checked={settings.consentReminder}
          onChange={(e) => {
            const consentReminder = e.target.checked;
            setSettings((s) => ({ ...s, consentReminder }));
            void save({ consentReminder });
          }}
        />{' '}
        Remind me to tell participants they are being transcribed each time I press Start
      </label>

      <h3>Clean transcript</h3>
      <label>
        <input
          type="checkbox"
          checked={settings.cleanTranscript}
          onChange={(e) => {
            const cleanTranscript = e.target.checked;
            setSettings((s) => ({ ...s, cleanTranscript }));
            void save({ cleanTranscript });
          }}
        />{' '}
        Leave out fillers and false starts
      </label>

      {/* 002 FR-028 (design decision 61, copy-review K42): a row of its own, no heading, no helper text. */}
      <label className="setting-alone">
        <input
          type="checkbox"
          checked={settings.showMeetCaptions}
          onChange={(e) => {
            const showMeetCaptions = e.target.checked;
            setSettings((s) => ({ ...s, showMeetCaptions }));
            void save({ showMeetCaptions });
          }}
        />{' '}
        Show Meet captions
      </label>

      <RememberedNames api={api} />

      <h3>Microphone</h3>
      <button type="button" onClick={() => void api.openMicPermission()}>
        Allow microphone
      </button>
    </>
  );
}
