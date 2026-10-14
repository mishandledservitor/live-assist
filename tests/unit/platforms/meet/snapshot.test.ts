// T066: the dev-only Meet snapshot anonymiser (research R11). A saved real page must keep everything the locators use
// and nothing that identifies the people, the meeting or what was said.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  captionItems,
  captionsButton,
  captionsOn,
  captionsRegion,
  inCall,
  isMuted,
  meetingCode,
  meetingTitle,
  micButton,
  speakerNameOf,
} from '@/platforms/meet/locators';
import { anonymiseMeetPage, PLACEHOLDER_CODE } from '@/platforms/meet/snapshot';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK, expectNoMarker, holdsMarker } from '../../../support/caption-marker';
import { addCaptionItem, appendCaptionText, loadMeetSnapshot, MEET_SNAPSHOTS } from '../../../support/meet-snapshot';

const ANON_URL = `https://meet.google.com/${PLACEHOLDER_CODE}`;
const parse = (html: string) => new JSDOM(html, { url: ANON_URL }).window.document;

function anonymised(name: string, extraNames?: string[]) {
  const original = loadMeetSnapshot(name);
  const result = anonymiseMeetPage(original, extraNames ? { extraNames } : {});
  return { original, ...result, doc: parse(result.html) };
}

/** Every real string in the synthetic snapshots that must not survive. */
const REAL = [
  'Emma',
  'Jones',
  'Tom',
  'Brown',
  'John', // a notification chip on the real-dom snapshots (research R13)
  'Weekly product sync',
  'abc-defg-hij',
  'fixture-avatar',
  'Kickoff is at ten',
  'post the notes',
  'move the review',
  'Σάρα',
  'Μπράουν',
  'Εβδομαδιαία',
  'Καλημέρα',
  'έτοιμος',
];

describe('anonymiseMeetPage', () => {
  it.each(MEET_SNAPSHOTS)('%s: removes scripts, styles, links, data: URLs and comments', (name) => {
    const original = loadMeetSnapshot(name);
    const extra = original.createElement('div');
    extra.innerHTML =
      '<script>var x = 1</script><style>.a{}</style><link rel="stylesheet" href="x.css">' +
      '<noscript>n</noscript><iframe src="https://example.com"></iframe>' +
      '<img src="data:image/png;base64,AAAA" data-iml="9"><!-- a comment -->';
    original.body.append(extra);
    const { html } = anonymiseMeetPage(original);
    expect(html).not.toMatch(/<script|<style|<link|<noscript|<iframe|<!--(?! ?live-assist)/i);
    expect(html).not.toContain('data:');
  });

  it.each(MEET_SNAPSHOTS)('%s: no real name, title, code, avatar URL or caption text is left', (name) => {
    const { html } = anonymised(name);
    for (const s of REAL) expect(html).not.toContain(s);
    expect(html).not.toContain('googleusercontent.com');
  });

  it('replaces caption names, tile names and names in aria-labels with one placeholder per person', () => {
    const { doc, key } = anonymised('in-call-captions-on');
    const region = captionsRegion(doc).value!;
    expect(captionItems(region).value.map((i) => speakerNameOf(i).value)).toEqual([
      'Participant A',
      'You',
      'Participant B',
    ]);
    const tiles = [...doc.querySelectorAll('[data-participant-id] .zWGUib')].map((t) => t.textContent);
    expect(tiles).toEqual(['You', 'Participant A', 'Participant B']);
    const labels = [...doc.querySelectorAll('[aria-label^="More options"]')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['More options for Participant A', 'More options for Participant B']);
    expect(key).toEqual({ 'Participant A': 'Emma Jones', 'Participant B': 'Tom Brown' });
  });

  it('replaces caption text with "Caption text N" and keeps the self word', () => {
    const { doc } = anonymised('in-call-captions-on');
    const items = captionItems(captionsRegion(doc).value!).value;
    expect(items.map((i) => i.lastElementChild?.textContent)).toEqual([
      'Caption text 1',
      'Caption text 2',
      'Caption text 3',
    ]);
    const greek = anonymised('greek-ui').doc;
    const names = captionItems(captionsRegion(greek).value!).value.map((i) => speakerNameOf(i).value);
    expect(names).toEqual(['Participant A', 'Εσύ']);
  });

  it('replaces the title, data-meeting-title, meeting code and avatar URLs', () => {
    const { doc } = anonymised('in-call-captions-on');
    expect(doc.querySelector('[data-meeting-title]')?.getAttribute('data-meeting-title')).toBe('Meeting title');
    expect(doc.title).toBe('Meet - Meeting title');
    const avatars = [...doc.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(avatars).toEqual([
      'https://example.invalid/avatar-A',
      'https://example.invalid/avatar-B',
      'https://example.invalid/avatar-C',
    ]);
    expect(anonymised('lobby').doc.title).toBe(`Meet - ${PLACEHOLDER_CODE}`);
  });

  it('scrubs extra names the user lists, emails and the Google Account label wherever they appear in attributes', () => {
    const original = loadMeetSnapshot('in-call-captions-off');
    original.body.insertAdjacentHTML(
      'beforeend',
      '<a aria-label="Google Account: Mary Smith (mary.smith@example.com)" data-email="mary.smith@example.com"></a>' +
        '<div data-tooltip="John Doe is presenting" title="Mary is here"></div>',
    );
    const { html, key } = anonymiseMeetPage(original, { extraNames: ['John Doe'] });
    expect(html).not.toMatch(/Mary|Smith|John|Doe\b|example\.com/);
    expect(html).toContain('person@example.invalid');
    expect(Object.values(key)).toEqual(expect.arrayContaining(['Mary Smith', 'John Doe']));
  });

  it('removes every other text node (only icons, caption names and caption placeholders keep text)', () => {
    const { doc } = anonymised('in-call-captions-on');
    const texts = [...doc.body.querySelectorAll('*')]
      .flatMap((el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim() !== ''))
      .map((n) => n.textContent!.trim());
    const allowed = /^(Participant [A-Z]+|You|Caption text \d+|[a-z_]+)$/;
    expect(texts.filter((t) => !allowed.test(t))).toEqual([]);
    expect(texts).not.toContain('Weekly product sync');
  });

  it('leaves the live page untouched', () => {
    const original = loadMeetSnapshot('in-call-captions-on');
    const before = original.documentElement.outerHTML;
    anonymiseMeetPage(original);
    expect(original.documentElement.outerHTML).toBe(before);
  });

  it.each(MEET_SNAPSHOTS)('%s: the locators find the same values on the same tiers', (name) => {
    const { original, doc, key } = anonymised(name);
    const real = (v: string | null) => (v === null ? null : (key[v] ?? v));
    expect(inCall(doc)).toEqual(inCall(original));
    const [btnA, btnB] = [captionsButton(original), captionsButton(doc)];
    expect(btnB.tier).toBe(btnA.tier);
    expect(btnB.value && captionsOn(btnB.value)).toEqual(btnA.value && captionsOn(btnA.value));
    const [regA, regB] = [captionsRegion(original), captionsRegion(doc)];
    expect(regB.tier).toBe(regA.tier);
    if (regA.value && regB.value) {
      const [itemsA, itemsB] = [captionItems(regA.value), captionItems(regB.value)];
      expect(itemsB.tier).toBe(itemsA.tier);
      expect(itemsB.value.map((i) => real(speakerNameOf(i).value))).toEqual(
        itemsA.value.map((i) => speakerNameOf(i).value),
      );
      expect(itemsB.value.map((i) => speakerNameOf(i).tier)).toEqual(itemsA.value.map((i) => speakerNameOf(i).tier));
    }
    const [micA, micB] = [micButton(original), micButton(doc)];
    expect(micB.tier).toBe(micA.tier);
    expect(micB.value && isMuted(micB.value)).toEqual(micA.value && isMuted(micA.value));
    expect(meetingTitle(doc).tier).toBe(meetingTitle(original).tier);
    expect(meetingCode(doc.location)).toEqual({ value: PLACEHOLDER_CODE, tier: 1 });
  });

  it('marks the output as a real anonymised snapshot', () => {
    const { doc } = anonymised('in-call-captions-on');
    expect(doc.querySelector('meta[name="live-assist-fixture"]')?.getAttribute('content')).toMatch(/^real, anonymised/);
  });
});

// 013 T056 (FR-011, contracts/captions-capture.md "Meet page (DOM)"): a pinning test, expected green. The product now
// reads caption text, so a saved real page must be shown to hold none of it: the anonymiser still overwrites every
// turn's text.
describe('anonymiseMeetPage and caption text (013)', () => {
  it.each(['in-call-captions-on', 'greek-ui', 'real-dom-captions-on'])(
    '%s: no sentence of a caption turn survives',
    (name) => {
      const original = loadMeetSnapshot(name);
      const english = addCaptionItem(original, 'Mike Smith', CAPTION_MARKER);
      appendCaptionText(english, ` ${CAPTION_MARKER} again, in a second text node`);
      const nested = addCaptionItem(original, 'You');
      const span = original.createElement('span');
      span.textContent = CAPTION_MARKER_GREEK;
      nested.querySelector('.ygicle')!.append(span);
      const second = original.createElement('div');
      second.textContent = CAPTION_MARKER;
      nested.append(second);
      expect(holdsMarker(original.documentElement.outerHTML)).toBe(true);

      const result = anonymiseMeetPage(original);
      expectNoMarker(result.html);
      expectNoMarker(result.key);
      const texts = captionItems(captionsRegion(parse(result.html)).value!).value.map(
        (i) => i.lastElementChild?.textContent,
      );
      for (const text of texts) expect(text).toMatch(/^Caption text \d+$/);
    },
  );
});
