// Speaker keys and display labels (002 data-model.md "Display label", research R9). The stored attribution is never
// overwritten: corrections live in the meeting's renames and the segment's override, and every consumer (panel, 003
// chat context, 004 export) shows the label computed here (FR-021).
import { isRenamableKey, type LabelSource, type Meeting, type SpeakerKey, type TranscriptSegment } from './model';

export interface DisplayLabel {
  text: string;
  source: LabelSource;
  /** caption or manual: shown as a name. A fallback is never shown as one (Principle II). */
  confirmed: boolean;
  /** The name is not settled yet: `text` is the placeholder, not a speaker (design decision 37). */
  pending?: true;
}

/** Shown in the label position while a line's name is not settled (design decision 37, 002 FR-026). */
export const PENDING_LABEL = '…';
/** How screen readers hear the placeholder. */
export const PENDING_LABEL_NAME = 'Speaker pending';

/** NFC, trimmed, whitespace collapsed, lower-cased: how two caption names are compared. */
export function normaliseName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function speakerKey(segment: Pick<TranscriptSegment, 'captionSelf' | 'captionName'>): SpeakerKey {
  if (segment.captionSelf) return 'self';
  if (segment.captionName) return `caption:${normaliseName(segment.captionName)}`;
  return 'others';
}

export function displayLabel(
  segment: TranscriptSegment,
  meeting: Pick<Meeting, 'speakerRenames'> | null,
): DisplayLabel {
  const shown = (text: string, source: LabelSource): DisplayLabel => ({
    text,
    source,
    confirmed: source !== 'fallback',
  });
  if (segment.labelOverride) return shown(segment.labelOverride, 'manual');
  if (segment.labelPending) return { text: PENDING_LABEL, source: 'fallback', confirmed: false, pending: true };
  const key = speakerKey(segment);
  // A rename of `others` (stored by an earlier build) is ignored: "Others" is never renamed (decision 35).
  const rename = isRenamableKey(key) ? meeting?.speakerRenames[key] : undefined;
  if (rename) return shown(rename.name, segment.labelSource);
  return shown(segment.speakerLabel, segment.labelSource);
}

/** Records written before 002 lack the 002 fields; reads fill them in (no IndexedDB version bump, research R9). */
export function normaliseSegment(segment: TranscriptSegment): TranscriptSegment {
  const raw: Partial<TranscriptSegment> = segment;
  // A stored line read back is never pending: the meeting has stopped, or crashed before the line settled.
  const { labelPending: _pending, ...rest } = segment;
  return {
    ...rest,
    captionName: raw.captionName ?? null,
    captionSelf: raw.captionSelf ?? false,
    labelOverride: raw.labelOverride ?? null,
    schemaVersion: raw.schemaVersion ?? 1,
  };
}

export function normaliseMeeting(meeting: Meeting): Meeting {
  const raw: Partial<Meeting> = meeting;
  return { ...meeting, speakerRenames: raw.speakerRenames ?? {}, schemaVersion: raw.schemaVersion ?? 1 };
}
