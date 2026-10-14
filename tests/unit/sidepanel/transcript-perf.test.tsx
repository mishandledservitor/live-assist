// T091: the panel stays responsive with a 3-hour meeting (~5,000 lines, plan performance goal: 100 ms render budget).
// jsdom is slower than Chrome at DOM work, so passing here leaves headroom in the real panel.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PartialLine } from '@/core/messaging/protocol';
import { segmentId, type TranscriptSegment } from '@/core/transcript/model';
import { App } from '@/entrypoints/sidepanel/App';
import { PastTranscript } from '@/entrypoints/sidepanel/components/PastTranscript';
import { Transcript } from '@/entrypoints/sidepanel/components/Transcript';
import { longTranscript, storedMeeting } from '../../support/stored-meetings';
import { fakeMeetingApi } from './fake-meeting-api';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const LINES = 5_000;
const BUDGET_MS = 100;

function seg(i: number): TranscriptSegment {
  return {
    id: segmentId('m1', 'mixed', i),
    meetingId: 'm1',
    stream: 'mixed',
    seq: i,
    startMs: i * 2_000,
    endMs: i * 2_000 + 1_500,
    text: `Line ${i}: a typical sentence of about a dozen words said in the meeting.`,
    language: 'en',
    speakerLabel: 'Others',
    labelSource: 'fallback',
    captionName: null,
    captionSelf: false,
    labelOverride: null,
    schemaVersion: 2,
    words: [],
    timing: 'words',
    sessionId: 's',
    createdAt: 0,
  };
}

const segments = Array.from({ length: LINES }, (_, i) => seg(i));
const partial = (text: string): PartialLine[] => [{ stream: 'mixed', text }];

/** Median of a few runs, so one GC pause cannot fail the build. */
function median(times: number[]): number {
  return [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? Infinity;
}

function time(run: () => void): number {
  const t0 = performance.now();
  run();
  return performance.now() - t0;
}

describe('Transcript with a 3-hour meeting (5,000 lines)', () => {
  it('renders every line', () => {
    const { container } = render(<Transcript segments={segments} partials={[]} />);
    expect(container.querySelectorAll('li')).toHaveLength(LINES);
  });

  it(`updates in-progress text within ${BUDGET_MS} ms`, () => {
    const { rerender } = render(<Transcript segments={segments} partials={partial('')} />);
    const times = Array.from({ length: 7 }, (_, i) =>
      time(() => act(() => rerender(<Transcript segments={segments} partials={partial('word '.repeat(i + 1))} />))),
    );
    expect(median(times)).toBeLessThan(BUDGET_MS);
  });

  it(`appends a finished line within ${BUDGET_MS} ms`, () => {
    let current = segments;
    const { rerender } = render(<Transcript segments={current} partials={[]} />);
    const times = Array.from({ length: 7 }, (_, i) => {
      const next = [...current, seg(LINES + i)];
      current = next;
      return time(() => act(() => rerender(<Transcript segments={next} partials={[]} />)));
    });
    expect(median(times)).toBeLessThan(BUDGET_MS);
  });
});

// T073 (002): the same budget with speaker labels, editable labels, live label updates and a rename.
describe('Transcript with 5,000 labelled lines (002)', () => {
  const NAMES = ['Emma Jones', 'Tom Brown', 'Jane D.', 'John Doe', 'Mary Jones'];
  const named = (i: number): TranscriptSegment => {
    const base = seg(i);
    if (i % 10 === 9) return base; // some lines stay Others; every fifth line (1,000) is Emma Jones
    const name = NAMES[i % NAMES.length]!;
    return { ...base, speakerLabel: name, labelSource: 'caption', captionName: name };
  };
  const labelled = Array.from({ length: LINES }, (_, i) => named(i));
  const handlers = { onRenameSpeaker: () => undefined, onOverrideLine: () => undefined };

  it(`applies 200 live/segment-updated events within ${BUDGET_MS} ms each (median)`, () => {
    let current = labelled;
    const { rerender } = render(
      <Transcript segments={current} partials={[]} meeting={{ speakerRenames: {} }} {...handlers} />,
    );
    const times = Array.from({ length: 200 }, (_, n) => {
      const i = (n * 37) % LINES;
      const next = [...current];
      next[i] = { ...current[i]!, speakerLabel: 'Tom Brown', labelSource: 'caption', captionName: 'Tom Brown' };
      current = next;
      return time(() =>
        act(() =>
          rerender(<Transcript segments={next} partials={[]} meeting={{ speakerRenames: {} }} {...handlers} />),
        ),
      );
    });
    expect(median(times)).toBeLessThan(BUDGET_MS);
  }, 60_000);

  it(`shows a rename affecting 1,000 lines within ${BUDGET_MS} ms`, () => {
    const { rerender, container } = render(
      <Transcript segments={labelled} partials={[]} meeting={{ speakerRenames: {} }} {...handlers} />,
    );
    const renamed = { speakerRenames: { 'caption:emma jones': { name: 'Emma', origin: 'manual' as const } } };
    const times = Array.from({ length: 5 }, (_, n) =>
      time(() =>
        act(() =>
          rerender(
            <Transcript
              segments={labelled}
              partials={[]}
              meeting={n % 2 === 0 ? renamed : { speakerRenames: {} }}
              {...handlers}
            />,
          ),
        ),
      ),
    );
    expect(median(times)).toBeLessThan(BUDGET_MS);
    expect(container.textContent).not.toContain('Emma Jones');
  });
});

// 006 T049 (FR-012): opening Settings and coming back neither redraws nor slows the transcript.
describe('Settings round trip with 5,000 lines (006)', () => {
  it(`switches screens within ${BUDGET_MS} ms without touching a transcript line`, async () => {
    const meeting = {
      id: 'm1',
      startedAt: 1,
      endedAt: 2,
      endReason: 'user-stop' as const,
      source: { url: 'https://meet.google.com/x', title: 'Standup', platform: 'meet' as const },
      languageMode: { kind: 'auto' as const },
      userName: 'Alex',
      speakerRenames: {},
      schemaVersion: 1 as const,
    };
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    render(<App api={api} meetings={fakeMeetingApi({ meeting, segments }).api} />);
    await screen.findByText(segments.at(-1)!.text);
    const list = document.querySelector('.transcript-lines')!;
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((m) => mutations.push(...m));
    observer.observe(list, { subtree: true, childList: true, characterData: true, attributes: true });
    // Found once: role queries over 5,000 lines are slow in jsdom and would dominate the timing.
    const gear = document.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!;
    const back = document.querySelector<HTMLButtonElement>('button[aria-label="Back"]')!;
    const times = Array.from({ length: 5 }, () =>
      time(() => {
        act(() => {
          fireEvent.click(gear);
        });
        act(() => {
          fireEvent.click(back);
        });
      }),
    );
    expect(document.activeElement).toBe(gear);
    observer.disconnect();
    expect(mutations.concat(observer.takeRecords())).toEqual([]);
    expect(median(times) / 2).toBeLessThan(BUDGET_MS);
  });
});

// 012 T016 (SC-006, research R4): a stored 3-hour transcript read on the Transcripts screen is the same memoised
// Transcript, so a re-render of the view around it stays inside the same budget.
describe('A stored 5,000-line transcript on the Transcripts screen (012)', () => {
  it(`re-renders within ${BUDGET_MS} ms`, () => {
    const props = {
      meeting: storedMeeting(),
      segments: longTranscript('m1', LINES),
      load: vi.fn(() => Promise.resolve(null)),
      remove: vi.fn(() => Promise.resolve()),
      onDeleted: vi.fn(),
      confirming: false,
      onConfirmingChange: vi.fn(),
      save: vi.fn(),
    };
    const { rerender, container } = render(<PastTranscript {...props} state="stopped" />);
    expect(container.querySelectorAll('li')).toHaveLength(LINES);
    expect(container.querySelector('.label-button')).toBeNull();
    const times = Array.from({ length: 7 }, (_, i) =>
      time(() => act(() => rerender(<PastTranscript {...props} state={i % 2 === 0 ? 'interrupted' : 'stopped'} />))),
    );
    expect(median(times)).toBeLessThan(BUDGET_MS);
    expect(container.querySelector('.meeting-marker')!.textContent).toBe('Interrupted');
  });
});
