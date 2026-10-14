// Loads saved Meet pages (tests/fixtures/meet/) into jsdom and scripts the page changes the Meet layer reacts to.
// Constitution III: Meet DOM behaviour is tested only against these snapshots.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const FIXTURES = join(import.meta.dirname, '../fixtures/meet');

/** The synthetic snapshots (tests/fixtures/meet/README.md). */
export const MEET_SNAPSHOTS = [
  'in-call-captions-off',
  'in-call-captions-on',
  'lobby',
  'greek-ui',
  'changed-page',
  'real-dom-captions-on',
  'real-dom-captions-off',
] as const;

export type MeetSnapshot = (typeof MEET_SNAPSHOTS)[number];

export const MEET_CALL_URL = 'https://meet.google.com/abc-defg-hij';

/** A fresh document per call, located on a Meet call URL. Pass a path under tests/fixtures/meet/ (no `.html`). */
export function loadMeetSnapshot(name: string): Document {
  let html: string;
  try {
    html = readFileSync(join(FIXTURES, `${name}.html`), 'utf8');
  } catch {
    throw new Error(`No Meet snapshot named "${name}" in tests/fixtures/meet/`);
  }
  return new JSDOM(html, { url: MEET_CALL_URL }).window.document;
}

const iconOf = (el: Element): string => el.querySelector('.google-symbols')?.textContent?.trim() ?? '';

function captionsRegion(doc: Document): HTMLElement {
  const region = doc.querySelector<HTMLElement>('[role="region"][tabindex="0"]');
  if (!region) throw new Error('This snapshot has no captions region');
  return region;
}

/** Adds a caption turn after the existing turns (before the region's trailing non-caption children). */
export function addCaptionItem(doc: Document, name: string, text = ''): HTMLElement {
  const region = captionsRegion(doc);
  const item = doc.createElement('div');
  item.className = 'nMcdL bj4p3b';
  const header = doc.createElement('div');
  header.className = 'adE6rb';
  const avatar = doc.createElement('img');
  avatar.className = 'Z6byG r6DyN';
  avatar.setAttribute('data-iml', String(2000 + region.children.length));
  avatar.src = 'https://lh3.googleusercontent.com/a/fixture-avatar=s48';
  avatar.alt = '';
  const nameBox = doc.createElement('div');
  nameBox.className = 'KcIKyf jxFHg';
  const nameSpan = doc.createElement('span');
  nameSpan.className = 'NWpY1d';
  nameSpan.textContent = name;
  nameBox.append(nameSpan);
  header.append(avatar, nameBox);
  const body = doc.createElement('div');
  body.className = 'ygicle VbkSUe';
  body.textContent = text;
  item.append(header, body);

  const turns = region.querySelectorAll(':scope > .nMcdL');
  const last = turns[turns.length - 1];
  if (last) last.after(item);
  else region.prepend(item);
  return item;
}

/** Appends caption text to a turn, as Meet does while someone keeps talking. */
export function appendCaptionText(item: Element, text = ' more'): void {
  const body = item.querySelector('.ygicle');
  if (!body) throw new Error('Not a caption item');
  body.append(item.ownerDocument.createTextNode(text));
}

/** 013: replaces a turn's whole text, as Meet does when it rewrites or corrects what it showed. */
export function setCaptionText(item: Element, text: string): void {
  const body = item.querySelector('.ygicle');
  if (!body) throw new Error('Not a caption item');
  body.textContent = text;
}

/** 013: takes a turn off the page, as Meet may do with old turns in a long call. */
export function removeCaptionItem(item: Element): void {
  item.remove();
}

/**
 * 013: replaces every turn element with a fresh clone in one go, as a re-render inside the captions band does. Returns
 * the new elements in page order.
 */
export function recreateCaptionItems(doc: Document): HTMLElement[] {
  const region = captionsRegion(doc);
  return [...region.querySelectorAll<HTMLElement>(':scope > .nMcdL')].map((item) => {
    const copy = item.cloneNode(true) as HTMLElement;
    item.replaceWith(copy);
    return copy;
  });
}

/**
 * 013: replaces the captions region itself with a clone (new region, new turn elements), as Meet does when it
 * re-renders the band. Pass `keepTurns: false` for a region that comes back empty. Returns the new region.
 */
export function replaceCaptionsRegion(doc: Document, options: { keepTurns?: boolean } = {}): HTMLElement {
  const old = captionsRegion(doc);
  const copy = old.cloneNode(true) as HTMLElement;
  if (options.keepTurns === false) for (const item of copy.querySelectorAll(':scope > .nMcdL')) item.remove();
  old.replaceWith(copy);
  return copy;
}

function micButton(doc: Document): HTMLElement {
  const button =
    doc.querySelector<HTMLElement>('button[data-mute-button]') ??
    doc.querySelector<HTMLElement>('button[data-is-muted]');
  if (!button) throw new Error('This snapshot has no mic button');
  return button;
}

/** Flips the mic button's `data-is-muted` and icon, as Meet does on mute/unmute. */
export function setMuted(doc: Document, muted: boolean): void {
  const button = micButton(doc);
  button.setAttribute('data-is-muted', String(muted));
  const icon = button.querySelector('.google-symbols');
  if (icon) icon.textContent = muted ? 'mic_off' : 'mic';
}

export function removeMicButton(doc: Document): void {
  micButton(doc).remove();
}

/** Sets the captions button's pressed state, icon and (English only) label. */
export function setCaptionsButton(doc: Document, on: boolean): void {
  const button = [...doc.querySelectorAll<HTMLElement>('button')].find((b) =>
    /^closed_caption(_off)?$/.test(iconOf(b)),
  );
  if (!button) throw new Error('This snapshot has no captions button');
  // The real page (real-dom-* snapshots, research R13) has no aria-pressed and keeps its icon; only the label changes.
  if (button.hasAttribute('aria-pressed')) {
    button.setAttribute('aria-pressed', String(on));
    const icon = button.querySelector('.google-symbols');
    if (icon) icon.textContent = on ? 'closed_caption' : 'closed_caption_off';
  }
  if (/captions/i.test(button.getAttribute('aria-label') ?? ''))
    button.setAttribute('aria-label', on ? 'Turn off captions (c)' : 'Turn on captions (c)');
}
