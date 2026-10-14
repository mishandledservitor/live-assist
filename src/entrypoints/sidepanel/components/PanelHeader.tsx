// 006 US1 (FR-002, decision 32): the slim header on one line — Start or Stop, the language, the credits badge, the
// control that opens the Transcripts screen (012 FR-001) and the gear that opens Settings. Purely layout; the start flow
// lives in StartControls.
import type { ReactNode, Ref } from 'react';

export interface PanelHeaderProps {
  /** Start or Stop. */
  primary: ReactNode;
  language: ReactNode;
  badge?: ReactNode;
  /** 012: opens the Transcripts screen; absent, the control is too. */
  onOpenTranscripts?: (() => void) | undefined;
  transcriptsRef?: Ref<HTMLButtonElement> | undefined;
  onOpenSettings?: (() => void) | undefined;
  gearRef?: Ref<HTMLButtonElement> | undefined;
}

export function PanelHeader({
  primary,
  language,
  badge,
  onOpenTranscripts,
  transcriptsRef,
  onOpenSettings,
  gearRef,
}: PanelHeaderProps) {
  return (
    <header className="panel-header">
      {primary}
      {language}
      <span className="header-end">
        {badge}
        {onOpenTranscripts && (
          <button
            type="button"
            className="icon-button transcripts"
            ref={transcriptsRef}
            onClick={onOpenTranscripts}
            aria-label="Transcripts"
            title="Transcripts"
          >
            <span aria-hidden="true">☰</span>
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            className="icon-button gear"
            ref={gearRef}
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
          >
            <span aria-hidden="true">⚙</span>
          </button>
        )}
      </span>
    </header>
  );
}
