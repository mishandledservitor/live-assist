// Per-meeting language override (US4, FR-014): Automatic detection by default; a fixed language applies to the
// meeting's transcription session for the next meeting only.
import { SUPPORTED_LANGUAGES } from '../../../core/settings/languages';
import type { LanguageMode } from '../../../core/transcript/model';

const AUTO = 'auto';

export function LanguagePicker({
  value,
  onChange,
  disabled,
}: {
  value: LanguageMode;
  onChange: (mode: LanguageMode) => void;
  disabled: boolean;
}) {
  return (
    <label className="language-picker">
      <span className="sr-only">Language</span>
      <select
        value={value.kind === 'fixed' ? value.code : AUTO}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === AUTO ? { kind: 'auto' } : { kind: 'fixed', code: e.target.value })}
      >
        <option value={AUTO}>Auto-detect</option>
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
