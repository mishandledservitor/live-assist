// T021: turning Meet's captions on, hiding them and restoring them (research R4), on saved snapshots with fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionsState } from '@/core/platform/adapter';
import { MEET_REASONS } from '@/core/messaging/meet-bridge';
import { CaptionsControl, HIDE_CSS, HIDE_STYLE_ID } from '@/platforms/meet/captions-control';
import { loadMeetSnapshot, setCaptionsButton } from '../../../support/meet-snapshot';

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

const captionsButton = (doc: Document) =>
  [...doc.querySelectorAll<HTMLElement>('button')].find((b) =>
    /^closed_caption(_off)?$/.test(b.querySelector('.google-symbols')?.textContent?.trim() ?? ''),
  )!;

/** Behaves like Meet: a click on the captions button flips it (after `delayMs`). Returns the click count. */
function meetFlipsOnClick(doc: Document, delayMs = 100) {
  const clicks = { n: 0 };
  captionsButton(doc).addEventListener('click', () => {
    clicks.n += 1;
    const on = captionsButton(doc).getAttribute('aria-pressed') !== 'true';
    setTimeout(() => setCaptionsButton(doc, on), delayMs);
  });
  return clicks;
}

function setup(snapshot: string) {
  const doc = loadMeetSnapshot(snapshot);
  const states: CaptionsState[] = [];
  const control = new CaptionsControl({ doc, onState: (s) => void states.push(s) });
  return { doc, control, states, last: () => states.at(-1) };
}

const hiddenContainer = (doc: Document) => doc.querySelector('[data-live-assist-hidden]');
const region = (doc: Document) => doc.querySelector('[role="region"][aria-label="Captions"]')!;

describe('CaptionsControl', () => {
  it('in the lobby reports "Join the call to get speaker names" and proceeds once the call appears', async () => {
    const { doc, control, last } = setup('lobby');
    control.enable();
    await vi.advanceTimersByTimeAsync(1000);
    expect(last()).toEqual({ state: 'starting', reason: MEET_REASONS.lobby });
    // No timeout while waiting in the lobby.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(last()).toEqual({ state: 'starting', reason: MEET_REASONS.lobby });

    // Joining: the in-call page replaces the lobby.
    doc.body.innerHTML = loadMeetSnapshot('in-call-captions-off').body.innerHTML;
    const clicks = meetFlipsOnClick(doc);
    await vi.advanceTimersByTimeAsync(1000);
    expect(clicks.n).toBe(1);
    expect(last()).toEqual({ state: 'on' });
  });

  it('in a call with captions off clicks once, waits for on, reports on and hides the captions region itself', async () => {
    const { doc, control, states } = setup('in-call-captions-off');
    const clicks = meetFlipsOnClick(doc, 600);
    control.enable();
    await vi.advanceTimersByTimeAsync(300);
    expect(clicks.n).toBe(1);
    expect(hiddenContainer(doc)).toBeNull(); // not hidden before it reports on
    await vi.advanceTimersByTimeAsync(1000);
    expect(clicks.n).toBe(1);
    expect(states.at(-1)).toEqual({ state: 'on' });
    expect(states.filter((s) => s.state === 'on')).toHaveLength(1);
    // Only the region itself (T086): hiding its parent once hid Meet's notifications area on the real page.
    expect([...doc.querySelectorAll('[data-live-assist-hidden]')]).toEqual([region(doc)]);
    const styles = doc.querySelectorAll(`style#${HIDE_STYLE_ID}`);
    expect(styles).toHaveLength(1);
    expect(styles[0]!.textContent).toBe(HIDE_CSS);
    expect(HIDE_CSS).toMatch(/opacity:\s*0\s*!important/);
  });

  it('with captions already on does not click, reports on and hides', async () => {
    const { doc, control, last } = setup('in-call-captions-on');
    const clicks = meetFlipsOnClick(doc);
    control.enable();
    await vi.advanceTimersByTimeAsync(500);
    expect(clicks.n).toBe(0);
    expect(last()).toEqual({ state: 'on' });
    expect(hiddenContainer(doc)).not.toBeNull();
  });

  it('enable() twice does not click twice', async () => {
    const { doc, control } = setup('in-call-captions-off');
    const clicks = meetFlipsOnClick(doc);
    control.enable();
    control.enable();
    await vi.advanceTimersByTimeAsync(2000);
    expect(clicks.n).toBe(1);
  });

  it('button missing for 4 s → unavailable "Couldn\'t turn on Meet captions"', async () => {
    const { doc, control, last } = setup('in-call-captions-off');
    captionsButton(doc).remove();
    control.enable();
    await vi.advanceTimersByTimeAsync(3500);
    expect(control.state().state).toBe('starting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(last()).toEqual({ state: 'unavailable', reason: MEET_REASONS.cantTurnOn });
  });

  it('button never reports on within 4 s → unavailable, and a later on still recovers', async () => {
    const { doc, control, last } = setup('in-call-captions-off');
    control.enable(); // nothing flips the button
    await vi.advanceTimersByTimeAsync(4500);
    expect(last()).toEqual({ state: 'unavailable', reason: MEET_REASONS.cantTurnOn });
    setCaptionsButton(doc, true);
    await vi.advanceTimersByTimeAsync(500);
    expect(last()).toEqual({ state: 'on' });
  });

  it('a changed page (neither a call nor the lobby recognised) → unavailable after 4 s, without throwing (US2-1)', async () => {
    const { control, last } = setup('changed-page');
    control.enable();
    await vi.advanceTimersByTimeAsync(3500);
    expect(control.state().state).toBe('starting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(last()).toEqual({ state: 'unavailable', reason: MEET_REASONS.cantTurnOn });
  });

  it('a changed page that later shows the call recovers', async () => {
    const { doc, control, last } = setup('changed-page');
    control.enable();
    await vi.advanceTimersByTimeAsync(5000);
    doc.body.innerHTML = loadMeetSnapshot('in-call-captions-on').body.innerHTML;
    await vi.advanceTimersByTimeAsync(500);
    expect(last()).toEqual({ state: 'on' });
  });

  describe('restore', () => {
    it('unhides and clicks captions off when they were off before and are still on', async () => {
      const { doc, control } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      control.restore();
      await vi.advanceTimersByTimeAsync(500);
      expect(clicks.n).toBe(2);
      expect(captionsButton(doc).getAttribute('aria-pressed')).toBe('false');
      expect(hiddenContainer(doc)).toBeNull();
      expect(doc.getElementById(HIDE_STYLE_ID)).toBeNull();
    });

    it('leaves captions on when they were on before Start', async () => {
      const { doc, control } = setup('in-call-captions-on');
      const clicks = meetFlipsOnClick(doc);
      control.enable();
      await vi.advanceTimersByTimeAsync(500);
      control.restore();
      expect(clicks.n).toBe(0);
      expect(hiddenContainer(doc)).toBeNull();
    });

    it('twice is a no-op', async () => {
      const { doc, control } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      control.restore();
      await vi.advanceTimersByTimeAsync(500);
      control.restore();
      await vi.advanceTimersByTimeAsync(500);
      expect(clicks.n).toBe(2);
    });

    it('does not click off captions the user already turned off', async () => {
      const { doc, control } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      setCaptionsButton(doc, false); // the user turns them off
      await vi.advanceTimersByTimeAsync(500);
      control.restore();
      expect(clicks.n).toBe(1);
    });

    // T080: a Start within ~100 ms of the previous Stop, before Meet's button reports the restore click's "off".
    it('enable() right after restore waits for the restore click, turns captions on itself and restores them again', async () => {
      const { doc, control, states, last } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc, 300);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      expect(last()).toEqual({ state: 'on' });
      control.restore(); // clicks off; Meet flips the button 300 ms later
      expect(clicks.n).toBe(2);
      await vi.advanceTimersByTimeAsync(100);
      expect(captionsButton(doc).getAttribute('aria-pressed')).toBe('true'); // still reads on
      const before = states.length;
      control.enable();
      await vi.advanceTimersByTimeAsync(2000);
      expect(states.slice(before)).not.toContainEqual(expect.objectContaining({ state: 'off-by-user' }));
      expect(last()).toEqual({ state: 'on' });
      expect(clicks.n).toBe(3); // turned back on by us
      expect(captionsButton(doc).getAttribute('aria-pressed')).toBe('true');
      control.restore();
      await vi.advanceTimersByTimeAsync(1000);
      expect(clicks.n).toBe(4);
      expect(captionsButton(doc).getAttribute('aria-pressed')).toBe('false');
    });

    it('a restore click Meet never applies: the next enable takes captions as on and the next restore still turns them off', async () => {
      const { doc, control, last } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc, 100);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      captionsButton(doc).addEventListener('click', (e) => e.stopImmediatePropagation(), { capture: true, once: true });
      control.restore(); // swallowed: captions stay on
      control.enable();
      await vi.advanceTimersByTimeAsync(6000);
      expect(last()).toEqual({ state: 'on' });
      control.restore();
      await vi.advanceTimersByTimeAsync(500);
      expect(clicks.n).toBe(2);
      expect(captionsButton(doc).getAttribute('aria-pressed')).toBe('false');
    });

    it('captions the user turns on well after a restore count as theirs: left on at the next restore', async () => {
      const { doc, control } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc, 100);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      control.restore();
      await vi.advanceTimersByTimeAsync(10_000);
      setCaptionsButton(doc, true); // the user turns captions on between meetings
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      control.restore();
      await vi.advanceTimersByTimeAsync(500);
      expect(clicks.n).toBe(2);
      expect(captionsButton(doc).getAttribute('aria-pressed')).toBe('true');
    });

    it('stops reporting state after restore', async () => {
      const { doc, control, states } = setup('in-call-captions-on');
      control.enable();
      await vi.advanceTimersByTimeAsync(500);
      control.restore();
      const n = states.length;
      setCaptionsButton(doc, false);
      await vi.advanceTimersByTimeAsync(2000);
      expect(states).toHaveLength(n);
    });
  });

  it('the user turning captions off → off-by-user, no re-click; turning them back on → on', async () => {
    const { doc, control, last } = setup('in-call-captions-off');
    const clicks = meetFlipsOnClick(doc);
    control.enable();
    await vi.advanceTimersByTimeAsync(1000);
    setCaptionsButton(doc, false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(last()).toEqual({ state: 'off-by-user', reason: MEET_REASONS.turnedOff });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(clicks.n).toBe(1);
    setCaptionsButton(doc, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(last()).toEqual({ state: 'on' });
  });

  // T132 (FR-028–FR-030, design decision 61): Settings → Show Meet captions. Shown means nothing is added to the page.
  describe('show Meet captions', () => {
    const tagged = (doc: Document) => [...doc.querySelectorAll('[data-live-assist-hidden]')];
    const style = (doc: Document) => doc.getElementById(HIDE_STYLE_ID);
    const pressed = (doc: Document) => captionsButton(doc).getAttribute('aria-pressed');

    it('shown before enable: captions are turned on and reported, nothing is hidden, also on later checks and after a re-render', async () => {
      const { doc, control, states } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc);
      control.setShown(true);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      expect(clicks.n).toBe(1);
      expect(states.at(-1)).toEqual({ state: 'on' });
      expect(tagged(doc)).toEqual([]);
      expect(style(doc)).toBeNull();
      const old = region(doc);
      old.replaceWith(old.cloneNode(true));
      await vi.advanceTimersByTimeAsync(1000);
      expect(tagged(doc)).toEqual([]);
      expect(style(doc)).toBeNull();
    });

    it('switched during a meeting: shown at once and hidden at once, only the region, with no click and no state report', async () => {
      const { doc, control, states } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      expect(tagged(doc)).toEqual([region(doc)]);
      const reported = states.length;

      control.setShown(true);
      expect(tagged(doc)).toEqual([]);
      expect(style(doc)).toBeNull();
      await vi.advanceTimersByTimeAsync(1000); // the poll does not hide them again
      expect(tagged(doc)).toEqual([]);

      control.setShown(false);
      expect(tagged(doc)).toEqual([region(doc)]);
      expect(style(doc)!.textContent).toBe(HIDE_CSS);
      await vi.advanceTimersByTimeAsync(1000);

      control.setShown(true);
      control.setShown(true);
      expect(tagged(doc)).toEqual([]);
      expect(clicks.n).toBe(1);
      expect(pressed(doc)).toBe('true');
      expect(states).toHaveLength(reported);
      expect(control.state()).toEqual({ state: 'on' });
    });

    it('set before captions are on, the latest value applies when they come on', async () => {
      const shown = setup('in-call-captions-off');
      meetFlipsOnClick(shown.doc, 600);
      shown.control.enable();
      await vi.advanceTimersByTimeAsync(300); // still turning on
      shown.control.setShown(true);
      expect(tagged(shown.doc)).toEqual([]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(shown.last()).toEqual({ state: 'on' });
      expect(tagged(shown.doc)).toEqual([]);

      const hidden = setup('in-call-captions-off');
      meetFlipsOnClick(hidden.doc, 600);
      hidden.control.setShown(true);
      hidden.control.enable();
      await vi.advanceTimersByTimeAsync(300);
      hidden.control.setShown(false);
      expect(tagged(hidden.doc)).toEqual([]); // nothing to hide yet
      await vi.advanceTimersByTimeAsync(1000);
      expect(tagged(hidden.doc)).toEqual([region(hidden.doc)]);
    });

    it('adds nothing to a page it is not enabled on, before enable or after restore', async () => {
      const { doc, control } = setup('in-call-captions-on');
      control.setShown(false);
      expect(tagged(doc)).toEqual([]);
      expect(style(doc)).toBeNull();
      control.setShown(true);
      control.enable();
      await vi.advanceTimersByTimeAsync(500);
      control.restore();
      control.setShown(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(tagged(doc)).toEqual([]);
      expect(style(doc)).toBeNull();
    });

    it('restore while shown turns captions off when they were off before Start', async () => {
      const { doc, control } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc);
      control.setShown(true);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      control.restore();
      await vi.advanceTimersByTimeAsync(500);
      expect(clicks.n).toBe(2);
      expect(pressed(doc)).toBe('false');
      expect(tagged(doc)).toEqual([]);
      expect(style(doc)).toBeNull();
    });

    it('restore after switching to shown mid-meeting still turns captions off (what was there before Start is kept)', async () => {
      const { doc, control } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      control.setShown(true);
      await vi.advanceTimersByTimeAsync(1000);
      control.restore();
      await vi.advanceTimersByTimeAsync(500);
      expect(clicks.n).toBe(2);
      expect(pressed(doc)).toBe('false');
    });

    it('restore while shown leaves captions on when they were on before Start', async () => {
      const { doc, control } = setup('in-call-captions-on');
      const clicks = meetFlipsOnClick(doc);
      control.setShown(true);
      control.enable();
      await vi.advanceTimersByTimeAsync(500);
      expect(tagged(doc)).toEqual([]);
      control.restore();
      await vi.advanceTimersByTimeAsync(500);
      expect(clicks.n).toBe(0);
      expect(pressed(doc)).toBe('true');
    });

    it('the user turning captions off while shown → off-by-user, no re-click; back on → on, still shown', async () => {
      const { doc, control, last } = setup('in-call-captions-off');
      const clicks = meetFlipsOnClick(doc);
      control.setShown(true);
      control.enable();
      await vi.advanceTimersByTimeAsync(1000);
      setCaptionsButton(doc, false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(last()).toEqual({ state: 'off-by-user', reason: MEET_REASONS.turnedOff });
      setCaptionsButton(doc, true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(last()).toEqual({ state: 'on' });
      expect(clicks.n).toBe(1);
      expect(tagged(doc)).toEqual([]);
    });
  });

  it('state() reports the current state before and after enable', async () => {
    const { control } = setup('in-call-captions-on');
    expect(control.state()).toEqual({ state: 'starting', reason: MEET_REASONS.starting });
    control.enable();
    await vi.advanceTimersByTimeAsync(500);
    expect(control.state()).toEqual({ state: 'on' });
  });
});
