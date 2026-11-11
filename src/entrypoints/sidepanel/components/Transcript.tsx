// Live transcript (FR-010, FR-011, FR-013): finished lines in meeting order with their offset, confirmed vs fallback
// labels told apart visually and for screen readers, the in-progress line, and auto-scroll that stops
// following while the user reads further up.
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import type { PartialLine } from '../../../core/messaging/protocol';
import {
  displayLabel,
  displayText,
  PENDING_LABEL,
  PENDING_LABEL_NAME,
  speakerKey,
} from '../../../core/transcript/labels';
import {
  formatOffset,
  isConfirmedLabel,
  isRenamableKey,
  type LabelSource,
  type Meeting,
  type TranscriptSegment,
} from '../../../core/transcript/model';
import { sortSegments } from '../../../core/transcript/ordering';
import type { RenameTarget } from '../meeting-api';
import { LabelEditor } from './LabelEditor';
import { TextEditor, type TextSelection } from './TextEditor';

export interface TranscriptProps {
  segments: readonly TranscriptSegment[];
  partials: readonly PartialLine[];
  /** Its renames give every line its display label (002 FR-018, FR-021); null = none. */
  meeting?: Pick<Meeting, 'speakerRenames'> | null;
  /** 002 US4: with both handlers, every label is a button that opens the label editor. */
  onRenameSpeaker?: (speaker: RenameTarget, name: string) => void;
  onOverrideLine?: (segmentId: string, name: string | null) => void;
  /** 020 US1: with it, a double-click on a settled line's text opens the text editor. Rejects when not stored. */
  onOverrideText?: (segmentId: string, text: string | null) => Promise<void>;
  /** 006 FR-013: shown after the last line (Delete transcript for a stopped meeting). */
  footer?: ReactNode;
  /** 003 FR-005: lets a citation bring its line into view. */
  controlRef?: Ref<TranscriptHandle>;
  /** false: a stored transcript read from the top; no stick-to-bottom, scroller role `group`. Default true. */
  follow?: boolean;
}

export interface TranscriptHandle {
  /** Scrolls the line into view and highlights it for CITED_MS; stops following new lines like a scroll-up. */
  scrollToSegment(segmentId: string): void;
}

/** How long a cited line stays highlighted (003 contracts/ask-ui.md). */
export const CITED_MS = 2000;

type Renames = Meeting['speakerRenames'];

/** How close to the bottom (px) still counts as "at the bottom". */
const STICKY_SLACK = 24;

/** The one open editor (020 research R5): a line's label (002) or its text (020), never both. */
interface OpenEditor {
  id: string;
  kind: 'label' | 'text';
  /** text only: the range to select in the field; null selects all. */
  selection: TextSelection | null;
}

/**
 * 020 R2: the browser's selection inside the line's text (a double-click selects the word under the pointer), as
 * offsets into that text; null when the selection is elsewhere. A trailing space some platforms add to the word is left out.
 */
function selectionIn(span: HTMLElement): TextSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!span.contains(range.startContainer) || !span.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(span);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().trimEnd().length;
  return { start, end };
}

function Label({
  text,
  source,
  onClick,
}: {
  text: string;
  source: LabelSource;
  /** Makes the label a button (002 US4). */
  onClick?: ((button: HTMLButtonElement) => void) | undefined;
}) {
  const confirmed = isConfirmedLabel(source);
  const className = confirmed ? 'label label-confirmed' : 'label label-fallback';
  const title = confirmed ? 'Confirmed speaker' : 'Speaker not identified';
  const content = (
    <>
      {text}
      <span className="sr-only">{confirmed ? ' (confirmed)' : ' (speaker not identified)'}</span>
    </>
  );
  if (!onClick)
    return (
      <span className={className} data-label-source={source} title={title}>
        {content}
      </span>
    );
  return (
    <button
      type="button"
      className={`${className} label-button`}
      data-label-source={source}
      title={`${title} — change the name`}
      onClick={(e) => onClick(e.currentTarget)}
    >
      {content}
    </button>
  );
}

/**
 * The line's name is not settled yet (design decision 37, 002 FR-026): a neutral mark in the label position, never a
 * speaker and never editable. Screen readers hear "Speaker pending" instead of the mark.
 */
function PendingLabel() {
  return (
    <span className="label label-pending" data-label-pending title={PENDING_LABEL_NAME}>
      <span aria-hidden="true">{PENDING_LABEL}</span>
      <span className="sr-only">{PENDING_LABEL_NAME}</span>
    </span>
  );
}

// Memoised so a 3-hour transcript (~5,000 lines) is not re-rendered on every in-progress update, and an appended or
// relabelled line re-renders only itself (T091; measured without virtualisation). The label is passed as plain
// values, so a rename re-renders only the lines whose label text changed.
const Line = memo(function Line({
  segment,
  label,
  source,
  pending,
  cited,
  onEdit,
  onEditText,
  editing,
  editor,
}: {
  segment: TranscriptSegment;
  label: string;
  source: LabelSource;
  pending: boolean;
  /** 003: the line a citation just led to. */
  cited: boolean;
  /** Stable across renders, so it does not re-render lines. */
  onEdit?: ((segmentId: string, button: HTMLButtonElement) => void) | undefined;
  /** 020: stable too; called on a double-click on the text. */
  onEditText?: ((segmentId: string, text: HTMLElement) => void) | undefined;
  /** Only the line being edited gets these. A text editor takes the text's place. */
  editing?: OpenEditor['kind'] | undefined;
  editor?: ReactNode;
}) {
  const textEditor = editing === 'text';
  return (
    <li
      className={cited ? 'line line-cited' : 'line'}
      data-segment-id={segment.id}
      aria-current={cited ? 'true' : undefined}
    >
      <time className="offset">{formatOffset(segment.startMs)}</time>{' '}
      {pending ? (
        <PendingLabel />
      ) : (
        <Label text={label} source={source} onClick={onEdit && ((button) => onEdit(segment.id, button))} />
      )}{' '}
      {textEditor ? (
        editor
      ) : (
        <>
          <span
            data-text
            onDoubleClick={!pending && onEditText ? (e) => onEditText(segment.id, e.currentTarget) : undefined}
          >
            {displayText(segment)}
          </span>
          {segment.textOverride !== null && (
            <>
              {' '}
              <span className="line-edited">edited</span>
            </>
          )}
          {editor}
        </>
      )}
    </li>
  );
});

const Lines = memo(function Lines({
  segments,
  renames,
  onEdit,
  onEditText,
  editing,
  editor,
  cited,
}: {
  segments: readonly TranscriptSegment[];
  renames: Renames;
  cited: string | null;
  onEdit?: ((segmentId: string, button: HTMLButtonElement) => void) | undefined;
  onEditText?: ((segmentId: string, text: HTMLElement) => void) | undefined;
  editing: OpenEditor | null;
  editor: ReactNode;
}) {
  const ordered = useMemo(() => sortSegments(segments), [segments]);
  return (
    <ol className="transcript-lines">
      {ordered.map((s) => {
        const label = displayLabel(s, { speakerRenames: renames });
        return (
          <Line
            key={s.id}
            segment={s}
            label={label.text}
            source={label.source}
            pending={label.pending === true}
            cited={s.id === cited}
            onEdit={onEdit}
            onEditText={onEditText}
            editing={s.id === editing?.id ? editing.kind : undefined}
            editor={s.id === editing?.id ? editor : undefined}
          />
        );
      })}
    </ol>
  );
});

/** Names used in the meeting, offered as suggestions in the label editor. */
function meetingNames(segments: readonly TranscriptSegment[], renames: Renames): string[] {
  const names = new Set<string>();
  for (const s of segments) {
    const label = displayLabel(s, { speakerRenames: renames });
    if (label.confirmed) names.add(label.text);
  }
  return [...names];
}

const NO_RENAMES: Renames = {};

export function Transcript({
  segments,
  partials,
  meeting = null,
  onRenameSpeaker,
  onOverrideLine,
  onOverrideText,
  footer,
  controlRef,
  follow = true,
}: TranscriptProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const inProgress = partials.filter((p) => p.text !== '');
  const renames = meeting?.speakerRenames ?? NO_RENAMES;

  // The open editor (002 US4 label, 020 text) and, on close, focus back to the line's label button, or to the line
  // itself when its label is plain text (020 FR-014).
  const [editing, setEditing] = useState<OpenEditor | null>(null);
  const editable = onRenameSpeaker !== undefined && onOverrideLine !== undefined;
  const onEdit = useCallback((segmentId: string) => {
    setEditing({ id: segmentId, kind: 'label', selection: null });
  }, []);
  const onEditText = useCallback((segmentId: string, text: HTMLElement) => {
    setEditing({ id: segmentId, kind: 'text', selection: selectionIn(text) });
  }, []);
  const closeEditor = useCallback(() => {
    const id = editing?.id;
    setEditing(null);
    if (id === undefined) return;
    const line = scroller.current?.querySelector<HTMLElement>(`[data-segment-id="${CSS.escape(id)}"]`);
    const button = line?.querySelector<HTMLButtonElement>('.label-button');
    if (button) return button.focus();
    if (line) {
      line.tabIndex = -1;
      line.focus();
    }
  }, [editing?.id]);

  const edited = editing === null ? undefined : segments.find((s) => s.id === editing.id);
  let editor: ReactNode = null;
  if (edited && editing?.kind === 'text' && onOverrideText) {
    editor = (
      <TextEditor
        key={edited.id}
        current={displayText(edited)}
        selection={editing.selection}
        corrected={edited.textOverride !== null}
        onSave={(text) => onOverrideText(edited.id, text)}
        onClose={closeEditor}
      />
    );
  } else if (edited && editing?.kind === 'label' && onRenameSpeaker && onOverrideLine) {
    const key = speakerKey(edited);
    // "Others" has no rename-everywhere (decision 35): only this line can be corrected.
    const target: RenameTarget | null = isRenamableKey(key)
      ? { key, original: edited.speakerLabel, captionName: edited.captionName }
      : null;
    editor = (
      <LabelEditor
        current={displayLabel(edited, { speakerRenames: renames }).text}
        original={edited.speakerLabel}
        hasOverride={edited.labelOverride !== null}
        suggestions={meetingNames(segments, renames)}
        onRename={target ? (name) => onRenameSpeaker(target, name) : undefined}
        onOverride={(name) => onOverrideLine(edited.id, name)}
        onClose={closeEditor}
      />
    );
  }
  const editorOpen = editor !== null;

  useLayoutEffect(() => {
    const el = scroller.current;
    // 020 FR-011: an open editor is never scrolled away; following resumes when it closes.
    if (follow && el && atBottom.current && !editorOpen) el.scrollTop = el.scrollHeight;
  }, [follow, segments, partials, editorOpen]);

  // 003 FR-005: a citation scrolls its line into view and highlights it; live lines keep arriving below.
  const [cited, setCited] = useState<string | null>(null);
  useImperativeHandle(
    controlRef,
    () => ({
      scrollToSegment(segmentId) {
        const line = scroller.current?.querySelector(`[data-segment-id="${CSS.escape(segmentId)}"]`);
        if (!line) return;
        atBottom.current = false;
        line.scrollIntoView?.({ block: 'center' });
        setCited(segmentId);
      },
    }),
    [],
  );
  useEffect(() => {
    if (cited === null) return;
    const timer = setTimeout(() => setCited(null), CITED_MS);
    return () => clearTimeout(timer);
  }, [cited]);

  function onScroll() {
    const el = scroller.current;
    if (el) atBottom.current = el.scrollTop + el.clientHeight >= el.scrollHeight - STICKY_SLACK;
  }

  return (
    <section aria-label="Transcript" className="transcript">
      <div
        className="transcript-scroll"
        data-testid="transcript-scroll"
        ref={scroller}
        onScroll={onScroll}
        // A log: screen readers announce finished lines as they arrive (in-progress text stays silent). A stored
        // transcript that is only read (012) is a plain group: nothing arrives, so nothing is announced. Focusable so
        // the transcript can be scrolled from the keyboard.
        role={follow ? 'log' : 'group'}
        aria-label="Transcript lines"
        tabIndex={0}
      >
        {segments.length === 0 && inProgress.length === 0 ? (
          <p className="transcript-empty">No transcript yet.</p>
        ) : (
          <Lines
            segments={segments}
            renames={renames}
            onEdit={editable ? onEdit : undefined}
            onEditText={onOverrideText ? onEditText : undefined}
            editing={editing}
            editor={editor}
            cited={cited}
          />
        )}
        {inProgress.map((p) => (
          <p key={p.stream} className="line line-in-progress" data-in-progress aria-live="off">
            {/* One mixed stream: the in-progress line's speaker is not known yet (FR-010, design decision 37). */}
            <PendingLabel /> <span>{p.text}…</span>
          </p>
        ))}
        {footer && <div className="transcript-footer">{footer}</div>}
      </div>
    </section>
  );
}
