import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PartialLine } from '@/core/messaging/protocol';
import { segmentId, type LabelSource, type TranscriptSegment } from '@/core/transcript/model';
import { Transcript } from '@/entrypoints/sidepanel/components/Transcript';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 001 lines are all "Others"/fallback; a confirmed label (002's captions or a manual rename) is passed explicitly. */
function seg(
  seq: number,
  startMs: number,
  text: string,
  label: { speakerLabel: string; labelSource: LabelSource } = { speakerLabel: 'Others', labelSource: 'fallback' },
): TranscriptSegment {
  return {
    id: segmentId('m1', 'mixed', seq),
    meetingId: 'm1',
    stream: 'mixed',
    seq,
    startMs,
    endMs: startMs + 500,
    text,
    language: 'en',
    ...label,
    captionName: null,
    captionSelf: false,
    labelOverride: null,
    textOverride: null,
    words: [],
    timing: 'words',
    sessionId: 's',
    createdAt: 0,
    schemaVersion: 2,
  };
}

const items = () => within(screen.getByRole('region', { name: 'Transcript' })).queryAllByRole('listitem');

describe('Transcript', () => {
  it('says so when there is nothing yet', () => {
    render(<Transcript segments={[]} partials={[]} />);
    expect(screen.getByRole('region', { name: 'Transcript' }).textContent).toContain('No transcript yet');
  });

  it('renders segments in meeting order with mm:ss and h:mm:ss offsets', () => {
    render(
      <Transcript
        segments={[seg(2, 3_725_000, 'late'), seg(0, 2_100, 'first'), seg(1, 65_000, 'middle')]}
        partials={[]}
      />,
    );
    expect(items().map((li) => li.textContent)).toEqual([
      expect.stringContaining('00:02'),
      expect.stringContaining('01:05'),
      expect.stringContaining('1:02:05'),
    ]);
    expect(items().map((li) => li.querySelector('[data-text]')?.textContent)).toEqual(['first', 'middle', 'late']);
  });

  it('distinguishes confirmed and fallback labels visually and for screen readers (FR-010)', () => {
    const renamed = { speakerLabel: 'Alex', labelSource: 'manual' } as const;
    render(<Transcript segments={[seg(0, 0, 'hi'), seg(1, 1000, 'yo', renamed)]} partials={[]} />);
    const [others, mine] = items();
    const othersLabel = others!.querySelector('[data-label-source]')!;
    const mineLabel = mine!.querySelector('[data-label-source]')!;
    expect(othersLabel.getAttribute('data-label-source')).toBe('fallback');
    expect(mineLabel.getAttribute('data-label-source')).toBe('manual');
    expect(othersLabel.className).not.toBe(mineLabel.className);
    expect(othersLabel.textContent).toContain('Others');
    expect(othersLabel.textContent).toBe('Others (speaker not identified)'); // 006 R24
    expect(othersLabel.getAttribute('title')).toBe('Speaker not identified'); // 006 R23
    expect(mineLabel.textContent).toContain('Alex');
    expect(mineLabel.textContent).toBe('Alex (confirmed)');
    expect(mineLabel.getAttribute('title')).toBe('Confirmed speaker');
  });

  // Revised by T110 (decision 37): the in-progress line's speaker is not known yet, so it shows the placeholder.
  it('shows the in-progress line with the pending placeholder and replaces it with the finished line', () => {
    const partials: PartialLine[] = [{ stream: 'mixed', text: 'Hello every' }];
    const { rerender } = render(<Transcript segments={[]} partials={partials} />);
    const progress = screen.getByRole('region', { name: 'Transcript' }).querySelectorAll('[data-in-progress]');
    expect([...progress].map((p) => p.textContent)).toEqual([expect.stringMatching(/^…Speaker pending Hello every/)]);
    expect(progress[0]?.querySelector('[data-label-pending]')).not.toBeNull();
    rerender(<Transcript segments={[seg(0, 0, 'Hello everyone.')]} partials={[]} />);
    const region = screen.getByRole('region', { name: 'Transcript' });
    expect(region.querySelectorAll('[data-in-progress]')).toHaveLength(0);
    expect(region.textContent).not.toContain('Hello every…');
    expect(items()).toHaveLength(1);
  });

  // T110 (real trace 2026-10-08, design decision 37, FR-026).
  describe('pending placeholder', () => {
    const pending = (seq: number, startMs: number, text: string) => ({
      ...seg(seq, startMs, text),
      labelPending: true,
    });

    it('a line whose name is not settled shows "…", read as "Speaker pending", and offers no editor', () => {
      render(
        <Transcript
          segments={[pending(0, 0, 'Hello everyone.')]}
          partials={[]}
          meeting={{ speakerRenames: {} }}
          onRenameSpeaker={() => undefined}
          onOverrideLine={() => undefined}
        />,
      );
      const [line] = items();
      const label = line!.querySelector('[data-label-pending]')!;
      expect(label.textContent).toBe('…Speaker pending');
      expect(label.querySelector('[aria-hidden="true"]')?.textContent).toBe('…');
      expect(label.getAttribute('title')).toBe('Speaker pending');
      expect(line!.textContent).not.toContain('Others');
      expect(within(line!).queryByRole('button')).toBeNull();
    });

    it('becomes the name once the line settles', () => {
      const { rerender } = render(<Transcript segments={[pending(0, 0, 'Hello everyone.')]} partials={[]} />);
      const named = {
        ...seg(0, 0, 'Hello everyone.', { speakerLabel: 'Emma Jones', labelSource: 'caption' }),
        captionName: 'Emma Jones',
        labelPending: false,
      };
      rerender(<Transcript segments={[named]} partials={[]} />);
      const [line] = items();
      expect(line!.querySelector('[data-label-pending]')).toBeNull();
      expect(line!.querySelector('[data-label-source]')?.textContent).toBe('Emma Jones (confirmed)');
    });
  });

  describe('speaker names (002 T038)', () => {
    const caption = (name: string, captionName = name, captionSelf = false) =>
      ({ speakerLabel: name, labelSource: 'caption', captionName, captionSelf }) as const;
    const named = (seq: number, startMs: number, text: string, fields: ReturnType<typeof caption>) => ({
      ...seg(seq, startMs, text),
      ...fields,
    });
    const labelOf = (li: HTMLElement) => li.querySelector('[data-label-source]')!;

    it('shows caption names in the confirmed style and Others in the fallback style', () => {
      const segments = [
        named(0, 0, 'hi', caption('Emma Jones')),
        seg(1, 1000, 'yo'),
        named(2, 2000, 'me', caption('Alex', 'You', true)),
      ];
      render(<Transcript segments={segments} partials={[]} meeting={null} />);
      const labels = items().map(labelOf);
      expect(labels.map((l) => [l.firstChild?.textContent, l.getAttribute('data-label-source')])).toEqual([
        ['Emma Jones', 'caption'],
        ['Others', 'fallback'],
        ['Alex', 'caption'],
      ]);
      expect(labels[0]!.className).toBe(labels[2]!.className);
      expect(labels[0]!.className).not.toBe(labels[1]!.className);
    });

    it("shows the display label: the meeting's renames apply to every line of that speaker", () => {
      const segments = [
        named(0, 0, 'a', caption('Emma Jones')),
        seg(1, 1000, 'b'),
        named(2, 2000, 'c', caption('Emma Jones')),
      ];
      const meeting = { speakerRenames: { 'caption:emma jones': { name: 'Emma', origin: 'remembered' as const } } };
      render(<Transcript segments={segments} partials={[]} meeting={meeting} />);
      expect(items().map((li) => labelOf(li).firstChild?.textContent)).toEqual(['Emma', 'Others', 'Emma']);
    });

    it('an updated line changes in place, keeping its position', () => {
      const lines = [seg(0, 0, 'a'), seg(1, 1000, 'b')];
      const { rerender } = render(<Transcript segments={lines} partials={[]} meeting={null} />);
      rerender(
        <Transcript segments={[lines[0]!, named(1, 1000, 'b', caption('Tom Brown'))]} partials={[]} meeting={null} />,
      );
      expect(
        items().map((li) => [labelOf(li).firstChild?.textContent, li.querySelector('[data-text]')?.textContent]),
      ).toEqual([
        ['Others', 'a'],
        ['Tom Brown', 'b'],
      ]);
    });
  });

  describe('auto-scroll', () => {
    function scrollable(el: HTMLElement, heights: { scrollHeight: number; clientHeight: number }) {
      Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => heights.scrollHeight });
      Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => heights.clientHeight });
    }

    it('follows new lines while the user is at the bottom', () => {
      const { rerender } = render(<Transcript segments={[seg(0, 0, 'a')]} partials={[]} />);
      const log = screen.getByTestId('transcript-scroll');
      const h = { scrollHeight: 1000, clientHeight: 300 };
      scrollable(log, h);
      log.scrollTop = 700;
      fireEvent.scroll(log);
      h.scrollHeight = 1200;
      rerender(<Transcript segments={[seg(0, 0, 'a'), seg(1, 10, 'b')]} partials={[]} />);
      expect(log.scrollTop).toBe(1200);
    });

    it('stays put when the user has scrolled up', () => {
      const { rerender } = render(<Transcript segments={[seg(0, 0, 'a')]} partials={[]} />);
      const log = screen.getByTestId('transcript-scroll');
      const h = { scrollHeight: 1000, clientHeight: 300 };
      scrollable(log, h);
      log.scrollTop = 100;
      fireEvent.scroll(log);
      h.scrollHeight = 1200;
      rerender(<Transcript segments={[seg(0, 0, 'a'), seg(1, 10, 'b')]} partials={[]} />);
      expect(log.scrollTop).toBe(100);
    });
  });

  // 012 T012 (FR-011, FR-012, spec Clarifications D8; research R4): a stored transcript read from the top.
  describe('follow', () => {
    const confirmed = { speakerLabel: 'Jane', labelSource: 'caption' } as const;
    const lines = (n: number) => Array.from({ length: n }, (_, i) => seg(i, i * 1_000, `line ${i}`, confirmed));
    /** jsdom has no layout: every element reports this height, so "the bottom" is somewhere to scroll to. */
    const tall = () => vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1_000);

    it('follow={false}: the scroller is a focusable group named Transcript lines, not a live log', () => {
      render(<Transcript segments={lines(3)} partials={[]} follow={false} />);
      const region = screen.getByRole('region', { name: 'Transcript' });
      const scroller = within(region).getByRole('group', { name: 'Transcript lines' });
      expect(scroller).toBe(screen.getByTestId('transcript-scroll'));
      expect(scroller.className).toBe('transcript-scroll');
      expect(scroller.tabIndex).toBe(0);
      expect(screen.queryByRole('log')).toBeNull();
      expect(scroller.getAttribute('aria-live')).toBeNull();
    });

    it('follow={false}: opens at the first line and stays there when the props change', () => {
      tall();
      const { rerender } = render(<Transcript segments={lines(3)} partials={[]} follow={false} />);
      const scroller = screen.getByTestId('transcript-scroll');
      expect(scroller.scrollTop).toBe(0);
      rerender(<Transcript segments={lines(5)} partials={[]} follow={false} />);
      expect(scroller.scrollTop).toBe(0);
      rerender(<Transcript segments={lines(5)} partials={[]} follow={false} meeting={{ speakerRenames: {} }} />);
      expect(scroller.scrollTop).toBe(0);
    });

    it('follow={false}: keeps the place the reader scrolled to', () => {
      tall();
      const { rerender } = render(<Transcript segments={lines(3)} partials={[]} follow={false} />);
      const scroller = screen.getByTestId('transcript-scroll');
      scroller.scrollTop = 1_000;
      fireEvent.scroll(scroller);
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1_400);
      rerender(<Transcript segments={lines(4)} partials={[]} follow={false} />);
      expect(scroller.scrollTop).toBe(1_000);
    });

    it('follow={false}: labels are text, told apart as on the main view, and every line is there in order', () => {
      render(
        <Transcript segments={[seg(1, 1_000, 'second'), seg(0, 0, 'first', confirmed)]} partials={[]} follow={false} />,
      );
      expect(screen.queryByRole('button')).toBeNull();
      expect(items().map((li) => li.textContent)).toEqual([
        '00:00 Jane (confirmed) first',
        '00:01 Others (speaker not identified) second',
      ]);
      const [jane, others] = items().map((li) => li.querySelector('[data-label-source]'));
      expect(jane?.tagName).toBe('SPAN');
      expect(jane?.className).toBe('label label-confirmed');
      expect(others?.className).toBe('label label-fallback');
    });

    it('without the prop, and with follow, everything is as before: a log that sticks to the bottom', () => {
      tall();
      for (const props of [{}, { follow: true }]) {
        const { rerender, unmount } = render(<Transcript segments={lines(3)} partials={[]} {...props} />);
        const scroller = screen.getByRole('log', { name: 'Transcript lines' });
        expect(scroller.tabIndex).toBe(0);
        expect(screen.queryByRole('group', { name: 'Transcript lines' })).toBeNull();
        expect(scroller.scrollTop).toBe(1_000);
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1_400);
        rerender(<Transcript segments={lines(4)} partials={[]} {...props} />);
        expect(scroller.scrollTop).toBe(1_400);
        unmount();
        tall();
      }
    });
  });
});

// 020 T007 (US1; FR-001–FR-003, FR-010, FR-011, FR-014; contracts/edit-text-ui.md): a double-click on a settled line's
// text opens the text editor in place, with the double-clicked word selected.
describe('editing a line’s text', () => {
  const textOf = (li: HTMLElement) => li.querySelector<HTMLElement>('[data-text]')!;
  const editorGroup = () => screen.queryByRole('group', { name: 'Edit line text' });
  const field = () => within(editorGroup()!).getByRole<HTMLTextAreaElement>('textbox', { name: 'Line text' });

  /** What the browser does on a double-click: select the word under the pointer, then fire dblclick. */
  function doubleClickWord(span: HTMLElement, word: string) {
    const node = span.firstChild!;
    const start = node.textContent!.indexOf(word);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + word.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.doubleClick(span);
  }

  function setup(segments: TranscriptSegment[], over: Partial<Parameters<typeof Transcript>[0]> = {}) {
    const onOverrideText = vi.fn((_id: string, _text: string | null) => Promise.resolve());
    const props = {
      segments,
      partials: [] as PartialLine[],
      meeting: { speakerRenames: {} },
      onRenameSpeaker: vi.fn(),
      onOverrideLine: vi.fn(),
      onOverrideText,
      ...over,
    };
    const view = render(<Transcript {...props} />);
    return { ...view, props, onOverrideText };
  }

  it('opens on a double-click with the word selected, in place of the text', () => {
    setup([seg(0, 0, 'the cue three budget'), seg(1, 1000, 'next')]);
    doubleClickWord(textOf(items()[0]!), 'cue');
    const [first] = items();
    expect(within(first!).getByRole('group', { name: 'Edit line text' })).toBeTruthy();
    expect(first!.querySelector('[data-text]')).toBeNull();
    expect(field().value).toBe('the cue three budget');
    expect([field().selectionStart, field().selectionEnd]).toEqual([4, 7]);
    expect(document.activeElement).toBe(field());
  });

  it('holds the corrected text when the line has one, and selects all without a selection inside the text', () => {
    setup([{ ...seg(0, 0, 'the cue three budget'), textOverride: 'the Q3 budget' }]);
    window.getSelection()!.removeAllRanges();
    fireEvent.doubleClick(textOf(items()[0]!));
    expect(field().value).toBe('the Q3 budget');
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 'the Q3 budget'.length]);
  });

  // T012 (FR-009): the mark follows the text, real text read with the line; an uncorrected line has none.
  it('a corrected line shows its corrected text followed by the edited mark', () => {
    setup([{ ...seg(0, 0, 'the cue three budget'), textOverride: 'the Q3 budget' }, seg(1, 1000, 'plain')]);
    const [corrected, plain] = items();
    expect(textOf(corrected!).textContent).toBe('the Q3 budget');
    const mark = corrected!.querySelector('.line-edited')!;
    expect(mark.tagName).toBe('SPAN');
    expect(mark.textContent).toBe('edited');
    expect(textOf(corrected!).nextSibling?.textContent).toBe(' ');
    expect(corrected!.lastElementChild).toBe(mark);
    expect(plain!.querySelector('.line-edited')).toBeNull();
    expect(plain!.textContent).not.toContain('edited');
  });

  it('Restore original saves null through the handler', async () => {
    const { onOverrideText } = setup([{ ...seg(0, 0, 'the cue three budget'), textOverride: 'the Q3 budget' }]);
    fireEvent.doubleClick(textOf(items()[0]!));
    fireEvent.click(within(editorGroup()!).getByRole('button', { name: 'Restore original' }));
    await act(() => Promise.resolve());
    expect(onOverrideText).toHaveBeenCalledWith('m1:mixed:0', null);
    expect(editorGroup()).toBeNull();
  });

  it('a single click opens nothing', () => {
    setup([seg(0, 0, 'hello')]);
    fireEvent.click(textOf(items()[0]!));
    expect(editorGroup()).toBeNull();
  });

  it('the in-progress line and a pending line open nothing', () => {
    setup([{ ...seg(0, 0, 'pending line'), labelPending: true }], {
      partials: [{ stream: 'mixed', text: 'still talking' }],
    });
    fireEvent.doubleClick(textOf(items()[0]!));
    const progress = screen
      .getByRole('region', { name: 'Transcript' })
      .querySelector<HTMLElement>('[data-in-progress]')!;
    fireEvent.doubleClick(progress.lastElementChild!);
    expect(editorGroup()).toBeNull();
  });

  it('without the handler nothing opens', () => {
    render(<Transcript segments={[seg(0, 0, 'hello')]} partials={[]} />);
    fireEvent.doubleClick(textOf(items()[0]!));
    expect(editorGroup()).toBeNull();
  });

  it('saves through the handler, then shows the line again with focus on its label button', async () => {
    const { onOverrideText } = setup([seg(0, 0, 'the cue three budget')]);
    doubleClickWord(textOf(items()[0]!), 'cue');
    fireEvent.change(field(), { target: { value: 'the Q3 budget' } });
    fireEvent.click(within(editorGroup()!).getByRole('button', { name: 'Save' }));
    await act(() => Promise.resolve());
    expect(onOverrideText).toHaveBeenCalledWith('m1:mixed:0', 'the Q3 budget');
    expect(editorGroup()).toBeNull();
    expect(document.activeElement).toBe(within(items()[0]!).getByRole('button'));
  });

  it('Escape closes, nothing stored, focus on the label button', () => {
    const { onOverrideText } = setup([seg(0, 0, 'hello')]);
    doubleClickWord(textOf(items()[0]!), 'hello');
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(editorGroup()).toBeNull();
    expect(textOf(items()[0]!).textContent).toBe('hello');
    expect(onOverrideText).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(items()[0]!).getByRole('button'));
  });

  it('with plain labels focus returns to the line itself', () => {
    render(<Transcript segments={[seg(0, 0, 'hello')]} partials={[]} onOverrideText={() => Promise.resolve()} />);
    expect(within(items()[0]!).queryByRole('button')).toBeNull();
    doubleClickWord(textOf(items()[0]!), 'hello');
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(document.activeElement).toBe(items()[0]);
    expect(items()[0]!.tabIndex).toBe(-1);
  });

  it('new lines arriving keep the typed text, the caret and the focus', () => {
    const lines = [seg(0, 0, 'hello there')];
    const { rerender, props } = setup(lines);
    doubleClickWord(textOf(items()[0]!), 'there');
    fireEvent.change(field(), { target: { value: 'hello world' } });
    field().setSelectionRange(5, 5);
    rerender(
      <Transcript
        {...props}
        segments={[{ ...lines[0]!, speakerLabel: 'Jane', labelSource: 'caption' }, seg(1, 1000, 'more')]}
        partials={[{ stream: 'mixed', text: 'and' }]}
      />,
    );
    expect(field().value).toBe('hello world');
    expect([field().selectionStart, field().selectionEnd]).toEqual([5, 5]);
    expect(document.activeElement).toBe(field());
    expect(items()).toHaveLength(2);
  });

  it('opening the label editor closes the text editor, and the other way round', () => {
    setup([seg(0, 0, 'hello'), seg(1, 1000, 'there')]);
    doubleClickWord(textOf(items()[0]!), 'hello');
    fireEvent.click(within(items()[1]!).getByRole('button'));
    expect(editorGroup()).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Edit speaker name' })).toBeTruthy();
    doubleClickWord(textOf(items()[0]!), 'hello');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(editorGroup()).not.toBeNull();
  });

  it('does not auto-scroll while an editor is open, and follows again once it closes', () => {
    const { rerender, props } = setup([seg(0, 0, 'a')]);
    const log = screen.getByTestId('transcript-scroll');
    let height = 1000;
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => height });
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 300 });
    log.scrollTop = 700;
    fireEvent.scroll(log);
    doubleClickWord(textOf(items()[0]!), 'a');
    height = 1200;
    rerender(<Transcript {...props} segments={[seg(0, 0, 'a'), seg(1, 10, 'b')]} />);
    expect(log.scrollTop).toBe(700);
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(log.scrollTop).toBe(1200);
  });
});
