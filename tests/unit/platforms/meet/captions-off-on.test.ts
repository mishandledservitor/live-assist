// 013 (FR-002, FR-004, FR-005; research R3 rule 2 and "Open risks" O7; flagged with the first build): the user turns
// Meet's captions off and on again mid-meeting, or switches Settings → Show Meet captions. Whatever Meet shows when
// capture attaches again is history or a turn kept earlier, never a new turn, so the captions file gets no line twice
// and none from before Start, and a kept line never loses its text. Timelines on a saved Meet page through the whole
// path: page agent → bridge messages (parsed as the offscreen document parses them) → adapter → caption log → the
// captions file. What a live Meet page really does when captions come back is not known (manual-check.md step 11);
// each case here is one thing it may do. Every name and sentence is invented.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptionLog } from '@/core/captions/caption-log';
import type { StoredCaptionTurn } from '@/core/captions/model';
import { captionsFile } from '@/core/export/captions-file';
import type { CaptionsState } from '@/core/platform/adapter';
import { BridgedMeetAdapter, type BridgePort } from '@/core/platform/meet-bridge-adapter';
import { CAPTION_TEXT_THROTTLE_MS, REGION_POLL_MS } from '@/platforms/meet/caption-observer';
import { createPageAgent, type PagePort } from '@/platforms/meet/page-agent';
import {
  addCaptionItem,
  appendCaptionText,
  loadMeetSnapshot,
  setCaptionsButton,
  setCaptionText,
} from '../../../support/meet-snapshot';
import { storedMeeting } from '../../../support/stored-meetings';

const T0 = 1_760_000_000_000;
const MEETING = '0b7a1c9e-1111-4222-8333-944455556666';
/** The three turns the saved page holds before Start. */
const BEFORE_START = [
  'Kickoff is at ten tomorrow.',
  "I'll post the notes afterwards.",
  'Can we move the review to Thursday',
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
/** Long enough for a change to be read on the page, sent, and written by the log. */
const settle = () => wait(CAPTION_TEXT_THROTTLE_MS + 2_500);

/** A Meet page with captions on and three earlier turns, a running meeting, and everything between them. */
async function meeting() {
  const doc = loadMeetSnapshot('in-call-captions-on');
  const toPage: ((m: unknown) => void)[] = [];
  const toOffscreen: ((m: unknown) => void)[] = [];
  let textMessages = 0;
  const pagePort: PagePort = {
    postMessage: (m) => {
      if ((m as { type?: string }).type === 'meet/caption-text') textMessages += 1;
      // A port carries a copy, never the object.
      for (const l of toOffscreen) l(structuredClone(m));
    },
    onMessage: { addListener: (l) => void toPage.push(l) },
    onDisconnect: { addListener: () => undefined },
    disconnect: () => undefined,
  };
  const offscreenPort: BridgePort = {
    postMessage: (m) => {
      for (const l of toPage) l(structuredClone(m));
    },
    onMessage: { addListener: (l) => void toOffscreen.push(l) },
    onDisconnect: { addListener: () => undefined },
  };
  let deliver: (port: BridgePort) => void = () => undefined;
  const adapter = new BridgedMeetAdapter({
    connect: (listener) => {
      deliver = listener;
      return () => undefined;
    },
    now: () => Date.now(),
  });
  if (!adapter.captions.supported) throw new Error('Meet supports captions');

  const rows = new Map<number, StoredCaptionTurn>();
  const log = new CaptionLog({
    meetingId: MEETING,
    startedAt: T0,
    put: (turns) => {
      for (const turn of turns) rows.set(turn.seq, turn);
      return Promise.resolve(true);
    },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  });
  const states: CaptionsState['state'][] = [];
  adapter.captions.subscribeState((s) => void states.push(s.state));
  adapter.captions.subscribeText((t) => log.update(t));
  await adapter.captions.enable();

  const agent = createPageAgent({ doc, connect: () => pagePort, pageId: 'pg1' });
  agent.attach(MEETING);
  deliver(offscreenPort);
  await wait(500);

  const region = () => doc.querySelector<HTMLElement>('[role="region"][aria-label="Captions"]');
  return {
    doc,
    agent,
    adapter,
    states,
    region,
    textMessages: () => textMessages,
    /** The captions file as a download would hold it now. */
    file: () =>
      captionsFile(storedMeeting({ startedAt: T0 }), [...rows.values()])
        .body.split('\n\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    /** The user presses Meet's captions button: the button flips and the band leaves the page. */
    captionsOff() {
      const band = region()!;
      const parent = band.parentElement!;
      setCaptionsButton(doc, false);
      band.remove();
      return { band, parent };
    },
  };
}

const MIKE = 'The harbour survey starts on Monday.';
const SELF = 'I can bring the tide tables.';

/** Two turns kept before captions go off: one by a colleague, one by the user. */
async function withTwoKept() {
  const m = await meeting();
  addCaptionItem(m.doc, 'Mike Smith', MIKE);
  await wait(4_000);
  addCaptionItem(m.doc, 'You', SELF);
  await settle();
  expect(m.file()).toEqual([`[00:00] Mike Smith: ${MIKE}`, `[00:04] Alex: ${SELF}`]);
  return m;
}

const expectNothingFromBeforeStart = (lines: string[]) => {
  for (const sentence of BEFORE_START) expect(lines.join('\n')).not.toContain(sentence);
};

describe('captions turned off and on again mid-meeting', () => {
  it('the band comes back showing the earlier turns again: no line twice, none from before Start, and a kept turn carries on', async () => {
    const m = await withTwoKept();
    const { band, parent } = m.captionsOff();
    await wait(60_000);
    expect(m.states.at(-1)).toBe('off-by-user');

    // Captions on again: Meet builds a new band and shows every earlier turn in it again, as new elements.
    const back = band.cloneNode(true) as HTMLElement;
    setCaptionsButton(m.doc, true);
    parent.append(back);
    await wait(REGION_POLL_MS * 2);
    await settle();
    expect(m.states.at(-1)).toBe('on');
    expect(m.file()).toEqual([`[00:00] Mike Smith: ${MIKE}`, `[00:04] Alex: ${SELF}`]);

    // A turn kept before goes on in its new element; a turn from before Start changes; someone new speaks.
    const [, , tom, mike] = [...back.querySelectorAll<HTMLElement>(':scope > .nMcdL')];
    appendCaptionText(mike!, ' Bring boots.');
    appendCaptionText(tom!, ', please.');
    addCaptionItem(m.doc, 'Tom Brown', 'The ferry leaves at nine.');
    await settle();
    const lines = m.file();
    expect(lines).toEqual([
      `[00:00] Mike Smith: ${MIKE} Bring boots.`,
      `[00:04] Alex: ${SELF}`,
      expect.stringMatching(/^\[01:\d\d\] Tom Brown: The ferry leaves at nine\.$/) as string,
    ]);
    expectNothingFromBeforeStart(lines);
  });

  it('the band comes back empty: the turns kept before stay as they were, and new turns are kept', async () => {
    const m = await withTwoKept();
    const { band, parent } = m.captionsOff();
    await wait(60_000);
    const back = band.cloneNode(false) as HTMLElement;
    setCaptionsButton(m.doc, true);
    parent.append(back);
    await wait(REGION_POLL_MS * 2);
    addCaptionItem(m.doc, 'Tom Brown', 'The ferry');
    await wait(400);
    setCaptionText(back.querySelector('.nMcdL')!, 'The ferry leaves at nine.');
    await settle();
    const lines = m.file();
    expect(lines).toEqual([
      `[00:00] Mike Smith: ${MIKE}`,
      `[00:04] Alex: ${SELF}`,
      expect.stringMatching(/^\[01:\d\d\] Tom Brown: The ferry leaves at nine\.$/) as string,
    ]);
    expectNothingFromBeforeStart(lines);
  });

  it('the band stays and is emptied: nothing is lost with the turns that left, and new turns are kept', async () => {
    const m = await withTwoKept();
    setCaptionsButton(m.doc, false);
    for (const item of [...m.region()!.querySelectorAll(':scope > .nMcdL')]) item.remove();
    await wait(60_000);
    setCaptionsButton(m.doc, true);
    await wait(2_000);
    addCaptionItem(m.doc, 'Mike Smith', 'Back to the agenda.');
    await settle();
    expect(m.file()).toEqual([
      `[00:00] Mike Smith: ${MIKE}`,
      `[00:04] Alex: ${SELF}`,
      expect.stringMatching(/^\[01:\d\d\] Mike Smith: Back to the agenda\.$/) as string,
    ]);
  });

  it('the band comes back holding a new turn that begins like an earlier one: the earlier line keeps every word', async () => {
    const m = await meeting();
    addCaptionItem(m.doc, 'Mike Smith', 'So the harbour survey starts on Monday.');
    await settle();
    const kept = '[00:00] Mike Smith: So the harbour survey starts on Monday.';
    expect(m.file()).toEqual([kept]);

    const { band, parent } = m.captionsOff();
    await wait(60_000);
    // Meet builds the band with the first new turn already in it: the same speaker, starting with the same word.
    const back = band.cloneNode(false) as HTMLElement;
    parent.append(back);
    setCaptionsButton(m.doc, true);
    const again = addCaptionItem(m.doc, 'Mike Smith', 'So');
    await wait(REGION_POLL_MS * 2);
    setCaptionText(again, 'So we are agreed.');
    await settle();
    // The earlier line is whole. (The turn that was on the page when capture attached again is not kept: the price
    // the spec states for every attach.)
    expect(m.file()[0]).toBe(kept);
    expect(m.file().join('\n')).toContain('So the harbour survey starts on Monday.');
  });
});

describe('Settings → Show Meet captions switched during the meeting', () => {
  it('showing and hiding changes nothing that is kept: the same lines, no new one, and no text is sent again', async () => {
    const m = await withTwoKept();
    const sent = m.textMessages();
    const mike = [...m.region()!.querySelectorAll<HTMLElement>(':scope > .nMcdL')].at(-2)!;

    m.agent.showCaptions(true);
    await wait(3_000);
    expect(m.region()!.hasAttribute('data-live-assist-hidden')).toBe(false);
    m.agent.showCaptions(false);
    await wait(3_000);
    expect(m.region()!.hasAttribute('data-live-assist-hidden')).toBe(true);
    // The switches alone: nothing left the page, nothing new is stored.
    expect(m.textMessages()).toBe(sent);
    expect(m.file()).toEqual([`[00:00] Mike Smith: ${MIKE}`, `[00:04] Alex: ${SELF}`]);

    // A kept turn goes on while shown, another turn starts while hidden: one line each, as without the switches.
    m.agent.showCaptions(true);
    appendCaptionText(mike, ' Bring boots.');
    await settle();
    m.agent.showCaptions(false);
    addCaptionItem(m.doc, 'Tom Brown', 'The ferry leaves at nine.');
    await settle();
    const lines = m.file();
    expect(lines).toEqual([
      `[00:00] Mike Smith: ${MIKE} Bring boots.`,
      `[00:04] Alex: ${SELF}`,
      expect.stringMatching(/^\[00:\d\d\] Tom Brown: The ferry leaves at nine\.$/) as string,
    ]);
    expectNothingFromBeforeStart(lines);
    expect(m.states.filter((s) => s === 'on')).toHaveLength(1);
  });
});
