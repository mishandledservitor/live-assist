// T009: the Meet bridge protocol (contracts/meet-bridge.md). Every message round-trips; anything else is dropped and
// counted. No message may carry caption text (FR-004).
import { describe, expect, it } from 'vitest';
import { createReceiver } from '@/core/messaging/protocol';
import {
  MAX_APPEND_CHARS,
  MAX_CAPTION_TEXT_MESSAGE,
  MAX_CLOCK_SKEW_MS,
  MAX_MESSAGE_BYTES,
  MAX_TURN_AGE_MS,
  MAX_TURN_CHARS,
  parseAttach,
  parseFromPage,
  parseReadyReply,
  parseToPage,
  type FromPage,
} from '@/core/messaging/meet-bridge';

const NOW = 1_800_000_000_000;
const ID = '0b6f5c8e-3c1a-4c1e-9d55-2f1c0a7e9b10';
const fromPage = (m: unknown) => parseFromPage(m, NOW);

const pageMessages: FromPage[] = [
  { type: 'meet/hello', meetingId: ID, pageId: 'a1b2c3d4', inCall: true },
  { type: 'meet/captions-state', state: 'starting', reason: 'Turning on Meet captions…' },
  { type: 'meet/captions-state', state: 'on' },
  { type: 'meet/captions-state', state: 'unavailable', reason: "Couldn't turn on Meet captions" },
  { type: 'meet/captions-state', state: 'off-by-user', reason: 'Captions were turned off' },
  { type: 'meet/caption', turnKey: 'a1b2c3d4:7', speakerName: 'Emma Jones', self: null, observedAt: NOW - 200 },
  { type: 'meet/caption', turnKey: 'a1b2c3d4:8', speakerName: 'You', self: true, observedAt: NOW },
  { type: 'meet/mute', muted: true, observedAt: NOW },
  { type: 'meet/mute', muted: null, observedAt: NOW },
  { type: 'meet/metadata', title: 'Weekly product sync', meetingCode: 'abc-defg-hij' },
  { type: 'meet/metadata' },
  // T102 (FR-024): the user left the call.
  { type: 'meet/call-ended', observedAt: NOW },
];

describe('content script → offscreen (parseFromPage)', () => {
  it.each(pageMessages.map((m) => [m.type, m] as const))('round-trips %s', (_type, m) => {
    expect(fromPage(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it.each([
    ['an unknown type', { type: 'meet/transcript' }],
    ['a non-object', 'meet/hello'],
    ['a malformed meeting id', { type: 'meet/hello', meetingId: 'm1', pageId: 'a', inCall: true }],
    ['a missing inCall', { type: 'meet/hello', meetingId: ID, pageId: 'a' }],
    ['an unknown captions state', { type: 'meet/captions-state', state: 'maybe', reason: 'x' }],
    ['a captions state without a reason', { type: 'meet/captions-state', state: 'unavailable' }],
    [
      'a caption with text',
      { type: 'meet/caption', turnKey: 'k', speakerName: 'A', self: null, observedAt: NOW, text: 'hello' },
    ],
    [
      'a caption with an empty name',
      { type: 'meet/caption', turnKey: 'k', speakerName: ' ', self: null, observedAt: NOW },
    ],
    [
      'a caption name over 200 chars',
      { type: 'meet/caption', turnKey: 'k', speakerName: 'x'.repeat(201), self: null, observedAt: NOW },
    ],
    [
      'a turn key over 64 chars',
      { type: 'meet/caption', turnKey: 'k'.repeat(65), speakerName: 'A', self: null, observedAt: NOW },
    ],
    ['a bad self hint', { type: 'meet/caption', turnKey: 'k', speakerName: 'A', self: 'yes', observedAt: NOW }],
    ['a non-finite time', { type: 'meet/mute', muted: true, observedAt: Number.POSITIVE_INFINITY }],
    ['a time as text', { type: 'meet/mute', muted: true, observedAt: String(NOW) }],
    ['a time more than 1 h ahead', { type: 'meet/mute', muted: true, observedAt: NOW + 3_600_001 }],
    ['a time more than 1 h behind', { type: 'meet/mute', muted: false, observedAt: NOW - 3_600_001 }],
    ['a bad mute reading', { type: 'meet/mute', muted: 'yes', observedAt: NOW }],
    ['a title over 300 chars', { type: 'meet/metadata', title: 't'.repeat(301) }],
    ['metadata with text', { type: 'meet/metadata', title: 'x', text: 'said' }],
    ['a message over 2 KB', { type: 'meet/metadata', title: 'x', padding: 'p'.repeat(MAX_MESSAGE_BYTES) }],
    ['a secret-looking field', { type: 'meet/mute', muted: true, observedAt: NOW, token: 'x' }],
    ['a call end without a time', { type: 'meet/call-ended' }],
    ['a call end with a time as text', { type: 'meet/call-ended', observedAt: String(NOW) }],
  ])('drops %s', (_what, raw) => {
    expect(fromPage(raw)).toBeNull();
  });

  it('keeps times exactly 1 h off', () => {
    expect(fromPage({ type: 'meet/mute', muted: true, observedAt: NOW + 3_600_000 })).not.toBeNull();
    expect(fromPage({ type: 'meet/mute', muted: true, observedAt: NOW - 3_600_000 })).not.toBeNull();
  });

  it('passes only known fields through', () => {
    expect(fromPage({ type: 'meet/mute', muted: false, observedAt: NOW, extra: 1 })).toEqual({
      type: 'meet/mute',
      muted: false,
      observedAt: NOW,
    });
  });

  it('counts what it drops when used with createReceiver', () => {
    const receiver = createReceiver(fromPage);
    expect(receiver.accept(pageMessages[0])).not.toBeNull();
    expect(receiver.accept({ type: 'meet/caption', text: 'hello' })).toBeNull();
    expect(receiver.accept(null)).toBeNull();
    expect(receiver.dropped()).toBe(2);
  });
});

describe('offscreen → content script (parseToPage)', () => {
  it.each(['meet/enable-captions', 'meet/restore-captions', 'meet/detach'] as const)('round-trips %s', (type) => {
    expect(parseToPage({ type })).toEqual({ type });
  });

  it.each([{ type: 'meet/hello' }, { type: 'meet/enable' }, {}, null])('drops %j', (raw) => {
    expect(parseToPage(raw)).toBeNull();
  });
});

describe('service worker ↔ content script (parseAttach, parseReadyReply)', () => {
  it.each([
    { type: 'meet/attach', meetingId: ID, showCaptions: false },
    { type: 'meet/attach', meetingId: ID, showCaptions: true },
    { type: 'meet/ready' },
    { type: 'meet/detach' },
    { type: 'meet/show-captions', show: true },
    { type: 'meet/show-captions', show: false },
  ])('round-trips %j', (m) => {
    expect(parseAttach(m)).toEqual(m);
  });

  // 002 FR-028: captions stay hidden unless the service worker says to show them.
  it('reads a meet/attach without showCaptions as hidden', () => {
    expect(parseAttach({ type: 'meet/attach', meetingId: ID })).toEqual({
      type: 'meet/attach',
      meetingId: ID,
      showCaptions: false,
    });
  });

  it.each([
    { type: 'meet/attach' },
    { type: 'meet/attach', meetingId: 'not-a-uuid' },
    { type: 'meet/attach', meetingId: ID, showCaptions: 'yes' },
    { type: 'meet/hello', meetingId: ID },
    { type: 'meet/ready', padding: 'p'.repeat(MAX_MESSAGE_BYTES) },
    { type: 'meet/show-captions' },
    { type: 'meet/show-captions', show: 'true' },
    { type: 'meet/show-captions', show: 1 },
    { type: 'meet/show-captions', show: true, text: 'a caption' },
  ])('drops %j', (raw) => {
    expect(parseAttach(raw)).toBeNull();
  });

  it('meet/show-captions is not a port message', () => {
    expect(parseToPage({ type: 'meet/show-captions', show: true })).toBeNull();
    expect(parseFromPage({ type: 'meet/show-captions', show: true }, Date.now())).toBeNull();
  });

  it('reads ready replies', () => {
    expect(parseReadyReply({ attach: true, meetingId: ID, showCaptions: true })).toEqual({
      attach: true,
      meetingId: ID,
      showCaptions: true,
    });
    expect(parseReadyReply({ attach: true, meetingId: ID })).toEqual({
      attach: true,
      meetingId: ID,
      showCaptions: false,
    });
    expect(parseReadyReply({ attach: true, meetingId: ID, showCaptions: 'yes' })).toBeNull();
    expect(parseReadyReply({ attach: false })).toEqual({ attach: false });
    expect(parseReadyReply({ attach: true })).toBeNull();
    expect(parseReadyReply(undefined)).toBeNull();
  });
});

// 013 T007 (contracts/captions-capture.md "Bridge message"): `meet/caption-text` is the one message that may carry
// caption text, on its own validation path; every other message still fails on a `text` or `append` field. All text
// here is invented.
describe('meet/caption-text (013)', () => {
  const base = {
    type: 'meet/caption-text',
    turnKey: 'a1b2c3d4:7',
    speakerName: 'Emma Jones',
    self: null,
    firstSeenAt: NOW - 500,
    keep: 12,
    append: 'morning, can everyone see the slide?',
  } as const;

  it('accepts a well-formed message', () => {
    expect(fromPage({ ...base })).toEqual(base);
    expect(fromPage({ ...base, self: true, keep: 0 })).toEqual({ ...base, self: true, keep: 0 });
    expect(fromPage({ ...base, self: false })).toEqual({ ...base, self: false });
  });

  it('rebuilds it from its seven fields only', () => {
    const parsed = fromPage({ ...base, observedAt: NOW, extra: { deep: 'x' }, pageId: 'p' });
    expect(parsed).toEqual(base);
    expect(Object.keys(parsed ?? {}).sort()).toEqual(
      ['append', 'firstSeenAt', 'keep', 'self', 'speakerName', 'turnKey', 'type'].sort(),
    );
  });

  it.each([
    ['an empty append', { append: '' }],
    ['Greek text', { append: 'Καλημέρα σε όλους, βλέπετε τη διαφάνεια;' }],
    ['a surrogate pair', { append: 'Launch day 🚀 is set.' }],
    ['an append of exactly the limit', { append: 'a'.repeat(MAX_APPEND_CHARS) }],
    ['keep at the limit', { keep: MAX_TURN_CHARS }],
    ['a time exactly 1 h off', { firstSeenAt: NOW - 3_600_000 }],
    // A turn's first-seen time never changes while its text does: a turn Meet keeps writing into for more than an
    // hour (one person talking, alone or to a muted room) must keep arriving.
    ['a turn first seen 61 minutes ago', { firstSeenAt: NOW - 61 * 60_000 }],
    ['a turn first seen three hours ago', { firstSeenAt: NOW - 3 * 3_600_000 }],
    ['a turn first seen exactly a day ago', { firstSeenAt: NOW - MAX_TURN_AGE_MS }],
    ['a time exactly 1 h ahead', { firstSeenAt: NOW + MAX_CLOCK_SKEW_MS }],
    ['a message far over 2 KB', { append: 'word '.repeat(1_500) }],
  ])('accepts %s', (_what, over) => {
    expect(fromPage({ ...base, ...over })).toEqual({ ...base, ...over });
  });

  const without = (field: keyof typeof base) => {
    const { [field]: _dropped, ...rest } = base;
    return rest;
  };

  it.each([
    ['no turnKey', without('turnKey')],
    ['no speakerName', without('speakerName')],
    ['no self', without('self')],
    ['no firstSeenAt', without('firstSeenAt')],
    ['no keep', without('keep')],
    ['no append', without('append')],
    ['a numeric turnKey', { ...base, turnKey: 7 }],
    ['a turn key over 64 chars', { ...base, turnKey: 'k'.repeat(65) }],
    ['an empty speaker name', { ...base, speakerName: ' ' }],
    ['a speaker name over 200 chars', { ...base, speakerName: 'x'.repeat(201) }],
    ['a bad self hint', { ...base, self: 'yes' }],
    ['self undefined', { ...base, self: undefined }],
    ['a time as text', { ...base, firstSeenAt: String(NOW) }],
    ['a non-finite time', { ...base, firstSeenAt: Number.NaN }],
    ['a time more than a day behind', { ...base, firstSeenAt: NOW - MAX_TURN_AGE_MS - 1 }],
    ['a time in seconds, not milliseconds', { ...base, firstSeenAt: Math.floor(NOW / 1000) }],
    ['a time of zero', { ...base, firstSeenAt: 0 }],
    ['a time more than 1 h ahead', { ...base, firstSeenAt: NOW + 3_600_001 }],
    ['keep as text', { ...base, keep: '12' }],
    ['a negative keep', { ...base, keep: -1 }],
    ['a fractional keep', { ...base, keep: 1.5 }],
    ['a non-finite keep', { ...base, keep: Number.POSITIVE_INFINITY }],
    ['keep above the turn limit', { ...base, keep: MAX_TURN_CHARS + 1 }],
    ['append as a list', { ...base, append: ['a'] }],
    ['an append over the limit', { ...base, append: 'a'.repeat(MAX_APPEND_CHARS + 1) }],
    // Within the append limit, but each control character is six characters of JSON.
    ['a message over the size limit', { ...base, append: '\u0001'.repeat(3_000) }],
    ['a secret-looking field', { ...base, token: 'x' }],
    ['a nested secret-looking field', { ...base, extra: { apiKey: 'x' } }],
    ['a text field', { ...base, text: 'Good morning.' }],
    ['a list', [base]],
  ])('drops one with %s', (_what, raw) => {
    expect(fromPage(raw)).toBeNull();
  });

  it('the size limit counts the message as JSON', () => {
    const fits = { ...base, append: '\u0001'.repeat(2_000) };
    expect(JSON.stringify(fits).length).toBeLessThanOrEqual(MAX_CAPTION_TEXT_MESSAGE);
    expect(fromPage(fits)).toEqual(fits);
    expect(JSON.stringify({ ...base, append: '\u0001'.repeat(3_000) }).length).toBeGreaterThan(
      MAX_CAPTION_TEXT_MESSAGE,
    );
  });

  it("the limits are the contract's", () => {
    expect([MAX_APPEND_CHARS, MAX_CAPTION_TEXT_MESSAGE, MAX_TURN_CHARS]).toEqual([8_000, 16_384, 1_000_000]);
  });

  it.each([
    ['meet/caption', { type: 'meet/caption', turnKey: 'k', speakerName: 'A', self: null, observedAt: NOW }],
    ['meet/mute', { type: 'meet/mute', muted: true, observedAt: NOW }],
    ['meet/metadata', { type: 'meet/metadata', title: 'Weekly product sync' }],
    ['meet/hello', { type: 'meet/hello', meetingId: ID, pageId: 'a1b2c3d4', inCall: true }],
    ['meet/captions-state', { type: 'meet/captions-state', state: 'on' }],
    ['meet/call-ended', { type: 'meet/call-ended', observedAt: NOW }],
  ])('%s with an append field is dropped whole', (_type, m) => {
    expect(fromPage(m)).not.toBeNull();
    expect(fromPage({ ...m, append: 'Good morning.' })).toBeNull();
    expect(fromPage({ ...m, append: '' })).toBeNull();
  });

  it('nothing sent to the page can carry text', () => {
    for (const type of ['meet/enable-captions', 'meet/restore-captions', 'meet/detach']) {
      expect(parseToPage({ type })).toEqual({ type });
      expect(parseToPage({ type, append: 'Good morning.' })).toBeNull();
      expect(parseToPage({ type, text: 'Good morning.' })).toBeNull();
    }
    expect(parseToPage({ ...base })).toBeNull();
    for (const m of [
      { type: 'meet/attach', meetingId: ID, showCaptions: false },
      { type: 'meet/ready' },
      { type: 'meet/detach' },
      { type: 'meet/show-captions', show: true },
    ]) {
      expect(parseAttach(m)).not.toBeNull();
      expect(parseAttach({ ...m, append: 'Good morning.' })).toBeNull();
      expect(parseAttach({ ...m, text: 'Good morning.' })).toBeNull();
    }
    expect(parseAttach({ ...base })).toBeNull();
  });

  it('a dropped caption-text message is counted like any other', () => {
    const receiver = createReceiver(fromPage);
    expect(receiver.accept({ ...base })).not.toBeNull();
    expect(receiver.accept({ ...base, keep: -1 })).toBeNull();
    expect(receiver.dropped()).toBe(1);
  });
});

// 013: the age allowed for a turn's first-seen time applies to `meet/caption-text` alone. Every other time on the
// bridge is the moment of the event itself, and stays within an hour of the receiver's clock either way.
describe('times on the bridge other than a turn\u2019s first-seen time', () => {
  it.each([
    ['meet/caption', { type: 'meet/caption', turnKey: 'a1b2c3d4:7', speakerName: 'Emma Jones', self: null }],
    ['meet/mute', { type: 'meet/mute', muted: true }],
    ['meet/call-ended', { type: 'meet/call-ended' }],
  ])('%s is dropped when its time is more than an hour off, behind or ahead', (_type, message) => {
    expect(fromPage({ ...message, observedAt: NOW - MAX_CLOCK_SKEW_MS })).not.toBeNull();
    expect(fromPage({ ...message, observedAt: NOW - MAX_CLOCK_SKEW_MS - 1 })).toBeNull();
    expect(fromPage({ ...message, observedAt: NOW + MAX_CLOCK_SKEW_MS + 1 })).toBeNull();
  });
});
