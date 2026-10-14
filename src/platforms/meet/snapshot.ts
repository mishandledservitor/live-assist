// DEV-ONLY (spike build): an anonymised copy of the Meet page for the snapshot tests (002 research R11, tasks T066–T067).
// Works on a clone, so the live page is untouched. Keeps the structure and every attribute the locators use; drops
// scripts, styles, comments and every text node except icon ligatures, caption speaker names and the self word.
// People, the meeting title and code, avatar URLs and emails become placeholders; caption text becomes "Caption text N"
// (it is overwritten, never read). The user still reviews the file before committing it (tests/fixtures/meet/README.md).
import { captionItems, captionsRegion, isSelfName, meetingCode, meetingTitle, speakerNameOf } from './locators';

export const PLACEHOLDER_CODE = 'aaa-bbbb-ccc';
export const PLACEHOLDER_TITLE = 'Meeting title';
export const PLACEHOLDER_EMAIL = 'person@example.invalid';

export interface AnonymiseOptions {
  /** Names the user wants scrubbed as well (their own, attendees who never spoke). */
  extraNames?: readonly string[];
  /** For the fixture marker; defaults to today. */
  date?: string;
}

export interface AnonymisedPage {
  html: string;
  /** Placeholder → real name, for the user's review only. Never written into `html`. */
  key: Record<string, string>;
}

const REMOVED = 'script, style, link, noscript, iframe, template, object, embed, base';
const ICON =
  '.google-symbols, .material-icons, .material-icons-extended, .material-symbols-outlined, i[aria-hidden="true"]';
/** Code identifiers, not text: never contain a person's name and some locators rely on them unchanged. */
const CODE_ATTRS = /^(class|id|jsname|jscontroller|jsaction|jsmodel|jslog|jsrenderer|data-iml)$/;
const AVATAR_URL = /https?:\/\/[a-z0-9.-]*googleusercontent\.com\/[^\s"'()<>,]*/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const ACCOUNT_LABEL = /Google Account:\s*([^(]+?)\s*\(/;
const MARK = 'data-live-assist-keep';

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const letters = (i: number): string =>
  (i < 26 ? '' : letters(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));

function cloneDocument(doc: Document): Document {
  const out = doc.implementation.createHTMLDocument('');
  out.replaceChild(out.importNode(doc.documentElement, true), out.documentElement);
  return out;
}

function textNodes(root: Node): Text[] {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

function comments(root: Node): Comment[] {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
  const nodes: Comment[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Comment);
  return nodes;
}

/** Real names in page order: participant tiles, caption speakers, the account label, then the user's list. */
function collectNames(doc: Document, extra: readonly string[]): string[] {
  const names: string[] = [];
  const add = (raw: string | null | undefined) => {
    const name = collapse(raw ?? '');
    if (name.length < 2 || isSelfName(name, doc) || names.includes(name)) return;
    names.push(name);
  };
  for (const tile of doc.querySelectorAll('[data-participant-id], [data-self-name]')) {
    add(tile.getAttribute('data-self-name'));
    for (const t of textNodes(tile)) if (!t.parentElement?.closest(ICON)) add(t.data);
  }
  const region = captionsRegion(doc).value;
  if (region) for (const item of captionItems(region).value) add(speakerNameOf(item).value);
  // Anything else with an avatar (notification chips such as "… wants to join", research R13): its first name-like span.
  for (const img of doc.querySelectorAll('img[data-iml], img[src*="googleusercontent.com"]'))
    add(img.parentElement?.querySelector(':scope > span, :scope > div > span')?.textContent);
  for (const el of doc.querySelectorAll('[aria-label*="Google Account"]'))
    add(ACCOUNT_LABEL.exec(el.getAttribute('aria-label') ?? '')?.[1]);
  for (const name of extra) add(name);
  return names;
}

export function anonymiseMeetPage(page: Document, options: AnonymiseOptions = {}): AnonymisedPage {
  const doc = cloneDocument(page);
  const title = meetingTitle(page).value;
  const code = meetingCode(page.location).value;
  const originalTitle = page.title;

  const names = collectNames(doc, options.extraNames ?? []);
  const placeholderOf = new Map(names.map((n, i) => [n, `Participant ${letters(i)}`]));
  const key = Object.fromEntries(names.map((n) => [placeholderOf.get(n)!, n]));

  // Full names first (longest first), then each word of three letters or more on its own (first names in tooltips).
  const rules: [RegExp, string][] = [];
  for (const name of [...names].sort((a, b) => b.length - a.length))
    rules.push([new RegExp(escape(name), 'giu'), placeholderOf.get(name)!]);
  for (const name of names)
    for (const word of name.split(' ').filter((w) => w.length >= 3))
      rules.push([new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'giu'), placeholderOf.get(name)!]);
  // Meet titles a meeting without a name after its code: the code rule must win then.
  if (title && title !== code) rules.unshift([new RegExp(escape(title), 'giu'), PLACEHOLDER_TITLE]);
  if (code) rules.unshift([new RegExp(escape(code), 'gi'), PLACEHOLDER_CODE]);
  rules.push([EMAIL, PLACEHOLDER_EMAIL]);

  const avatars = new Map<string, string>();
  const scrub = (value: string): string => {
    let out = value.replace(AVATAR_URL, (url) => {
      if (!avatars.has(url)) avatars.set(url, `https://example.invalid/avatar-${letters(avatars.size)}`);
      return avatars.get(url)!;
    });
    for (const [pattern, placeholder] of rules) out = out.replace(pattern, placeholder);
    return out;
  };

  for (const el of doc.querySelectorAll(REMOVED)) el.remove();
  for (const el of doc.querySelectorAll('meta:not([charset])')) el.remove();
  for (const c of comments(doc)) c.remove();

  // Caption turns: the name becomes its placeholder (the self word stays), the text is overwritten unread.
  const region = captionsRegion(doc).value;
  if (region) {
    let n = 0;
    for (const item of captionItems(region).value) {
      const name = speakerNameOf(item).value;
      const header = item.firstElementChild;
      const span = header?.querySelector('span') ?? header?.querySelector('.NWpY1d');
      if (span && name) {
        span.textContent = isSelfName(name, doc) ? name : (placeholderOf.get(name) ?? 'Participant ?');
        span.setAttribute(MARK, '');
      }
      for (const body of [...item.children].slice(1)) {
        n += 1;
        body.textContent = `Caption text ${n}`;
        body.setAttribute(MARK, '');
      }
    }
  }

  // Every other text node goes, except icon ligatures, the self word and tile names (as placeholders).
  for (const t of textNodes(doc.documentElement)) {
    const parent = t.parentElement;
    if (!parent || t.data.trim() === '') continue;
    if (parent.closest(`[${MARK}]`) || parent.closest(ICON)) continue;
    const text = collapse(t.data);
    if (isSelfName(text, doc)) continue;
    const placeholder = parent.closest('[data-participant-id]') ? placeholderOf.get(text) : undefined;
    if (placeholder) t.data = placeholder;
    else t.remove();
  }
  for (const el of doc.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);

  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/data:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (CODE_ATTRS.test(attr.name)) continue;
      const scrubbed = scrub(attr.value);
      if (scrubbed !== attr.value) el.setAttribute(attr.name, scrubbed);
    }
  }

  const titleMatch = /^(Meet [-–] ).+$/.exec(collapse(originalTitle));
  doc.title = titleMatch ? `Meet - ${scrub(collapse(originalTitle).slice(titleMatch[1]!.length))}` : 'Meet';

  const meta = doc.createElement('meta');
  meta.name = 'live-assist-fixture';
  meta.content = `real, anonymised ${options.date ?? new Date().toISOString().slice(0, 10)} by the live-assist spike build; reviewed by hand before commit`;
  doc.head.prepend(meta);
  const charset = doc.querySelector('meta[charset]') ?? doc.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  doc.head.prepend(charset);

  return { html: `<!doctype html>\n${doc.documentElement.outerHTML}\n`, key };
}
