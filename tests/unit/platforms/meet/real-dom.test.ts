// T085: the real Meet DOM inspected on 2026-10-08 (research R13). On that page the first region with a caption-like
// child is "Call feature notifications and actions" (a participant chip has an avatar and spans), the captions button
// has no aria-pressed and the same icon in both states, and the mic and the camera both carry data-is-muted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionActivity, CaptionsState } from '@/core/platform/adapter';
import { observeCaptions } from '@/platforms/meet/caption-observer';
import { CaptionsControl, HIDE_ATTR, HIDE_STYLE_ID } from '@/platforms/meet/captions-control';
import {
  captionItems,
  captionsButton,
  captionsOn,
  captionsRegion,
  inCall,
  isMuted,
  micButton,
  speakerNameOf,
} from '@/platforms/meet/locators';
import { addCaptionItem, loadMeetSnapshot, setCaptionsButton } from '../../../support/meet-snapshot';

const NOTIFICATIONS = '[role="region"][aria-label="Call feature notifications and actions"]';
const CAPTIONS = '[role="region"][aria-label="Captions"]';

const notifications = (doc: Document) => doc.querySelector<HTMLElement>(NOTIFICATIONS)!;
const captions = (doc: Document) => doc.querySelector<HTMLElement>(CAPTIONS)!;

describe('real DOM: captions region (D3)', () => {
  it.each([
    ['real-dom-captions-on', 1],
    ['real-dom-captions-off', 3],
  ] as const)('%s: finds the captions region (tier %i), never the notifications region', (name, tier) => {
    const doc = loadMeetSnapshot(name);
    const region = captionsRegion(doc);
    expect(region.value).toBe(captions(doc));
    expect(region.tier).toBe(tier);
  });

  it('T096: a turn-shaped side region earlier on the page is not taken for captions, and is never hidden', () => {
    const doc = loadMeetSnapshot('real-dom-captions-on');
    const panel = doc.createElement('div');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'People');
    panel.innerHTML =
      '<div><div><img data-iml="7001" src="https://lh3.googleusercontent.com/a/p1=s40" alt=""><span>John Doe</span></div><div>Host</div></div>';
    doc.body.prepend(panel);
    expect(captionsRegion(doc).value).toBe(captions(doc));
    vi.useFakeTimers();
    const control = new CaptionsControl({ doc, onState: () => undefined });
    control.enable();
    vi.advanceTimersByTime(1000);
    expect(panel.hasAttribute(HIDE_ATTR)).toBe(false);
    expect(captions(doc).hasAttribute(HIDE_ATTR)).toBe(true);
    control.restore();
    vi.useRealTimers();
  });

  it('the notifications region is never taken for captions, even with no captions region on the page', () => {
    const doc = loadMeetSnapshot('real-dom-captions-on');
    captions(doc).remove();
    expect(captionsRegion(doc).value).not.toBe(notifications(doc));
  });

  it('the notifications region is not taken even when it is the only focusable region and holds several chips', () => {
    const doc = loadMeetSnapshot('real-dom-captions-off');
    captions(doc).remove();
    const n = notifications(doc);
    n.setAttribute('tabindex', '0');
    const chip = n.querySelector('.CvJr8b')!;
    chip.after(chip.cloneNode(true), chip.cloneNode(true));
    expect(captionsRegion(doc).value).toBeNull();
  });

  it('reads the caption turns and speaker names, leaving the trailing children out', () => {
    const doc = loadMeetSnapshot('real-dom-captions-on');
    const items = captionItems(captionsRegion(doc).value!);
    expect(items.tier).toBe(1);
    expect(items.value.map((i) => speakerNameOf(i))).toEqual([
      { value: 'Emma Jones', tier: 1 },
      { value: 'You', tier: 1 },
    ]);
  });
});

describe('real DOM: captions button (D2)', () => {
  it('reads on/off from the label when there is no aria-pressed and the icon is the same in both states', () => {
    const on = loadMeetSnapshot('real-dom-captions-on');
    const off = loadMeetSnapshot('real-dom-captions-off');
    expect(captionsButton(on).value?.getAttribute('aria-label')).toBe('Turn off captions');
    expect(captionsOn(captionsButton(on).value!)).toEqual({ value: true, tier: 3 });
    expect(captionsOn(captionsButton(off).value!)).toEqual({ value: false, tier: 3 });
  });

  it('is in a call (D1, by the "Call controls" region)', () => {
    expect(inCall(loadMeetSnapshot('real-dom-captions-on')).value).toBe(true);
  });
});

describe('real DOM: mic, never the camera (D5)', () => {
  const camera = (doc: Document) => doc.querySelector<HTMLElement>('button[aria-label^="Turn on camera"]')!;

  it('picks the mic button by its label and reads it unmuted', () => {
    const doc = loadMeetSnapshot('real-dom-captions-on');
    const mic = micButton(doc);
    expect(mic.value?.getAttribute('aria-label')).toBe('Turn off microphone');
    expect(isMuted(mic.value!)).toEqual({ value: false, tier: 1 });
  });

  it('still picks the mic when the camera comes first', () => {
    const doc = loadMeetSnapshot('real-dom-captions-on');
    const cam = camera(doc);
    cam.parentElement!.prepend(cam);
    expect(micButton(doc).value?.getAttribute('aria-label')).toBe('Turn off microphone');
  });

  it('never falls back to the camera when the mic button is gone', () => {
    const doc = loadMeetSnapshot('real-dom-captions-on');
    doc.querySelector('button[aria-label^="Turn off microphone"]')!.remove();
    expect(micButton(doc).value).not.toBe(camera(doc));
  });

  it('never takes a camera button that carries a mic-like icon', () => {
    const doc = loadMeetSnapshot('real-dom-captions-on');
    doc.querySelector('button[aria-label^="Turn off microphone"]')!.remove();
    camera(doc).innerHTML = '<i class="google-symbols" aria-hidden="true">mic_off</i>';
    expect(micButton(doc).value).toBeNull();
  });
});

describe('real DOM: CaptionsControl hides only the captions region', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  function meetFlipsOnClick(doc: Document) {
    const button = captionsButton(doc).value!;
    button.addEventListener('click', () => {
      const on = !/^turn off captions/i.test(button.getAttribute('aria-label') ?? '');
      setTimeout(() => setCaptionsButton(doc, on), 100);
    });
  }

  const hidden = (doc: Document) => [...doc.querySelectorAll(`[${HIDE_ATTR}]`)];

  it.each(['real-dom-captions-on', 'real-dom-captions-off'])(
    '%s: turns captions on, hides the captions region itself and nothing else, restores',
    async (name) => {
      const doc = loadMeetSnapshot(name);
      meetFlipsOnClick(doc);
      const states: CaptionsState[] = [];
      const control = new CaptionsControl({ doc, onState: (s) => void states.push(s) });
      control.enable();
      await vi.advanceTimersByTimeAsync(1500);
      expect(states.at(-1)).toEqual({ state: 'on' });
      expect(hidden(doc)).toEqual([captions(doc)]);
      expect(notifications(doc).hasAttribute(HIDE_ATTR)).toBe(false);
      expect(notifications(doc).parentElement!.hasAttribute(HIDE_ATTR)).toBe(false);
      expect(captions(doc).parentElement!.hasAttribute(HIDE_ATTR)).toBe(false);
      control.restore();
      await vi.advanceTimersByTimeAsync(500);
      expect(hidden(doc)).toEqual([]);
      expect(captionsOn(captionsButton(doc).value!).value).toBe(name === 'real-dom-captions-on');
    },
  );

  // T132 (FR-028–FR-030, design decision 61): Settings → Show Meet captions on the real page structure.
  it.each(['real-dom-captions-on', 'real-dom-captions-off'])(
    '%s, captions shown: turns captions on and tags nothing; hiding mid-meeting tags the captions region alone; restores',
    async (name) => {
      const doc = loadMeetSnapshot(name);
      meetFlipsOnClick(doc);
      const states: CaptionsState[] = [];
      const control = new CaptionsControl({ doc, onState: (s) => void states.push(s) });
      control.setShown(true);
      control.enable();
      await vi.advanceTimersByTimeAsync(1500);
      expect(states.at(-1)).toEqual({ state: 'on' });
      expect(captionsOn(captionsButton(doc).value!).value).toBe(true);
      expect(hidden(doc)).toEqual([]);
      expect(doc.getElementById(HIDE_STYLE_ID)).toBeNull();

      const reported = states.length;
      control.setShown(false);
      expect(hidden(doc)).toEqual([captions(doc)]);
      expect(notifications(doc).hasAttribute(HIDE_ATTR)).toBe(false);
      expect(captions(doc).parentElement!.hasAttribute(HIDE_ATTR)).toBe(false);
      control.setShown(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(hidden(doc)).toEqual([]);
      expect(states).toHaveLength(reported);

      control.restore();
      await vi.advanceTimersByTimeAsync(500);
      expect(hidden(doc)).toEqual([]);
      expect(captionsOn(captionsButton(doc).value!).value).toBe(name === 'real-dom-captions-on');
    },
  );
});

describe('real DOM: caption observer', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('reports turns from the captions region, not from notification chips', async () => {
    const doc = loadMeetSnapshot('real-dom-captions-off');
    const events: CaptionActivity[] = [];
    const observer = observeCaptions({ doc, pageId: 'pg', onActivity: (a) => void events.push(a) });
    const chip = notifications(doc).querySelector('.CvJr8b')!;
    chip.after(chip.cloneNode(true));
    addCaptionItem(doc, 'Emma Jones', 'hello');
    await vi.advanceTimersByTimeAsync(0);
    expect(events.map((e) => e.speakerName)).toEqual(['Emma Jones']);
    observer.stop();
  });
});
