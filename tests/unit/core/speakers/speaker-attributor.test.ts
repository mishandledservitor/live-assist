// T034: pending → settled → final attribution over time (research R6 "Pending and settling", FR-009), fake clock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeakerNameMapping } from '@/core/messaging/protocol';
import { ATTRIBUTION } from '@/core/speakers/attribution';
import { SpeakerAttributor, type LabelFields } from '@/core/speakers/speaker-attributor';
import type { SpeakerKey, SpeakerRename, TranscriptSegment } from '@/core/transcript/model';

const T0 = 1_760_000_000_000;
const { SETTLE_MS, RESOLVE_DEADLINE_MS } = ATTRIBUTION;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

function segment(seq: number, startMs: number, endMs: number): TranscriptSegment {
  const n = 4;
  const step = (endMs - startMs) / n;
  return {
    id: `m1:mixed:${seq}`,
    meetingId: 'm1',
    stream: 'mixed',
    seq,
    startMs,
    endMs,
    text: 'words',
    language: 'en',
    speakerLabel: 'Others',
    labelSource: 'fallback',
    captionName: null,
    captionSelf: false,
    labelOverride: null,
    words: Array.from({ length: n }, (_, i) => ({
      text: 'w',
      startMs: startMs + i * step,
      endMs: startMs + (i + 1) * step,
    })),
    timing: 'words',
    sessionId: 's',
    createdAt: T0,
    schemaVersion: 2,
  };
}

function setup(over: { mappings?: SpeakerNameMapping[]; renamed?: SpeakerKey[]; overridden?: string[] } = {}) {
  const updates: { id: string; fields: LabelFields }[] = [];
  const renames: { key: SpeakerKey; rename: SpeakerRename }[] = [];
  const splits: { id: string; pieces: TranscriptSegment[] }[] = [];
  const renamed = new Set<SpeakerKey>(over.renamed ?? []);
  const attributor = new SpeakerAttributor({
    startedAt: T0,
    now: () => Date.now(),
    userName: 'Mary Smith',
    mappings: over.mappings ?? [],
    hasRename: (k) => renamed.has(k),
    onUpdate: (id, fields) => void updates.push({ id, fields }),
    onRename: (key, rename) => {
      renamed.add(key);
      renames.push({ key, rename });
    },
    onSplit: (id, pieces) => void splits.push({ id, pieces }),
    isOverridden: (id) => (over.overridden ?? []).includes(id),
  });
  /** Caption activity for a turn, at meeting time `atMs` (the clock is moved there first if it is behind). */
  const caption = async (turnKey: string, speakerName: string, atMs: number, self: boolean | null = null) => {
    const wait = T0 + atMs - Date.now();
    if (wait > 0) await vi.advanceTimersByTimeAsync(wait);
    attributor.caption({ turnKey, speakerName, self, observedAt: T0 + atMs });
  };
  const at = async (meetingMs: number) => vi.advanceTimersByTimeAsync(T0 + meetingMs - Date.now());
  return { attributor, updates, renames, splits, caption, at };
}

describe('SpeakerAttributor', () => {
  it('a new segment is pending (shown as Others) and not resolved before end + SETTLE_MS', async () => {
    const { attributor, updates, caption, at } = setup();
    await caption('p:1', 'Emma Jones', 1400);
    await caption('p:1', 'Emma Jones', 3300);
    attributor.add(segment(0, 1000, 3000));
    expect(attributor.state('m1:mixed:0')).toBe('pending');
    await at(3000 + SETTLE_MS - 1);
    expect(updates).toEqual([]);
    await at(3000 + SETTLE_MS);
    expect(updates).toEqual([
      {
        id: 'm1:mixed:0',
        fields: { speakerLabel: 'Emma Jones', labelSource: 'caption', captionName: 'Emma Jones', captionSelf: false },
      },
    ]);
    expect(attributor.state('m1:mixed:0')).toBe('pending');
  });

  it('a segment whose settle time has already passed is resolved at once', async () => {
    const { attributor, updates, caption, at } = setup();
    await caption('p:1', 'Emma Jones', 1400);
    await caption('p:1', 'Emma Jones', 3300);
    await at(3000 + SETTLE_MS + 2000);
    attributor.add(segment(0, 1000, 3000));
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toHaveLength(1);
  });

  it('caption activity touching the window before end + RESOLVE_DEADLINE_MS re-resolves it', async () => {
    const { attributor, updates, caption, at } = setup();
    attributor.add(segment(0, 1000, 3000));
    await caption('p:1', 'Emma Jones', 1400);
    await at(3000 + SETTLE_MS);
    expect(updates).toEqual([]); // 1400 alone covers only part of it → still Others
    await caption('p:1', 'Emma Jones', 3300); // a late caption event extends the turn
    expect(updates.map((u) => u.fields.speakerLabel)).toEqual(['Emma Jones']);
  });

  it('only reports changes: re-resolving to the same label sends nothing', async () => {
    const { attributor, updates, caption, at } = setup();
    await caption('p:1', 'Emma Jones', 1400);
    await caption('p:1', 'Emma Jones', 3300);
    attributor.add(segment(0, 1000, 3000));
    await at(3000 + SETTLE_MS);
    await caption('p:1', 'Emma Jones', 3400);
    expect(updates).toHaveLength(1);
  });

  it('after end + RESOLVE_DEADLINE_MS the segment is final and captions no longer change it', async () => {
    const { attributor, updates, caption, at } = setup();
    attributor.add(segment(0, 1000, 3000));
    await at(3000 + RESOLVE_DEADLINE_MS);
    expect(attributor.state('m1:mixed:0')).toBe('final');
    await caption('p:9', 'Emma Jones', 1400);
    await caption('p:9', 'Emma Jones', 3300);
    expect(updates).toEqual([]);
  });

  it('finish() (meeting end) resolves every pending segment once and finalises it', async () => {
    const { attributor, updates, caption } = setup();
    await caption('p:1', 'Emma Jones', 1400);
    await caption('p:1', 'Emma Jones', 3300);
    attributor.add(segment(0, 1000, 3000));
    attributor.finish();
    expect(updates.map((u) => u.fields.speakerLabel)).toEqual(['Emma Jones']);
    expect(attributor.state('m1:mixed:0')).toBe('final');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(updates).toHaveLength(1);
  });

  it("a segment under the user's own caption turn gets the meeting's user name (FR-007)", async () => {
    const { attributor, updates, caption, at } = setup();
    await caption('p:1', 'You', 1400, true);
    await caption('p:1', 'You', 3300, true);
    attributor.add(segment(0, 1000, 3000));
    await at(3000 + SETTLE_MS);
    expect(updates[0]?.fields).toEqual({
      speakerLabel: 'Mary Smith',
      labelSource: 'caption',
      captionName: 'You',
      captionSelf: true,
    });
  });

  it('with no caption turns at all every segment stays Others', async () => {
    const { attributor, updates } = setup();
    attributor.add(segment(0, 1000, 3000));
    attributor.add(segment(1, 4000, 6000));
    await vi.advanceTimersByTimeAsync(30_000);
    attributor.finish();
    expect(updates).toEqual([]);
  });

  it('a named segment that later loses its dominance goes back to Others', async () => {
    const { attributor, updates, caption, at } = setup();
    await caption('p:1', 'Emma Jones', 1400);
    await caption('p:1', 'Emma Jones', 3300);
    attributor.add(segment(0, 1000, 3000));
    await at(3000 + SETTLE_MS);
    await caption('p:2', 'Tom Brown', 2400); // a second speaker turns out to overlap it
    await caption('p:2', 'Tom Brown', 6200);
    // Tom's window [900, 6700] covers all of it as well → 50/50 → Others.
    expect(updates.map((u) => u.fields.speakerLabel)).toEqual(['Emma Jones', 'Others']);
    expect(updates[1]?.fields.labelSource).toBe('fallback');
  });

  describe('remembered names (FR-022, research R9)', () => {
    const mapping = { captionName: 'Emma  Jones', displayName: 'Emma', updatedAt: 1 };

    it('a mapping becomes a remembered rename the first time its caption key resolves', async () => {
      const { attributor, renames, caption, at } = setup({ mappings: [mapping] });
      await caption('p:1', 'Emma Jones', 1400);
      await caption('p:1', 'Emma Jones', 3300);
      attributor.add(segment(0, 1000, 3000));
      attributor.add(segment(1, 1100, 3100));
      await at(3100 + SETTLE_MS);
      expect(renames).toEqual([{ key: 'caption:emma jones', rename: { name: 'Emma', origin: 'remembered' } }]);
    });

    it('never overrides an existing meeting rename', async () => {
      const { attributor, renames, caption, at } = setup({ mappings: [mapping], renamed: ['caption:emma jones'] });
      await caption('p:1', 'Emma Jones', 1400);
      await caption('p:1', 'Emma Jones', 3300);
      attributor.add(segment(0, 1000, 3000));
      await at(3000 + SETTLE_MS);
      expect(renames).toEqual([]);
    });

    it("is never applied to the user's own lines", async () => {
      const { attributor, renames, caption, at } = setup({
        mappings: [{ captionName: 'You', displayName: 'Someone else', updatedAt: 1 }],
      });
      await caption('p:1', 'You', 1400, true);
      await caption('p:1', 'You', 3300, true);
      attributor.add(segment(0, 1000, 3000));
      await at(3000 + SETTLE_MS);
      expect(renames).toEqual([]);
    });
  });

  it('dispose() stops every timer', async () => {
    const { attributor, updates, caption } = setup();
    await caption('p:1', 'Emma Jones', 1400);
    await caption('p:1', 'Emma Jones', 3300);
    attributor.add(segment(0, 1000, 3000));
    attributor.dispose();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(updates).toEqual([]);
  });
});

// T110 (real trace 2026-10-08, design decision 37): a line stored with labelPending shows "…" until it settles.
describe('SpeakerAttributor: the pending placeholder', () => {
  const pending = (seq: number, startMs: number, endMs: number) => ({
    ...segment(seq, startMs, endMs),
    labelPending: true,
  });
  const emma = { speakerLabel: 'Emma Jones', labelSource: 'caption', captionName: 'Emma Jones', captionSelf: false };
  const others = { speakerLabel: 'Others', labelSource: 'fallback', captionName: null, captionSelf: false };

  it('settles 6 s after the line ends (covers the 4.7 s seen on the real trace)', () => {
    expect(SETTLE_MS).toBe(6000);
  });

  it('clears the placeholder at the first resolution even when the line stays Others', async () => {
    const { attributor, updates, at } = setup();
    attributor.add(pending(0, 1000, 3000));
    await at(3000 + SETTLE_MS - 1);
    expect(updates).toEqual([]);
    await at(3000 + SETTLE_MS);
    expect(updates).toEqual([{ id: 'm1:mixed:0', fields: { ...others, labelPending: false } }]);
  });

  it('clears it together with the name when the line is named', async () => {
    const { attributor, updates, caption, at } = setup();
    await caption('p:1', 'Emma Jones', 1400);
    await caption('p:1', 'Emma Jones', 3300);
    attributor.add(pending(0, 1000, 3000));
    await at(3000 + SETTLE_MS);
    expect(updates.map((u) => u.fields)).toEqual([{ ...emma, labelPending: false }]);
  });

  it('a later change before the deadline carries no placeholder field', async () => {
    const { attributor, updates, caption, at } = setup();
    attributor.add(pending(0, 1000, 3000));
    await at(3000 + SETTLE_MS);
    await caption('p:1', 'Emma Jones', 1400);
    await caption('p:1', 'Emma Jones', 3300);
    expect(updates.map((u) => u.fields)).toEqual([{ ...others, labelPending: false }, emma]);
  });

  it('meeting end clears it on lines that have not settled yet', async () => {
    const { attributor, updates, at } = setup();
    attributor.add(pending(0, 1000, 3000));
    await at(4000);
    attributor.finish();
    expect(updates.map((u) => u.fields)).toEqual([{ ...others, labelPending: false }]);
  });
});

// T119 (real call 2026-10-09, FR-027): a line spoken by two people is split when it settles.
describe('SpeakerAttributor: splitting at a speaker change', () => {
  const others = { speakerLabel: 'Others', labelSource: 'fallback', captionName: null, captionSelf: false };
  /** Emma speaks 1000–4500, Tom 5000–9000, one committed line of 500 ms words. */
  const handover = (): TranscriptSegment => {
    const words = [
      ...Array.from({ length: 7 }, (_, i) => ({ text: `a${i}`, startMs: 1000 + i * 500, endMs: 1500 + i * 500 })),
      ...Array.from({ length: 8 }, (_, i) => ({ text: `r${i}`, startMs: 5000 + i * 500, endMs: 5500 + i * 500 })),
    ];
    return {
      ...segment(0, 1000, 9000),
      text: words.map((w) => w.text).join(' '),
      words,
      labelPending: true,
    };
  };
  const captions = async (caption: ReturnType<typeof setup>['caption']) => {
    for (let at = 1800; at <= 5000; at += 400) await caption('p:1', 'Emma Jones', at);
    for (let at = 5800; at <= 9800; at += 400) await caption('p:2', 'Tom Brown', at);
  };

  it('at settle the line is reported as pieces with their own labels, the first on the original id', async () => {
    const { attributor, updates, splits, caption, at } = setup();
    await captions(caption);
    attributor.add(handover());
    await at(9000 + SETTLE_MS - 1);
    expect(splits).toEqual([]);
    await at(9000 + SETTLE_MS);
    expect(updates).toEqual([]);
    expect(splits).toHaveLength(1);
    const { id, pieces } = splits[0]!;
    expect(id).toBe('m1:mixed:0');
    expect(pieces.map((p) => [p.id, p.speakerLabel, p.labelSource, p.text, p.labelPending])).toEqual([
      ['m1:mixed:0', 'Emma Jones', 'caption', 'a0 a1 a2', false],
      ['m1:mixed:0.w3', 'Others', 'fallback', 'a3 a4 a5 a6', false],
      ['m1:mixed:0.w7', 'Tom Brown', 'caption', 'r0 r1 r2 r3 r4 r5 r6 r7', false],
    ]);
  });

  it('pieces stay pending until the original deadline, then are final', async () => {
    const { attributor, caption, at } = setup();
    await captions(caption);
    attributor.add(handover());
    await at(9000 + SETTLE_MS);
    expect(attributor.state('m1:mixed:0.w7')).toBe('pending');
    expect(attributor.state('m1:mixed:0')).toBe('pending');
    await at(9000 + RESOLVE_DEADLINE_MS);
    expect(attributor.state('m1:mixed:0.w7')).toBe('final');
    expect(attributor.state('m1:mixed:0')).toBe('final');
  });

  it('a piece split off as "Others" stays "Others" on later captions (it never borrows a neighbour\'s name)', async () => {
    const { attributor, updates, caption, at } = setup();
    await captions(caption);
    attributor.add(handover());
    await at(9000 + SETTLE_MS);
    await caption('p:2', 'Tom Brown', 9000 + SETTLE_MS + 200);
    await caption('p:1', 'Emma Jones', 9000 + SETTLE_MS + 400);
    expect(updates.filter((u) => u.id === 'm1:mixed:0.w3')).toEqual([]);
  });

  it('a line with a single-line override is not split; holding two speakers it resolves to Others', async () => {
    const { attributor, updates, splits, caption, at } = setup({ overridden: ['m1:mixed:0'] });
    await captions(caption);
    attributor.add(handover());
    await at(9000 + SETTLE_MS);
    expect(splits).toEqual([]);
    expect(updates).toEqual([{ id: 'm1:mixed:0', fields: { ...others, labelPending: false } }]);
  });

  it('meeting end splits a line that has not settled yet', async () => {
    const { attributor, splits, caption } = setup();
    await captions(caption);
    attributor.add(handover());
    attributor.finish();
    expect(splits.map((s) => s.pieces.length)).toEqual([3]);
  });
});
