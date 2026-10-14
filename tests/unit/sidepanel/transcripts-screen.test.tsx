// 012 T018 (US1; FR-005, FR-008 to FR-013; contracts/transcripts-ui.md): the Transcripts screen — the list of stored
// meetings, one meeting's transcript, and the way back from each.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captionsFile } from '@/core/export/captions-file';
import { transcriptFile } from '@/core/export/transcript-file';
import { zipStored } from '@/core/export/zip';
import { TranscriptsScreen, type TranscriptsScreenProps } from '@/entrypoints/sidepanel/components/TranscriptsScreen';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK, expectNoMarker } from '../../support/caption-marker';
import {
  meetingWithCaptions,
  spokenBy,
  storedCaptionTurn,
  storedMeeting,
  storedSegment,
  STORED_START,
  titled,
} from '../../support/stored-meetings';
import { fakeTranscriptsApi, summarised, type FakeStoredMeeting } from './fake-transcripts-api';

afterEach(cleanup);

const DAY = 86_400_000;

/** Stored meetings `a` (newest, 7 Oct), `b` (6 Oct), `c` (5 Oct), each with a line by a named speaker. */
const three = (): FakeStoredMeeting[] =>
  (['a', 'b', 'c'] as const).map((id, i) =>
    summarised(storedMeeting({ id, startedAt: STORED_START - i * DAY }), [
      storedSegment(id, 0, { text: `First line of ${id}.`, ...spokenBy(`Speaker ${id.toUpperCase()}`) }),
      storedSegment(id, 1, { text: `Second line of ${id}.` }),
    ]),
  );

function setup(stored: FakeStoredMeeting[] = three(), over: Partial<TranscriptsScreenProps> = {}) {
  const fake = fakeTranscriptsApi(stored);
  const headingRef = createRef<HTMLHeadingElement>();
  const calls = { onBack: vi.fn(), onGoToRunning: vi.fn(), onDeleted: vi.fn((_id: string) => undefined) };
  const save = vi.fn((_name: string, _data: BlobPart, _type: string) => undefined);
  const props: TranscriptsScreenProps = { api: fake.api, runningId: null, ...calls, headingRef, save, ...over };
  const view = render(<TranscriptsScreen {...props} />);
  return {
    fake,
    calls,
    save,
    headingRef,
    rerender: (next: Partial<TranscriptsScreenProps>) => view.rerender(<TranscriptsScreen {...props} {...next} />),
  };
}

const items = () => screen.queryAllByRole('listitem').filter((li) => li.hasAttribute('data-meeting-id'));
const ids = () => items().map((li) => li.getAttribute('data-meeting-id'));
const rowOf = (id: string) => document.querySelector<HTMLElement>(`[data-meeting-id="${id}"]`)!;
const opener = (id: string) => rowOf(id).querySelector<HTMLButtonElement>('button.meeting-open')!;
const section = () => document.querySelector<HTMLElement>('section.transcripts-screen')!;
const scroller = () => document.querySelector<HTMLElement>('.transcripts-list')!;
const heading = () => screen.getByRole('heading', { level: 2 });
const loaded = () => waitFor(() => expect(items().length).toBeGreaterThan(0));

// 012 T058 (FR-028, FR-030; design decision 76): the meeting's title in its row and over its transcript.
describe('TranscriptsScreen: the meeting\u2019s title (012 decision 76)', () => {
  const withTitle = (): FakeStoredMeeting[] => {
    const [a, b, c] = three();
    return [{ ...a!, meeting: { ...a!.meeting, source: titled('Weekly sync') } }, b!, c!];
  };

  it('a row with a title shows it above its date line; a row without one is as before', async () => {
    setup(withTitle());
    await loaded();
    expect(rowOf('a').querySelector('.meeting-title')!.textContent).toBe('Weekly sync');
    expect(opener('a').getAttribute('aria-label')).toBe('Open transcript of Weekly sync, 7 Oct 2026, 14:30');
    expect(rowOf('b').querySelector('.meeting-title')).toBeNull();
    expect(opener('b').getAttribute('aria-label')).toBe('Open transcript of 6 Oct 2026, 14:30');
  });

  it('the heading over a titled meeting shows the title above its date and time, and is focused', async () => {
    setup(withTitle());
    await loaded();
    fireEvent.click(opener('a'));
    await waitFor(() => expect(heading().querySelector('.meeting-title')).not.toBeNull());
    expect([...heading().children].map((el) => `${el.className}:${el.textContent}`)).toEqual([
      'meeting-title:Weekly sync',
      'meeting-when:7 Oct 2026, 14:30',
    ]);
    expect(heading().querySelector('.meeting-title')!.getAttribute('title')).toBe('Weekly sync');
    expect(document.activeElement).toBe(heading());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(heading().textContent).toBe('Transcripts');
    expect(document.activeElement).toBe(opener('a'));
  });

  it('the heading over a meeting without a title is its date and time alone', async () => {
    setup(withTitle());
    await loaded();
    fireEvent.click(opener('b'));
    await waitFor(() => expect(heading().textContent).toBe('6 Oct 2026, 14:30'));
    expect(heading().querySelector('.meeting-title')).toBeNull();
  });
});

describe('TranscriptsScreen: the list (012 US1)', () => {
  it('is a section labelled by its title, with Back, the title and one list of every meeting, newest first', async () => {
    const { headingRef } = setup();
    await loaded();
    expect(section().getAttribute('aria-labelledby')).toBe(heading().id);
    expect(heading().textContent).toBe('Transcripts');
    expect(heading().tabIndex).toBe(-1);
    expect(headingRef.current).toBe(heading());
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Transcripts' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(rowOf('a').querySelector('.meeting-names')!.textContent).toBe('Speaker A');
    expect(opener('b').textContent).toBe('6 Oct 2026 · 14:30 · 45 min');
  });

  it('shows nothing but Back and the title until the list is read: no loading line, no empty state', async () => {
    setup();
    expect(section().textContent).toBe('←Transcripts');
    await loaded();
  });

  it('only the list scrolls: it is the focusable scroller, and the bar and the status region are outside it', async () => {
    setup();
    await loaded();
    expect(scroller().tabIndex).toBe(0);
    expect(scroller().contains(screen.getByRole('list', { name: 'Transcripts' }))).toBe(true);
    expect(scroller().contains(screen.getByRole('button', { name: 'Back' }))).toBe(false);
    expect(scroller().contains(heading())).toBe(false);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    expect(status.classList.contains('sr-only')).toBe(true);
    expect(section().contains(status)).toBe(true);
    expect(scroller().contains(status)).toBe(false);
  });

  it('lists the running meeting first and marks it, whatever its start time', async () => {
    const running = storedMeeting({ id: 'live', startedAt: STORED_START - 10 * DAY, endedAt: null, endReason: null });
    const { fake } = setup([...three(), { meeting: running }], { runningId: 'live' });
    await loaded();
    expect(ids()).toEqual(['live', 'a', 'b', 'c']);
    expect(rowOf('live').getAttribute('data-state')).toBe('in-progress');
    expect(rowOf('live').querySelector('.meeting-marker')!.textContent).toBe('In progress');
    expect(within(rowOf('live')).getAllByRole('button')).toHaveLength(1);
    expect(within(rowOf('a')).getByRole('button', { name: 'Delete transcript of 7 Oct 2026, 14:30' })).toBeTruthy();
    // Its lines are still arriving: its details are not worked out here.
    expect(fake.api.summarise).not.toHaveBeenCalled();
  });

  it('an open record that is not the running meeting is Interrupted', async () => {
    const cut = storedMeeting({ id: 'cut', endedAt: null, endReason: null });
    setup([{ meeting: cut, segments: [storedSegment('cut', 0, { startMs: 9 * 60_000 })] }]);
    await waitFor(() => expect(opener('cut').textContent).toBe('7 Oct 2026 · 14:30 · 9 min'));
    expect(rowOf('cut').getAttribute('data-state')).toBe('interrupted');
    expect(rowOf('cut').querySelector('.meeting-marker')!.textContent).toBe('Interrupted');
  });

  it('two meetings started in the same minute are two rows, each opening its own transcript', async () => {
    const twins = (['t1', 't2'] as const).map((id, i) =>
      summarised(storedMeeting({ id, startedAt: STORED_START + i * 1_000 }), [
        storedSegment(id, 0, { text: `Only line of ${id}.` }),
      ]),
    );
    const { fake } = setup(twins);
    await loaded();
    expect(ids()).toEqual(['t2', 't1']);
    expect(opener('t1').getAttribute('aria-label')).toBe(opener('t2').getAttribute('aria-label'));
    fireEvent.click(opener('t1'));
    await screen.findByText('Only line of t1.');
    expect(fake.api.open.mock.calls).toEqual([['t1']]);
  });

  it('draws rows before their details are ready and fills them in afterwards, without reordering', async () => {
    const bare = three().map(({ meeting, segments }): FakeStoredMeeting => {
      const { summary: _summary, ...rest } = meeting;
      return segments ? { meeting: rest, segments } : { meeting: rest };
    });
    const fake = fakeTranscriptsApi(bare);
    fake.holdSummaries();
    render(
      <TranscriptsScreen
        api={fake.api}
        runningId={null}
        onBack={vi.fn()}
        onGoToRunning={vi.fn()}
        onDeleted={vi.fn()}
        headingRef={createRef()}
      />,
    );
    await loaded();
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(items().map((li) => li.querySelector('.meeting-when')!.textContent)).toEqual([
      '7 Oct 2026 · 14:30 · 45 min',
      '6 Oct 2026 · 14:30 · 45 min',
      '5 Oct 2026 · 14:30 · 45 min',
    ]);
    expect(document.querySelector('.meeting-names')).toBeNull();
    // One at a time, newest first.
    await waitFor(() => expect(fake.api.summarise).toHaveBeenCalledTimes(1));
    expect(fake.api.summarise.mock.calls).toEqual([['a']]);
    await act(async () => {
      fake.releaseSummaries(1);
      await Promise.resolve();
    });
    await waitFor(() => expect(rowOf('a').querySelector('.meeting-names')!.textContent).toBe('Speaker A'));
    expect(rowOf('b').querySelector('.meeting-names')).toBeNull();
    await waitFor(() => expect(fake.api.summarise.mock.calls).toEqual([['a'], ['b']]));
    await act(async () => {
      fake.releaseSummaries();
      await Promise.resolve();
    });
    await waitFor(() => expect(rowOf('c').querySelector('.meeting-names')!.textContent).toBe('Speaker C'));
    expect(fake.api.summarise.mock.calls).toEqual([['a'], ['b'], ['c']]);
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('asks for details only where the stored ones are missing or outdated', async () => {
    const [a, b, c] = three();
    const outdated = { ...b!, meeting: { ...b!.meeting, summary: { ...b!.meeting.summary!, v: 0 as unknown as 1 } } };
    const { summary: _summary, ...bare } = c!.meeting;
    const { fake } = setup([a!, outdated, { meeting: bare, segments: c!.segments! }]);
    await waitFor(() => expect(fake.api.summarise).toHaveBeenCalledTimes(2));
    expect(fake.api.summarise.mock.calls).toEqual([['b'], ['c']]);
    await waitFor(() => expect(rowOf('c').querySelector('.meeting-names')!.textContent).toBe('Speaker C'));
  });

  it('says so when the stored meetings cannot be read, and never shows the empty state for it', async () => {
    const fake = fakeTranscriptsApi(three());
    fake.failNextList();
    render(
      <TranscriptsScreen
        api={fake.api}
        runningId={null}
        onBack={vi.fn()}
        onGoToRunning={vi.fn()}
        onDeleted={vi.fn()}
        headingRef={createRef()}
      />,
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("Couldn't read the stored transcripts. Close the panel and open it again.");
    expect(screen.queryByText('No transcripts stored.')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(section().textContent).toBe(`←Transcripts${alert.textContent}`);
  });

  it('with no stored meeting it says so and shows nothing else but Back and the title', async () => {
    setup([]);
    const empty = await screen.findByText('No transcripts stored.');
    expect(empty.tagName).toBe('P');
    expect(screen.queryByRole('list')).toBeNull();
    expect(section().textContent).toBe('←TranscriptsNo transcripts stored.');
  });

  it('Back and Escape from the list go back', async () => {
    const { calls } = setup();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(calls.onBack).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(heading(), { key: 'Escape' });
    expect(calls.onBack).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(opener('b'), { key: 'Enter' });
    expect(calls.onBack).toHaveBeenCalledTimes(2);
  });

  it('selecting the running row goes to the running meeting and opens nothing here', async () => {
    const running = storedMeeting({ id: 'live', startedAt: STORED_START + DAY, endedAt: null, endReason: null });
    const { fake, calls } = setup([...three(), { meeting: running }], { runningId: 'live' });
    await loaded();
    fireEvent.click(opener('live'));
    expect(calls.onGoToRunning).toHaveBeenCalledTimes(1);
    expect(fake.api.open).not.toHaveBeenCalled();
    expect(calls.onBack).not.toHaveBeenCalled();
  });

  it('reads the list again when the running meeting changes: a meeting that stopped gains its details', async () => {
    const running = storedMeeting({ id: 'live', startedAt: STORED_START + DAY, endedAt: null, endReason: null });
    const { fake, rerender } = setup([...three(), { meeting: running }], { runningId: 'live' });
    await loaded();
    expect(fake.api.list).toHaveBeenCalledTimes(1);
    fake.put({
      meeting: { ...running, endedAt: running.startedAt + 20 * 60_000, endReason: 'user-stop' },
      segments: [storedSegment('live', 0, spokenBy('Jane'))],
    });
    rerender({ runningId: null });
    await waitFor(() => expect(rowOf('live').getAttribute('data-state')).toBe('stopped'));
    expect(fake.api.list).toHaveBeenCalledTimes(2);
    expect(rowOf('live').querySelector('.meeting-marker')).toBeNull();
    await waitFor(() => expect(opener('live').textContent).toBe('8 Oct 2026 · 14:30 · 20 min'));
    await waitFor(() => expect(rowOf('live').querySelector('.meeting-names')!.textContent).toBe('Jane'));
    expect(ids()).toEqual(['live', 'a', 'b', 'c']);
  });
});

describe('TranscriptsScreen: one meeting (012 US1)', () => {
  async function openB() {
    const result = setup();
    await loaded();
    fireEvent.click(opener('b'));
    await screen.findByText('First line of b.');
    return result;
  }

  it('shows the transcript under a title giving its date and time, focused, with the list kept and hidden', async () => {
    const { fake, headingRef } = await openB();
    expect(fake.api.open.mock.calls).toEqual([['b']]);
    expect(heading().textContent).toBe('6 Oct 2026, 14:30');
    expect(headingRef.current).toBe(heading());
    expect(document.activeElement).toBe(heading());
    const lines = within(screen.getByRole('region', { name: 'Transcript' })).getAllByRole('listitem');
    expect(lines.map((l) => l.textContent)).toEqual([
      '00:00 Speaker B (confirmed) First line of b.',
      '00:02 Others (speaker not identified) Second line of b.',
    ]);
    expect(scroller().hidden).toBe(true);
    expect(scroller().querySelectorAll('[data-meeting-id]')).toHaveLength(3);
    expect(section().contains(screen.getByRole('region', { name: 'Transcript' }))).toBe(true);
    expect(fake.api.list).toHaveBeenCalledTimes(1);
  });

  it('Back returns to the list with focus on that meeting’s row', async () => {
    const { calls } = await openB();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(heading().textContent).toBe('Transcripts');
    expect(scroller().hidden).toBe(false);
    expect(screen.queryByRole('region', { name: 'Transcript' })).toBeNull();
    expect(document.activeElement).toBe(opener('b'));
    expect(calls.onBack).not.toHaveBeenCalled();
  });

  it('Escape does the same, and a second Escape goes back from the list', async () => {
    const { calls } = await openB();
    fireEvent.keyDown(heading(), { key: 'Escape' });
    expect(document.activeElement).toBe(opener('b'));
    expect(calls.onBack).not.toHaveBeenCalled();
    fireEvent.keyDown(opener('b'), { key: 'Escape' });
    expect(calls.onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the list where it was scrolled', async () => {
    setup();
    await loaded();
    scroller().scrollTop = 37;
    fireEvent.click(opener('c'));
    await screen.findByText('First line of c.');
    scroller().scrollTop = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(scroller().scrollTop).toBe(37);
  });

  it('a meeting that is gone when selected leaves the list, read again', async () => {
    const { fake } = setup();
    await loaded();
    fake.vanish('b');
    fireEvent.click(opener('b'));
    await waitFor(() => expect(ids()).toEqual(['a', 'c']));
    expect(heading().textContent).toBe('Transcripts');
    expect(screen.queryByRole('region', { name: 'Transcript' })).toBeNull();
  });

  it('an interrupted meeting says so beside its transcript', async () => {
    const cut = storedMeeting({ id: 'cut', endedAt: null, endReason: null });
    setup([{ meeting: cut, segments: [storedSegment('cut', 0, { text: 'Cut off here' })] }]);
    await loaded();
    fireEvent.click(opener('cut'));
    await screen.findByText('Cut off here');
    expect(document.querySelector('.past-actions .meeting-marker')!.textContent).toBe('Interrupted');
  });
});

const deleteOf = (id: string) => within(rowOf(id)).getByRole('button', { name: /^Delete transcript of / });
const confirmations = () => screen.queryAllByRole('group', { name: 'Confirm delete' });
const confirmDelete = () => fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
const status = () => screen.getByRole('status').textContent;

describe('TranscriptsScreen: delete from the list (012 US2)', () => {
  it('a row\u2019s confirmation names its meeting, and only one is open at a time', async () => {
    setup();
    await loaded();
    fireEvent.click(deleteOf('a'));
    expect(confirmations()).toHaveLength(1);
    expect(rowOf('a').textContent).toContain('Delete the transcript of 7 Oct 2026, 14:30 permanently?');
    fireEvent.click(deleteOf('b'));
    expect(confirmations()).toHaveLength(1);
    expect(rowOf('b').textContent).toContain(
      'Delete the transcript of 6 Oct 2026, 14:30 permanently? Its questions, answers and notes are deleted too. It cannot be recovered.',
    );
    expect(deleteOf('a')).toBeTruthy();
    expect(document.activeElement).toBe(within(rowOf('b')).getByRole('button', { name: 'Delete permanently' }));
  });

  it('Cancel deletes nothing and returns focus to that row\u2019s Delete', async () => {
    const { fake, calls } = setup();
    await loaded();
    fireEvent.click(deleteOf('b'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirmations()).toHaveLength(0);
    expect(document.activeElement).toBe(deleteOf('b'));
    expect(fake.api.remove).not.toHaveBeenCalled();
    expect(calls.onDeleted).not.toHaveBeenCalled();
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('Escape closes an open confirmation and does not go back; a second Escape does', async () => {
    const { calls } = setup();
    await loaded();
    fireEvent.click(deleteOf('b'));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Delete permanently' }), { key: 'Escape' });
    expect(confirmations()).toHaveLength(0);
    expect(calls.onBack).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(deleteOf('b'));
    fireEvent.keyDown(deleteOf('b'), { key: 'Escape' });
    expect(calls.onBack).toHaveBeenCalledTimes(1);
  });

  it('Escape from elsewhere on the screen closes an open confirmation first', async () => {
    const { calls } = setup();
    await loaded();
    fireEvent.click(deleteOf('b'));
    fireEvent.keyDown(opener('a'), { key: 'Escape' });
    expect(confirmations()).toHaveLength(0);
    expect(calls.onBack).not.toHaveBeenCalled();
    fireEvent.keyDown(opener('a'), { key: 'Escape' });
    expect(calls.onBack).toHaveBeenCalledTimes(1);
  });

  it('confirming removes the row without reading the list again, announces it and focuses the next row', async () => {
    const { fake, calls } = setup();
    await loaded();
    expect(status()).toBe('');
    fireEvent.click(deleteOf('b'));
    confirmDelete();
    await waitFor(() => expect(ids()).toEqual(['a', 'c']));
    expect(fake.api.remove.mock.calls).toEqual([['b']]);
    expect(fake.api.list).toHaveBeenCalledTimes(1);
    expect(status()).toBe('Transcript deleted.');
    expect(document.activeElement).toBe(opener('c'));
    expect(calls.onDeleted.mock.calls).toEqual([['b']]);
    expect(confirmations()).toHaveLength(0);
    expect(fake.ids()).toEqual(['a', 'c']);
  });

  it('after the last row is deleted focus goes to the row before it, and then to the title', async () => {
    setup();
    await loaded();
    fireEvent.click(deleteOf('c'));
    confirmDelete();
    await waitFor(() => expect(ids()).toEqual(['a', 'b']));
    expect(document.activeElement).toBe(opener('b'));
    fireEvent.click(deleteOf('a'));
    confirmDelete();
    await waitFor(() => expect(ids()).toEqual(['b']));
    expect(document.activeElement).toBe(opener('b'));
    fireEvent.click(deleteOf('b'));
    confirmDelete();
    await screen.findByText('No transcripts stored.');
    expect(screen.queryByRole('list')).toBeNull();
    expect(document.activeElement).toBe(heading());
    expect(status()).toBe('Transcript deleted.');
  });

  it('a failed deletion leaves the row and says so', async () => {
    const { fake, calls } = setup();
    await loaded();
    fake.failNextRemove();
    fireEvent.click(deleteOf('b'));
    confirmDelete();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("Couldn't delete this transcript. Try again.");
    expect(rowOf('b').contains(alert)).toBe(true);
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(status()).toBe('');
    expect(calls.onDeleted).not.toHaveBeenCalled();
    // Trying again works.
    confirmDelete();
    await waitFor(() => expect(ids()).toEqual(['a', 'c']));
  });

  it('offers no way to delete several meetings at once', async () => {
    setup();
    await loaded();
    expect(screen.queryAllByRole('checkbox')).toEqual([]);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names.filter((n) => /delete/i.test(n ?? ''))).toEqual([
      'Delete transcript of 7 Oct 2026, 14:30',
      'Delete transcript of 6 Oct 2026, 14:30',
      'Delete transcript of 5 Oct 2026, 14:30',
    ]);
  });
});

describe('TranscriptsScreen: delete from one meeting (012 US2)', () => {
  async function openB() {
    const result = setup();
    await loaded();
    fireEvent.click(opener('b'));
    await screen.findByText('First line of b.');
    return result;
  }
  const deleteHere = () => screen.getByRole('button', { name: 'Delete transcript' });

  it('confirming there returns to the list without the meeting, announced, with focus on the next row', async () => {
    const { fake, calls } = await openB();
    fireEvent.click(deleteHere());
    expect(screen.getByRole('group', { name: 'Confirm delete' }).textContent).toContain(
      'Delete the transcript of 6 Oct 2026, 14:30 permanently? Its questions, answers and notes are deleted too.',
    );
    confirmDelete();
    await waitFor(() => expect(heading().textContent).toBe('Transcripts'));
    expect(ids()).toEqual(['a', 'c']);
    expect(scroller().hidden).toBe(false);
    expect(screen.queryByRole('region', { name: 'Transcript' })).toBeNull();
    expect(status()).toBe('Transcript deleted.');
    expect(document.activeElement).toBe(opener('c'));
    expect(fake.api.remove.mock.calls).toEqual([['b']]);
    expect(calls.onDeleted.mock.calls).toEqual([['b']]);
    expect(fake.api.list).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the confirmation there, then goes back to the list', async () => {
    const { calls } = await openB();
    fireEvent.click(deleteHere());
    fireEvent.keyDown(heading(), { key: 'Escape' });
    expect(confirmations()).toHaveLength(0);
    expect(heading().textContent).toBe('6 Oct 2026, 14:30');
    fireEvent.keyDown(heading(), { key: 'Escape' });
    expect(heading().textContent).toBe('Transcripts');
    expect(calls.onBack).not.toHaveBeenCalled();
  });

  it('a failed deletion there keeps the transcript and says so', async () => {
    const { fake } = await openB();
    fake.failNextRemove();
    fireEvent.click(deleteHere());
    confirmDelete();
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't delete this transcript. Try again.");
    expect(heading().textContent).toBe('6 Oct 2026, 14:30');
    expect(screen.getByText('First line of b.')).toBeTruthy();
  });

  it('a confirmation left open in the list is closed when a meeting opens', async () => {
    setup();
    await loaded();
    fireEvent.click(deleteOf('a'));
    fireEvent.click(opener('b'));
    await screen.findByText('First line of b.');
    expect(confirmations()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(confirmations()).toHaveLength(0);
  });
});

const downloadOf = (id: string) => within(rowOf(id)).getByRole('button', { name: /^Download transcript of / });

describe('TranscriptsScreen: download (012 US4)', () => {
  it('a row\u2019s Download reads that meeting and saves its file; the list is not read again and focus stays', async () => {
    const stored = three();
    const { fake, save } = setup(stored);
    await loaded();
    const before = section().innerHTML;
    downloadOf('b').focus();
    fireEvent.click(downloadOf('b'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(fake.api.open.mock.calls).toEqual([['b']]);
    expect(save).toHaveBeenCalledWith(
      'Meeting — 06-10-2026 at 14h30 — Transcript.txt',
      '[00:00] Speaker B: First line of b.\n\n[00:02] Others: Second line of b.\n',
      'text/plain;charset=utf-8',
    );
    expect(fake.api.list).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(downloadOf('b'));
    expect(section().innerHTML).toBe(before);
    expect(heading().textContent).toBe('Transcripts');
  });

  it('a row has Download only once its details say the file would have a line', async () => {
    const withLines = storedMeeting({ id: 'lines' });
    const silent = storedMeeting({ id: 'silent', startedAt: STORED_START - DAY });
    const fake = fakeTranscriptsApi([
      { meeting: withLines, segments: [storedSegment('lines', 0, { text: 'Said.' })] },
      { meeting: silent },
    ]);
    fake.holdSummaries();
    render(
      <TranscriptsScreen
        api={fake.api}
        runningId={null}
        onBack={vi.fn()}
        onGoToRunning={vi.fn()}
        onDeleted={vi.fn()}
        headingRef={createRef()}
      />,
    );
    await loaded();
    expect(screen.queryByRole('button', { name: /^Download/ })).toBeNull();
    await act(async () => {
      fake.releaseSummaries();
      await Promise.resolve();
    });
    await waitFor(() => expect(downloadOf('lines')).toBeTruthy());
    await waitFor(() => expect(rowOf('silent').textContent).toContain('Nothing was transcribed.'));
    expect(within(rowOf('silent')).queryByRole('button', { name: /^Download/ })).toBeNull();
  });

  it('a meeting that vanished saves nothing and shows nothing', async () => {
    const { fake, save } = setup();
    await loaded();
    fake.vanish('b');
    const before = section().innerHTML;
    fireEvent.click(downloadOf('b'));
    await waitFor(() => expect(fake.api.open).toHaveBeenCalledTimes(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(save).not.toHaveBeenCalled();
    expect(section().innerHTML).toBe(before);
    expect(fake.api.list).toHaveBeenCalledTimes(1);
  });

  it('the meeting being read has Download, which reads that meeting again and saves what its row saves', async () => {
    const { fake, save } = setup();
    await loaded();
    fireEvent.click(opener('b'));
    await screen.findByText('First line of b.');
    fireEvent.click(screen.getByRole('button', { name: 'Download transcript' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]).toEqual([
      'Meeting — 06-10-2026 at 14h30 — Transcript.txt',
      '[00:00] Speaker B: First line of b.\n\n[00:02] Others: Second line of b.\n',
      'text/plain;charset=utf-8',
    ]);
    expect(fake.api.open.mock.calls).toEqual([['b'], ['b']]);
    expect(heading().textContent).toBe('6 Oct 2026, 14:30');
  });
});

// 013 T047 (FR-018, FR-019, FR-022; contracts/files-and-storage.md "Call sites"): a meeting with kept captions on the
// Transcripts screen. The caption sentences are the invented markers, so a leak into the screen is found.
describe('TranscriptsScreen: a meeting with kept captions (013)', () => {
  const C4 =
    "Delete the transcript of 6 Oct 2026, 14:30 permanently? Its questions, answers, notes and Meet's captions are deleted too. It cannot be recovered.";
  const utf8 = (text: string) => new TextEncoder().encode(text);

  /** `a` and `c` as in `three()`; `b` has kept captions. `quiet` (4 Oct) has captions and no transcript line. */
  function withCaptions(): FakeStoredMeeting[] {
    const [a, b, c] = three();
    const quiet = meetingWithCaptions({ id: 'quiet', startedAt: STORED_START - 3 * DAY });
    return [
      a!,
      {
        ...b!,
        meeting: { ...b!.meeting, hasCaptions: true },
        captionTurns: [
          storedCaptionTurn('b', 1, { speakerName: 'Speaker B', text: CAPTION_MARKER }),
          storedCaptionTurn('b', 2, { speakerName: 'You', self: true, text: CAPTION_MARKER_GREEK }),
        ],
      },
      c!,
      { ...summarised(quiet), captionTurns: [storedCaptionTurn('quiet', 1, { text: CAPTION_MARKER })] },
    ];
  }

  /** The bytes a zip of `entry` has when its entries are stamped with `at`. */
  function zipOf(entry: FakeStoredMeeting, at: Date): Uint8Array {
    const transcript = transcriptFile(entry.meeting, entry.segments ?? []);
    const captions = captionsFile(entry.meeting, entry.captionTurns ?? []);
    return zipStored(
      [
        { name: 'Meeting — 06-10-2026 at 14h30 — Transcript.txt', data: utf8(transcript.body) },
        { name: captions.name, data: utf8(captions.body) },
      ],
      at,
    );
  }

  it('a row\u2019s Download saves one zip of the transcript and the captions, and the screen shows none of their text', async () => {
    const stored = withCaptions();
    const { fake, save } = setup(stored);
    await loaded();
    const before = section().innerHTML;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const now = new Date(2026, 9, 12, 9, 41, 30);
      vi.setSystemTime(now);
      fireEvent.click(downloadOf('b'));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(save.mock.calls[0]).toEqual([
        'Meeting — 06-10-2026 at 14h30.zip',
        zipOf(stored[1]!, now),
        'application/zip',
      ]);
    } finally {
      vi.useRealTimers();
    }
    expect(fake.api.open.mock.calls).toEqual([['b']]);
    expect(section().innerHTML).toBe(before);
    expectNoMarker(section().innerHTML);
  });

  it('the meeting being read saves the same zip, and renders no caption sentence', async () => {
    const stored = withCaptions();
    const { save } = setup(stored);
    await loaded();
    fireEvent.click(opener('b'));
    await screen.findByText('First line of b.');
    expectNoMarker(section().innerHTML);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const now = new Date(2026, 9, 12, 9, 41, 30);
      vi.setSystemTime(now);
      fireEvent.click(screen.getByRole('button', { name: 'Download transcript' }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(save.mock.calls[0]).toEqual([
        'Meeting — 06-10-2026 at 14h30.zip',
        zipOf(stored[1]!, now),
        'application/zip',
      ]);
    } finally {
      vi.useRealTimers();
    }
    expectNoMarker(section().innerHTML);
  });

  it('a meeting with captions and no transcript line has Download in its row and beside "Nothing was transcribed."', async () => {
    const { save } = setup(withCaptions());
    await loaded();
    expect(rowOf('quiet').textContent).toContain('Nothing was transcribed.');
    fireEvent.click(downloadOf('quiet'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const captionsOnly = [
      'Meeting — 04-10-2026 at 14h30 — Meet captions.txt',
      `[00:04] Sarah Brown: ${CAPTION_MARKER}\n`,
      'text/plain;charset=utf-8',
    ];
    expect(save.mock.calls[0]).toEqual(captionsOnly);

    fireEvent.click(opener('quiet'));
    await screen.findByText('Nothing was transcribed.', { selector: '.past-transcript p' });
    expect(document.querySelector('.past-actions')!.textContent).toBe('Download transcriptDelete transcript');
    fireEvent.click(screen.getByRole('button', { name: 'Download transcript' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]).toEqual(captionsOnly);
    expectNoMarker(section().innerHTML);
  });

  it('caption turns that cannot be read: the press saves nothing, never the transcript alone, and shows nothing', async () => {
    const { fake, save } = setup(withCaptions());
    await loaded();
    fake.failNextCaptions();
    const before = section().innerHTML;
    fireEvent.click(downloadOf('b'));
    await waitFor(() => expect(fake.api.open).toHaveBeenCalledTimes(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(save).not.toHaveBeenCalled();
    expect(section().innerHTML).toBe(before);
    // The next press tries again.
    fireEvent.click(downloadOf('b'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toBe('Meeting — 06-10-2026 at 14h30.zip');
  });

  it('the confirmation names Meet\u2019s captions in the row and beside the transcript; other meetings keep P13', async () => {
    setup(withCaptions());
    await loaded();
    const question = () => screen.getByRole('group', { name: 'Confirm delete' }).querySelector('p')?.textContent;
    fireEvent.click(within(rowOf('b')).getByRole('button', { name: /^Delete transcript of / }));
    expect(question()).toBe(C4);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(rowOf('a')).getByRole('button', { name: /^Delete transcript of / }));
    expect(question()).toBe(
      'Delete the transcript of 7 Oct 2026, 14:30 permanently? Its questions, answers and notes are deleted too. It cannot be recovered.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(opener('b'));
    await screen.findByText('First line of b.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete transcript' }));
    expect(question()).toBe(C4);
  });
});
