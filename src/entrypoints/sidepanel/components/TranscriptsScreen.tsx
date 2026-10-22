// The Transcripts screen (012, design decisions 62 and 64; contracts/transcripts-ui.md): every stored meeting, newest
// first, one meeting's transcript read-only, and a download and a real deletion per meeting. Shown in place of the main view, which
// stays mounted underneath; this screen is mounted only while it shows, so every opening reads storage afresh
// (research R1). The list stays mounted and hidden while one meeting shows, which keeps its place for Back (FR-013).
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { meetingDownload, mergedMeetingDownload } from '../../../core/export/meeting-download';
import { currentSummary, meetingState } from '../../../core/history/meeting-summary';
import type { Meeting, MeetingSummary, TranscriptSegment } from '../../../core/transcript/model';
import type { SaveBlob } from '../save-file';
import type { TranscriptsApi } from '../transcripts-api';
import { MeetingRow, MeetingTitleLine, meetingTitle } from './MeetingRow';
import { PastTranscript } from './PastTranscript';
import './transcripts.css';

export interface TranscriptsScreenProps {
  api: TranscriptsApi;
  /** The meeting the live port reports as running, or null. */
  runningId: string | null;
  onBack(): void;
  /** The running meeting's row was selected. */
  onGoToRunning(): void;
  /** A meeting was deleted here. */
  onDeleted(id: string): void;
  headingRef: Ref<HTMLHeadingElement>;
  /** Injected in tests; the panel saves through a browser download. */
  save?: SaveBlob;
}

type View = { kind: 'list' } | { kind: 'meeting'; meeting: Meeting; segments: TranscriptSegment[] };

const NO_SUMMARIES: ReadonlyMap<string, MeetingSummary> = new Map();

export function TranscriptsScreen(props: TranscriptsScreenProps) {
  // The callbacks are called on `props` (they are declared as methods in contracts/internal-api.md).
  const { api, runningId, headingRef, save } = props;
  const [list, setList] = useState<Meeting[] | 'loading' | 'failed'>('loading');
  // Row details worked out since the list was read; a meeting's stored summary, when current, comes first.
  const [filled, setFilled] = useState(NO_SUMMARIES);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [readAgain, setReadAgain] = useState(0);
  // The one open delete confirmation (FR-017): a row's, by meeting id, or the one beside the meeting being read.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingHere, setConfirmingHere] = useState(false);
  // Read by screen readers only: the row disappearing is what sighted users get (FR-021).
  const [announcement, setAnnouncement] = useState('');

  // One heading for both views; the panel focuses it when the screen opens, the screen when a meeting opens.
  const heading = useRef<HTMLHeadingElement>(null);
  useImperativeHandle(headingRef, () => heading.current as HTMLHeadingElement, []);
  const scroller = useRef<HTMLDivElement>(null);
  const opener = (id: string) =>
    scroller.current?.querySelector<HTMLElement>(`[data-meeting-id="${CSS.escape(id)}"] .meeting-open`) ?? null;

  // Focus follows what the screen shows (FR-002, FR-013); the list returns to where it was scrolled.
  const focusNext = useRef<(() => HTMLElement | null) | null>(null);
  const listScroll = useRef<number | null>(null);
  const listWasHidden = useRef(false);
  const listHidden = view.kind !== 'list';
  useLayoutEffect(() => {
    if (!listHidden && listWasHidden.current && scroller.current && listScroll.current !== null)
      scroller.current.scrollTop = listScroll.current;
    listWasHidden.current = listHidden;
    const target = focusNext.current?.();
    focusNext.current = null;
    target?.focus({ preventScroll: true });
  });

  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  // The list is drawn from the meeting records alone; what needs a meeting's lines is filled in afterwards, one
  // meeting at a time, newest first (research R3). The running meeting's lines are still arriving, so it is skipped.
  useEffect(() => {
    let current = true;
    void (async () => {
      let meetings: Meeting[];
      try {
        meetings = await api.list();
      } catch {
        if (current) setList('failed');
        return;
      }
      if (!current) return;
      setList(meetings);
      for (const meeting of meetings) {
        if (meeting.id === runningId || currentSummary(meeting)) continue;
        const summary = await api.summarise(meeting.id).catch(() => null);
        if (!current) return;
        if (summary) setFilled((before) => new Map(before).set(meeting.id, summary));
      }
    })();
    return () => {
      current = false;
    };
  }, [api, runningId, readAgain]);

  const open = useCallback(
    (id: string) => {
      if (id === latest.current.runningId) {
        latest.current.onGoToRunning();
        return;
      }
      listScroll.current = scroller.current?.scrollTop ?? null;
      setConfirmingId(null);
      void api.open(id).then(
        (opened) => {
          // Gone since the list was read (deleted in another window): the list is read again.
          if (!opened) {
            setReadAgain((n) => n + 1);
            return;
          }
          focusNext.current = () => heading.current;
          // The lines are shown; the kept captions are not, and stay out of the screen's state (013 FR-009).
          setView({ kind: 'meeting', meeting: opened.meeting, segments: opened.segments });
        },
        () => setReadAgain((n) => n + 1),
      );
    },
    [api],
  );

  const backToList = (focusRow: string) => {
    focusNext.current = () => opener(focusRow);
    setConfirmingHere(false);
    setView({ kind: 'list' });
  };
  const back = () => {
    if (view.kind === 'meeting') backToList(view.meeting.id);
    else props.onBack();
  };
  // Escape closes an open confirmation; with none open, it goes back. A confirmation that holds the focus has already
  // taken the key (DeleteTranscript), so this is Escape pressed elsewhere on the screen.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (view.kind === 'meeting' && confirmingHere) setConfirmingHere(false);
    else if (view.kind === 'list' && confirmingId !== null) setConfirmingId(null);
    else back();
  };

  // FR-008: the running meeting first, then newest first as stored.
  const ordered = useMemo(() => {
    if (!Array.isArray(list)) return null;
    return [...list.filter((m) => m.id === runningId), ...list.filter((m) => m.id !== runningId)];
  }, [list, runningId]);
  const rowOrder = useRef<readonly string[]>([]);
  useLayoutEffect(() => {
    rowOrder.current = (ordered ?? []).map((m) => m.id);
  });

  // FR-014, 013 FR-019: a Download, in a row or beside the transcript, reads the meeting on press and saves what every
  // Download saves. Nothing listed here runs (its row has no Download), so from 016 (decision 93) a meeting with both
  // records saves the merged transcript; one with one record saves it as 013 does. The caption turns are used for that
  // one file and dropped. A meeting that is gone, or whose captions cannot be read, saves nothing.
  const load = useCallback(
    async (id: string) => {
      const opened = await api.open(id);
      return opened ? mergedMeetingDownload(opened, new Date()) : null;
    },
    [api],
  );
  // 016 (decision 97): `Download originals` beside the transcript being read saves 013's download, the zip of both.
  const loadOriginals = useCallback(
    async (id: string) => {
      const opened = await api.open(id);
      return opened ? meetingDownload(opened, new Date()) : null;
    },
    [api],
  );
  const remove = useCallback((id: string) => api.remove(id), [api]);
  const confirmingChanged = useCallback((id: string, open: boolean) => {
    // A new confirmation is a new deletion to announce.
    if (open) setAnnouncement('');
    setConfirmingId((current) => (open ? id : current === id ? null : current));
  }, []);
  // The row goes without reading the list again; focus moves to the next row, else the one before, else the title
  // (FR-021). From one meeting's transcript the list returns first.
  const deleted = useCallback((id: string) => {
    const order = rowOrder.current;
    const at = order.indexOf(id);
    const neighbour = at < 0 ? undefined : (order[at + 1] ?? order[at - 1]);
    focusNext.current = () => (neighbour === undefined ? null : opener(neighbour)) ?? heading.current;
    setList((current) => (Array.isArray(current) ? current.filter((m) => m.id !== id) : current));
    setConfirmingId(null);
    setConfirmingHere(false);
    setView({ kind: 'list' });
    setAnnouncement('Transcript deleted.');
    latest.current.onDeleted(id);
  }, []);

  return (
    <section aria-labelledby="transcripts-heading" className="transcripts-screen" onKeyDown={onKeyDown}>
      <div className="screen-bar">
        <button type="button" className="secondary back" onClick={back} aria-label="Back">
          ←
        </button>
        <h2 id="transcripts-heading" ref={heading} tabIndex={-1}>
          {view.kind === 'meeting' ? (
            <>
              {/* FR-030: the meeting's title, when it has one, above its date and time. */}
              <MeetingTitleLine meeting={view.meeting} />
              <span className="meeting-when">{meetingTitle(view.meeting)}</span>
            </>
          ) : (
            'Transcripts'
          )}
        </h2>
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      <div
        className="transcripts-list"
        ref={scroller}
        // Focusable so a long list can be scrolled from the keyboard.
        tabIndex={ordered !== null && ordered.length > 0 ? 0 : undefined}
        hidden={listHidden}
      >
        {list === 'failed' && (
          <p role="alert">Couldn&apos;t read the stored transcripts. Close the panel and open it again.</p>
        )}
        {ordered !== null &&
          (ordered.length === 0 ? (
            <p>No transcripts stored.</p>
          ) : (
            <ul aria-label="Transcripts">
              {ordered.map((meeting) => (
                <MeetingRow
                  key={meeting.id}
                  meeting={meeting}
                  state={meetingState(meeting, runningId)}
                  summary={currentSummary(meeting) ?? filled.get(meeting.id) ?? null}
                  onOpen={open}
                  load={load}
                  save={save}
                  remove={remove}
                  onDeleted={deleted}
                  confirming={confirmingId === meeting.id}
                  onConfirmingChange={confirmingChanged}
                />
              ))}
            </ul>
          ))}
      </div>
      {view.kind === 'meeting' && (
        <PastTranscript
          key={view.meeting.id}
          meeting={view.meeting}
          segments={view.segments}
          state={meetingState(view.meeting, runningId)}
          load={() => load(view.meeting.id)}
          loadOriginals={() => loadOriginals(view.meeting.id)}
          save={save}
          remove={() => api.remove(view.meeting.id)}
          onDeleted={() => deleted(view.meeting.id)}
          confirming={confirmingHere}
          onConfirmingChange={(open) => {
            if (open) setAnnouncement('');
            setConfirmingHere(open);
          }}
        />
      )}
    </section>
  );
}
