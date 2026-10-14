// T003: the Meet snapshot helper itself, against the five synthetic snapshots.
import { describe, expect, it } from 'vitest';
import {
  addCaptionItem,
  appendCaptionText,
  loadMeetSnapshot,
  MEET_SNAPSHOTS,
  removeMicButton,
  setCaptionsButton,
  setMuted,
} from '../../support/meet-snapshot';

const micButton = (doc: Document) =>
  doc.querySelector<HTMLElement>('button[data-mute-button]') ?? doc.querySelector<HTMLElement>('button[data-is-muted]');
const captionsButton = (doc: Document) =>
  [...doc.querySelectorAll<HTMLElement>('button')].find((b) =>
    /^closed_caption(_off)?$/.test(b.querySelector('.google-symbols')?.textContent?.trim() ?? ''),
  ) ?? null;
const items = (doc: Document) => [...doc.querySelectorAll('[role="region"][tabindex="0"] > .nMcdL')];

describe('loadMeetSnapshot', () => {
  it('lists the synthetic snapshots, the real-DOM rebuilds included', () => {
    expect([...MEET_SNAPSHOTS].sort()).toEqual([
      'changed-page',
      'greek-ui',
      'in-call-captions-off',
      'in-call-captions-on',
      'lobby',
      'real-dom-captions-off',
      'real-dom-captions-on',
    ]);
  });

  it.each(MEET_SNAPSHOTS)('loads %s into a fresh document on a Meet call URL', (name) => {
    const a = loadMeetSnapshot(name);
    const b = loadMeetSnapshot(name);
    expect(a).not.toBe(b);
    expect(a.location.href).toBe('https://meet.google.com/abc-defg-hij');
    expect(a.querySelector('meta[name="live-assist-fixture"]')).not.toBeNull();
  });

  it('throws for an unknown snapshot', () => {
    expect(() => loadMeetSnapshot('nope')).toThrow(/nope/);
  });
});

describe('addCaptionItem / appendCaptionText', () => {
  it('adds a turn after the existing turns and before trailing non-caption children', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const item = addCaptionItem(doc, 'John Doe');
    expect(items(doc)).toHaveLength(4);
    expect(items(doc).at(-1)).toBe(item);
    expect(item.nextElementSibling?.classList.contains('ZPyPXe')).toBe(true);
    expect(item.querySelector('.NWpY1d')?.textContent).toBe('John Doe');
    expect(item.querySelector('img[data-iml]')).not.toBeNull();
  });

  it('adds the first turn to an empty region', () => {
    const doc = loadMeetSnapshot('in-call-captions-off');
    const item = addCaptionItem(doc, 'You', 'Hello');
    expect(items(doc)).toEqual([item]);
    expect(item.querySelector('.ygicle')?.textContent).toBe('Hello');
  });

  it('appends text to a turn', () => {
    const doc = loadMeetSnapshot('in-call-captions-off');
    const item = addCaptionItem(doc, 'Emma Jones', 'One');
    appendCaptionText(item, ' two');
    expect(item.querySelector('.ygicle')?.textContent).toBe('One two');
  });

  it('throws on a page without a captions region', () => {
    expect(() => addCaptionItem(loadMeetSnapshot('changed-page'), 'X')).toThrow();
  });
});

describe('setMuted / removeMicButton', () => {
  it.each(['in-call-captions-off', 'in-call-captions-on', 'lobby', 'greek-ui'] as const)(
    'flips data-is-muted on the mic button only (%s)',
    (name) => {
      const doc = loadMeetSnapshot(name);
      const camera = [...doc.querySelectorAll('button[data-is-muted]')][1];
      const cameraBefore = camera?.getAttribute('data-is-muted');
      setMuted(doc, true);
      expect(micButton(doc)?.getAttribute('data-is-muted')).toBe('true');
      expect(micButton(doc)?.querySelector('.google-symbols')?.textContent).toBe('mic_off');
      setMuted(doc, false);
      expect(micButton(doc)?.getAttribute('data-is-muted')).toBe('false');
      expect(micButton(doc)?.querySelector('.google-symbols')?.textContent).toBe('mic');
      expect(camera?.getAttribute('data-is-muted')).toBe(cameraBefore);
    },
  );

  it('removes the mic button', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    removeMicButton(doc);
    expect(doc.querySelector('button[data-mute-button]')).toBeNull();
  });
});

describe('setCaptionsButton', () => {
  it('turns the button on and off (pressed state, icon, label)', () => {
    const doc = loadMeetSnapshot('in-call-captions-off');
    setCaptionsButton(doc, true);
    let button = captionsButton(doc);
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.querySelector('.google-symbols')?.textContent).toBe('closed_caption');
    expect(button?.getAttribute('aria-label')).toBe('Turn off captions (c)');
    setCaptionsButton(doc, false);
    button = captionsButton(doc);
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    expect(button?.querySelector('.google-symbols')?.textContent).toBe('closed_caption_off');
    expect(button?.getAttribute('aria-label')).toBe('Turn on captions (c)');
  });

  it('keeps a non-English label untouched', () => {
    const doc = loadMeetSnapshot('greek-ui');
    const label = captionsButton(doc)?.getAttribute('aria-label');
    setCaptionsButton(doc, false);
    expect(captionsButton(doc)?.getAttribute('aria-pressed')).toBe('false');
    expect(captionsButton(doc)?.getAttribute('aria-label')).toBe(label);
  });

  it('throws when the page has no captions button', () => {
    expect(() => setCaptionsButton(loadMeetSnapshot('lobby'), true)).toThrow();
  });
});
