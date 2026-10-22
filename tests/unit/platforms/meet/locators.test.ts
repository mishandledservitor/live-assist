// T019: Meet page locators against the saved snapshots, one describe per assumption in contracts/meet-dom.md.
// Every locator reports the value and which tier (research R1) matched it, so a test also pins the route.
import { describe, expect, it } from 'vitest';
import {
  captionItems,
  captionTextOf,
  captionsButton,
  captionsOn,
  captionsRegion,
  inCall,
  isMuted,
  isSelfName,
  meetingCode,
  meetingTitle,
  micButton,
  speakerNameOf,
  type Tier,
} from '@/platforms/meet/locators';
import { addCaptionItem, loadMeetSnapshot, MEET_SNAPSHOTS, setCaptionText } from '../../../support/meet-snapshot';

const NOTHING = { value: null, tier: null };
const icon = (el: Element | null) => el?.querySelector('.google-symbols')?.textContent;

describe('D1 in a call: the control bar has a leave button with icon call_end', () => {
  it.each([
    ['in-call-captions-off', { value: true, tier: 2 }],
    ['in-call-captions-on', { value: true, tier: 2 }],
    ['greek-ui', { value: true, tier: 2 }],
    ['lobby', { value: false, tier: null }],
    ['changed-page', { value: false, tier: null }],
  ])('%s', (name, expected) => {
    expect(inCall(loadMeetSnapshot(name))).toEqual(expected);
  });

  it('falls back to the English "Call controls" region (tier 3) when the icon is gone', () => {
    const doc = loadMeetSnapshot('in-call-captions-off');
    for (const i of doc.querySelectorAll('.google-symbols')) i.textContent = '';
    expect(inCall(doc)).toEqual({ value: true, tier: 3 });
  });
});

describe('D2 the captions button exists in a call and shows its state', () => {
  it.each([
    ['in-call-captions-off', 1, { value: false, tier: 1 }],
    ['in-call-captions-on', 1, { value: true, tier: 1 }],
    ['greek-ui', 1, { value: true, tier: 1 }],
  ] as const)('%s: button at tier %i, state %o', (name, tier, state) => {
    const button = captionsButton(loadMeetSnapshot(name));
    expect(button.tier).toBe(tier);
    expect(icon(button.value)).toMatch(/^closed_caption/);
    expect(captionsOn(button.value!)).toEqual(state);
  });

  it.each(['lobby', 'changed-page'])('%s has no captions button', (name) => {
    expect(captionsButton(loadMeetSnapshot(name))).toEqual(NOTHING);
  });

  it('without aria-pressed: found by icon (tier 2), state read from the English label before the icon (research R13)', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    doc.querySelector('button[aria-pressed]')?.removeAttribute('aria-pressed');
    const button = captionsButton(doc);
    expect(button.tier).toBe(2);
    expect(captionsOn(button.value!)).toEqual({ value: true, tier: 3 });
    button.value!.setAttribute('aria-label', 'Turn on captions (c)'); // the icon still says closed_caption
    expect(captionsOn(button.value!)).toEqual({ value: false, tier: 3 });
  });

  it('without aria-pressed or an English label: read from the icon (tier 2)', () => {
    const doc = loadMeetSnapshot('greek-ui');
    const b = doc.querySelector('button[aria-pressed]')!;
    b.removeAttribute('aria-pressed');
    expect(captionsOn(b as HTMLElement)).toEqual({ value: true, tier: 2 });
    b.querySelector('.google-symbols')!.textContent = 'closed_caption_off';
    expect(captionsOn(b as HTMLElement)).toEqual({ value: false, tier: 2 });
  });

  it('without icon or pressed state: found and read by the English label (tier 3)', () => {
    const doc = loadMeetSnapshot('in-call-captions-off');
    const b = doc.querySelector('button[aria-pressed]')!;
    b.removeAttribute('aria-pressed');
    b.querySelector('.google-symbols')!.textContent = '';
    const button = captionsButton(doc);
    expect(button.tier).toBe(3);
    expect(captionsOn(button.value!)).toEqual({ value: false, tier: 3 });
  });

  it('an unreadable state is null', () => {
    const doc = loadMeetSnapshot('greek-ui');
    const b = doc.querySelector('button[aria-pressed]')!;
    b.removeAttribute('aria-pressed');
    b.querySelector('.google-symbols')!.textContent = 'cc';
    expect(captionsOn(b as HTMLElement)).toEqual(NOTHING);
  });
});

describe('D3 caption turns: items in a captions region, each with an avatar, a name and a text', () => {
  it.each([
    ['in-call-captions-on', 1, ['Emma Jones', 'You', 'Tom Brown']],
    ['greek-ui', 1, ['Σάρα Μπράουν', 'Εσύ']],
  ] as const)('%s: region tier %i, names %o, each name at tier 1', (name, tier, names) => {
    const region = captionsRegion(loadMeetSnapshot(name));
    expect(region.tier).toBe(tier);
    const items = captionItems(region.value!);
    expect(items.tier).toBe(1);
    expect(items.value.map((i) => speakerNameOf(i))).toEqual(names.map((n) => ({ value: n, tier: 1 })));
  });

  it('an empty region (captions off) is found by its English label (tier 3) and has no items', () => {
    const region = captionsRegion(loadMeetSnapshot('in-call-captions-off'));
    expect(region.tier).toBe(3);
    expect(captionItems(region.value!)).toEqual({ value: [], tier: null });
  });

  it('trailing non-caption children of the region are not items', () => {
    const region = captionsRegion(loadMeetSnapshot('in-call-captions-on')).value!;
    const items = captionItems(region).value;
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.classList.contains('nMcdL'))).toBe(true);
  });

  it('falls back to generated classes (tier 4) when avatars are gone', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    for (const img of doc.querySelectorAll('[role="region"] img')) img.remove();
    const region = captionsRegion(doc);
    expect(region.tier).toBe(3);
    expect(captionItems(region.value!)).toMatchObject({ tier: 4 });
    expect(captionItems(region.value!).value).toHaveLength(3);
  });

  it('reads the name by class (tier 4) when the header has no span, and normalises whitespace', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const item = captionItems(captionsRegion(doc).value!).value[0]!;
    const name = item.querySelector('.NWpY1d')!;
    const div = doc.createElement('div');
    div.className = 'NWpY1d';
    div.textContent = '  Emma \n Jones ';
    name.replaceWith(div);
    expect(speakerNameOf(item)).toEqual({ value: 'Emma Jones', tier: 4 });
  });

  it.each(['lobby', 'changed-page'])('%s has no captions region', (name) => {
    expect(captionsRegion(loadMeetSnapshot(name))).toEqual(NOTHING);
  });
});

describe("D4 the user's own turns are labelled with a self word", () => {
  it.each([
    ['in-call-captions-on', 'You', true],
    ['greek-ui', 'Εσύ', true],
    ['in-call-captions-on', 'Emma Jones', null],
    ['greek-ui', 'Σάρα Μπράουν', null],
    ['in-call-captions-on', ' you ', true],
  ] as const)('%s: %s → %s', (snapshot, name, expected) => {
    expect(isSelfName(name, loadMeetSnapshot(snapshot))).toBe(expected);
  });
});

describe('D5 the mic button carries data-is-muted', () => {
  it.each([
    ['in-call-captions-off', { value: false, tier: 1 }],
    ['in-call-captions-on', { value: true, tier: 1 }],
    ['lobby', { value: true, tier: 1 }],
    ['greek-ui', { value: false, tier: 1 }],
  ] as const)('%s', (name, muted) => {
    const button = micButton(loadMeetSnapshot(name));
    expect(button.tier).toBe(1);
    expect(icon(button.value)).toMatch(/^mic/);
    expect(isMuted(button.value!)).toEqual(muted);
  });

  it('never picks the camera button', () => {
    for (const name of ['in-call-captions-off', 'lobby'])
      expect(icon(micButton(loadMeetSnapshot(name)).value)).not.toMatch(/videocam/);
  });

  it('without data-is-muted: found and read by the icon (tier 2)', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    for (const b of doc.querySelectorAll('[data-is-muted]')) b.removeAttribute('data-is-muted');
    const button = micButton(doc);
    expect(button.tier).toBe(2);
    expect(isMuted(button.value!)).toEqual({ value: true, tier: 2 });
  });

  it('without attribute or icon: found and read by the English label (tier 3)', () => {
    const doc = loadMeetSnapshot('in-call-captions-off');
    for (const b of doc.querySelectorAll('[data-is-muted]')) b.removeAttribute('data-is-muted');
    for (const i of doc.querySelectorAll('.google-symbols')) i.textContent = '';
    const button = micButton(doc);
    expect(button.tier).toBe(3);
    expect(isMuted(button.value!)).toEqual({ value: false, tier: 3 });
  });

  it('changed-page has no mic button', () => {
    expect(micButton(loadMeetSnapshot('changed-page'))).toEqual(NOTHING);
  });
});

describe('D6 title and meeting code are readable', () => {
  it.each([
    ['in-call-captions-off', { value: 'Weekly product sync', tier: 1 }],
    ['in-call-captions-on', { value: 'Weekly product sync', tier: 1 }],
    ['greek-ui', { value: 'Εβδομαδιαία συνάντηση', tier: 1 }],
    ['lobby', { value: 'abc-defg-hij', tier: 3 }],
    ['changed-page', NOTHING],
  ])('title: %s', (name, expected) => {
    expect(meetingTitle(loadMeetSnapshot(name))).toEqual(expected);
  });

  it('meeting code from the URL', () => {
    expect(meetingCode(loadMeetSnapshot('in-call-captions-on').location)).toEqual({ value: 'abc-defg-hij', tier: 1 });
    expect(meetingCode(new URL('https://meet.google.com/landing'))).toEqual(NOTHING);
    expect(meetingCode(new URL('https://meet.google.com/meet/abc-defg-hij'))).toEqual({
      value: 'abc-defg-hij',
      tier: 1,
    });
    expect(meetingCode(new URL('https://meet.google.com/meet/landing'))).toEqual(NOTHING);
  });
});

describe('D7 a changed page degrades, never throws', () => {
  const doc = () => loadMeetSnapshot('changed-page');

  it('every locator returns null, false or []', () => {
    const d = doc();
    expect(inCall(d).value).toBe(false);
    expect(captionsButton(d)).toEqual(NOTHING);
    expect(captionsRegion(d)).toEqual(NOTHING);
    expect(micButton(d)).toEqual(NOTHING);
    expect(meetingTitle(d)).toEqual(NOTHING);
    expect(isSelfName('Someone', d)).toBeNull();
    const anyDiv = d.querySelector('div')!;
    expect(captionItems(anyDiv)).toEqual({ value: [], tier: null });
    expect(speakerNameOf(anyDiv.querySelector('.x5')!)).toEqual(NOTHING);
    expect(captionsOn(d.querySelector('button')!)).toEqual(NOTHING);
    expect(isMuted(d.querySelector('button')!)).toEqual(NOTHING);
  });

  it.each(MEET_SNAPSHOTS)('no locator throws on %s', (name) => {
    const d = loadMeetSnapshot(name);
    expect(() => {
      inCall(d);
      const b = captionsButton(d).value;
      if (b) captionsOn(b);
      const r = captionsRegion(d).value;
      if (r) for (const i of captionItems(r).value) speakerNameOf(i);
      const m = micButton(d).value;
      if (m) isMuted(m);
      meetingTitle(d);
      meetingCode(d.location);
    }).not.toThrow();
  });
});

describe('Greek UI resolves through language-independent tiers only', () => {
  it('uses tiers 1–2 for every locator', () => {
    const d = loadMeetSnapshot('greek-ui');
    const region = captionsRegion(d).value!;
    const tiers: (Tier | null)[] = [
      inCall(d).tier,
      captionsButton(d).tier,
      captionsOn(captionsButton(d).value!).tier,
      captionsRegion(d).tier,
      captionItems(region).tier,
      ...captionItems(region).value.map((i) => speakerNameOf(i).tier),
      micButton(d).tier,
      isMuted(micButton(d).value!).tier,
      meetingTitle(d).tier,
    ];
    expect(tiers.every((t) => t === 1 || t === 2)).toBe(true);
  });
});

// 013 T014 (specs/013-captions-download/contracts/captions-capture.md D8–D10): the text of a caption turn. The
// snapshots hold invented sentences only (tests/fixtures/meet/README.md).
describe("D8 a caption turn's text is the text after its header", () => {
  const turns = (name: string) => captionItems(captionsRegion(loadMeetSnapshot(name)).value!).value;

  it.each([
    [
      'in-call-captions-on',
      ['Kickoff is at ten tomorrow.', "I'll post the notes afterwards.", 'Can we move the review to Thursday'],
    ],
    ['greek-ui', ["Καλημέρα σε όλους, let's start with the roadmap.", 'Ναι, έτοιμος.']],
    ['real-dom-captions-on', ['Kickoff is at ten tomorrow.', "I'll post the notes afterwards."]],
  ] as const)('%s: each turn reads its sentence at tier 1', (name, sentences) => {
    expect(turns(name).map((i) => captionTextOf(i))).toEqual(sentences.map((value) => ({ value, tier: 1 })));
  });

  it('never includes the speaker name', () => {
    for (const name of ['in-call-captions-on', 'greek-ui', 'real-dom-captions-on']) {
      for (const item of turns(name)) {
        const speaker = speakerNameOf(item).value!;
        expect(captionTextOf(item).value).not.toContain(speaker);
      }
    }
    // Also when the sentence itself starts like a name would.
    const doc = loadMeetSnapshot('in-call-captions-on');
    const item = addCaptionItem(doc, 'Mike Smith', 'Mike here, can you hear me?');
    expect(captionTextOf(item).value).toBe('Mike here, can you hear me?');
  });

  it('keeps Greek letters intact', () => {
    expect(captionTextOf(turns('greek-ui')[1]!).value).toBe('Ναι, έτοιμος.');
  });

  it('collapses whitespace and line breaks', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const item = addCaptionItem(doc, 'Mike Smith', '  The  harbour\n survey\tmoves \r\n to Thursday.  ');
    expect(captionTextOf(item).value).toBe('The harbour survey moves to Thursday.');
  });

  it('joins the text of several elements after the header with one space', () => {
    const doc = loadMeetSnapshot('real-dom-captions-on');
    const item = addCaptionItem(doc, 'Mike Smith', 'First part.');
    const second = doc.createElement('div');
    second.textContent = 'Second part.';
    item.append(second);
    expect(captionTextOf(item)).toEqual({ value: 'First part. Second part.', tier: 1 });
  });

  it('reads text spread over nested nodes, as Meet writes a long turn', () => {
    const doc = loadMeetSnapshot('real-dom-captions-on');
    const item = addCaptionItem(doc, 'Mike Smith');
    const body = item.querySelector('.ygicle')!;
    for (const piece of ['We agreed', ' on the', ' budget.']) {
      const span = doc.createElement('span');
      span.textContent = piece;
      body.append(span);
    }
    expect(captionTextOf(item).value).toBe('We agreed on the budget.');
  });

  it('follows a rewrite', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const item = turns('in-call-captions-on')[0]!;
    const own = addCaptionItem(doc, 'Mike Smith', 'We ship on Thursday');
    setCaptionText(own, 'We ship on Tuesday, not Thursday.');
    expect(captionTextOf(own).value).toBe('We ship on Tuesday, not Thursday.');
    expect(captionTextOf(item).value).toBe('Kickoff is at ten tomorrow.');
  });

  it('falls back to the generated class (tier 4) when the avatar is gone', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const item = captionItems(captionsRegion(doc).value!).value[0]!;
    item.querySelector('img')!.remove();
    expect(captionTextOf(item)).toEqual({ value: 'Kickoff is at ten tomorrow.', tier: 4 });
  });
});

describe('D9 a changed page degrades, never throws', () => {
  const EMPTY = { value: '', tier: null };

  it('an item with no text element reads the empty string', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const item = addCaptionItem(doc, 'Mike Smith', 'About to lose its text element.');
    item.querySelector('.ygicle')!.remove();
    expect(captionTextOf(item)).toEqual(EMPTY);
  });

  it('an item with an empty text element reads the empty string', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    expect(captionTextOf(addCaptionItem(doc, 'Mike Smith'))).toEqual(EMPTY);
    expect(captionTextOf(addCaptionItem(doc, 'Mike Smith', ' \n '))).toEqual(EMPTY);
  });

  it('every element of changed-page reads the empty string, and nothing throws', () => {
    const doc = loadMeetSnapshot('changed-page');
    const all = [...doc.querySelectorAll('*')];
    expect(all.length).toBeGreaterThan(10);
    for (const el of all) expect(captionTextOf(el)).toEqual(EMPTY);
  });

  it('never throws on any element of any snapshot, detached or empty', () => {
    for (const name of MEET_SNAPSHOTS) {
      const doc = loadMeetSnapshot(name);
      for (const el of doc.querySelectorAll('*')) expect(() => captionTextOf(el)).not.toThrow();
      expect(captionTextOf(doc.createElement('div'))).toEqual(EMPTY);
    }
  });
});

describe('D10 an item that is not a caption turn is never read (existing behaviour, pinned)', () => {
  it('the notifications chip of real-dom-captions-on is not a caption item, and reads the empty string', () => {
    const doc = loadMeetSnapshot('real-dom-captions-on');
    const chip = doc.querySelector('.CvJr8b')!;
    expect(chip.textContent).toContain('wants to join');
    const region = captionsRegion(doc).value!;
    expect(region.getAttribute('aria-label')).toBe('Captions');
    expect(captionItems(region).value).not.toContain(chip);
    expect(captionItems(chip.parentElement!).value).toEqual([]);
    expect(captionTextOf(chip)).toEqual({ value: '', tier: null });
  });

  it('trailing controls of the captions region are not items', () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const region = captionsRegion(doc).value!;
    const others = [...region.children].filter((c) => !captionItems(region).value.includes(c as HTMLElement));
    expect(others.length).toBeGreaterThan(0);
    for (const other of others) expect(captionTextOf(other)).toEqual({ value: '', tier: null });
  });
});
