// Every lookup on the Meet page goes through here (002 research R1, contracts/meet-dom.md). Each locator tries tiers in
// a fixed order and reports which one matched, so drift is visible before it breaks:
//   1 semantic attributes · 2 language-independent icon ligature · 3 English aria-label · 4 generated class names.
// A changed page makes locators return null / false / [], never throw. Caption text is read by one locator only,
// `captionTextOf` (013: the text is kept for download); naming uses names and timing and never calls it (002 FR-004).

export type Tier = 1 | 2 | 3 | 4;

/** A located value and the tier that found it; nothing found is `{ value: null, tier: null }`. */
export type Located<T> = { value: T; tier: Tier } | { value: null; tier: null };

const NOTHING = { value: null, tier: null } as const;
const found = <T>(value: T, tier: Tier): Located<T> => ({ value, tier });

/** Meet's word for the user in captions, per UI language (research R5; Greek unverified until a real snapshot). */
const SELF_WORDS = ['you', 'εσύ'];

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Text of the Material Symbols icon inside an element ('' if none). Same in every UI language. */
function iconOf(el: Element): string {
  return el.querySelector('.google-symbols, i[aria-hidden="true"]')?.textContent?.trim() ?? '';
}

const labelOf = (el: Element) => el.getAttribute('aria-label') ?? '';

function buttons(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button')];
}

function buttonWithIcon(root: ParentNode, icons: readonly string[]): HTMLElement | null {
  return buttons(root).find((b) => icons.includes(iconOf(b))) ?? null;
}

/** D1: in a call (not the lobby) — the control bar has a leave button with icon `call_end`. */
export function inCall(doc: Document): { value: boolean; tier: Tier | null } {
  if (buttonWithIcon(doc, ['call_end'])) return { value: true, tier: 2 };
  if (doc.querySelector('[role="region"][aria-label="Call controls"]')) return { value: true, tier: 3 };
  return { value: false, tier: null };
}

// ── D2 captions button ──
const CAPTION_ICONS = ['closed_caption', 'closed_caption_off'];

export function captionsButton(doc: Document): Located<HTMLElement> {
  const byIcon = buttons(doc).filter((b) => CAPTION_ICONS.includes(iconOf(b)));
  const pressed = byIcon.find((b) => b.hasAttribute('aria-pressed'));
  if (pressed) return found(pressed, 1);
  if (byIcon[0]) return found(byIcon[0], 2);
  const byLabel = buttons(doc).find((b) => /captions/i.test(labelOf(b)));
  return byLabel ? found(byLabel, 3) : NOTHING;
}

export function captionsOn(button: Element): Located<boolean> {
  const pressed = button.getAttribute('aria-pressed');
  if (pressed === 'true' || pressed === 'false') return found(pressed === 'true', 1);
  // The real page (research R13) has no aria-pressed and showed `closed_caption` while on; whether the icon changes
  // when off was not seen, so the English label is trusted before the icon.
  const label = labelOf(button);
  if (/^turn off captions/i.test(label)) return found(true, 3);
  if (/^turn on captions/i.test(label)) return found(false, 3);
  const icon = iconOf(button);
  if (icon === 'closed_caption_off') return found(false, 2);
  if (icon === 'closed_caption') return found(true, 2);
  return NOTHING;
}

// ── D3 captions region, items, speaker names ──
const AVATAR = 'img[data-iml], img[src*="googleusercontent.com"]';

/**
 * A caption turn: a header (its first child) holding the avatar and the name, followed by the text element. A
 * notification chip (avatar and spans side by side, research R13) has no such header and is not a turn.
 */
function isCaptionTurn(el: Element): boolean {
  const header = el.firstElementChild;
  return (
    el.children.length >= 2 &&
    header !== null &&
    header.querySelector(AVATAR) !== null &&
    header.querySelector('span') !== null
  );
}

/** Besides its turns, the captions region holds at most a couple of controls ("Jump to most recent captions"). */
const MAX_OTHER_CHILDREN = 3;
/** Regions that are never the captions region, whatever they contain (research R13: the admit/notifications area). */
const NOT_CAPTIONS_LABEL = /notification/i;

/** Few children besides turns: rules out busy regions such as the notifications area (25 children on the real page). */
function fewOthers(region: Element): boolean {
  return [...region.children].filter((c) => !isCaptionTurn(c)).length <= MAX_OTHER_CHILDREN;
}

/**
 * How much a turn-holding region looks like the captions band: labelled "Captions" (English UI), focusable as the
 * real band is (R13). A side panel whose rows happen to look like turns (retest 2026-10-08, T096) scores lower.
 */
const captionsLikeness = (r: Element) =>
  (r.getAttribute('aria-label') === 'Captions' ? 2 : 0) + (r.getAttribute('tabindex') === '0' ? 1 : 0);

export function captionsRegion(doc: Document): Located<HTMLElement> {
  const regions = [...doc.querySelectorAll<HTMLElement>('[role="region"]')].filter(
    (r) => !NOT_CAPTIONS_LABEL.test(labelOf(r)),
  );
  const withTurns = regions
    .filter((r) => [...r.children].some(isCaptionTurn) && fewOthers(r))
    .reduce<HTMLElement | null>((best, r) => (!best || captionsLikeness(r) > captionsLikeness(best) ? r : best), null);
  if (withTurns) return found(withTurns, 1);
  const labelled = regions.find((r) => r.getAttribute('aria-label') === 'Captions');
  if (labelled) return found(labelled, 3);
  const focusable = regions.find((r) => r.getAttribute('tabindex') === '0' && fewOthers(r));
  return focusable ? found(focusable, 4) : NOTHING;
}

/** The region's caption turns in page order; trailing non-caption children are left out. */
export function captionItems(region: Element): { value: HTMLElement[]; tier: Tier | null } {
  const children = [...region.children] as HTMLElement[];
  const byShape = children.filter(isCaptionTurn);
  if (byShape.length > 0) return { value: byShape, tier: 1 };
  const byClass = children.filter((c) => c.classList.contains('nMcdL'));
  if (byClass.length > 0) return { value: byClass, tier: 4 };
  return { value: [], tier: null };
}

/** The speaker name in a caption item's header (the element before the text). Never reads the text element. */
export function speakerNameOf(item: Element): Located<string> {
  const header = item.children.length >= 2 ? item.firstElementChild : null;
  const span = header?.querySelector('span');
  const name = span ? collapse(span.textContent ?? '') : '';
  if (name) return found(name, 1);
  const byClass = header?.querySelector('.NWpY1d') ?? null;
  const classed = byClass ? collapse(byClass.textContent ?? '') : '';
  return classed ? found(classed, 4) : NOTHING;
}

/**
 * 013 D8, D9: the text of a caption turn, whitespace collapsed: everything after its header (one text element on the
 * real page). The header's name is not part of it. '' when the element is not a caption turn, has no text element or
 * the element is empty; never throws.
 */
export function captionTextOf(item: Element): { value: string; tier: Tier | null } {
  const read = (parts: Element[]) => collapse(parts.map((p) => p.textContent ?? '').join(' '));
  if (isCaptionTurn(item)) {
    const text = read([...item.children].slice(1));
    return text ? { value: text, tier: 1 } : { value: '', tier: null };
  }
  const byClass = read([...item.children].filter((c) => c.classList.contains('ygicle')));
  return byClass ? { value: byClass, tier: 4 } : { value: '', tier: null };
}

// ── D4 self word ──
/** true when the caption name is Meet's label for the user; null when it cannot tell (never a guess). */
export function isSelfName(name: string, _doc: Document): true | null {
  return SELF_WORDS.includes(collapse(name).normalize('NFC').toLowerCase()) ? true : null;
}

// ── D5 mic button ──
const MIC_ICONS = ['mic', 'mic_off'];

/** The camera button also carries `data-is-muted` on the real page (research R13); it is never the mic. */
function isCamera(b: Element): boolean {
  return /camera/i.test(labelOf(b)) || /^videocam/.test(iconOf(b));
}

export function micButton(doc: Document): Located<HTMLElement> {
  const all = buttons(doc).filter((b) => !isCamera(b));
  const attributed = all.filter((b) => b.hasAttribute('data-is-muted'));
  const marked = attributed.find((b) => b.hasAttribute('data-mute-button'));
  if (marked) return found(marked, 1);
  const withIcon = attributed.find((b) => MIC_ICONS.includes(iconOf(b)));
  if (withIcon) return found(withIcon, 1);
  const labelled = attributed.find((b) => /microphone/i.test(labelOf(b)));
  if (labelled) return found(labelled, 3);
  const byIcon = all.find((b) => MIC_ICONS.includes(iconOf(b)));
  if (byIcon) return found(byIcon, 2);
  const byLabel = all.find((b) => /microphone/i.test(labelOf(b)));
  return byLabel ? found(byLabel, 3) : NOTHING;
}

export function isMuted(button: Element): Located<boolean> {
  const attr = button.getAttribute('data-is-muted');
  if (attr === 'true' || attr === 'false') return found(attr === 'true', 1);
  const icon = iconOf(button);
  if (icon === 'mic_off') return found(true, 2);
  if (icon === 'mic') return found(false, 2);
  const label = labelOf(button);
  if (/^turn on microphone/i.test(label)) return found(true, 3);
  if (/^turn off microphone/i.test(label)) return found(false, 3);
  return NOTHING;
}

// ── D6 title and code ──
export function meetingTitle(doc: Document): Located<string> {
  const attr = collapse(doc.querySelector('[data-meeting-title]')?.getAttribute('data-meeting-title') ?? '');
  if (attr) return found(attr, 1);
  const fromTitle = /^Meet [-–] (.+)$/.exec(collapse(doc.title))?.[1]?.trim();
  return fromTitle ? found(fromTitle, 3) : NOTHING;
}

export function meetingCode(location: Pick<Location, 'pathname'>): Located<string> {
  const code = /^\/(?:meet\/)?([a-z]{3}-[a-z]{4}-[a-z]{3})(\/|$)/.exec(location.pathname)?.[1];
  return code ? found(code, 1) : NOTHING;
}
