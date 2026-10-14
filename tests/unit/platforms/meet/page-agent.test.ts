// T025: the page agent ties the Meet DOM layer to the `platform:meet` port (contracts/meet-bridge.md), over a fake port.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_APPEND_CHARS,
  MAX_CAPTION_TEXT_MESSAGE,
  MEET_REASONS,
  parseFromPage,
  type FromPage,
} from '@/core/messaging/meet-bridge';
import { CAPTION_TEXT_THROTTLE_MS } from '@/platforms/meet/caption-observer';
import { CALL_GONE_MS } from '@/platforms/meet/call-presence';
import { createPageAgent, type PagePort } from '@/platforms/meet/page-agent';
import {
  addCaptionItem,
  appendCaptionText,
  loadMeetSnapshot,
  setCaptionsButton,
  setCaptionText,
  setMuted,
} from '../../../support/meet-snapshot';

const T0 = 1_760_000_000_000;
const MEETING = '0b7a1c9e-1111-4222-8333-944455556666';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => void vi.useRealTimers());

function fakePort() {
  const sent: unknown[] = [];
  let onMessage: ((m: unknown) => void) | null = null;
  let onDisconnect: (() => void) | null = null;
  const state = { disconnected: false };
  /** Each message as the offscreen document would parse it at the moment it arrives. */
  const arrived: (FromPage | null)[] = [];
  const port: PagePort = {
    postMessage: (m) => {
      sent.push(m);
      arrived.push(parseFromPage(m, Date.now()));
    },
    onMessage: { addListener: (l) => void (onMessage = l) },
    onDisconnect: { addListener: (l) => void (onDisconnect = l) },
    disconnect: () => void (state.disconnected = true),
  };
  return {
    port,
    sent,
    arrived,
    state,
    /** Validated the way the offscreen document validates them. */
    received: () => sent.map((m) => parseFromPage(m, Date.now())),
    fromOffscreen: (m: unknown) => onMessage?.(m),
    lose: () => onDisconnect?.(),
  };
}

function setup(snapshot = 'in-call-captions-off') {
  const doc = loadMeetSnapshot(snapshot);
  const ports: ReturnType<typeof fakePort>[] = [];
  const agent = createPageAgent({
    doc,
    connect: () => {
      const p = fakePort();
      ports.push(p);
      return p.port;
    },
  });
  // Meet flips the captions button on click.
  const button = [...doc.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.includes('captions'))!;
  button.addEventListener('click', () => setCaptionsButton(doc, button.getAttribute('aria-pressed') !== 'true'));
  return { doc, agent, ports };
}

/** Every message but the one that may carry caption text (013). */
const withoutCaptionText = (sent: unknown[]) =>
  sent.filter((m) => (m as { type?: string }).type !== 'meet/caption-text');

const ofType = <T extends FromPage['type']>(msgs: (FromPage | null)[], type: T) =>
  msgs.filter((m): m is Extract<FromPage, { type: T }> => m?.type === type);

describe('page agent', () => {
  it('on attach connects once and sends hello, then the current captions state, mute reading and metadata', () => {
    const { agent, ports } = setup();
    agent.attach(MEETING);
    agent.attach(MEETING);
    expect(ports).toHaveLength(1);
    const msgs = ports[0]!.received();
    expect(msgs.every((m) => m !== null)).toBe(true);
    expect(msgs[0]).toEqual({
      type: 'meet/hello',
      meetingId: MEETING,
      pageId: expect.any(String) as string,
      inCall: true,
    });
    expect(msgs.slice(1)).toEqual([
      { type: 'meet/captions-state', state: 'starting', reason: MEET_REASONS.starting },
      { type: 'meet/mute', muted: false, observedAt: T0 },
      { type: 'meet/metadata', title: 'Weekly product sync', meetingCode: 'abc-defg-hij' },
    ]);
  });

  it('meet/enable-captions turns captions on and reports it; caption activity is forwarded', async () => {
    const { doc, agent, ports } = setup();
    agent.attach(MEETING);
    ports[0]!.fromOffscreen({ type: 'meet/enable-captions' });
    await vi.advanceTimersByTimeAsync(500);
    expect(ofType(ports[0]!.received(), 'meet/captions-state').at(-1)).toEqual({
      type: 'meet/captions-state',
      state: 'on',
    });
    addCaptionItem(doc, 'Emma Jones', 'text that must not travel');
    await vi.advanceTimersByTimeAsync(0);
    expect(ofType(ports[0]!.received(), 'meet/caption')).toEqual([
      {
        type: 'meet/caption',
        turnKey: expect.any(String) as string,
        speakerName: 'Emma Jones',
        self: null,
        observedAt: T0 + 500,
      },
    ]);
    // 013: the text travels in meet/caption-text only, never in the activity message or any other.
    expect(JSON.stringify(withoutCaptionText(ports[0]!.sent))).not.toContain('must not travel');
  });

  it('meet/restore-captions puts captions back and stops forwarding activity', async () => {
    const { doc, agent, ports } = setup();
    agent.attach(MEETING);
    ports[0]!.fromOffscreen({ type: 'meet/enable-captions' });
    await vi.advanceTimersByTimeAsync(500);
    ports[0]!.fromOffscreen({ type: 'meet/restore-captions' });
    expect(doc.querySelector('[data-live-assist-hidden]')).toBeNull();
    expect(doc.querySelector('button[aria-pressed="true"]')).toBeNull();
    const n = ports[0]!.sent.length;
    addCaptionItem(doc, 'Emma Jones');
    await vi.advanceTimersByTimeAsync(1000);
    expect(ports[0]!.sent).toHaveLength(n);
  });

  it('meet/detach disconnects the port; a later attach connects again', () => {
    const { agent, ports } = setup();
    agent.attach(MEETING);
    ports[0]!.fromOffscreen({ type: 'meet/detach' });
    expect(ports[0]!.state.disconnected).toBe(true);
    agent.attach(MEETING);
    expect(ports).toHaveLength(2);
  });

  it('agent.detach() (from the service worker) disconnects too', () => {
    const { agent, ports } = setup();
    agent.attach(MEETING);
    agent.detach();
    expect(ports[0]!.state.disconnected).toBe(true);
  });

  it('losing the port (the offscreen document went away) restores captions', async () => {
    const { doc, agent, ports } = setup();
    agent.attach(MEETING);
    ports[0]!.fromOffscreen({ type: 'meet/enable-captions' });
    await vi.advanceTimersByTimeAsync(500);
    ports[0]!.lose();
    expect(doc.querySelector('[data-live-assist-hidden]')).toBeNull();
    expect(doc.querySelector('button[aria-pressed="true"]')).toBeNull();
  });

  it('ignores invalid messages from the offscreen side', () => {
    const { agent, ports } = setup();
    agent.attach(MEETING);
    expect(() => ports[0]!.fromOffscreen({ type: 'meet/whatever' })).not.toThrow();
    expect(() => ports[0]!.fromOffscreen('nonsense')).not.toThrow();
  });

  it('a reloaded page (a new agent) says hello with a new pageId', () => {
    const first = setup();
    const second = setup();
    first.agent.attach(MEETING);
    second.agent.attach(MEETING);
    const id = (p: ReturnType<typeof fakePort>) => ofType(p.received(), 'meet/hello')[0]!.pageId;
    expect(id(first.ports[0]!)).not.toBe(id(second.ports[0]!));
  });
  // T046/T047: mute is followed for the whole attachment, not only sent once on attach (research R7).
  it('sends every mute change while attached, stamped with when it was seen, and stops after detach', async () => {
    const { doc, agent, ports } = setup();
    agent.attach(MEETING);
    vi.setSystemTime(T0 + 2000);
    setMuted(doc, true);
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(T0 + 2600);
    setMuted(doc, false);
    await vi.advanceTimersByTimeAsync(0);
    expect(ofType(ports[0]!.received(), 'meet/mute')).toEqual([
      { type: 'meet/mute', muted: false, observedAt: T0 },
      { type: 'meet/mute', muted: true, observedAt: T0 + 2000 },
      { type: 'meet/mute', muted: false, observedAt: T0 + 2600 },
    ]);
    agent.detach();
    setMuted(doc, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(ofType(ports[0]!.received(), 'meet/mute')).toHaveLength(3);
  });

  it('T102 (FR-024): leaving the call sends meet/call-ended once, without being asked', async () => {
    const { doc, agent, ports } = setup('real-dom-captions-on');
    agent.attach(MEETING);
    await vi.advanceTimersByTimeAsync(2000);
    doc.body.innerHTML = '<div role="main"><h1>You left the meeting</h1><button>Rejoin</button></div>';
    await vi.advanceTimersByTimeAsync(CALL_GONE_MS + 1000);
    const ended = ofType(ports[0]!.received(), 'meet/call-ended');
    expect(ended).toHaveLength(1);
    expect(ended[0]!.observedAt - T0).toBeGreaterThanOrEqual(2000);
  });

  // 013: caption text now leaves the page in `meet/caption-text` and in no other message (was: in none at all).
  it('T096: no caption text leaves the page outside meet/caption-text, through new turns, rewrites, dropped lines and re-renders', async () => {
    const { doc, agent, ports } = setup('real-dom-captions-off');
    const onPage = [...doc.querySelectorAll('.ygicle')].map((el) => el.textContent?.trim() ?? '').filter(Boolean);
    agent.attach(MEETING);
    ports[0]!.fromOffscreen({ type: 'meet/enable-captions' });
    await vi.advanceTimersByTimeAsync(500);
    const secrets = ['Quarterly numbers are down', 'call the supplier', 'Project Falcon', 'salary review'];
    const emma = addCaptionItem(doc, 'Emma Jones', secrets[0]);
    await vi.advanceTimersByTimeAsync(300);
    appendCaptionText(emma, ` ${secrets[1]}`);
    await vi.advanceTimersByTimeAsync(5000);
    emma.querySelector('.ygicle')!.firstChild!.remove();
    (emma.querySelector('.ygicle')!.lastChild as Text).data = secrets[2]!;
    await vi.advanceTimersByTimeAsync(300);
    const you = addCaptionItem(doc, 'You', secrets[3]);
    await vi.advanceTimersByTimeAsync(300);
    const region = doc.querySelector('[role="region"][aria-label="Captions"]')!;
    region.replaceWith(region.cloneNode(true));
    await vi.advanceTimersByTimeAsync(1500);
    you.remove();
    await vi.advanceTimersByTimeAsync(1500);
    const sent = JSON.stringify(withoutCaptionText(ports[0]!.sent));
    expect(ofType(ports[0]!.received(), 'meet/caption').length).toBeGreaterThan(0);
    for (const text of [...onPage, ...secrets]) expect(sent).not.toContain(text);
    // What was on the page before Start stays there: not even the text message carries it.
    for (const text of onPage) expect(JSON.stringify(ports[0]!.sent)).not.toContain(text);
  });

  // T134 (FR-028–FR-030, design decision 61): Settings → Show Meet captions, told to the page by the service worker.
  describe('show Meet captions', () => {
    const hiddenTag = (doc: Document) => doc.querySelector('[data-live-assist-hidden]');
    const captionsOn = (doc: Document) => doc.querySelector('button[aria-pressed="true"]') !== null;

    it('showCaptions(true) before attach: meet/enable-captions turns captions on and leaves them visible', async () => {
      const { doc, agent, ports } = setup();
      agent.showCaptions(true);
      agent.attach(MEETING);
      ports[0]!.fromOffscreen({ type: 'meet/enable-captions' });
      await vi.advanceTimersByTimeAsync(1000);
      expect(captionsOn(doc)).toBe(true);
      expect(hiddenTag(doc)).toBeNull();
      expect(ofType(ports[0]!.received(), 'meet/captions-state').at(-1)).toEqual({
        type: 'meet/captions-state',
        state: 'on',
      });
    });

    it('switching during a meeting shows and hides at once; the same turn keeps reporting activity and nothing else is sent', async () => {
      const { doc, agent, ports } = setup();
      agent.attach(MEETING);
      ports[0]!.fromOffscreen({ type: 'meet/enable-captions' });
      await vi.advanceTimersByTimeAsync(500);
      expect(hiddenTag(doc)).not.toBeNull();
      const item = addCaptionItem(doc, 'Emma Jones', 'one');
      await vi.advanceTimersByTimeAsync(300);
      const captions = () => ofType(ports[0]!.received(), 'meet/caption');
      const others = () => ports[0]!.received().filter((m) => m?.type !== 'meet/caption').length;
      const before = { captions: captions().length, others: others(), sent: ports[0]!.sent.length };
      expect(before.captions).toBeGreaterThan(0);

      agent.showCaptions(true);
      expect(hiddenTag(doc)).toBeNull();
      expect(ports[0]!.sent).toHaveLength(before.sent); // the switch itself sends nothing
      appendCaptionText(item, ' two');
      await vi.advanceTimersByTimeAsync(300);
      const whileShown = captions().length;
      expect(whileShown).toBeGreaterThan(before.captions);

      agent.showCaptions(false);
      expect(hiddenTag(doc)).not.toBeNull();
      appendCaptionText(item, ' three');
      await vi.advanceTimersByTimeAsync(300);
      expect(captions().length).toBeGreaterThan(whileShown);

      expect(new Set(captions().map((c) => c.turnKey)).size).toBe(1);
      expect(others()).toBe(before.others); // no captions-state, hello, mute or metadata caused by the switches
      expect(captionsOn(doc)).toBe(true);
    });

    it('no caption text leaves the page outside meet/caption-text while captions are shown', async () => {
      const { doc, agent, ports } = setup('real-dom-captions-off');
      const onPage = [...doc.querySelectorAll('.ygicle')].map((el) => el.textContent?.trim() ?? '').filter(Boolean);
      agent.showCaptions(true);
      agent.attach(MEETING);
      ports[0]!.fromOffscreen({ type: 'meet/enable-captions' });
      await vi.advanceTimersByTimeAsync(500);
      const secrets = ['Quarterly numbers are down', 'call the supplier', 'salary review'];
      const emma = addCaptionItem(doc, 'Emma Jones', secrets[0]);
      await vi.advanceTimersByTimeAsync(300);
      appendCaptionText(emma, ` ${secrets[1]}`);
      agent.showCaptions(false);
      addCaptionItem(doc, 'You', secrets[2]);
      await vi.advanceTimersByTimeAsync(300);
      agent.showCaptions(true);
      await vi.advanceTimersByTimeAsync(1500);
      const sent = JSON.stringify(withoutCaptionText(ports[0]!.sent));
      expect(ofType(ports[0]!.received(), 'meet/caption').length).toBeGreaterThan(0);
      for (const text of [...onPage, ...secrets]) expect(sent).not.toContain(text);
      for (const text of onPage) expect(JSON.stringify(ports[0]!.sent)).not.toContain(text);
    });

    it('meet/restore-captions and a lost port put captions back as before Start while shown', async () => {
      for (const end of ['restore', 'lose'] as const) {
        const { doc, agent, ports } = setup();
        agent.showCaptions(true);
        agent.attach(MEETING);
        ports[0]!.fromOffscreen({ type: 'meet/enable-captions' });
        await vi.advanceTimersByTimeAsync(500);
        expect(captionsOn(doc)).toBe(true);
        if (end === 'restore') ports[0]!.fromOffscreen({ type: 'meet/restore-captions' });
        else ports[0]!.lose();
        expect(captionsOn(doc)).toBe(false);
        expect(hiddenTag(doc)).toBeNull();
      }
    });
  });
});

// 013 T020 (contracts/captions-capture.md "Page agent"): a kept turn's text leaves the page as `meet/caption-text`
// messages carrying only what changed. Every sentence is invented.
describe('page agent: caption text (013)', () => {
  type TextMessage = Extract<FromPage, { type: 'meet/caption-text' }>;
  const textMessages = (port: ReturnType<typeof fakePort>) => ofType(port.received(), 'meet/caption-text');
  /** What the offscreen side holds for each turn after these messages, applied as the adapter applies them. */
  const rebuilt = (messages: TextMessage[]) => {
    const texts = new Map<string, string>();
    for (const m of messages) {
      const current = texts.get(m.turnKey) ?? '';
      expect(m.keep).toBeLessThanOrEqual(current.length);
      texts.set(m.turnKey, current.slice(0, m.keep) + m.append);
    }
    return texts;
  };
  const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  async function enabled(snapshot = 'in-call-captions-on') {
    const s = setup(snapshot);
    s.agent.attach(MEETING);
    s.ports[0]!.fromOffscreen({ type: 'meet/enable-captions' });
    await vi.advanceTimersByTimeAsync(500);
    return s;
  }

  it("a kept turn's first text is posted whole, with keep 0", async () => {
    const { doc, ports } = await enabled();
    addCaptionItem(doc, 'Mike Smith', 'Good morning, can everyone see the slide?');
    await vi.advanceTimersByTimeAsync(100);
    expect(textMessages(ports[0]!)).toEqual([
      {
        type: 'meet/caption-text',
        turnKey: expect.stringMatching(/^[0-9a-f]{8}:\d+$/) as string,
        speakerName: 'Mike Smith',
        self: null,
        firstSeenAt: T0 + 500,
        keep: 0,
        append: 'Good morning, can everyone see the slide?',
      },
    ]);
  });

  // Flagged with the first build: the bridge dropped a text message whose turn was first seen over an hour before.
  it('a turn Meet keeps writing into for more than an hour: every message is accepted when it arrives, and the text is whole', async () => {
    const { doc, ports } = await enabled();
    const item = addCaptionItem(doc, 'Mike Smith', 'Minute 0.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const said = ['Minute 0.'];
    // One person talking, alone in the call: a sentence every half hour for two and a half hours, all in one turn.
    // (The clock is moved, not run: the page's once-a-second checks over that time are not what is tested.)
    for (let minute = 30; minute <= 150; minute += 30) {
      vi.setSystemTime(T0 + minute * 60_000);
      said.push(`Minute ${minute}.`);
      appendCaptionText(item, ` Minute ${minute}.`);
      await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    }
    const sent = ports[0]!.sent.filter((m) => (m as { type?: string }).type === 'meet/caption-text');
    expect(sent).toHaveLength(6);
    // None was dropped on arrival, although the turn's first-seen time is by then two and a half hours old.
    const arrived = ofType(ports[0]!.arrived, 'meet/caption-text');
    expect(arrived).toHaveLength(6);
    expect(new Set(arrived.map((m) => m.firstSeenAt))).toEqual(new Set([T0 + 500]));
    expect(rebuilt(arrived).get(arrived[0]!.turnKey)).toBe(said.join(' '));
  });

  it('nothing of the turns already on the page is posted', async () => {
    const { doc, ports } = await enabled();
    const onPage = [...doc.querySelectorAll('.ygicle')];
    appendCaptionText(onPage[2]!.parentElement!, ', please.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS * 2);
    expect(textMessages(ports[0]!)).toEqual([]);
  });

  it('a later text posts only the changed tail, with the right keep', async () => {
    const { doc, ports } = await enabled();
    const item = addCaptionItem(doc, 'Mike Smith', 'We ship on Thursday');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    appendCaptionText(item, ' at the latest');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    setCaptionText(item, 'We ship on Tuesday, not Thursday.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const messages = textMessages(ports[0]!);
    expect(messages.map((m) => [m.keep, m.append])).toEqual([
      [0, 'We ship on Thursday'],
      [19, ' at the latest'],
      [12, 'uesday, not Thursday.'],
    ]);
    expect(new Set(messages.map((m) => m.turnKey)).size).toBe(1);
    expect(new Set(messages.map((m) => m.firstSeenAt)).size).toBe(1);
    expect(rebuilt(messages).get(messages[0]!.turnKey)).toBe('We ship on Tuesday, not Thursday.');
  });

  it('a text cut back to its own beginning posts an empty append', async () => {
    const { doc, ports } = await enabled();
    const item = addCaptionItem(doc, 'Mike Smith', 'We ship on Thursday, probably');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    setCaptionText(item, 'We ship on Thursday');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const messages = textMessages(ports[0]!);
    expect(messages.map((m) => [m.keep, m.append])).toEqual([
      [0, 'We ship on Thursday, probably'],
      [19, ''],
    ]);
    expect(rebuilt(messages).get(messages[0]!.turnKey)).toBe('We ship on Thursday');
  });

  it('an unchanged text posts nothing', async () => {
    const { doc, ports } = await enabled();
    const item = addCaptionItem(doc, 'Mike Smith', 'Said once.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    setCaptionText(item, 'Said once.');
    item.querySelector('img')!.setAttribute('data-iml', '9999');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS * 3);
    expect(textMessages(ports[0]!)).toHaveLength(1);
  });

  it(`a 20,000-character change is posted as three messages of at most ${MAX_APPEND_CHARS}, in order`, async () => {
    const { doc, ports } = await enabled();
    const item = addCaptionItem(doc, 'Mike Smith', 'Opening.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const long = `Opening. ${Array.from({ length: 3_500 }, (_, i) => `word${i % 100}`).join(' ')}`.slice(0, 20_008);
    expect(long).toHaveLength(20_008);
    setCaptionText(item, long);
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const messages = textMessages(ports[0]!);
    expect(messages.map((m) => [m.keep, m.append.length])).toEqual([
      [0, 8],
      [8, 8_000],
      [8_008, 8_000],
      [16_008, 4_000],
    ]);
    expect(rebuilt(messages).get(messages[0]!.turnKey)).toBe(long);
  });

  it('no message splits a surrogate pair, at a piece boundary or at keep', async () => {
    const { doc, ports } = await enabled();
    const item = addCaptionItem(doc, 'Mike Smith', 'Launch 🚀');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    // The same high surrogate, another low one: the common prefix ends inside the pair.
    setCaptionText(item, 'Launch 🚂 then');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    // A pair astride the 8,000-character boundary of a long change.
    const long = `Launch 🚂 then ${'x'.repeat(MAX_APPEND_CHARS - 1)}🌊${'y'.repeat(MAX_APPEND_CHARS)}🌊 end`;
    setCaptionText(item, long);
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const messages = textMessages(ports[0]!);
    expect(messages.length).toBeGreaterThanOrEqual(5);
    expect(messages[1]).toMatchObject({ keep: 7, append: '🚂 then' });
    for (const m of messages) {
      expect(m.append).not.toMatch(loneSurrogate);
      expect(m.append.length).toBeLessThanOrEqual(MAX_APPEND_CHARS);
    }
    expect(rebuilt(messages).get(messages[0]!.turnKey)).toBe(long);
  });

  it('every posted message passes parseFromPage, also text that grows when written as JSON', async () => {
    const { doc, ports } = await enabled();
    const item = addCaptionItem(doc, 'Mike Smith', 'Opening.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    // Control characters are six characters each in JSON: 8,000 of them would not fit one message.
    const awkward = `Opening. ${'\u0001'.repeat(9_000)} "quoted" \\ Καλημέρα 🚀`;
    setCaptionText(item, awkward);
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const sent = ports[0]!.sent.filter((m) => (m as { type?: string }).type === 'meet/caption-text');
    expect(sent.length).toBeGreaterThan(3);
    for (const m of sent) {
      expect(JSON.stringify(m).length).toBeLessThanOrEqual(MAX_CAPTION_TEXT_MESSAGE);
      expect(parseFromPage(m, Date.now())).toEqual(m);
    }
    expect(ports[0]!.received().every((m) => m !== null)).toBe(true);
    const messages = textMessages(ports[0]!);
    expect(rebuilt(messages).get(messages[0]!.turnKey)).toBe(awkward);
  });

  it('two turns are told apart, and Greek text arrives whole', async () => {
    const { doc, ports } = await enabled();
    const a = addCaptionItem(doc, 'Σάρα Μπράουν', 'Καλημέρα σε όλους');
    const b = addCaptionItem(doc, 'Εσύ', 'Ναι');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    appendCaptionText(a, ', ξεκινάμε.');
    appendCaptionText(b, ', έτοιμος.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const messages = textMessages(ports[0]!);
    const texts = rebuilt(messages);
    const keyOf = (name: string) => messages.find((m) => m.speakerName === name)!.turnKey;
    expect(texts.get(keyOf('Σάρα Μπράουν'))).toBe('Καλημέρα σε όλους, ξεκινάμε.');
    expect(texts.get(keyOf('Εσύ'))).toBe('Ναι, έτοιμος.');
    expect(messages.find((m) => m.speakerName === 'Εσύ')!.self).toBe(true);
  });

  it('meet/restore-captions flushes the last change before the observer stops', async () => {
    const { doc, ports } = await enabled();
    const item = addCaptionItem(doc, 'Mike Smith', 'Almost');
    await vi.advanceTimersByTimeAsync(200);
    setCaptionText(item, 'Almost done.');
    ports[0]!.fromOffscreen({ type: 'meet/restore-captions' });
    const messages = textMessages(ports[0]!);
    expect(rebuilt(messages).get(messages[0]!.turnKey)).toBe('Almost done.');
    setCaptionText(item, 'Almost done. Said after the end.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS * 3);
    expect(textMessages(ports[0]!)).toHaveLength(messages.length);
  });

  it('meet/detach flushes the last change before the port closes', async () => {
    const { doc, ports } = await enabled();
    const item = addCaptionItem(doc, 'Mike Smith', 'Almost');
    await vi.advanceTimersByTimeAsync(200);
    setCaptionText(item, 'Almost done.');
    ports[0]!.fromOffscreen({ type: 'meet/detach' });
    expect(ports[0]!.state.disconnected).toBe(true);
    const messages = textMessages(ports[0]!);
    expect(rebuilt(messages).get(messages[0]!.turnKey)).toBe('Almost done.');
  });

  it('a second enable on the same page continues the turn numbers', async () => {
    const { doc, ports } = await enabled();
    addCaptionItem(doc, 'Mike Smith', 'Before captions were restored.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    ports[0]!.fromOffscreen({ type: 'meet/restore-captions' });
    await vi.advanceTimersByTimeAsync(500);
    ports[0]!.fromOffscreen({ type: 'meet/enable-captions' });
    await vi.advanceTimersByTimeAsync(500);
    addCaptionItem(doc, 'Mike Smith', 'After they were turned on again.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const number = (key: string) => Number(key.split(':')[1]);
    const textKeys = textMessages(ports[0]!).map((m) => m.turnKey);
    const activityKeys = [...new Set(ofType(ports[0]!.received(), 'meet/caption').map((m) => m.turnKey))];
    expect(textKeys).toHaveLength(2);
    expect(number(textKeys[1]!)).toBeGreaterThan(number(textKeys[0]!));
    expect(activityKeys).toHaveLength(2);
    expect(number(activityKeys[1]!)).toBeGreaterThan(number(activityKeys[0]!));
  });

  it('after the port is replaced every turn starts with keep 0, and earlier turns are history', async () => {
    const { doc, agent, ports } = await enabled();
    const earlier = addCaptionItem(doc, 'Mike Smith', 'Kept through the first port.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const firstKey = textMessages(ports[0]!)[0]!.turnKey;
    // The offscreen document went away; whatever attaches next may be another meeting.
    ports[0]!.lose();
    agent.attach(MEETING);
    ports[1]!.fromOffscreen({ type: 'meet/enable-captions' });
    await vi.advanceTimersByTimeAsync(500);
    appendCaptionText(earlier, ' Changed afterwards.');
    addCaptionItem(doc, 'Bob Doe', 'A turn on the new port.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS * 2);
    const messages = textMessages(ports[1]!);
    expect(messages.map((m) => [m.speakerName, m.keep, m.append])).toEqual([['Bob Doe', 0, 'A turn on the new port.']]);
    expect(messages[0]!.turnKey).not.toBe(firstKey);
  });

  it('meet/caption messages are exactly what they were: names and timing, no text', async () => {
    const { doc, ports } = await enabled();
    const item = addCaptionItem(doc, 'Mike Smith', 'An invented sentence.');
    await vi.advanceTimersByTimeAsync(300);
    appendCaptionText(item, ' And another.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    const raw = ports[0]!.sent.filter((m) => (m as { type?: string }).type === 'meet/caption');
    expect(raw.length).toBeGreaterThanOrEqual(2);
    for (const m of raw) {
      expect(Object.keys(m as object).sort()).toEqual(['observedAt', 'self', 'speakerName', 'turnKey', 'type']);
      expect(JSON.stringify(m)).not.toContain('invented');
    }
  });

  it('caption text is in no message but meet/caption-text', async () => {
    const { doc, ports } = await enabled('real-dom-captions-on');
    const item = addCaptionItem(doc, 'Mike Smith', 'The purple heron audits');
    await vi.advanceTimersByTimeAsync(300);
    appendCaptionText(item, ' seventeen lighthouses.');
    await vi.advanceTimersByTimeAsync(CAPTION_TEXT_THROTTLE_MS);
    ports[0]!.fromOffscreen({ type: 'meet/restore-captions' });
    const others = ports[0]!.sent.filter((m) => (m as { type?: string }).type !== 'meet/caption-text');
    expect(others.length).toBeGreaterThan(3);
    expect(JSON.stringify(others)).not.toMatch(/heron|lighthouses|Kickoff|notes afterwards/);
    expect(textMessages(ports[0]!).length).toBeGreaterThan(0);
  });
});
