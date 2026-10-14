// Start / Stop (FR-006, FR-017) in the header (006), with what they say between the header and the status line: the
// consent reminder, the not-ready line and start failures with the next step; a meeting already running elsewhere can
// be stopped from here. The language choice (US4) applies to the next meeting only.
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import type { StartError } from '../../../core/messaging/protocol';
import type { LanguageMode, Meeting } from '../../../core/transcript/model';
import type { MeetingApi } from '../meeting-api';
import { startSteps } from '../start-flow';
import { startErrorMessage } from '../start-messages';
import { ConsentDialog } from './ConsentDialog';
import { LanguagePicker } from './LanguagePicker';
import { PanelHeader } from './PanelHeader';

export interface StartControlsProps {
  api: Pick<MeetingApi, 'start' | 'stop'>;
  ready: boolean;
  notReadyReason: string | null;
  running: boolean;
  /** The meeting shown in the panel (running or most recent stored), if any. */
  meeting: Meeting | null;
  /** Something started or stopped: the panel reconnects / reloads. */
  onChanged: () => void;
  /** Settings: show the consent reminder on every Start (FR-007). */
  consentReminder: boolean;
  /** 006: false while another screen shows; an open consent reminder is cancelled then (nothing starts). */
  active?: boolean;
  /** 006: the credits badge, shown in the header. */
  badge?: ReactNode;
  /** 012: the header's Transcripts control. */
  onOpenTranscripts?: (() => void) | undefined;
  transcriptsRef?: Ref<HTMLButtonElement> | undefined;
  /** 006: the header's gear. */
  onOpenSettings?: (() => void) | undefined;
  gearRef?: Ref<HTMLButtonElement> | undefined;
  /** 008: the next meeting's notes, after the language picker; shown only while nothing runs. */
  notes?: ReactNode;
}

export function StartControls({
  api,
  ready,
  notReadyReason,
  running,
  meeting,
  onChanged,
  consentReminder,
  active = true,
  badge,
  onOpenTranscripts,
  transcriptsRef,
  onOpenSettings,
  gearRef,
  notes,
}: StartControlsProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ error: StartError; runningTabTitle?: string } | null>(null);
  const [language, setLanguage] = useState<LanguageMode>({ kind: 'auto' });
  const [askingConsent, setAskingConsent] = useState(false);
  if (!active && askingConsent) setAskingConsent(false);
  // Keyboard users land back where they were when a reminder or confirmation is dismissed (T092).
  const startButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    startButton.current?.focus();
  });

  // Each meeting's choice is its own: once one ends, the next starts on Automatic again (US4-3).
  const [wasRunning, setWasRunning] = useState(running);
  if (running !== wasRunning) {
    setWasRunning(running);
    if (!running) setLanguage({ kind: 'auto' });
  }

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  /** Start pressed: run the start-flow steps first; nothing is sent until they pass. */
  const requestStart = () => {
    setFailure(null);
    if (startSteps({ consentReminder }).includes('consent')) setAskingConsent(true);
    else void start();
  };

  const start = () =>
    act(async () => {
      setAskingConsent(false);
      setFailure(null);
      const result = await api.start(language);
      if (result.ok) onChanged();
      else setFailure(result.runningTabTitle === undefined ? { error: result.error } : result);
    });

  const stop = () =>
    act(async () => {
      setFailure(null);
      await api.stop();
      onChanged();
    });

  return (
    <>
      <PanelHeader
        primary={
          running ? (
            <button type="button" className="primary" onClick={() => void stop()} disabled={busy}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              ref={startButton}
              onClick={requestStart}
              disabled={!ready || busy || askingConsent}
            >
              Start
            </button>
          )
        }
        language={
          <>
            <LanguagePicker
              value={running && meeting ? meeting.languageMode : language}
              onChange={setLanguage}
              disabled={running || busy}
            />
            {!running && notes}
          </>
        }
        badge={badge}
        onOpenTranscripts={onOpenTranscripts}
        transcriptsRef={transcriptsRef}
        onOpenSettings={onOpenSettings}
        gearRef={gearRef}
      />
      <div className="notices">
        {askingConsent && !running && (
          <ConsentDialog
            onAcknowledge={() => void start()}
            onCancel={() => {
              setAskingConsent(false);
              refocus.current = true;
            }}
          />
        )}
        {!ready && !running && notReadyReason && <p className="notice">{notReadyReason}</p>}

        {failure && (
          <div role="alert" className="notice notice-error">
            <p>{startErrorMessage(failure.error, failure.runningTabTitle)}</p>
            {failure.error === 'already-running' && (
              <button type="button" onClick={() => void stop()} disabled={busy}>
                Stop that one
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
