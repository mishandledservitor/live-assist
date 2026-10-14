// 012 T022 (SC-006, research R3): the list stays quick with a long history. 200 rows inside the jsdom render budget of
// transcript-perf.test.tsx, and a history whose row details are already stored never reads a meeting's lines again.
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptsScreen } from '@/entrypoints/sidepanel/components/TranscriptsScreen';
import { spokenBy, storedMeeting, storedSegment, STORED_START } from '../../support/stored-meetings';
import { fakeTranscriptsApi, summarised, type FakeStoredMeeting } from './fake-transcripts-api';

afterEach(cleanup);

const MEETINGS = 200;
const BUDGET_MS = 100;

const history = (): FakeStoredMeeting[] =>
  Array.from({ length: MEETINGS }, (_, i) => {
    const id = `m${i}`;
    return summarised(storedMeeting({ id, startedAt: STORED_START - i * 86_400_000 }), [
      storedSegment(id, 0, spokenBy('Jane')),
      storedSegment(id, 1, spokenBy(`Guest ${i}`)),
      storedSegment(id, 2),
    ]);
  });

function screenFor(fake: ReturnType<typeof fakeTranscriptsApi>, runningId: string | null = null) {
  return (
    <TranscriptsScreen
      api={fake.api}
      runningId={runningId}
      onBack={vi.fn()}
      onGoToRunning={vi.fn()}
      onDeleted={vi.fn()}
      headingRef={createRef()}
    />
  );
}

const rows = () => document.querySelectorAll('[data-meeting-id]');

describe('Transcripts screen with 200 stored meetings', () => {
  it(`draws 200 rows within ${BUDGET_MS} ms (median)`, async () => {
    const fake = fakeTranscriptsApi(history());
    const { rerender } = render(screenFor(fake));
    await waitFor(() => expect(rows()).toHaveLength(MEETINGS));
    expect(document.querySelector('[data-meeting-id="m199"] .meeting-names')!.textContent).toBe('Jane, Guest 199');
    // The whole list drawn again: every row changes state when a meeting is taken to be running and back.
    const times = Array.from({ length: 7 }, (_, i) => {
      const started = performance.now();
      act(() => rerender(screenFor(fake, i % 2 === 0 ? 'none-of-them' : null)));
      return performance.now() - started;
    });
    expect([...times].sort((a, b) => a - b)[3]).toBeLessThan(BUDGET_MS);
  }, 30_000);

  it('never works out row details that are already stored', async () => {
    const fake = fakeTranscriptsApi(history());
    render(screenFor(fake));
    await waitFor(() => expect(rows()).toHaveLength(MEETINGS));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(fake.api.summarise).not.toHaveBeenCalled();
    expect(fake.api.open).not.toHaveBeenCalled();
    expect(fake.api.list).toHaveBeenCalledTimes(1);
  }, 30_000);
});
