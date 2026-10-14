// T011: speaker keys and display labels (002 data-model.md "Display label", research R9).
import { describe, expect, it } from 'vitest';
import { displayLabel, normaliseMeeting, normaliseName, normaliseSegment, speakerKey } from '@/core/transcript/labels';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';

const segment = (over: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  id: 'm:mixed:0',
  meetingId: 'm',
  stream: 'mixed',
  seq: 0,
  startMs: 0,
  endMs: 1000,
  text: 'Hello.',
  language: null,
  speakerLabel: 'Others',
  labelSource: 'fallback',
  captionName: null,
  captionSelf: false,
  labelOverride: null,
  words: [],
  timing: 'words',
  sessionId: 's',
  createdAt: 0,
  schemaVersion: 2,
  ...over,
});

const emma = (over: Partial<TranscriptSegment> = {}) =>
  segment({ speakerLabel: 'Emma Jones', labelSource: 'caption', captionName: 'Emma Jones', ...over });
const mine = (over: Partial<TranscriptSegment> = {}) =>
  segment({ speakerLabel: 'Alex', labelSource: 'caption', captionName: 'You', captionSelf: true, ...over });

const meeting = (speakerRenames: Meeting['speakerRenames'] = {}) => ({ speakerRenames });

describe('normaliseName', () => {
  it('applies NFC, trims, collapses whitespace and folds case', () => {
    expect(normaliseName('  Emma   Jones ')).toBe('emma jones');
    expect(normaliseName('EMMA\tJONES')).toBe('emma jones');
    expect(normaliseName('Café')).toBe(normaliseName('Café'));
    expect(normaliseName('ΣΑΡΑ')).toBe('σαρα');
  });
});

describe('speakerKey', () => {
  it('is self for lines attributed to Meet’s label for the user', () => {
    expect(speakerKey(mine())).toBe('self');
  });

  it('is caption:<normalised name> for another caption speaker', () => {
    expect(speakerKey(emma())).toBe('caption:emma jones');
    expect(speakerKey(emma({ captionName: ' EMMA  jones' }))).toBe('caption:emma jones');
  });

  it('is others for the fallback', () => {
    expect(speakerKey(segment())).toBe('others');
  });
});

describe('displayLabel', () => {
  it('shows the attributed label and source when nothing is corrected', () => {
    expect(displayLabel(emma(), meeting())).toEqual({ text: 'Emma Jones', source: 'caption', confirmed: true });
    expect(displayLabel(mine(), meeting())).toEqual({ text: 'Alex', source: 'caption', confirmed: true });
    expect(displayLabel(segment(), meeting())).toEqual({ text: 'Others', source: 'fallback', confirmed: false });
  });

  it('applies a rename of the line’s key, keeping the segment’s source', () => {
    const renames = { 'caption:emma jones': { name: 'Emma', origin: 'manual' as const } };
    expect(displayLabel(emma(), meeting(renames))).toEqual({ text: 'Emma', source: 'caption', confirmed: true });
    expect(displayLabel(segment(), meeting(renames)).text).toBe('Others');
  });

  // Red-team 2026-10-08 (T092, decision 35): "Others" holds the user's own lines too, so a rename of it would present a
  // guess as a confirmed name. A rename stored by an earlier build is ignored.
  it('ignores a stored rename of others: the line stays the unconfirmed fallback', () => {
    const renames = { others: { name: 'Bob', origin: 'manual' as const } };
    expect(displayLabel(segment(), meeting(renames))).toEqual({ text: 'Others', source: 'fallback', confirmed: false });
  });

  it('lets a line override win over a rename, as manual', () => {
    const renames = { 'caption:emma jones': { name: 'Emma', origin: 'manual' as const } };
    expect(displayLabel(emma({ labelOverride: 'Jane' }), meeting(renames))).toEqual({
      text: 'Jane',
      source: 'manual',
      confirmed: true,
    });
    expect(displayLabel(segment({ labelOverride: 'Bob' }), meeting())).toEqual({
      text: 'Bob',
      source: 'manual',
      confirmed: true,
    });
  });

  it('works without a meeting', () => {
    expect(displayLabel(emma(), null).text).toBe('Emma Jones');
  });
});

describe('normalising v1 records on read', () => {
  it('fills the 002 segment fields', () => {
    const v1 = segment() as Partial<TranscriptSegment>;
    delete v1.captionName;
    delete v1.captionSelf;
    delete v1.labelOverride;
    delete v1.schemaVersion;
    expect(normaliseSegment(v1 as TranscriptSegment)).toEqual({
      ...segment(),
      captionName: null,
      captionSelf: false,
      labelOverride: null,
      schemaVersion: 1,
    });
  });

  it('keeps v2 segment fields', () => {
    expect(normaliseSegment(emma({ labelOverride: 'A' }))).toEqual(emma({ labelOverride: 'A' }));
  });

  it('fills speakerRenames on a v1 meeting and keeps them on v2', () => {
    const base = {
      id: 'm',
      startedAt: 0,
      endedAt: null,
      endReason: null,
      source: { url: '', title: '', platform: 'generic' as const },
      languageMode: { kind: 'auto' as const },
      userName: 'Alex',
    };
    expect(normaliseMeeting({ ...base, schemaVersion: 1 } as unknown as Meeting)).toEqual({
      ...base,
      speakerRenames: {},
      schemaVersion: 1,
    });
    const v2: Meeting = { ...base, speakerRenames: { self: { name: 'Me', origin: 'manual' } }, schemaVersion: 2 };
    expect(normaliseMeeting(v2)).toEqual(v2);
  });
});

// T110 (real trace 2026-10-08, design decision 37, FR-026): "…" while a line's name is not settled.
describe('displayLabel: the pending placeholder', () => {
  it('a pending line shows "…", never Others or a name, and is not confirmed', () => {
    expect(displayLabel(segment({ labelPending: true }), meeting())).toEqual({
      text: '…',
      source: 'fallback',
      confirmed: false,
      pending: true,
    });
  });

  it('settled lines are not pending', () => {
    expect(displayLabel(segment(), meeting()).pending).toBeUndefined();
    expect(displayLabel(emma({ labelPending: false }), meeting())).toEqual({
      text: 'Emma Jones',
      source: 'caption',
      confirmed: true,
    });
  });

  it('a single-line override replaces the placeholder', () => {
    expect(displayLabel(segment({ labelPending: true, labelOverride: 'Bob' }), meeting())).toEqual({
      text: 'Bob',
      source: 'manual',
      confirmed: true,
    });
  });

  it('a line read back from storage is never pending', () => {
    expect(normaliseSegment(segment({ labelPending: true })).labelPending).toBeUndefined();
  });
});
