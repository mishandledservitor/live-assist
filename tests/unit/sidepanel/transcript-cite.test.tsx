// 003 T044: following a citation (FR-005, contracts/ask-ui.md "Layout"): the transcript scrolls the cited line into
// view and highlights it for 2 s, stops following new lines like a manual scroll-up, and keeps taking new lines.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Transcript, type TranscriptHandle } from '@/entrypoints/sidepanel/components/Transcript';
import { readChatMeeting } from '../../support/chat-meetings';

const { meeting, segments } = readChatMeeting('standup-en');
const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const items = () => within(screen.getByRole('region', { name: 'Transcript' })).getAllByRole('listitem');

describe('Transcript: citations', () => {
  it('gives every line its segment id', () => {
    render(<Transcript segments={segments} partials={[]} meeting={meeting} />);
    expect(items().map((li) => li.getAttribute('data-segment-id'))).toEqual(segments.map((s) => s.id));
  });

  it('scrollToSegment scrolls the line into view and highlights it for 2 s', () => {
    const ref = createRef<TranscriptHandle>();
    render(<Transcript segments={segments} partials={[]} meeting={meeting} controlRef={ref} />);
    const target = segments[5]!;
    act(() => ref.current!.scrollToSegment(target.id));
    const li = items()[5]!;
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(li);
    expect(li.getAttribute('aria-current')).toBe('true');
    expect(li.classList.contains('line-cited')).toBe(true);
    expect(items().filter((x) => x.getAttribute('aria-current') === 'true')).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(li.hasAttribute('aria-current')).toBe(false);
    expect(li.classList.contains('line-cited')).toBe(false);
  });

  it('stops following new lines, like a scroll-up, and still shows them', () => {
    const ref = createRef<TranscriptHandle>();
    const { rerender } = render(
      <Transcript segments={segments.slice(0, 10)} partials={[]} meeting={meeting} controlRef={ref} />,
    );
    const log = screen.getByTestId('transcript-scroll');
    const h = { scrollHeight: 1000, clientHeight: 300 };
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => h.scrollHeight });
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => h.clientHeight });
    log.scrollTop = 700; // at the bottom, following
    act(() => ref.current!.scrollToSegment(segments[1]!.id));
    log.scrollTop = 120; // where scrollIntoView put the cited line
    h.scrollHeight = 1200;
    rerender(<Transcript segments={segments} partials={[]} meeting={meeting} controlRef={ref} />);
    expect(log.scrollTop).toBe(120);
    expect(items()).toHaveLength(segments.length);
  });

  it('an unknown id does nothing', () => {
    const ref = createRef<TranscriptHandle>();
    render(<Transcript segments={segments} partials={[]} meeting={meeting} controlRef={ref} />);
    act(() => ref.current!.scrollToSegment('no-such-line'));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
