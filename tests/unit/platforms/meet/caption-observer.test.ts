// T023: caption turns from the captions region — speaker names and timing only, never the caption text (research R5).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionActivity } from '@/core/platform/adapter';
import { observeCaptions, REGION_POLL_MS, THROTTLE_MS, TURN_CLOSE_MS } from '@/platforms/meet/caption-observer';
import { addCaptionItem, appendCaptionText, loadMeetSnapshot } from '../../../support/meet-snapshot';

const T0 = 1_760_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

/** jsdom delivers MutationObserver records in a microtask; this lets them through without moving the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

function setup(snapshot = 'in-call-captions-on') {
  const doc = loadMeetSnapshot(snapshot);
  const events: CaptionActivity[] = [];
  const observer = observeCaptions({ doc, pageId: 'pg1', onActivity: (a) => void events.push(a) });
  return { doc, events, observer };
}

describe('observeCaptions', () => {
  it('a new caption item → one activity with a new turn key (prefixed by pageId) and the speaker name', async () => {
    const { doc, events } = setup();
    addCaptionItem(doc, '  Emma   Jones ', 'hello');
    await flush();
    expect(events).toEqual([
      { turnKey: expect.stringMatching(/^pg1:/) as string, speakerName: 'Emma Jones', self: null, observedAt: T0 },
    ]);
    addCaptionItem(doc, 'Tom Brown');
    await flush();
    expect(events).toHaveLength(2);
    expect(events[1]!.turnKey).not.toBe(events[0]!.turnKey);
  });

  it('marks "You" and "Εσύ" as self, and anything else as unknown (null)', async () => {
    const { doc, events } = setup();
    addCaptionItem(doc, 'You');
    addCaptionItem(doc, 'Εσύ');
    addCaptionItem(doc, 'Tom Brown');
    await flush();
    expect(events.map((e) => [e.speakerName, e.self])).toEqual([
      ['You', true],
      ['Εσύ', true],
      ['Tom Brown', null],
    ]);
  });

  it('does not report the turns already on the page when it starts', async () => {
    const { events } = setup();
    await flush();
    expect(events).toEqual([]);
  });

  it(`throttles text changes in the latest item to one per ${THROTTLE_MS} ms and always sends the trailing one`, async () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const events: CaptionActivity[] = [];
    const sentAt: number[] = [];
    observeCaptions({
      doc,
      pageId: 'pg1',
      onActivity: (a) => {
        events.push(a);
        sentAt.push(Date.now() - T0);
      },
    });
    const item = addCaptionItem(doc, 'Emma Jones');
    await flush();
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(50);
      appendCaptionText(item); // 10 changes, 50 ms apart, the last at 500 ms
    }
    await vi.advanceTimersByTimeAsync(THROTTLE_MS);
    for (let i = 1; i < sentAt.length; i++) expect(sentAt[i]! - sentAt[i - 1]!).toBeGreaterThanOrEqual(THROTTLE_MS);
    expect(events.length).toBeGreaterThanOrEqual(2);
    // The trailing event carries the time of the last change.
    expect(events.at(-1)!.observedAt - T0).toBe(500);
    expect(new Set(events.map((e) => e.turnKey)).size).toBe(1);
  });

  it('ignores changes to an older item of the same speaker (Meet correcting itself)', async () => {
    const { doc, events } = setup();
    const first = addCaptionItem(doc, 'Emma Jones');
    await flush();
    addCaptionItem(doc, 'Emma Jones');
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    const n = events.length;
    appendCaptionText(first);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events).toHaveLength(n);
  });

  it('still follows an older item of a different speaker', async () => {
    const { doc, events } = setup();
    const emma = addCaptionItem(doc, 'Emma Jones');
    await flush();
    addCaptionItem(doc, 'Tom Brown');
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    appendCaptionText(emma);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.at(-1)?.speakerName).toBe('Emma Jones');
  });

  it(`an older item unchanged for ${TURN_CLOSE_MS} ms produces no more events (Meet correcting itself)`, async () => {
    const { doc, events } = setup();
    const emma = addCaptionItem(doc, 'Emma Jones');
    await flush();
    addCaptionItem(doc, 'Tom Brown');
    await flush();
    await vi.advanceTimersByTimeAsync(TURN_CLOSE_MS + 100);
    const n = events.length;
    appendCaptionText(emma);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events).toHaveLength(n);
  });

  it('never puts caption text in what it emits', async () => {
    const { doc, events } = setup();
    const existing = [...doc.querySelectorAll('.ygicle')].map((el) => el.textContent ?? '');
    const item = addCaptionItem(doc, 'Emma Jones', 'Secret plan for Thursday');
    appendCaptionText(item, ' and the budget');
    await vi.advanceTimersByTimeAsync(1000);
    const out = JSON.stringify(events);
    for (const text of [...existing, 'Secret plan', 'budget']) expect(out).not.toContain(text.trim());
    for (const e of events) expect(Object.keys(e).sort()).toEqual(['observedAt', 'self', 'speakerName', 'turnKey']);
  });

  it("never reads the text element's textContent", async () => {
    const doc = loadMeetSnapshot('in-call-captions-on');
    const reads = { n: 0 };
    const spyOn = (el: Element) =>
      Object.defineProperty(el, 'textContent', {
        configurable: true,
        get: () => {
          reads.n += 1;
          return 'caption text';
        },
      });
    for (const el of doc.querySelectorAll('.ygicle')) spyOn(el);
    observeCaptions({ doc, pageId: 'pg1', onActivity: () => undefined });
    const item = addCaptionItem(doc, 'Emma Jones', 'words');
    spyOn(item.querySelector('.ygicle')!);
    await flush();
    appendCaptionText(item);
    await vi.advanceTimersByTimeAsync(1000);
    expect(reads.n).toBe(0);
  });

  it('finds the region once it appears, and stop() ends reporting', async () => {
    const doc = loadMeetSnapshot('lobby');
    const events: CaptionActivity[] = [];
    const observer = observeCaptions({ doc, pageId: 'pg1', onActivity: (a) => void events.push(a) });
    doc.body.innerHTML = loadMeetSnapshot('in-call-captions-off').body.innerHTML;
    await vi.advanceTimersByTimeAsync(1500);
    addCaptionItem(doc, 'Emma Jones');
    await flush();
    expect(events).toHaveLength(1);
    observer.stop();
    addCaptionItem(doc, 'Tom Brown');
    await vi.advanceTimersByTimeAsync(1500);
    expect(events).toHaveLength(1);
  });
});

// T096 (retest 2026-10-08): on the real page structure (research R13), a speaker's ongoing turn keeps counting for as
// long as Meet keeps changing it, and re-rendered nodes never pass history off as new speech (FR-025).
describe('observeCaptions on the real page structure (retest 2026-10-08)', () => {
  const REAL = 'real-dom-captions-on';
  const textOf = (item: Element) => item.querySelector('.ygicle')!;
  const region = (doc: Document) => doc.querySelector<HTMLElement>('[role="region"][aria-label="Captions"]')!;
  const turnsOf = (doc: Document) => [...region(doc).querySelectorAll<HTMLElement>(':scope > .nMcdL')];

  it(`the newest item keeps reporting after a pause longer than ${TURN_CLOSE_MS} ms (a monologue)`, async () => {
    const { doc, events } = setup(REAL);
    const item = addCaptionItem(doc, 'Emma Jones', 'first words');
    await flush();
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(500);
      appendCaptionText(item);
    }
    await vi.advanceTimersByTimeAsync(TURN_CLOSE_MS + 2000); // the speaker pauses; nobody else talks
    appendCaptionText(item); // …and carries on in the same item
    await vi.advanceTimersByTimeAsync(THROTTLE_MS);
    const last = events.at(-1)!;
    expect(last.speakerName).toBe('Emma Jones');
    expect(last.observedAt - T0).toBe(2000 + TURN_CLOSE_MS + 2000);
  });

  it('older lines dropping off the item count as activity', async () => {
    const { doc, events } = setup(REAL);
    const item = addCaptionItem(doc, 'Emma Jones', 'line one');
    appendCaptionText(item, ' line two');
    await flush();
    await vi.advanceTimersByTimeAsync(TURN_CLOSE_MS + 1000);
    textOf(item).firstChild!.remove(); // Meet drops the oldest line of a long turn
    await vi.advanceTimersByTimeAsync(THROTTLE_MS);
    expect(events.at(-1)!.observedAt - T0).toBe(TURN_CLOSE_MS + 1000);
  });

  it('in-place text edits (character data only) count as activity', async () => {
    const { doc, events } = setup(REAL);
    const item = addCaptionItem(doc, 'Emma Jones', 'draft');
    await flush();
    await vi.advanceTimersByTimeAsync(TURN_CLOSE_MS + 1000);
    (textOf(item).firstChild as Text).data = 'rewritten';
    await vi.advanceTimersByTimeAsync(THROTTLE_MS);
    expect(events.at(-1)!.observedAt - T0).toBe(TURN_CLOSE_MS + 1000);
  });

  it('a re-rendered region reports none of the turns already on the page, then follows the new nodes', async () => {
    const { doc, events } = setup(REAL);
    addCaptionItem(doc, 'Tom Brown', 'earlier');
    addCaptionItem(doc, 'Emma Jones', 'now');
    await vi.advanceTimersByTimeAsync(1000);
    const before = events.length;
    // Meet re-renders the whole captions band (e.g. when a side panel opens): new region, new item nodes.
    const old = region(doc);
    const copy = old.cloneNode(true) as HTMLElement;
    old.replaceWith(copy);
    await vi.advanceTimersByTimeAsync(REGION_POLL_MS + 100);
    expect(events).toHaveLength(before);
    appendCaptionText(turnsOf(doc).at(-1)!);
    await vi.advanceTimersByTimeAsync(THROTTLE_MS);
    expect(events).toHaveLength(before + 1);
    expect(events.at(-1)!.speakerName).toBe('Emma Jones');
  });

  it('items re-created in place report nothing until they change', async () => {
    const { doc, events } = setup(REAL);
    addCaptionItem(doc, 'Tom Brown', 'earlier');
    addCaptionItem(doc, 'Emma Jones', 'now');
    await vi.advanceTimersByTimeAsync(1000);
    const before = events.length;
    // Same region node, every item node replaced by a fresh copy (a re-render inside the band).
    const r = region(doc);
    for (const item of turnsOf(doc)) item.replaceWith(item.cloneNode(true));
    await flush();
    expect(r.isConnected).toBe(true);
    expect(events).toHaveLength(before);
    appendCaptionText(turnsOf(doc).at(-1)!);
    await vi.advanceTimersByTimeAsync(THROTTLE_MS);
    expect(events.map((e) => e.speakerName).slice(before)).toEqual(['Emma Jones']);
  });

  it('the newest item, re-created alone, is not reported as a new turn until it changes', async () => {
    const { doc, events } = setup(REAL);
    addCaptionItem(doc, 'Emma Jones', 'now');
    await vi.advanceTimersByTimeAsync(1000);
    const before = events.length;
    const last = turnsOf(doc).at(-1)!;
    last.replaceWith(last.cloneNode(true));
    await flush();
    expect(events).toHaveLength(before);
  });

  it('a turn-shaped region added before the captions region does not take the observer away', async () => {
    const { doc, events } = setup(REAL);
    await flush();
    // A side panel (e.g. People) whose rows look like caption turns: a header with avatar and name, then more.
    const panel = doc.createElement('div');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'People');
    panel.innerHTML =
      '<div><div><img data-iml="7001" src="https://lh3.googleusercontent.com/a/p1=s40" alt=""><span>John Doe</span></div><div>Host</div></div>';
    doc.body.prepend(panel);
    await vi.advanceTimersByTimeAsync(REGION_POLL_MS * 2);
    addCaptionItem(doc, 'Emma Jones', 'still captioned');
    await flush();
    expect(events.map((e) => e.speakerName)).toEqual(['Emma Jones']);
  });
});
