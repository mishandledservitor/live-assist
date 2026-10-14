// Consent reminder on Start (US5, FR-007, Constitution I): capture begins only after the user acknowledges it.
export function ConsentDialog({ onAcknowledge, onCancel }: { onAcknowledge: () => void; onCancel: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-label="Consent reminder"
      aria-describedby="consent-text"
      className="notice consent"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <p id="consent-text">
        Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs
        and the transcript is kept on this computer. You can turn this reminder off in Settings.
      </p>
      <button type="button" onClick={onAcknowledge} autoFocus>
        I&apos;ve told them — start
      </button>{' '}
      <button type="button" className="secondary" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
