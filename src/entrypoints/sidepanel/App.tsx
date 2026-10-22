// The side panel (006, design decision 32): setup until it is complete, then one main view — header, status line,
// transcript — a Settings screen behind the gear and a Transcripts screen (012, decision 62) behind its header control.
// The main view stays mounted while another screen shows, so the live port, scroll position and lines that arrive
// meanwhile survive (006 FR-012, 012 FR-003).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { meetingDownload, mergedMeetingDownload } from '../../core/export/meeting-download';
import { hasTranscriptFileLines } from '../../core/export/transcript-file';
import { isReadyToStart, validateUserName } from '../../core/settings/schema';
import type { AccountApi } from './account-api';
import type { ChatApi } from './chat-api';
import { AccountDetails } from './components/AccountDetails';
import { AskArea } from './components/AskArea';
import { ChatRetention } from './components/ChatRetention';
import { CloseTranscript } from './components/CloseTranscript';
import { CreditsBadge } from './components/CreditsBadge';
import { CAPTIONS_PROMPT, DeleteTranscript } from './components/DeleteTranscript';
import { DownloadTranscript } from './components/DownloadTranscript';
import { NotesControl } from './components/NotesControl';
import { RetentionNotice } from './components/RetentionNotice';
import { Settings } from './components/Settings';
import { SettingsScreen } from './components/SettingsScreen';
import { Setup } from './components/Setup';
import { StartControls } from './components/StartControls';
import { StatusLine } from './components/StatusLine';
import { Transcript, type TranscriptHandle } from './components/Transcript';
import { TranscriptsScreen } from './components/TranscriptsScreen';
import { useAccount } from './hooks/useAccount';
import { useLive, type LiveApi, type LiveState } from './hooks/useLive';
import type { MeetingApi } from './meeting-api';
import type { NotesApi } from './notes-api';
import type { LoadedSettings, SettingsApi } from './settings-api';
import type { TranscriptsApi } from './transcripts-api';

function notReadyReason(loaded: LoadedSettings): string {
  if (loaded.keyHint === null) return 'Add your ElevenLabs API key in Settings to start.';
  if (!validateUserName(loaded.settings.userName).ok) return 'Add your name in Settings to start.';
  return 'Finish setup to start.';
}

const isRunning = (live: LiveState) => live.connected && live.meeting !== null && live.meeting.endedAt === null;

function MainView({
  meetings,
  live,
  loaded,
  onFixMic,
  onDeleted,
  onClose,
  onClosed,
  hidden,
  onOpenSettings,
  gearRef,
  onOpenTranscripts,
  transcriptsRef,
  badge,
  chat,
  notes,
}: {
  meetings: MeetingApi & LiveApi;
  live: ReturnType<typeof useLive>;
  loaded: LoadedSettings;
  onFixMic: () => void;
  /** The meeting shown here was deleted with `Delete transcript` (012 FR-019). */
  onDeleted: () => void;
  /** 014: clears the main view without deleting; rejects when it cannot be remembered. */
  onClose: () => Promise<void>;
  /** 014: the main view was cleared with `Close transcript`. */
  onClosed: () => void;
  hidden: boolean;
  onOpenSettings: () => void;
  gearRef: Ref<HTMLButtonElement>;
  /** 012: the header's Transcripts control; absent, the header is as before. */
  onOpenTranscripts?: (() => void) | undefined;
  transcriptsRef?: Ref<HTMLButtonElement> | undefined;
  badge?: ReactNode;
  /** 003: Ask under the transcript; absent, the main view is as before. */
  chat?: ChatApi | undefined;
  /** 008: meeting notes; absent, the main view is as before. */
  notes?: NotesApi | undefined;
}) {
  const transcriptRef = useRef<TranscriptHandle>(null);
  const ready = isReadyToStart(loaded.settings, loaded.keyHint !== null);
  const running = isRunning(live);
  const { meeting, segments } = live;
  const meetingId = meeting?.id ?? null;
  // 013 FR-018: a meeting with kept captions can be downloaded before, or without, a transcript line.
  const hasCaptions = meeting?.hasCaptions === true;
  const downloadable = hasTranscriptFileLines(segments) || hasCaptions;
  // After the last line (006 FR-013): Download for the meeting shown, running or stopped (007, design decision 48),
  // then Close (014, decisions 91 and 92) and Delete once it has stopped. Download is absent until a settled line or a kept caption exists, and saves what
  // `meetingDownload` gives for the meeting, as every Download does (012 FR-014, 013 FR-019). The caption turns are
  // read at the press, used for that one file and dropped: their text never enters the panel's state (FR-009). If
  // they cannot be read the press saves nothing, never the transcript alone in place of the zip. 016 (decisions 93, 94):
  // once the meeting no longer runs, a meeting with both records saves the merged transcript instead of the zip.
  const download = running ? meetingDownload : mergedMeetingDownload;
  const footer =
    meeting !== null && meetingId !== null && (!running || downloadable) ? (
      <div className="transcript-actions">
        <DownloadTranscript
          available={downloadable}
          load={async () =>
            download(
              { meeting, segments, captionTurns: hasCaptions ? await meetings.captionTurns(meetingId) : [] },
              new Date(),
            )
          }
        />
        {!running && <CloseTranscript close={onClose} onClosed={onClosed} />}
        {!running && (
          <DeleteTranscript
            remove={() => meetings.deleteMeeting(meetingId)}
            onDeleted={onDeleted}
            // 013 FR-022: the confirmation names Meet's captions when the meeting has them.
            {...(hasCaptions ? { prompt: CAPTIONS_PROMPT } : {})}
          />
        )}
      </div>
    ) : undefined;
  // 002 US4: a running meeting broadcasts the edit back over the live port; a stored one is read again.
  const afterEdit = (edit: Promise<void>) =>
    void edit.then(
      () => {
        if (!running) live.refresh();
      },
      () => undefined,
    );
  return (
    <div className="main-view" hidden={hidden}>
      <StartControls
        api={meetings}
        ready={ready}
        notReadyReason={ready ? null : notReadyReason(loaded)}
        running={running}
        meeting={live.meeting}
        onChanged={live.refresh}
        consentReminder={loaded.settings.consentReminder}
        active={!hidden}
        onOpenSettings={onOpenSettings}
        gearRef={gearRef}
        onOpenTranscripts={onOpenTranscripts}
        transcriptsRef={transcriptsRef}
        badge={badge}
        notes={notes && <NotesControl api={notes} target={{ kind: 'next' }} reloadKey={meetingId} />}
      />
      <StatusLine status={live.status} running={running} onFixMic={onFixMic} />
      {meetingId === null ? (
        <Transcript
          segments={live.segments}
          partials={live.partials}
          meeting={live.meeting}
          controlRef={transcriptRef}
        />
      ) : (
        <Transcript
          controlRef={transcriptRef}
          segments={live.segments}
          partials={live.partials}
          meeting={live.meeting}
          footer={footer}
          onRenameSpeaker={(speaker, name) =>
            afterEdit(meetings.renameSpeaker({ meetingId, live: running }, speaker, name))
          }
          onOverrideLine={(segmentId, name) =>
            afterEdit(meetings.overrideLine({ meetingId, live: running }, segmentId, name))
          }
        />
      )}
      {chat && (
        <AskArea
          api={chat}
          meetingId={meetingId}
          segments={live.segments}
          chat={loaded.settings.chat}
          keyHints={loaded.chatKeyHints}
          onCite={(segmentId) => transcriptRef.current?.scrollToSegment(segmentId)}
          notesApi={notes}
        />
      )}
    </div>
  );
}

type Screen = 'main' | 'settings' | 'transcripts';

/** Everything after setup: the live meeting, the three screens and the focus moves between them. */
function Panel({
  api,
  meetings,
  account,
  chat,
  notes,
  transcripts,
  loaded,
  onLoaded,
}: {
  api: SettingsApi;
  meetings: MeetingApi & LiveApi;
  account?: AccountApi | undefined;
  chat?: ChatApi | undefined;
  notes?: NotesApi | undefined;
  transcripts?: TranscriptsApi | undefined;
  loaded: LoadedSettings;
  onLoaded: (loaded: LoadedSettings) => void;
}) {
  const live = useLive(meetings);
  const running = isRunning(live);
  const accountState = useAccount(account, running);
  const [screen, setScreen] = useState<Screen>('main');
  // Focus follows a screen switch (006 research R7, 012 FR-002): the screen's heading on open, the control that opened
  // it on the way back.
  const gearRef = useRef<HTMLButtonElement>(null);
  const settingsHeadingRef = useRef<HTMLHeadingElement>(null);
  const transcriptsRef = useRef<HTMLButtonElement>(null);
  const transcriptsHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<(() => HTMLElement | null) | null>(null);
  useLayoutEffect(() => {
    const target = focusNext.current?.();
    focusNext.current = null;
    target?.focus();
  });
  const openSettings = () => {
    focusNext.current = () => settingsHeadingRef.current;
    setScreen('settings');
  };
  // The badge opens Settings at the account section (FR-015).
  const openAccount = () => {
    focusNext.current = () => {
      const heading = document.getElementById('account-heading');
      heading?.scrollIntoView?.({ block: 'start' });
      return heading;
    };
    setScreen('settings');
  };
  const backToMain = () => {
    focusNext.current = () => gearRef.current;
    setScreen('main');
  };
  const openTranscripts = () => {
    focusNext.current = () => transcriptsHeadingRef.current;
    setScreen('transcripts');
  };
  const backFromTranscripts = () => {
    focusNext.current = () => transcriptsRef.current;
    setScreen('main');
  };

  // 012 FR-020, FR-026 (design decision 64): once the meeting the main view shows is deleted, the main view shows no
  // stored meeting until the next Start. The deletion comes first and stands whatever happens to the marker: if it
  // cannot be written, the main view shows the most recent meeting that remains.
  const { refresh } = live;
  const clearMainView = async () => {
    try {
      await meetings.clearMainView();
    } catch {
      // Nothing to show for it: the transcript is deleted either way.
    }
    refresh();
  };
  // FR-019: a delete on the main view leads to what remains.
  const deletedOnMain = () =>
    void clearMainView().then(() => {
      if (transcripts) openTranscripts();
    });
  // 014 FR-002, FR-009: Close clears the main view as a delete does, without deleting. A failure reaches the button,
  // which says so; the transcript stays.
  const closeShown = async () => {
    await meetings.clearMainView();
    refresh();
  };
  const closedOnMain = () => {
    focusNext.current = () => transcriptsRef.current ?? gearRef.current;
  };
  // FR-027: deleting any other meeting on the Transcripts screen leaves the main view as it was.
  const shownId = live.meeting?.id ?? null;
  const deletedOnScreen = (id: string) => {
    if (!running && id === shownId) void clearMainView();
  };
  // Cleared in another window's panel: this one drops the transcript too, unless a meeting is running here.
  const runningNow = useRef(running);
  useLayoutEffect(() => {
    runningNow.current = running;
  });
  useEffect(
    () =>
      meetings.onMainViewCleared(() => {
        if (!runningNow.current) refresh();
      }),
    [meetings, refresh],
  );

  return (
    <>
      <MainView
        meetings={meetings}
        live={live}
        loaded={loaded}
        onFixMic={() => void api.openMicPermission()}
        onDeleted={deletedOnMain}
        onClose={closeShown}
        onClosed={closedOnMain}
        hidden={screen !== 'main'}
        onOpenSettings={openSettings}
        gearRef={gearRef}
        onOpenTranscripts={transcripts && openTranscripts}
        transcriptsRef={transcriptsRef}
        badge={accountState && <CreditsBadge account={accountState} onOpenAccount={openAccount} />}
        chat={chat}
        notes={notes}
      />
      <SettingsScreen hidden={screen !== 'settings'} onBack={backToMain} headingRef={settingsHeadingRef}>
        <Settings
          api={api}
          loaded={loaded}
          onChange={onLoaded}
          account={accountState && <AccountDetails account={accountState} />}
        />
        <RetentionNotice headingLevel={3} />
        <ChatRetention provider={loaded.settings.chat.provider} />
      </SettingsScreen>
      {/* Mounted only while it shows, so every opening reads storage afresh (012 FR-009, research R1). */}
      {transcripts && screen === 'transcripts' && (
        <TranscriptsScreen
          api={transcripts}
          runningId={running && live.meeting ? live.meeting.id : null}
          onBack={backFromTranscripts}
          onGoToRunning={backFromTranscripts}
          onDeleted={deletedOnScreen}
          headingRef={transcriptsHeadingRef}
        />
      )}
    </>
  );
}

export function App({
  api,
  meetings,
  account,
  chat,
  notes,
  transcripts,
}: {
  api: SettingsApi;
  meetings: MeetingApi & LiveApi;
  account?: AccountApi | undefined;
  /** 003: Ask the transcript. */
  chat?: ChatApi | undefined;
  /** 008: meeting notes. */
  notes?: NotesApi | undefined;
  /** 012: the Transcripts screen; absent, there is no header control for it. */
  transcripts?: TranscriptsApi | undefined;
}) {
  const [loaded, setLoaded] = useState<LoadedSettings | null>(null);

  useEffect(() => {
    let live = true;
    void api.load().then((l) => {
      if (live) setLoaded(l);
    });
    return () => {
      live = false;
    };
  }, [api]);

  // Chrome's side-panel title bar already shows the name; the heading stays for screen readers (K32).
  const title = <h1 className="sr-only">live-assist</h1>;

  if (!loaded) {
    return (
      <main>
        {title}
        <p>Loading…</p>
      </main>
    );
  }

  // 003 FR-011a: the chat step is decided by its flag, never by key presence, so a key removed later does not reopen it.
  if (!loaded.settings.firstRunComplete || !loaded.settings.chat.setupComplete) {
    return (
      <main className="setup-screen">
        {title}
        <Setup
          api={api}
          initial={loaded}
          mode={loaded.settings.firstRunComplete ? 'chat' : 'full'}
          onComplete={setLoaded}
        />
      </main>
    );
  }

  return (
    <main>
      {title}
      <Panel
        api={api}
        meetings={meetings}
        account={account}
        chat={chat}
        notes={notes}
        transcripts={transcripts}
        loaded={loaded}
        onLoaded={setLoaded}
      />
    </main>
  );
}
