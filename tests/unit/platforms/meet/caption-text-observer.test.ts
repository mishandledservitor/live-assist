// 013 T018 (FR-001, FR-002, FR-004–FR-006, research R1, R3; contracts/captions-capture.md "Caption observer: the text
// path"): the caption observer's second output. It reports the whole text of turns that appear while it watches,
// reads only the turn a change touched and at most once a second, never reads what was on the page before, and
// recognises a turn Meet re-creates. Loaded snapshots, fake timers; every name and sentence is invented.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionActivity } from '@/core/platform/adapter';
import {
  CAPTION_TEXT_THROTTLE_MS,
  observeCaptions,
  REBIND_PREFIX_CHARS,
  REGION_POLL_MS,
  TURN_CLOSE_MS,
} from '@/platforms/meet/caption-observer';
import { captionTextOf } from '@/platforms/meet/locators';
import {
  addCaptionItem,
  appendCaptionText,
  loadMeetSnapshot,
  recreateCaptionItems,
  removeCaptionItem,
  replaceCaptionsRegion,
  setCaptionText,
} from '../../../support/meet-snapshot';
import { loadTimeline } from '../../../support/timeline';

// The real locator, counted: which items had their text read, and how often.
vi.mock('@/platforms/meet/locators', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/platforms/meet/locators')>();
  return { ...real, captionTextOf: vi.fn(real.captionTextOf) };
});

const T0 = 1_760_000_000_000;
const reads = vi.mocked(captionTextOf);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  reads.mockClear();
});
afterEach(() => void vi.useRealTimers());

/** Lets jsdom deliver its mutation records and the reads they schedule, without moving the clock. */
const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
};
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

interface Update {
  turnKey: string;
  speakerName: string;
  self: boolean | null;
  firstSeenAt: number;
  text: string;
}

function setup(snapshot = 'in-call-captions-on', counter = { n: 0 }) {
  const doc = loadMeetSnapshot(snapshot);
  const updates: Update[] = [];
  const activity: CaptionActivity[] = [];
  const observer = observeCaptions({
    doc,
    pageId: 'pg1',
    onActivity: (a) => void activity.push(a),
    onText: (u) => void updates.push(u),
    nextTurnNumber: () => (counter.n += 1),
  });
  const region = () => doc.querySelector<HTMLElement>('[role="region"][tabindex="0"]')!;
  const turnsOnPage = () => [...region().querySelectorAll<HTMLElement>(':scope > .nMcdL')];
  return { doc, updates, activity, observer, region, turnsOnPage, counter, texts: () => updates.map((u) => u.text) };
}

const readsOf = (item: Element) => reads.mock.calls.filter(([el]) => el === item).length;

describe('the text path is off without onText', () => {
  it('never reads a text element', async () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const observer = observeCaptions({ doc, pageId: 'pg1', onActivity: () => undefined });
    const item = addCaptionItem(doc, 'Mike Smith', 'The harbour survey');
    await settle();
    appendCaptionText(item, ' moves to Thursday.');
    recreateCaptionItems(doc);
    await wait(CAPTION_TEXT_THROTTLE_MS * 3);
    observer.stop();
    expect(reads).not.toHaveBeenCalled();
  });
});

describe('kept turns and history', () => {
  it('never reports or reads the turns on the page when the region is adopted, however they change', async () => {
    const { doc, updates, turnsOnPage } = setup();
    const [first, second, third] = turnsOnPage();
    await settle();
    appendCaptionText(third!, ', please.');
    setCaptionText(first!, 'Kickoff is at eleven tomorrow, not ten.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    appendCaptionText(second!, ' Promise.');
    await wait(TURN_CLOSE_MS + CAPTION_TEXT_THROTTLE_MS);
    // A re-render replaces every element; what they hold is still from before.
    const [, , thirdAgain] = recreateCaptionItems(doc);
    await settle();
    appendCaptionText(thirdAgain!, ' Thanks.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toEqual([]);
    expect(reads).not.toHaveBeenCalled();
  });

  it('reports a turn appended later with its text, when it appeared, and a key from nextTurnNumber', async () => {
    const { doc, updates, counter } = setup();
    await wait(4_200);
    const before = counter.n;
    addCaptionItem(doc, '  Mike   Smith ', 'Good morning, can everyone see the slide?');
    await settle();
    expect(updates).toEqual([
      {
        turnKey: `pg1:${before + 1}`,
        speakerName: 'Mike Smith',
        self: null,
        firstSeenAt: T0 + 4_200,
        text: 'Good morning, can everyone see the slide?',
      },
    ]);
    addCaptionItem(doc, 'You', 'Yes, it is up.');
    await settle();
    expect(updates[1]).toMatchObject({ turnKey: `pg1:${before + 2}`, speakerName: 'You', self: true });
  });

  it('reports the whole text each time it changes, under the same key and first-seen time', async () => {
    const { doc, updates, texts } = setup();
    const item = addCaptionItem(doc, 'Mike Smith', 'We ship');
    await settle();
    await wait(CAPTION_TEXT_THROTTLE_MS);
    appendCaptionText(item, ' on Thursday');
    await wait(CAPTION_TEXT_THROTTLE_MS);
    setCaptionText(item, 'We ship on Tuesday, not Thursday.');
    await wait(CAPTION_TEXT_THROTTLE_MS);
    expect(texts()).toEqual(['We ship', 'We ship on Thursday', 'We ship on Tuesday, not Thursday.']);
    expect(new Set(updates.map((u) => u.turnKey)).size).toBe(1);
    expect(new Set(updates.map((u) => u.firstSeenAt))).toEqual(new Set([T0]));
  });

  it('a turn with a name and no text reports nothing until it has text', async () => {
    const { doc, updates } = setup();
    await wait(1_000);
    const item = addCaptionItem(doc, 'Mike Smith');
    await wait(CAPTION_TEXT_THROTTLE_MS * 3);
    expect(updates).toEqual([]);
    setCaptionText(item, 'Now I am saying something.');
    await wait(CAPTION_TEXT_THROTTLE_MS);
    expect(updates).toEqual([
      expect.objectContaining({ text: 'Now I am saying something.', firstSeenAt: T0 + 1_000 }) as Update,
    ]);
  });

  it('an unchanged text is not reported again, and an emptied turn keeps its text', async () => {
    const { doc, texts } = setup();
    const item = addCaptionItem(doc, 'Mike Smith', 'Said once.');
    await settle();
    await wait(CAPTION_TEXT_THROTTLE_MS);
    setCaptionText(item, 'Said once.');
    await wait(CAPTION_TEXT_THROTTLE_MS);
    setCaptionText(item, '');
    await wait(CAPTION_TEXT_THROTTLE_MS);
    expect(texts()).toEqual(['Said once.']);
  });

  it('keeps the beginning Meet drops from a long turn', async () => {
    const { doc, texts } = setup('real-dom-captions-on');
    const first = 'First we look at the numbers for the quarter. ';
    const second = 'Then we turn to the harbour survey and its findings. ';
    const third = 'Finally the lighthouse budget.';
    const item = addCaptionItem(doc, 'Mike Smith', first);
    await settle();
    await wait(CAPTION_TEXT_THROTTLE_MS);
    setCaptionText(item, first + second);
    await wait(CAPTION_TEXT_THROTTLE_MS);
    setCaptionText(item, second + third);
    await wait(CAPTION_TEXT_THROTTLE_MS);
    expect(texts().at(-1)).toBe(first + second + third);
  });
});

describe('reading is throttled and local', () => {
  it(`ten changes inside ${CAPTION_TEXT_THROTTLE_MS} ms cause one read and one report, with the last change`, async () => {
    const { doc, updates } = setup();
    const item = addCaptionItem(doc, 'Mike Smith', 'Step 0');
    await settle();
    expect(updates).toHaveLength(1);
    const readsBefore = readsOf(item);
    for (let i = 1; i <= 10; i += 1) {
      await wait(90);
      setCaptionText(item, `Step ${i}`);
    }
    await settle();
    expect(updates).toHaveLength(1);
    expect(readsOf(item)).toBe(readsBefore);
    await wait(CAPTION_TEXT_THROTTLE_MS);
    expect(readsOf(item)).toBe(readsBefore + 1);
    expect(updates).toHaveLength(2);
    expect(updates[1]!.text).toBe('Step 10');
    // Quiet afterwards: no further read.
    await wait(CAPTION_TEXT_THROTTLE_MS * 5);
    expect(readsOf(item)).toBe(readsBefore + 1);
  });

  it('the first change after a quiet second is read at once', async () => {
    const { doc, updates } = setup();
    const item = addCaptionItem(doc, 'Mike Smith', 'Before the pause.');
    await settle();
    await wait(CAPTION_TEXT_THROTTLE_MS * 4);
    setCaptionText(item, 'Before the pause. After it.');
    await settle();
    expect(updates.at(-1)!.text).toBe('Before the pause. After it.');
  });

  it('no text is read inside the mutation callback', async () => {
    const { doc } = setup();
    const item = addCaptionItem(doc, 'Mike Smith', 'Read a moment later.');
    // jsdom delivers the records in a microtask; the read is a task of its own.
    await Promise.resolve();
    await Promise.resolve();
    expect(readsOf(item)).toBe(0);
    await settle();
    expect(readsOf(item)).toBe(1);
  });

  it('a change in one turn reads that turn only, with 300 turns on the page', async () => {
    const { doc, updates } = setup('real-dom-captions-on');
    const items: HTMLElement[] = [];
    for (let i = 0; i < 300; i += 1) items.push(addCaptionItem(doc, i % 2 ? 'Mike Smith' : 'Bob Doe', `Turn ${i}.`));
    await settle();
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(300);
    reads.mockClear();
    appendCaptionText(items[137]!, ' Corrected.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(reads.mock.calls.map(([el]) => el)).toEqual([items[137]]);
    expect(updates).toHaveLength(301);
    expect(updates.at(-1)!.text).toBe('Turn 137. Corrected.');
  });

  it('a correction to an older kept turn after a newer one started is reported, also long after', async () => {
    const { doc, updates } = setup();
    const older = addCaptionItem(doc, 'Mike Smith', 'We meet on the forth');
    await settle();
    addCaptionItem(doc, 'Mike Smith', 'And then lunch.');
    await settle();
    await wait(CAPTION_TEXT_THROTTLE_MS);
    setCaptionText(older, 'We meet on the fourth.');
    await wait(CAPTION_TEXT_THROTTLE_MS);
    expect(updates.at(-1)).toMatchObject({ turnKey: updates[0]!.turnKey, text: 'We meet on the fourth.' });
    await wait(TURN_CLOSE_MS * 3);
    setCaptionText(older, 'We meet on the fourth of November.');
    await wait(CAPTION_TEXT_THROTTLE_MS);
    expect(updates.at(-1)).toMatchObject({ turnKey: updates[0]!.turnKey, text: 'We meet on the fourth of November.' });
  });
});

describe('a turn is its element, until Meet re-creates it', () => {
  it('a removed turn reports nothing, and a re-render does not bring it back as new', async () => {
    const { doc, updates, turnsOnPage } = setup();
    const a = addCaptionItem(doc, 'Mike Smith', 'The first kept turn of the meeting.');
    await settle();
    addCaptionItem(doc, 'Bob Doe', 'The second kept turn.');
    await settle();
    await wait(CAPTION_TEXT_THROTTLE_MS);
    expect(updates).toHaveLength(2);
    const [keyA, keyB] = updates.map((u) => u.turnKey);

    // Changed, then gone before it could be read.
    setCaptionText(a, 'The first kept turn of the meeting. And more.');
    removeCaptionItem(a);
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(2);

    // The remaining elements are re-created, then Meet shows the removed turn again where it stood.
    recreateCaptionItems(doc);
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    const b = turnsOnPage().at(-1)!;
    const back = a.cloneNode(true) as HTMLElement;
    setCaptionText(back, 'The first kept turn of the meeting.');
    b.before(back);
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(2);

    setCaptionText(back, 'The first kept turn of the meeting, corrected.');
    appendCaptionText(b, ' Continued.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates.slice(2).map((u) => [u.turnKey, u.text])).toEqual([
      [keyA, 'The first kept turn of the meeting, corrected.'],
      [keyB, 'The second kept turn. Continued.'],
    ]);
  });

  it('all elements replaced: no new turn, and later changes continue under the old key and first-seen time', async () => {
    const { doc, updates } = setup('real-dom-captions-on');
    addCaptionItem(doc, 'Mike Smith', 'An invented opening remark.');
    await wait(700);
    addCaptionItem(doc, 'You', 'An invented reply.');
    await wait(700);
    addCaptionItem(doc, 'Mike Smith', 'An invented follow-up');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    const kept = updates.map((u) => ({ turnKey: u.turnKey, firstSeenAt: u.firstSeenAt }));
    expect(kept).toHaveLength(3);

    const fresh = recreateCaptionItems(doc);
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(3);

    appendCaptionText(fresh.at(-1)!, ' question.');
    setCaptionText(fresh.at(-3)!, 'An invented opening remark, corrected.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates.slice(3).map((u) => ({ turnKey: u.turnKey, firstSeenAt: u.firstSeenAt, text: u.text }))).toEqual(
      expect.arrayContaining([
        { ...kept[2], text: 'An invented follow-up question.' },
        { ...kept[0], text: 'An invented opening remark, corrected.' },
      ]),
    );
    expect(updates).toHaveLength(5);
    // Twice over, and with a new turn in the same batch as the re-render.
    recreateCaptionItems(doc);
    addCaptionItem(doc, 'Bob Doe', 'A genuinely new turn.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(6);
    expect(updates[5]).toMatchObject({ speakerName: 'Bob Doe', text: 'A genuinely new turn.' });
    expect(kept.map((k) => k.turnKey)).not.toContain(updates[5]!.turnKey);
  });

  it('a re-created turn whose text moved on is the same turn if it starts the same', async () => {
    const { doc, updates, turnsOnPage } = setup('real-dom-captions-on');
    addCaptionItem(doc, 'Mike Smith', 'The lighthouse budget is approved');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    const old = turnsOnPage().at(-1)!;
    const fresh = old.cloneNode(true) as HTMLElement;
    setCaptionText(fresh, 'The lighthouse budget is approved for next year.');
    old.replaceWith(fresh);
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates.map((u) => [u.turnKey, u.text])).toEqual([
      [updates[0]!.turnKey, 'The lighthouse budget is approved'],
      [updates[0]!.turnKey, 'The lighthouse budget is approved for next year.'],
    ]);
    expect(REBIND_PREFIX_CHARS).toBe(16);
  });

  // Settled with the second build: a few shared characters are not a shared beginning. Before, a new turn opening
  // with the same word as a kept turn that had left the page took it over and replaced its text.
  it('the only turn on the page is replaced by one that opens with the same word: a new turn, and the kept turn keeps its text', async () => {
    const { doc, updates, turnsOnPage } = setup('in-call-captions-off');
    const old = addCaptionItem(doc, 'Mike Smith', 'So the harbour survey starts on Monday.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(1);
    // One batch: the old element goes, an element by the same speaker comes, with nothing else on the page to tell
    // by position whether it is the old turn again.
    const next = old.cloneNode(true) as HTMLElement;
    setCaptionText(next, 'So');
    old.replaceWith(next);
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    setCaptionText(turnsOnPage().at(-1)!, 'So we are agreed.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    const byKey = new Map(updates.map((u) => [u.turnKey, u.text]));
    expect([...byKey.values()]).toEqual(['So the harbour survey starts on Monday.', 'So we are agreed.']);
  });

  it('a short kept turn re-created with the same text, or with more, is still the same turn', async () => {
    const { doc, updates, turnsOnPage } = setup('real-dom-captions-on');
    addCaptionItem(doc, 'Mike Smith', 'Agreed.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    recreateCaptionItems(doc);
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(1);
    const old = turnsOnPage().at(-1)!;
    const fresh = old.cloneNode(true) as HTMLElement;
    setCaptionText(fresh, 'Agreed. Let us move on.');
    old.replaceWith(fresh);
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates.map((u) => [u.turnKey, u.text])).toEqual([
      [updates[0]!.turnKey, 'Agreed.'],
      [updates[0]!.turnKey, 'Agreed. Let us move on.'],
    ]);
  });

  it('a kept turn removed from the top while the same speaker starts a new turn with the same words: a new turn', async () => {
    const { doc, updates } = setup('real-dom-captions-on');
    const top = addCaptionItem(doc, 'Mike Smith', 'Yes, I think we should wait for the survey.');
    await wait(500);
    addCaptionItem(doc, 'Bob Doe', 'Agreed.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(2);
    await wait(60_000);
    // One batch: Meet prunes the old turn and appends the new one.
    removeCaptionItem(top);
    addCaptionItem(doc, 'Mike Smith', 'Yes, I think we should ask the harbour office first.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(3);
    expect(updates[2]).toMatchObject({
      speakerName: 'Mike Smith',
      text: 'Yes, I think we should ask the harbour office first.',
      firstSeenAt: T0 + 500 + CAPTION_TEXT_THROTTLE_MS * 2 + 60_000,
    });
    expect(updates[2]!.turnKey).not.toBe(updates[0]!.turnKey);
  });

  it('a region that comes back after captions were off holds history, unless a turn re-binds', async () => {
    const { doc, updates, region } = setup('real-dom-captions-on');
    addCaptionItem(doc, 'Mike Smith', 'Kept before captions went off.');
    await wait(500);
    addCaptionItem(doc, 'Bob Doe', 'Also kept before.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(2);
    const [keyA, keyB] = updates.map((u) => u.turnKey);

    // Captions off: the band leaves the page. Later it is back with what Meet shows again, plus a turn never seen.
    const old = region();
    const parent = old.parentElement!;
    const back = old.cloneNode(true) as HTMLElement;
    old.remove();
    await wait(REGION_POLL_MS * 3);
    const [, , a2, b2] = [...back.querySelectorAll<HTMLElement>(':scope > .nMcdL')];
    const unseen = b2!.cloneNode(true) as HTMLElement;
    unseen.querySelector('.NWpY1d')!.textContent = 'Tom Brown';
    setCaptionText(unseen, 'Said while captions were off.');
    b2!.before(unseen);
    parent.append(back);
    await wait(REGION_POLL_MS + CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(2);

    appendCaptionText(unseen, ' And changed later.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(2);
    expect(readsOf(unseen)).toBe(0);

    appendCaptionText(a2!, ' Continued after.');
    appendCaptionText(b2!, ' Me too.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates.slice(2).map((u) => [u.turnKey, u.firstSeenAt, u.text])).toEqual([
      [keyA, T0, 'Kept before captions went off. Continued after.'],
      [keyB, T0 + 500, 'Also kept before. Me too.'],
    ]);

    // New speech in the returned band is kept as usual.
    addCaptionItem(doc, 'Tom Brown', 'A new turn in the returned band.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates.at(-1)).toMatchObject({ speakerName: 'Tom Brown', text: 'A new turn in the returned band.' });
  });

  it('a whole region replaced by a copy continues every kept turn', async () => {
    const { doc, updates, turnsOnPage } = setup('real-dom-captions-on');
    addCaptionItem(doc, 'Mike Smith', 'Before the band was re-rendered.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    replaceCaptionsRegion(doc);
    await wait(REGION_POLL_MS + CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates).toHaveLength(1);
    appendCaptionText(turnsOnPage().at(-1)!, ' And after.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(updates.map((u) => [u.turnKey, u.text])).toEqual([
      [updates[0]!.turnKey, 'Before the band was re-rendered.'],
      [updates[0]!.turnKey, 'Before the band was re-rendered. And after.'],
    ]);
  });
});

describe('stop() and turn numbers', () => {
  it('stop() reports each dirty turn once, then nothing', async () => {
    const { doc, updates, observer } = setup();
    const a = addCaptionItem(doc, 'Mike Smith', 'One');
    const b = addCaptionItem(doc, 'Bob Doe', 'Alpha');
    const quiet = addCaptionItem(doc, 'Tom Brown', 'Unchanged.');
    await settle();
    await wait(200);
    setCaptionText(a, 'One two');
    await settle();
    // Changed so recently that the page has not even delivered the mutation yet.
    setCaptionText(b, 'Alpha beta');
    observer.stop();
    expect(
      updates
        .slice(3)
        .map((u) => u.text)
        .sort(),
    ).toEqual(['Alpha beta', 'One two']);
    setCaptionText(a, 'One two three');
    setCaptionText(quiet, 'Changed after the end.');
    await wait(CAPTION_TEXT_THROTTLE_MS * 3);
    expect(updates).toHaveLength(5);
  });

  it('two observers, one after the other, with a shared nextTurnNumber never share a key', async () => {
    const counter = { n: 0 };
    const doc = loadMeetSnapshot('in-call-captions-on');
    const keys: string[] = [];
    const activityKeys: string[] = [];
    const start = () =>
      observeCaptions({
        doc,
        pageId: 'pg1',
        onActivity: (a) => void activityKeys.push(a.turnKey),
        onText: (u) => void keys.push(u.turnKey),
        nextTurnNumber: () => (counter.n += 1),
      });
    const first = start();
    addCaptionItem(doc, 'Mike Smith', 'In the first observer.');
    addCaptionItem(doc, 'Bob Doe', 'Also in the first.');
    await wait(CAPTION_TEXT_THROTTLE_MS);
    first.stop();
    const second = start();
    addCaptionItem(doc, 'Mike Smith', 'In the second observer.');
    addCaptionItem(doc, 'Tom Brown', 'Also in the second.');
    await wait(CAPTION_TEXT_THROTTLE_MS);
    second.stop();
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
    expect(new Set(activityKeys).size).toBe(4);
    for (const key of keys) expect(key).toMatch(/^pg1:\d+$/);
  });

  it('without nextTurnNumber it numbers its own turns, as before', async () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const keys: string[] = [];
    observeCaptions({ doc, pageId: 'pg9', onActivity: () => undefined, onText: (u) => void keys.push(u.turnKey) });
    addCaptionItem(doc, 'Mike Smith', 'Numbered by the observer.');
    await settle();
    expect(keys).toEqual(['pg9:4']);
  });
});

// FR-006: the activity path, which naming rests on, reports exactly what it did before, with and without onText.
describe('caption activity is the same with and without the text path', () => {
  const DIR = join(import.meta.dirname, '../../../fixtures/meet/timelines');
  const NAMES = readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== 'format-example.json')
    .map((f) => f.replace(/\.json$/, ''));

  /** page-timelines.test.ts's replay, with the text path on or off. */
  async function replay(name: string, withText: boolean): Promise<CaptionActivity[]> {
    const t = loadTimeline(name);
    vi.setSystemTime(T0);
    const doc = loadMeetSnapshot('real-dom-captions-on');
    for (const item of doc.querySelectorAll('[role="region"][aria-label="Captions"] > .nMcdL')) item.remove();
    const events: CaptionActivity[] = [];
    const observer = observeCaptions({
      doc,
      pageId: 'pg',
      onActivity: (a) => void events.push(a),
      ...(withText ? { onText: () => undefined } : {}),
    });
    const changes = t.captions
      .flatMap((c, turn) => c.observedAtMs.map((at, i) => ({ at, turn, first: i === 0 })))
      .sort((a, b) => a.at - b.at || Number(b.first) - Number(a.first));
    const items = new Map<number, HTMLElement>();
    for (const change of changes) {
      await vi.advanceTimersByTimeAsync(Math.max(0, T0 + change.at - Date.now()));
      const c = t.captions[change.turn]!;
      if (change.first) {
        items.set(change.turn, addCaptionItem(doc, c.speakerName, 'w'));
        continue;
      }
      const item = items.get(change.turn)!;
      appendCaptionText(item, ' w');
      const body = item.querySelector('.ygicle')!;
      if (body.childNodes.length > 4) body.firstChild!.remove();
    }
    await vi.advanceTimersByTimeAsync(1000);
    observer.stop();
    return events;
  }

  it.each(NAMES)('%s', async (name) => {
    const without = await replay(name, false);
    const withText = await replay(name, true);
    expect(without.length).toBeGreaterThanOrEqual(name === 'no-captions' ? 0 : 1);
    expect(withText).toEqual(without);
  });

  it('re-renders, removals and a replaced region', async () => {
    async function scripted(withText: boolean): Promise<CaptionActivity[]> {
      vi.setSystemTime(T0);
      const doc = loadMeetSnapshot('real-dom-captions-on');
      const events: CaptionActivity[] = [];
      const observer = observeCaptions({
        doc,
        pageId: 'pg',
        onActivity: (a) => void events.push(a),
        ...(withText ? { onText: () => undefined } : {}),
      });
      const a = addCaptionItem(doc, 'Mike Smith', 'An invented opening remark.');
      await wait(300);
      const b = addCaptionItem(doc, 'Bob Doe', 'An invented reply');
      await wait(300);
      appendCaptionText(b, ' that grows.');
      appendCaptionText(a, ' Corrected.');
      await wait(600);
      const fresh = recreateCaptionItems(doc);
      await wait(300);
      appendCaptionText(fresh.at(-1)!, ' And grows.');
      await wait(TURN_CLOSE_MS + 500);
      removeCaptionItem(fresh.at(-2)!);
      addCaptionItem(doc, 'Mike Smith', 'An invented opening for a new turn.');
      await wait(700);
      replaceCaptionsRegion(doc);
      await wait(REGION_POLL_MS + 300);
      addCaptionItem(doc, 'You', 'An invented last word.');
      await wait(1_000);
      observer.stop();
      return events;
    }
    const without = await scripted(false);
    expect(without.length).toBeGreaterThan(4);
    expect(await scripted(true)).toEqual(without);
  });
});
