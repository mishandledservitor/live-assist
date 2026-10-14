// T061: fixing a wrong or missing name from the transcript (002 US4, research R10). Each label is a button that opens a
// small dialog: rename the speaker everywhere, or just this line.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { segmentId, type Meeting, type TranscriptSegment } from '@/core/transcript/model';
import { Transcript } from '@/entrypoints/sidepanel/components/Transcript';

afterEach(cleanup);

function seg(seq: number, over: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    id: segmentId('m1', 'mixed', seq),
    meetingId: 'm1',
    stream: 'mixed',
    seq,
    startMs: seq * 1000,
    endMs: seq * 1000 + 500,
    text: `line ${seq}`,
    language: 'en',
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
  };
}

const jane = { speakerLabel: 'Jane D.', labelSource: 'caption' as const, captionName: 'Jane D.' };
const segments = [seg(0, jane), seg(1), seg(2, jane), seg(3, { labelOverride: 'Bob' })];

function setup(renames: Meeting['speakerRenames'] = {}) {
  const onRenameSpeaker = vi.fn();
  const onOverrideLine = vi.fn();
  const props = {
    segments,
    partials: [],
    meeting: { speakerRenames: renames },
    onRenameSpeaker,
    onOverrideLine,
  };
  const view = render(<Transcript {...props} />);
  return { onRenameSpeaker, onOverrideLine, view, props };
}

const line = (n: number) => within(screen.getByRole('region', { name: 'Transcript' })).getAllByRole('listitem')[n]!;
const labelButton = (n: number) => within(line(n)).getByRole('button');
const dialog = () => screen.getByRole('dialog', { name: /speaker/i });
const nameInput = () => within(dialog()).getByRole('combobox', { name: /name/i });

describe('LabelEditor', () => {
  it('every label is a button that opens a dialog with the current name', () => {
    setup({ 'caption:jane d.': { name: 'Jane', origin: 'manual' } });
    expect(labelButton(0).textContent).toContain('Jane');
    fireEvent.click(labelButton(0));
    expect((nameInput() as HTMLInputElement).value).toBe('Jane');
    expect(document.activeElement).toBe(nameInput());
  });

  it('offers the meeting names as suggestions', () => {
    setup();
    fireEvent.click(labelButton(1));
    const list = document.getElementById(nameInput().getAttribute('list') ?? '');
    expect([...(list?.querySelectorAll('option') ?? [])].map((o) => o.value).sort()).toEqual(['Bob', 'Jane D.']);
  });

  it('"Rename everywhere" names the original label and renames its speaker', () => {
    const { onRenameSpeaker } = setup({ 'caption:jane d.': { name: 'Jane', origin: 'manual' } });
    fireEvent.click(labelButton(2));
    const rename = within(dialog()).getByRole('button', { name: /rename .*Jane D\..* everywhere/i });
    fireEvent.change(nameInput(), { target: { value: 'Jane Doe' } });
    fireEvent.click(rename);
    expect(onRenameSpeaker).toHaveBeenCalledWith(
      { key: 'caption:jane d.', original: 'Jane D.', captionName: 'Jane D.' },
      'Jane Doe',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Just this line" overrides only that line', () => {
    const { onOverrideLine, onRenameSpeaker } = setup();
    fireEvent.click(labelButton(1));
    fireEvent.change(nameInput(), { target: { value: 'Bob' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: /just this line/i }));
    expect(onOverrideLine).toHaveBeenCalledWith('m1:mixed:1', 'Bob');
    expect(onRenameSpeaker).not.toHaveBeenCalled();
  });

  it('offers "Reset this line" only when the line has one (006 R25)', () => {
    const { onOverrideLine } = setup();
    fireEvent.click(labelButton(1));
    expect(within(dialog()).queryByRole('button', { name: 'Reset this line' })).toBeNull();
    fireEvent.keyDown(nameInput(), { key: 'Escape' });
    fireEvent.click(labelButton(3));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reset this line' }));
    expect(onOverrideLine).toHaveBeenCalledWith('m1:mixed:3', null);
  });

  // Red-team 2026-10-08 (T092, decision 35): "Others" holds the user's own lines too, so it has no rename-everywhere.
  it('an Others line offers no rename-everywhere; Enter overrides just that line', () => {
    const { onRenameSpeaker, onOverrideLine } = setup();
    fireEvent.click(labelButton(1));
    expect(within(dialog()).queryByRole('button', { name: /everywhere/i })).toBeNull();
    fireEvent.change(nameInput(), { target: { value: 'Bob' } });
    fireEvent.submit(nameInput());
    expect(onOverrideLine).toHaveBeenCalledWith('m1:mixed:1', 'Bob');
    expect(onRenameSpeaker).not.toHaveBeenCalled();
  });

  it('Enter renames a named speaker everywhere', () => {
    const { onRenameSpeaker } = setup();
    fireEvent.click(labelButton(0));
    fireEvent.change(nameInput(), { target: { value: 'Jane' } });
    fireEvent.submit(nameInput());
    expect(onRenameSpeaker).toHaveBeenCalledWith(
      { key: 'caption:jane d.', original: 'Jane D.', captionName: 'Jane D.' },
      'Jane',
    );
  });

  it('Escape cancels and focus returns to the label', () => {
    const { onRenameSpeaker, onOverrideLine } = setup();
    fireEvent.click(labelButton(0));
    fireEvent.keyDown(nameInput(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(labelButton(0));
    expect(onRenameSpeaker).not.toHaveBeenCalled();
    expect(onOverrideLine).not.toHaveBeenCalled();
  });

  it('focus returns to the label after a rename too', () => {
    setup();
    fireEvent.click(labelButton(0));
    fireEvent.submit(nameInput());
    expect(document.activeElement).toBe(labelButton(0));
  });

  it.each([
    ['empty', '   '],
    ['too long', 'x'.repeat(61)],
  ])('a %s name shows an error and sends nothing', (_case, value) => {
    const { onRenameSpeaker, onOverrideLine } = setup();
    fireEvent.click(labelButton(0));
    fireEvent.change(nameInput(), { target: { value } });
    fireEvent.submit(nameInput());
    fireEvent.click(within(dialog()).getByRole('button', { name: /just this line/i }));
    expect(within(dialog()).getByRole('alert').textContent).toMatch(/1–60 characters/);
    expect(onRenameSpeaker).not.toHaveBeenCalled();
    expect(onOverrideLine).not.toHaveBeenCalled();
  });

  it('a rename shows on every line of that speaker on the next render (SC-005)', () => {
    const { view, props } = setup();
    view.rerender(
      <Transcript {...props} meeting={{ speakerRenames: { 'caption:jane d.': { name: 'Jane', origin: 'manual' } } }} />,
    );
    expect(labelButton(0).textContent).toContain('Jane');
    expect(labelButton(0).textContent).not.toContain('Jane D.');
    expect(labelButton(2).textContent).toContain('Jane');
    expect(labelButton(1).textContent).toContain('Others');
  });

  it('without edit handlers labels are plain text', () => {
    render(<Transcript segments={segments} partials={[]} meeting={{ speakerRenames: {} }} />);
    expect(within(line(0)).queryByRole('button')).toBeNull();
  });
});
