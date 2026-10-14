// 006 T018 (US2, FR-006–FR-008, FR-021): one line of four dots, each with its state as text for screen readers and as
// a tooltip, expanding only for a problem with its reason and action. Carries over 001 T074 / 002 T052's cases.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenericAdapter } from '@/core/platform/generic-adapter';
import { initialStatus, reduceStatus, type StatusEvent, type StatusSnapshot } from '@/core/status/status';
import { StatusLine } from '@/entrypoints/sidepanel/components/StatusLine';
import { FakeMeetAdapter } from '../../support/fake-meet-adapter';

afterEach(cleanup);

const apply = (...events: StatusEvent[]) => events.reduce(reduceStatus, initialStatus());
const meet = new FakeMeetAdapter({ state: 'on' });
const generic = new GenericAdapter();

/** A healthy Meet meeting: capture, transcription, names and a followed mic all fine. */
function healthy(...more: StatusEvent[]): StatusSnapshot {
  return apply(
    { type: 'capture', state: 'starting' },
    { type: 'adapter', captions: meet.captions, mute: meet.mute },
    { type: 'mic', state: 'active' },
    { type: 'transcription', state: 'connecting' },
    { type: 'transcription', state: 'active' },
    { type: 'capture', state: 'active' },
    { type: 'captions', state: { state: 'on' } },
    { type: 'mute', muted: false },
    ...more,
  );
}

const region = () => screen.getByRole('region', { name: 'Status' });
const items = () => [...region().querySelectorAll('.status-dot')];
/** Each dot's spoken text and tooltip. */
const spoken = () => items().map((li) => li.querySelector('.sr-only')!.textContent);
const problems = () => [...region().querySelectorAll('.status-problem')].map((p) => p.textContent);

describe('StatusLine', () => {
  it('is a labelled region that announces changes politely', () => {
    render(<StatusLine status={initialStatus()} running={false} onFixMic={() => {}} />);
    expect(region().querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('healthy: four dots named "{label}: {text}" with matching tooltips, and no reason shown', () => {
    render(<StatusLine status={healthy()} running onFixMic={() => {}} />);
    expect(spoken()).toEqual([
      'Capture: Capturing the meeting tab',
      'Transcription: Transcribing',
      'Speaker names: On',
      'Microphone: Live',
    ]);
    expect(items().map((li) => li.getAttribute('title'))).toEqual(spoken());
    expect(problems()).toEqual([]);
    expect(region().querySelector('.status-problems')).toBeNull();
    // A short word beside each dot (user, 2026-10-08); the state words stay in the tooltip and for screen readers.
    expect(items().map((li) => li.querySelector('[aria-hidden="true"]:not(.dot)')?.textContent)).toEqual([
      'Capture',
      'Transcription',
      'Speaker names',
      'Microphone',
    ]);
  });

  it('a reconnect is busy and does not expand', () => {
    render(
      <StatusLine
        status={healthy({ type: 'transcription', state: 'reconnecting', reason: 'Connection to ElevenLabs lost' })}
        running
        onFixMic={() => {}}
      />,
    );
    expect(spoken()[1]).toBe('Transcription: Reconnecting… — Connection to ElevenLabs lost');
    expect(problems()).toEqual([]);
  });

  it('muted in Meet does not expand and offers no fix', () => {
    render(<StatusLine status={healthy({ type: 'mute', muted: true })} running onFixMic={() => {}} />);
    expect(spoken()[3]).toBe('Microphone: Muted in Meet — not sent');
    expect(problems()).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Allow microphone' })).toBeNull();
  });

  it("Meet's mute button unreadable: expands with the reason and no action (K33, decision 34)", () => {
    render(<StatusLine status={healthy({ type: 'mute-unreadable' })} running onFixMic={() => {}} />);
    expect(problems()).toEqual(["Microphone Not sent — can't see Meet's mute button"]);
    expect(screen.queryByRole('button', { name: 'Allow microphone' })).toBeNull();
  });

  it('a tab with no mute source: Live — sent even while muted, collapsed (R12)', () => {
    const s = apply(
      { type: 'capture', state: 'starting' },
      { type: 'adapter', captions: generic.captions, mute: generic.mute },
      { type: 'mic', state: 'active' },
    );
    render(<StatusLine status={s} running={false} onFixMic={() => {}} />);
    expect(spoken()[3]).toBe('Microphone: Live — sent even while muted');
  });

  it('mic unavailable: expands with label, text and an Allow microphone button that calls onFixMic', () => {
    const onFixMic = vi.fn();
    render(
      <StatusLine
        status={healthy({ type: 'mic', state: 'unavailable', reason: 'Microphone permission needed' })}
        running
        onFixMic={onFixMic}
      />,
    );
    const problem = region().querySelector<HTMLElement>('.status-problem')!;
    expect(within(problem).getByText('Microphone')).toBeTruthy();
    expect(within(problem).getByText('Not available — Microphone permission needed')).toBeTruthy();
    fireEvent.click(within(problem).getByRole('button', { name: 'Allow microphone' }));
    expect(onFixMic).toHaveBeenCalled();
  });

  it('two problems render two lines in dependency order', () => {
    render(
      <StatusLine
        status={healthy(
          { type: 'mic', state: 'unavailable', reason: 'No mic' },
          { type: 'captions', state: { state: 'off-by-user', reason: 'Captions were turned off' } },
        )}
        running
        onFixMic={() => {}}
      />,
    );
    expect(problems()).toEqual([
      'Speaker names Unavailable — Captions were turned off',
      'Microphone Not available — No mic Allow microphone',
    ]);
  });

  it('a meeting on another site keeps the speaker-names reason shown', () => {
    const s = apply(
      { type: 'capture', state: 'starting' },
      { type: 'adapter', captions: generic.captions, mute: generic.mute },
    );
    render(<StatusLine status={s} running onFixMic={() => {}} />);
    expect(problems()).toEqual([`Speaker names Not available — ${s.speakerNames.reason}`]);
  });

  it('the error dot differs in shape class from the others (FR-021)', () => {
    render(
      <StatusLine
        status={healthy({ type: 'transcription', state: 'failed', reason: 'x' })}
        running
        onFixMic={() => {}}
      />,
    );
    const shapes = items().map((li) => li.querySelector('.dot')!.className);
    expect(shapes[1]).toContain('dot-error');
    expect(shapes.filter((c) => c.includes('dot-error'))).toHaveLength(1);
  });

  it('a very long reason is plain text inside the region, with wrapping allowed', () => {
    const reason = 'x'.repeat(300);
    render(<StatusLine status={healthy({ type: 'capture', state: 'failed', reason })} running onFixMic={() => {}} />);
    expect(problems()[0]).toContain(reason);
    expect(region().className).toContain('status-line');
  });
});
