// Caption turns from Meet's captions region, with two outputs that share the MutationObserver and nothing else.
// Activity (002 research R5): "this turn, by this name, changed at time t". It never reads the caption text: a
// mutation only says *that* a turn changed, and the name comes from the item's header (002 FR-004). Naming rests on
// it, so its code is not touched by the second output.
// Text (013 research R1, R3; specs/013-captions-download/contracts/captions-capture.md): the whole text of each turn
// that appears while the observer watches, for storage only. Off unless `onText` is given; then it reads the one turn
// a change touched, at most once a second, and never a turn that was on the page before.
import type { CaptionActivity } from '../../core/platform/adapter';
import { fullText, mergeCaptionText, type TurnText } from './caption-text';
import { captionItems, captionsRegion, captionTextOf, isSelfName, speakerNameOf } from './locators';

/** At most one event per turn per this long; the last change in each window is always sent. */
export const THROTTLE_MS = 250;
/** An older turn (not the newest item) unchanged this long is closed: later edits to it (Meet correcting itself) are ignored. The newest item never closes (retest 2026-10-08). */
export const TURN_CLOSE_MS = 4000;
/** How often a missing or replaced captions region is looked for again. */
export const REGION_POLL_MS = 1000;
/** 013: at most one text read and report per turn per this long; the last change is always reported. */
export const CAPTION_TEXT_THROTTLE_MS = 1000;
/** 013: the shared beginning that relates a re-created item to a kept turn. */
export const REBIND_PREFIX_CHARS = 16;

const MAX_NAME = 200;

interface Turn {
  turnKey: string;
  speakerName: string;
  /** Normalised, to find the latest item of a speaker. */
  speakerId: string;
  self: boolean | null;
  lastChangeAt: number;
  lastSentAt: number | null;
  /** Time of the latest change not yet sent. */
  pendingAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/** 013: a turn's place in the text path. A turn on the page when its region was adopted is history: never read. */
interface TextTurn {
  turnKey: string;
  speakerName: string;
  self: boolean | null;
  /** False = history. */
  keptTurn: boolean;
  /** Sequence on this page, in the order turns were first registered. */
  order: number;
  /** The element that is the turn now; Meet may re-create it (re-binding). */
  element: Element;
  firstSeenAt: number;
  text: TurnText;
  /** The whole text last reported; null before the first report. */
  reported: string | null;
  dirty: boolean;
  lastReadAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/** 013: a kept turn's whole text, each time it changes. */
export interface CaptionTextUpdate {
  turnKey: string;
  speakerName: string;
  self: boolean | null;
  /** Epoch ms when the turn first appeared. */
  firstSeenAt: number;
  text: string;
}

export interface CaptionObserverDeps {
  doc: Document;
  /** Prefixes turn keys, so a reloaded page never reuses one. */
  pageId: string;
  onActivity(activity: CaptionActivity): void;
  now?: () => number;
  /** 013: a kept turn's text changed. Absent = no text is read at all. */
  onText?(update: CaptionTextUpdate): void;
  /** 013: hands out the next turn number for this page; the page agent owns it, so a later observer never reuses a key. */
  nextTurnNumber?(): number;
}

export function observeCaptions(deps: CaptionObserverDeps): { stop(): void } {
  const { doc } = deps;
  const now = deps.now ?? (() => Date.now());
  const MutationObserverCtor = doc.defaultView?.MutationObserver;
  const turns = new WeakMap<Element, Turn>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const latestBySpeaker = new Map<string, Element>();
  let counter = 0;
  let region: HTMLElement | null = null;
  let observer: MutationObserver | null = null;
  let stopped = false;

  const send = (turn: Turn, observedAt: number) => {
    turn.lastSentAt = now();
    turn.pendingAt = null;
    deps.onActivity({ turnKey: turn.turnKey, speakerName: turn.speakerName, self: turn.self, observedAt });
  };

  const changed = (turn: Turn, at: number) => {
    turn.lastChangeAt = at;
    if (turn.lastSentAt === null || at - turn.lastSentAt >= THROTTLE_MS) {
      send(turn, at);
      return;
    }
    turn.pendingAt = at;
    if (turn.timer !== null) return;
    const timer = setTimeout(
      () => {
        timers.delete(timer);
        turn.timer = null;
        if (!stopped && turn.pendingAt !== null) send(turn, turn.pendingAt);
      },
      turn.lastSentAt + THROTTLE_MS - now(),
    );
    turn.timer = timer;
    timers.add(timer);
  };

  /** Registers an item not seen before, silently; returns its turn (null while Meet has not filled the name in). */
  const register = (item: Element): Turn | null => {
    const known = turns.get(item);
    if (known) return known;
    const name = speakerNameOf(item).value;
    if (!name) return null; // Meet may fill the header in a moment; the next mutation retries
    const speakerName = name.slice(0, MAX_NAME);
    counter = deps.nextTurnNumber ? deps.nextTurnNumber() : counter + 1;
    const turn: Turn = {
      turnKey: `${deps.pageId}:${counter}`,
      speakerName,
      speakerId: speakerName.normalize('NFC').toLowerCase(),
      self: isSelfName(speakerName, doc),
      lastChangeAt: now(),
      lastSentAt: null,
      pendingAt: null,
      timer: null,
    };
    turns.set(item, turn);
    return turn;
  };

  /** Each speaker's newest item, by page order (a re-created older item must not take over). */
  const indexSpeakers = (items: readonly Element[]) => {
    latestBySpeaker.clear();
    for (const item of items) {
      const turn = turns.get(item);
      if (turn) latestBySpeaker.set(turn.speakerId, item);
    }
  };

  /** The caption item (a child of the region) a mutated node belongs to. */
  const itemOf = (node: Node | null): Element | null => {
    let el: Node | null = node;
    while (el && el.parentNode !== region) el = el.parentNode;
    return el instanceof (doc.defaultView?.Element ?? Element) ? el : null;
  };

  const onMutations = (records: MutationRecord[]) => {
    if (stopped || !region) return;
    const at = now();
    const items = captionItems(region).value;
    // New turns are appended after the last known one. A known item removed in the same batch means Meet re-created
    // nodes (a re-render), not that someone started talking: what is already on the page is history, reported only
    // once it changes (retest 2026-10-08, FR-025).
    const replaced = records.some((r) => [...r.removedNodes].some((n) => turns.has(n as Element)));
    const lastKnown = items.findLastIndex((item) => turns.has(item));
    const newest = items.at(-1) ?? null;
    const announced = new Set<Turn>();
    items.forEach((item, i) => {
      if (turns.has(item)) return;
      const turn = register(item);
      if (turn && i > lastKnown && !replaced) announced.add(turn);
    });
    indexSpeakers(items);

    const touched = new Set<Element>();
    for (const r of records) {
      if (r.target === region) continue; // items added or removed: handled above
      const item = itemOf(r.target);
      if (item) touched.add(item);
    }
    for (const turn of announced) changed(turn, at);
    for (const item of touched) {
      const turn = turns.get(item);
      if (!turn || announced.has(turn)) continue;
      if (latestBySpeaker.get(turn.speakerId) !== item) continue; // an older item of the same speaker
      // The newest item is the turn being captioned now: it never closes, so a long turn keeps counting through
      // pauses, rewrites and older lines dropping off. Older items close (Meet correcting itself).
      if (item !== newest && at - turn.lastChangeAt > TURN_CLOSE_MS) continue;
      changed(turn, at);
    }
    if (deps.onText) followText(items, records, at);
  };

  // ── 013: the text path. Nothing above reads or writes anything below, and the other way round. ──
  const textOf = new WeakMap<Element, TextTurn>();
  /** Every turn the text path knows, in `order`; strong references, so a turn whose element left can be re-bound. */
  const textTurns: TextTurn[] = [];

  const reportText = (turn: TextTurn) => {
    turn.dirty = false;
    turn.lastReadAt = now();
    // A turn that left the page keeps what it had: a last read is impossible.
    if (!turn.element.isConnected) return;
    turn.text = mergeCaptionText(turn.text, captionTextOf(turn.element).value);
    const text = fullText(turn.text);
    if (text === '' || text === turn.reported) return;
    turn.reported = text;
    deps.onText?.({
      turnKey: turn.turnKey,
      speakerName: turn.speakerName,
      self: turn.self,
      firstSeenAt: turn.firstSeenAt,
      text,
    });
  };

  /** Per turn, trailing: read at once after a quiet second (in a task of its own), else once at the window's end. */
  const markDirty = (turn: TextTurn) => {
    turn.dirty = true;
    if (turn.timer !== null) return;
    const wait = turn.lastReadAt === null ? 0 : Math.max(0, turn.lastReadAt + CAPTION_TEXT_THROTTLE_MS - now());
    const timer = setTimeout(() => {
      timers.delete(timer);
      turn.timer = null;
      if (!stopped && turn.dirty) reportText(turn);
    }, wait);
    turn.timer = timer;
    timers.add(timer);
  };

  const newTextTurn = (item: Element, activity: Turn, keptTurn: boolean, at: number): TextTurn => {
    const turn: TextTurn = {
      turnKey: activity.turnKey,
      speakerName: activity.speakerName,
      self: activity.self,
      keptTurn,
      order: textTurns.length,
      element: item,
      firstSeenAt: at,
      text: { kept: '', shown: '' },
      reported: null,
      dirty: false,
      lastReadAt: null,
      timer: null,
    };
    textTurns.push(turn);
    textOf.set(item, turn);
    return turn;
  };

  /**
   * Whether an item showing `shown` can be the kept turn whose text on the page was `kept`: it shows that text or carries
   * on from it, or the two share a real beginning. A few characters are not one: a new turn by the same speaker that
   * opens with the same word ("So", "Okay") would take the kept turn over, and its text would replace the kept one.
   */
  const related = (shown: string, kept: string): boolean => {
    if (shown === '' || kept === '') return false;
    if (shown.startsWith(kept)) return true;
    const n = REBIND_PREFIX_CHARS;
    return shown.length >= n && kept.length >= n && shown.slice(0, n) === kept.slice(0, n);
  };

  /**
   * Re-binding (research R3 rule 3): an unknown item that is not a plain append may be a turn Meet re-created. It takes
   * over the first turn whose element has left the page, with the same speaker and a consistent position; a kept turn
   * also needs a related text. A history turn is matched without its text (it was never read), and stays history.
   * `pass.lastOrder` makes take-overs run in increasing order down the page.
   */
  const takeOver = (
    item: Element,
    index: ReadonlyMap<Element, number>,
    speakerName: string,
    pass: { lastOrder: number },
    history: boolean,
  ): TextTurn | null => {
    const at = index.get(item) ?? -1;
    const gone = textTurns.filter(
      (t) => !t.element.isConnected && t.speakerName === speakerName && t.order > pass.lastOrder,
    );
    if (gone.length === 0) return null;
    /** Every turn still on the page (of the kinds given) lies on the same side of the item as of the candidate. */
    const consistent = (candidate: TextTurn, among: (t: TextTurn) => boolean) =>
      textTurns.every((t) => {
        if (t === candidate || !among(t) || !t.element.isConnected) return true;
        const position = index.get(t.element);
        if (position === undefined) return true;
        return position < at ? t.order < candidate.order : t.order > candidate.order;
      });
    const keptGone = gone.filter((t) => t.keptTurn);
    const shown = keptGone.length > 0 ? captionTextOf(item).value : '';
    const taken =
      keptGone.find((t) => related(shown, t.text.shown) && consistent(t, (o) => o.keptTurn)) ??
      (history ? gone.find((t) => !t.keptTurn && consistent(t, () => true)) : undefined);
    if (!taken) return null;
    taken.element = item;
    textOf.set(item, taken);
    pass.lastOrder = taken.order;
    return taken;
  };

  const positions = (items: readonly Element[]) => new Map(items.map((item, i) => [item, i] as const));

  /** A mutation batch: new items become kept turns unless they re-bind; every touched kept turn is marked dirty. */
  function followText(items: readonly Element[], records: readonly MutationRecord[], at: number): void {
    const replaced = records.some((r) => [...r.removedNodes].some((n) => textOf.has(n as Element)));
    const lastKnown = items.findLastIndex((item) => textOf.has(item));
    const index = positions(items);
    const pass = { lastOrder: -1 };
    items.forEach((item, i) => {
      if (textOf.has(item)) return;
      const activity = register(item);
      if (!activity) return; // no name yet; the next mutation retries
      const plainAppend = i > lastKnown && !replaced;
      const turn =
        (plainAppend ? null : takeOver(item, index, activity.speakerName, pass, true)) ??
        newTextTurn(item, activity, true, at);
      if (turn.keptTurn) markDirty(turn);
    });
    for (const r of records) {
      if (r.target === region) continue;
      const item = itemOf(r.target);
      const turn = item ? textOf.get(item) : undefined;
      if (turn?.keptTurn) markDirty(turn);
    }
  }

  /** A region was adopted: what it holds is history, except a turn kept earlier on this page that it shows again. */
  function adoptText(items: readonly Element[]): void {
    const index = positions(items);
    const pass = { lastOrder: -1 };
    for (const item of items) {
      if (textOf.has(item)) continue;
      const activity = register(item);
      if (!activity) continue;
      const turn = takeOver(item, index, activity.speakerName, pass, false);
      if (turn) markDirty(turn);
      else newTextTurn(item, activity, false, now());
    }
  }

  /** The region being observed stays while it is on the page and still holds caption turns. */
  const stillCaptions = (r: HTMLElement | null): boolean =>
    r !== null && r.isConnected && captionItems(r).value.length > 0;

  const attach = () => {
    if (stillCaptions(region)) return;
    const found = captionsRegion(doc).value;
    if (found === region && region?.isConnected) return;
    observer?.disconnect();
    region = found;
    if (!region || !MutationObserverCtor) return;
    // Turns already on the page are history: known, but not announced.
    const items = captionItems(region).value;
    for (const item of items) register(item);
    indexSpeakers(items);
    if (deps.onText) adoptText(items);
    observer = new MutationObserverCtor(onMutations);
    observer.observe(region, { childList: true, characterData: true, subtree: true });
  };

  attach();
  const poll = setInterval(attach, REGION_POLL_MS);

  return {
    stop() {
      if (deps.onText && !stopped && region && observer) {
        // 013: what changed last is reported before the end, including changes the page has not delivered yet.
        followText(captionItems(region).value, observer.takeRecords(), now());
        for (const turn of textTurns) if (turn.keptTurn && turn.dirty) reportText(turn);
      }
      stopped = true;
      clearInterval(poll);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      observer?.disconnect();
      observer = null;
    },
  };
}
