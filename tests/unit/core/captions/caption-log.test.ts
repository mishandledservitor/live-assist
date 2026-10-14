// 013 T011 (FR-001–FR-003, FR-009; data-model.md "Caption log"; contracts/files-and-storage.md): the caption log turns
// whole-text events into stored rows, writes the changed ones every CAPTION_STORE_FLUSH_MS, and never lets a write
// overlap another. Every sentence here is invented.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTION_STORE_FLUSH_MS, CaptionLog, MAX_CAPTION_TURNS } from '@/core/captions/caption-log';
import type { StoredCaptionTurn } from '@/core/captions/model';
import type { Logger } from '@/core/log';
import type { CaptionText } from '@/core/platform/adapter';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK, expectNoMarker } from '../../../support/caption-marker';

const T0 = 1_760_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

type Put = (turns: StoredCaptionTurn[]) => Promise<boolean>;

function setup(putImpl?: Put) {
  const puts: StoredCaptionTurn[][] = [];
  const speakers: string[] = [];
  const logged: unknown[][] = [];
  let kept = 0;
  const log: Logger = {
    error: (...a) => void logged.push(a),
    warn: (...a) => void logged.push(a),
    info: (...a) => void logged.push(a),
  };
  const impl = { put: putImpl ?? (() => Promise.resolve(true)) };
  const captionLog = new CaptionLog({
    meetingId: 'm1',
    startedAt: T0,
    put: (turns) => {
      // A copy: what the log passed at that moment.
      puts.push(turns.map((t) => ({ ...t })));
      return impl.put(turns);
    },
    onSpeaker: (name) => void speakers.push(name),
    onKept: () => void (kept += 1),
    log,
  });
  const event = (turnKey: string, text: string, over: Partial<CaptionText> = {}): CaptionText => ({
    turnKey,
    speakerName: 'Sarah Brown',
    self: null,
    firstSeenAt: Date.now(),
    text,
    ...over,
  });
  return { captionLog, puts, speakers, logged, impl, event, kept: () => kept };
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('CaptionLog', () => {
  it('has the contract constants', () => {
    expect(CAPTION_STORE_FLUSH_MS).toBe(2000);
    expect(MAX_CAPTION_TURNS).toBe(20_000);
  });

  it('gives new turns seq 1, 2, … in arrival order and a start on the meeting clock', async () => {
    const { captionLog, puts, event } = setup();
    captionLog.update(event('p:7', 'Good morning.', { firstSeenAt: T0 + 4_200 }));
    captionLog.update(event('p:3', 'Yes, it is up.', { speakerName: 'You', self: true, firstSeenAt: T0 + 11_000 }));
    captionLog.update(event('p:9', 'Before the start.', { firstSeenAt: T0 - 800 }));
    await captionLog.flush();
    expect(puts).toEqual([
      [
        {
          meetingId: 'm1',
          seq: 1,
          startMs: 4_200,
          speakerName: 'Sarah Brown',
          self: false,
          text: 'Good morning.',
          schemaVersion: 1,
        },
        {
          meetingId: 'm1',
          seq: 2,
          startMs: 11_000,
          speakerName: 'You',
          self: true,
          text: 'Yes, it is up.',
          schemaVersion: 1,
        },
        {
          meetingId: 'm1',
          seq: 3,
          startMs: 0,
          speakerName: 'Sarah Brown',
          self: false,
          text: 'Before the start.',
          schemaVersion: 1,
        },
      ],
    ]);
  });

  it('does not create a turn while its text is empty', async () => {
    const { captionLog, puts, event } = setup();
    captionLog.update(event('p:1', ''));
    await tick(CAPTION_STORE_FLUSH_MS * 2);
    expect(puts).toEqual([]);
    captionLog.update(event('p:2', 'Second to appear, first with words.'));
    captionLog.update(event('p:1', 'Now it has words.'));
    await captionLog.flush();
    expect(puts[0]?.map((t) => [t.seq, t.text])).toEqual([
      [1, 'Second to appear, first with words.'],
      [2, 'Now it has words.'],
    ]);
  });

  it("writes a known turn's changed text at the next flush, and unchanged text not again", async () => {
    const { captionLog, puts, event } = setup();
    captionLog.update(event('p:1', 'We ship'));
    captionLog.update(event('p:2', 'Agreed.', { speakerName: 'Bob Doe' }));
    await captionLog.flush();
    captionLog.update(event('p:1', 'We ship on Tuesday.', { firstSeenAt: T0 + 9_999 }));
    captionLog.update(event('p:2', 'Agreed.', { speakerName: 'Bob Doe' }));
    await captionLog.flush();
    expect(puts[1]).toEqual([
      {
        meetingId: 'm1',
        seq: 1,
        startMs: 0,
        speakerName: 'Sarah Brown',
        self: false,
        text: 'We ship on Tuesday.',
        schemaVersion: 1,
      },
    ]);
    await captionLog.flush();
    await tick(CAPTION_STORE_FLUSH_MS * 3);
    expect(puts).toHaveLength(2);
  });

  it('an empty text for a known turn changes nothing', async () => {
    const { captionLog, puts, event } = setup();
    captionLog.update(event('p:1', 'Kept as it was.'));
    await captionLog.flush();
    captionLog.update(event('p:1', ''));
    await captionLog.flush();
    await tick(CAPTION_STORE_FLUSH_MS * 2);
    expect(puts).toHaveLength(1);
  });

  it('stores self: null as false and keeps the first name and self of a turn', async () => {
    const { captionLog, puts, event } = setup();
    captionLog.update(event('p:1', 'One', { self: null }));
    captionLog.update(event('p:2', 'Two', { self: false }));
    captionLog.update(event('p:3', 'Three', { self: true, speakerName: 'You' }));
    await captionLog.flush();
    expect(puts[0]?.map((t) => t.self)).toEqual([false, false, true]);
  });

  it(`writes nothing until ${CAPTION_STORE_FLUSH_MS} ms have passed, then one put with every changed turn`, async () => {
    const { captionLog, puts, event } = setup();
    captionLog.update(event('p:1', 'First'));
    await tick(700);
    captionLog.update(event('p:2', 'Second', { speakerName: 'Bob Doe' }));
    captionLog.update(event('p:1', 'First, longer.'));
    await tick(CAPTION_STORE_FLUSH_MS - 701);
    expect(puts).toEqual([]);
    await tick(1);
    expect(puts).toHaveLength(1);
    expect(puts[0]?.map((t) => t.text)).toEqual(['First, longer.', 'Second']);
    // Nothing dirty: no further write, however long it runs.
    await tick(CAPTION_STORE_FLUSH_MS * 5);
    expect(puts).toHaveLength(1);
    // A later change starts the next interval.
    captionLog.update(event('p:2', 'Second, longer.', { speakerName: 'Bob Doe' }));
    await tick(CAPTION_STORE_FLUSH_MS - 1);
    expect(puts).toHaveLength(1);
    await tick(1);
    expect(puts[1]?.map((t) => t.text)).toEqual(['Second, longer.']);
  });

  it('never overlaps two writes; a turn changed during a write goes into the next', async () => {
    let release: (ok: boolean) => void = () => undefined;
    let running = 0;
    let most = 0;
    const s = setup(() => {
      running += 1;
      most = Math.max(most, running);
      return new Promise<boolean>((resolve) => {
        release = (ok) => {
          running -= 1;
          resolve(ok);
        };
      });
    });
    s.captionLog.update(s.event('p:1', 'Slow'));
    await tick(CAPTION_STORE_FLUSH_MS);
    expect(s.puts).toHaveLength(1);
    // The store is still writing: changes pile up, timers pass, an explicit flush is asked for.
    s.captionLog.update(s.event('p:1', 'Slow write'));
    s.captionLog.update(s.event('p:2', 'Another turn'));
    const asked = s.captionLog.flush();
    await tick(CAPTION_STORE_FLUSH_MS * 3);
    expect(s.puts).toHaveLength(1);
    release(true);
    await tick(0);
    expect(s.puts).toHaveLength(2);
    expect(s.puts[1]?.map((t) => t.text)).toEqual(['Slow write', 'Another turn']);
    release(true);
    await asked;
    await tick(CAPTION_STORE_FLUSH_MS * 3);
    expect(s.puts).toHaveLength(2);
    expect(most).toBe(1);
  });

  it('a rejected put leaves the turns dirty and the next flush writes them', async () => {
    const s = setup();
    s.impl.put = () => Promise.reject(new Error('disk is busy'));
    s.captionLog.update(s.event('p:1', 'Not lost.'));
    await tick(CAPTION_STORE_FLUSH_MS);
    expect(s.puts).toHaveLength(1);
    expect(s.kept()).toBe(0);
    s.impl.put = () => Promise.resolve(true);
    s.captionLog.update(s.event('p:2', 'Arrived meanwhile.'));
    await tick(CAPTION_STORE_FLUSH_MS);
    expect(s.puts[1]?.map((t) => t.text)).toEqual(['Not lost.', 'Arrived meanwhile.']);
    expect(s.kept()).toBe(1);
    await tick(CAPTION_STORE_FLUSH_MS * 3);
    expect(s.puts).toHaveLength(2);
  });

  it('a rejected put is retried by the timer alone, without a new change', async () => {
    const s = setup();
    s.impl.put = () => Promise.reject(new Error('disk is busy'));
    s.captionLog.update(s.event('p:1', 'Not lost.'));
    await tick(CAPTION_STORE_FLUSH_MS);
    s.impl.put = () => Promise.resolve(true);
    await tick(CAPTION_STORE_FLUSH_MS);
    expect(s.puts).toHaveLength(2);
    expect(s.puts[1]?.map((t) => t.text)).toEqual(['Not lost.']);
  });

  it('a failing put logs nothing of the captions: no text, no name', async () => {
    const s = setup();
    s.impl.put = () => Promise.reject(new Error(`could not write "${CAPTION_MARKER}"`));
    s.captionLog.update(s.event('p:1', CAPTION_MARKER, { speakerName: 'Purple Heron' }));
    s.captionLog.update(s.event('p:2', CAPTION_MARKER_GREEK, { speakerName: 'Μοβ Ερωδιός' }));
    await tick(CAPTION_STORE_FLUSH_MS * 2);
    await s.captionLog.close();
    expect(s.logged.length).toBeGreaterThan(0);
    expectNoMarker(s.logged);
    expect(JSON.stringify(s.logged)).not.toContain('Purple Heron');
  });

  it('put resolving false closes the log: no further put', async () => {
    const s = setup(() => Promise.resolve(false));
    s.captionLog.update(s.event('p:1', 'The meeting has gone.'));
    await tick(CAPTION_STORE_FLUSH_MS);
    expect(s.puts).toHaveLength(1);
    s.captionLog.update(s.event('p:1', 'The meeting has gone. More.'));
    s.captionLog.update(s.event('p:2', 'A new turn.'));
    await tick(CAPTION_STORE_FLUSH_MS * 3);
    await s.captionLog.flush();
    await s.captionLog.close();
    expect(s.puts).toHaveLength(1);
    expect(s.kept()).toBe(0);
  });

  it('close() flushes once and later updates are ignored', async () => {
    const { captionLog, puts, event } = setup();
    captionLog.update(event('p:1', 'Last words before the end.'));
    await tick(500);
    await captionLog.close();
    expect(puts.map((p) => p.map((t) => t.text))).toEqual([['Last words before the end.']]);
    captionLog.update(event('p:1', 'Last words before the end. And after.'));
    captionLog.update(event('p:2', 'A turn after the end.'));
    await captionLog.flush();
    await captionLog.close();
    await tick(CAPTION_STORE_FLUSH_MS * 3);
    expect(puts).toHaveLength(1);
  });

  it('close() with nothing dirty writes nothing, and waits for a write under way', async () => {
    let release: (ok: boolean) => void = () => undefined;
    const s = setup(() => new Promise<boolean>((resolve) => (release = resolve)));
    await s.captionLog.close();
    expect(s.puts).toEqual([]);

    const t = setup(() => new Promise<boolean>((resolve) => (release = resolve)));
    t.captionLog.update(t.event('p:1', 'Being written.'));
    await tick(CAPTION_STORE_FLUSH_MS);
    let closed = false;
    const closing = t.captionLog.close().then(() => (closed = true));
    await tick(50);
    expect(closed).toBe(false);
    release(true);
    await closing;
    expect(t.puts).toHaveLength(1);
  });

  it('reports each distinct non-self caption name once, by normalised name, and never a self turn', () => {
    const { captionLog, speakers, event } = setup();
    captionLog.update(event('p:1', 'Hello.', { speakerName: 'Sarah Brown' }));
    captionLog.update(event('p:1', 'Hello there.', { speakerName: 'Sarah Brown' }));
    captionLog.update(event('p:2', 'Hi.', { speakerName: 'You', self: true }));
    captionLog.update(event('p:3', 'Again.', { speakerName: 'sarah  BROWN' }));
    captionLog.update(event('p:4', 'Good day.', { speakerName: 'Bob Doe', self: false }));
    captionLog.update(event('p:5', '', { speakerName: 'Silent Person' }));
    expect(speakers).toEqual(['Sarah Brown', 'Bob Doe']);
  });

  it('reports onKept once, after the first put that resolved true', async () => {
    const s = setup();
    s.captionLog.update(s.event('p:1', 'One.'));
    expect(s.kept()).toBe(0);
    await tick(CAPTION_STORE_FLUSH_MS);
    expect(s.kept()).toBe(1);
    s.captionLog.update(s.event('p:1', 'One. Two.'));
    await tick(CAPTION_STORE_FLUSH_MS);
    await s.captionLog.close();
    expect(s.puts).toHaveLength(2);
    expect(s.kept()).toBe(1);
  });

  it(`beyond ${MAX_CAPTION_TURNS} turns new ones are dropped and known ones still update`, async () => {
    const { captionLog, puts, event } = setup();
    for (let i = 1; i <= MAX_CAPTION_TURNS + 5; i += 1) captionLog.update(event(`p:${i}`, `Turn ${i}`));
    await captionLog.flush();
    expect(puts[0]).toHaveLength(MAX_CAPTION_TURNS);
    expect(puts[0]?.at(-1)).toMatchObject({ seq: MAX_CAPTION_TURNS, text: `Turn ${MAX_CAPTION_TURNS}` });
    captionLog.update(event(`p:${MAX_CAPTION_TURNS + 1}`, 'Dropped again.'));
    captionLog.update(event('p:17', 'Turn 17, corrected.'));
    await captionLog.flush();
    expect(puts[1]).toEqual([expect.objectContaining({ seq: 17, text: 'Turn 17, corrected.' })]);
  });

  it('works without the optional callbacks', async () => {
    const puts: StoredCaptionTurn[][] = [];
    const silent: Logger = { error: () => undefined, warn: () => undefined, info: () => undefined };
    const captionLog = new CaptionLog({
      meetingId: 'm2',
      startedAt: T0,
      put: (turns) => {
        puts.push(turns);
        return Promise.resolve(true);
      },
      log: silent,
    });
    captionLog.update({ turnKey: 'p:1', speakerName: 'Sarah Brown', self: null, firstSeenAt: T0 + 5, text: 'Fine.' });
    await captionLog.close();
    expect(puts[0]?.[0]).toMatchObject({ meetingId: 'm2', seq: 1, startMs: 5 });
  });
});
