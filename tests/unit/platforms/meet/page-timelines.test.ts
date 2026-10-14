// T098 (retest 2026-10-08): every timeline fixture replayed as page changes on the real-structure Meet snapshot, through
// the real caption observer, then the attribution rules. The timeline suite (tests/unit/core/speakers/timelines.test.ts)
// feeds caption activity straight to the rules; this one checks that what Meet's page does — a turn's item appearing,
// then changing while older lines drop off — reaches the rules as that activity. A caption's observedAtMs are the
// times Meet changed that turn's item on the page.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionActivity } from '@/core/platform/adapter';
import { labelFields, speakerRuns } from '@/core/speakers/attribution';
import { CaptionTurnTracker } from '@/core/speakers/caption-turns';
import { observeCaptions } from '@/platforms/meet/caption-observer';
import { addCaptionItem, appendCaptionText, loadMeetSnapshot } from '../../../support/meet-snapshot';
import { expectedPieces, loadTimeline, type Timeline } from '../../../support/timeline';

const DIR = join(import.meta.dirname, '../../../fixtures/meet/timelines');
const NAMES = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'format-example.json')
  .map((f) => f.replace(/\.json$/, ''));

/** The fixtures modelled on the real call of 2026-10-08 (T098). */
const RETEST = [
  'long-monologue-pauses',
  'rewritten-items',
  'dropped-older-text',
  'monologue-caption-lag-2s',
  'uncaptioned-gap',
];

const T0 = 1_760_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

/** Plays the timeline's caption changes on a real-structure page and returns what the observer reported. */
async function replay(t: Timeline): Promise<CaptionActivity[]> {
  vi.setSystemTime(T0);
  const doc = loadMeetSnapshot('real-dom-captions-on');
  for (const item of doc.querySelectorAll('[role="region"][aria-label="Captions"] > .nMcdL')) item.remove();
  const events: CaptionActivity[] = [];
  const observer = observeCaptions({ doc, pageId: 'pg', onActivity: (a) => void events.push(a) });
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
    // A long turn's oldest line drops off the page as new ones arrive.
    const body = item.querySelector('.ygicle')!;
    if (body.childNodes.length > 4) body.firstChild!.remove();
  }
  await vi.advanceTimersByTimeAsync(1000);
  observer.stop();
  // The fixture says whether its self word is recognised (e.g. an unfamiliar UI language); the page keeps that.
  const selfOf = new Map(t.captions.map((c) => [c.speakerName, c.self]));
  return events.map((e) => ({ ...e, self: selfOf.get(e.speakerName) ?? null }));
}

interface Outcome {
  expected: string;
  got: string;
  confirmed: boolean;
}

async function run(t: Timeline): Promise<Outcome[]> {
  const tracker = new CaptionTurnTracker(T0);
  for (const a of await replay(t)) tracker.add(a);
  // One outcome per piece: lines are split at speaker changes (real call 2026-10-09, FR-027).
  return t.segments.flatMap((s) => {
    const want = expectedPieces(t, s.id);
    const runs = speakerRuns(s, tracker.all());
    return Array.from({ length: Math.max(want.length, runs.length) }, (_, i) => {
      const r = runs[i];
      const fields = r ? labelFields(r.attribution, t.userName) : null;
      return {
        expected: want[i] ? `${want[i].label}×${want[i].words}` : '(none)',
        got: fields && r ? `${fields.speakerLabel}×${r.to - r.from}` : '(none)',
        confirmed: fields?.labelSource === 'caption',
      };
    });
  });
}

describe('timeline fixtures replayed through the Meet page (retest 2026-10-08)', () => {
  it.each(NAMES)('%s: every line gets its expected label', async (name) => {
    const outcomes = await run(loadTimeline(name));
    expect(outcomes.map((o) => o.got)).toEqual(outcomes.map((o) => o.expected));
  });

  it('names lines on every fixture with no wrong confirmed name (SC-001, SC-002)', async () => {
    let total = 0;
    let correct = 0;
    let shouldName = 0;
    let named = 0;
    let wrongConfirmed = 0;
    const retest = { shouldName: 0, named: 0 };
    for (const name of NAMES) {
      const t = loadTimeline(name);
      for (const o of await run(t)) {
        total += 1;
        if (o.got === o.expected) correct += 1;
        if (!o.expected.startsWith('Others×')) {
          shouldName += 1;
          if (o.got === o.expected) named += 1;
          if (RETEST.includes(name)) {
            retest.shouldName += 1;
            if (o.got === o.expected) retest.named += 1;
          }
        }
        if (o.confirmed && o.got !== o.expected) wrongConfirmed += 1;
      }
    }
    console.info(
      `page replay: lines with the expected label ${correct}/${total}; named lines ${named}/${shouldName} (${((named / shouldName) * 100).toFixed(1)}%), of them on the retest fixtures ${retest.named}/${retest.shouldName}; wrong confirmed names ${wrongConfirmed}`,
    );
    expect(wrongConfirmed).toBe(0);
    expect(named / shouldName).toBeGreaterThanOrEqual(0.9);
  });
});
