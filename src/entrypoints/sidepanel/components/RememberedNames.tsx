// Settings → Remembered names (002 FR-022, design decision 20): when a Meet caption name is renamed, the new name is
// remembered and used for that caption name in later meetings. Here the user can review, edit and forget each one.
import { useEffect, useState } from 'react';
import { parseLabelName } from '../../../core/messaging/protocol';
import type { SpeakerNameMapping } from '../../../core/settings/schema';
import type { SettingsApi } from '../settings-api';

const NAME_ERROR = 'Enter a name of 1–60 characters on one line.';

type Api = Pick<
  SettingsApi,
  'listSpeakerNames' | 'rememberSpeakerName' | 'forgetSpeakerName' | 'onSpeakerNamesChanged'
>;

function Row({ mapping, api, onChanged }: { mapping: SpeakerNameMapping; api: Api; onChanged: () => void }) {
  const [value, setValue] = useState(mapping.displayName);
  const [error, setError] = useState<string | null>(null);
  const caption = mapping.captionName;

  async function save() {
    const name = parseLabelName(value);
    if (name === null) return setError(NAME_ERROR);
    await api.rememberSpeakerName(caption, name);
    onChanged();
  }

  return (
    <li>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <span className="caption-name">{caption}</span> →{' '}
        <input
          aria-label={`Name shown for ${caption}`}
          value={value}
          aria-invalid={error !== null}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />{' '}
        <button type="submit" aria-label={`Save name for ${caption}`}>
          Save
        </button>{' '}
        <button
          type="button"
          className="secondary"
          aria-label={`Forget ${caption}`}
          onClick={() => void api.forgetSpeakerName(caption).then(onChanged)}
        >
          Forget
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </li>
  );
}

export function RememberedNames({ api }: { api: Api }) {
  const [mappings, setMappings] = useState<SpeakerNameMapping[] | null>(null);

  const reload = () => void api.listSpeakerNames().then(setMappings);
  useEffect(() => {
    reload();
    // Renames made in the transcript land here too, without remounting Settings (T083).
    return api.onSpeakerNamesChanged(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // 018 (decision 108): nothing of the section shows while there are none; a rename made meanwhile brings it in.
  if (mappings === null || mappings.length === 0) return null;
  return (
    <>
      <h4 id="remembered-names-heading">Remembered names</h4>
      <p>Changes here apply from the next meeting.</p>
      <ul aria-label="Remembered names">
        {mappings.map((m) => (
          <Row key={`${m.captionName}:${m.updatedAt}`} mapping={m} api={api} onChanged={reload} />
        ))}
      </ul>
    </>
  );
}
