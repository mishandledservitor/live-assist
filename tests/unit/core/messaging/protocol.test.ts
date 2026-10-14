import { describe, expect, it } from 'vitest';
import {
  createReceiver,
  parseCommand,
  parseKeyHintReply,
  parseInternal,
  parseLabelCommand,
  parseLive,
  parseOffscreenNotice,
  parseOffscreenRequest,
  parseTokenReply,
  type Command,
  type InternalMessage,
  type LabelCommand,
  type LiveEvent,
} from '@/core/messaging/protocol';
import { initialStatus } from '@/core/status/status';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';

const meeting: Meeting = {
  id: 'm1',
  startedAt: 1_000,
  endedAt: null,
  endReason: null,
  source: { url: 'https://meet.google.com/x', title: 'Standup', platform: 'generic' },
  languageMode: { kind: 'auto' },
  userName: 'Alex',
  speakerRenames: {},
  schemaVersion: 1,
};

const v2Meeting: Meeting = {
  ...meeting,
  speakerRenames: { 'caption:emma jones': { name: 'Emma', origin: 'manual' } },
  schemaVersion: 2,
};

const segment: TranscriptSegment = {
  id: 'm1:mixed:0',
  meetingId: 'm1',
  stream: 'mixed',
  seq: 0,
  startMs: 100,
  endMs: 900,
  text: 'Καλημέρα, hello',
  language: 'el',
  speakerLabel: 'Others',
  labelSource: 'fallback',
  captionName: null,
  captionSelf: false,
  labelOverride: null,
  schemaVersion: 2,
  words: [{ text: 'hello', startMs: 500, endMs: 900 }],
  timing: 'words',
  sessionId: 's1',
  createdAt: 2_000,
};

const namedSegment: TranscriptSegment = {
  ...segment,
  speakerLabel: 'Emma Jones',
  labelSource: 'caption',
  captionName: 'Emma Jones',
  labelOverride: 'Emma C.',
};

/** T110 (decision 37): a line whose name is not settled yet. */
const pendingSegment: TranscriptSegment = { ...segment, labelPending: true };

/** A segment stored before 002: no caption fields, no schemaVersion. */
const v1Segment: Partial<TranscriptSegment> = { ...segment };
delete v1Segment.captionName;
delete v1Segment.captionSelf;
delete v1Segment.labelOverride;
delete v1Segment.schemaVersion;

const commands: Command[] = [
  { type: 'meeting/start', tabId: 7, language: { kind: 'auto' } },
  { type: 'meeting/start', tabId: 7, language: { kind: 'fixed', code: 'el' } },
  { type: 'meeting/stop' },
  { type: 'settings/validate-key' },
  { type: 'settings/key-hint' },
];

const internal: InternalMessage[] = [
  {
    type: 'offscreen/begin',
    meetingId: 'm1',
    tabStreamId: 'stream-abc',
    language: { kind: 'auto' },
    keyterms: ['Northwind'],
    userName: 'Alex',
    source: { url: 'https://meet.google.com/abc', title: 'Standup' },
    speakerNameMappings: [],
    cleanTranscript: true,
  },
  {
    type: 'offscreen/begin',
    meetingId: 'm2',
    tabStreamId: 'stream-def',
    language: { kind: 'auto' },
    keyterms: [],
    userName: 'Alex',
    source: { url: 'https://meet.google.com/abc', title: 'Standup' },
    speakerNameMappings: [{ captionName: 'Jane D.', displayName: 'Jane', updatedAt: 5 }],
    cleanTranscript: false,
  },
  { type: 'offscreen/end', reason: 'user-stop' },
  { type: 'offscreen/end', reason: 'tab-navigated' },
];

const live: LiveEvent[] = [
  {
    type: 'live/snapshot',
    meeting,
    segments: [segment],
    partials: [{ stream: 'mixed', text: 'hel' }],
    status: initialStatus(),
  },
  { type: 'live/snapshot', meeting: null, segments: [], partials: [], status: initialStatus() },
  { type: 'live/segment', segment },
  { type: 'live/partial', stream: 'mixed', text: '' },
  { type: 'live/status', status: initialStatus() },
  // 002 (contracts/live-port-and-labels.md)
  {
    type: 'live/snapshot',
    meeting: v2Meeting,
    segments: [segment, v1Segment as TranscriptSegment],
    partials: [],
    status: initialStatus(),
  },
  { type: 'live/segment', segment: namedSegment },
  { type: 'live/segment-updated', segment: namedSegment },
  { type: 'live/segment', segment: pendingSegment },
  {
    type: 'live/labels',
    meetingId: 'm1',
    speakerRenames: {
      'caption:emma jones': { name: 'Emma', origin: 'remembered' },
      others: { name: 'Bob', origin: 'manual' },
    },
  },
];

const labelCommands: LabelCommand[] = [
  { type: 'labels/rename', meetingId: 'm1', speakerKey: 'caption:emma jones', name: 'Emma' },
  { type: 'labels/rename', meetingId: 'm1', speakerKey: 'self', name: 'Alex S.' },
  { type: 'labels/override', meetingId: 'm1', segmentId: 'm1:mixed:3', name: 'Jane' },
  { type: 'labels/override', meetingId: 'm1', segmentId: 'm1:mixed:3', name: null },
];

describe('valid messages are accepted unchanged', () => {
  it.each(commands)('command %o', (m) => expect(parseCommand(structuredClone(m))).toEqual(m));
  it.each(internal)('internal %o', (m) => expect(parseInternal(structuredClone(m))).toEqual(m));
  it.each(live)('live %o', (m) => expect(parseLive(structuredClone(m))).toEqual(m));
  it.each(labelCommands)('label command %o', (m) => expect(parseLabelCommand(structuredClone(m))).toEqual(m));
});

describe('002 additions (contracts/live-port-and-labels.md)', () => {
  // Design decision 41: an older service worker sends no cleanTranscript; the setting's default (on) applies.
  it('reads an offscreen/begin without cleanTranscript as on, and rejects a non-boolean', () => {
    const { cleanTranscript: _, ...older } = internal[0] as Extract<InternalMessage, { type: 'offscreen/begin' }>;
    expect(parseInternal(older)).toEqual(internal[0]);
    expect(parseInternal({ ...internal[0], cleanTranscript: false })).toMatchObject({ cleanTranscript: false });
    expect(parseInternal({ ...internal[0], cleanTranscript: 'yes' })).toBeNull();
  });

  it('reads an offscreen/begin without speakerNameMappings as having none', () => {
    const { speakerNameMappings: _, ...older } = internal[0] as Extract<InternalMessage, { type: 'offscreen/begin' }>;
    expect(parseInternal(older)).toEqual(internal[0]);
  });

  it.each([
    { speakerNameMappings: 'all' },
    { speakerNameMappings: [{ captionName: 'A', displayName: '', updatedAt: 1 }] },
    { speakerNameMappings: [{ captionName: 'A', displayName: 'x'.repeat(61), updatedAt: 1 }] },
    { speakerNameMappings: [{ captionName: 'A', displayName: 'B' }] },
  ])('rejects offscreen/begin with bad mappings %o', (over) => {
    expect(parseInternal({ ...internal[0], ...over })).toBeNull();
  });

  it('trims label names', () => {
    expect(parseLabelCommand({ type: 'labels/rename', meetingId: 'm1', speakerKey: 'self', name: '  Bob ' })).toEqual({
      type: 'labels/rename',
      meetingId: 'm1',
      speakerKey: 'self',
      name: 'Bob',
    });
    expect(
      parseLabelCommand({ type: 'labels/override', meetingId: 'm1', segmentId: 's', name: ' Jane ' }),
    ).toMatchObject({ name: 'Jane' });
  });

  it.each([
    { type: 'labels/rename', meetingId: 'm1', speakerKey: 'self', name: '   ' },
    // Red-team 2026-10-08 (T092, decision 35): "Others" is never renamed everywhere, only overridden line by line.
    { type: 'labels/rename', meetingId: 'm1', speakerKey: 'others', name: 'Bob' },
    { type: 'labels/rename', meetingId: 'm1', speakerKey: 'self', name: 'x'.repeat(61) },
    { type: 'labels/rename', meetingId: 'm1', speakerKey: 'self', name: 'Line\nbreak' },
    { type: 'labels/rename', meetingId: 'm1', speakerKey: 'everyone', name: 'A' },
    { type: 'labels/rename', meetingId: 'm1', speakerKey: 'caption:', name: 'A' },
    { type: 'labels/rename', meetingId: 'm1', speakerKey: 'self', name: null },
    { type: 'labels/rename', speakerKey: 'self', name: 'A' },
    { type: 'labels/override', meetingId: 'm1', segmentId: 's', name: '' },
    { type: 'labels/override', meetingId: 'm1', name: 'A' },
    { type: 'labels/delete', meetingId: 'm1' },
    { type: 'labels/rename', meetingId: 'm1', speakerKey: 'self', name: 'A', apiKey: 'x' },
  ])('rejects label command %o', (m) => expect(parseLabelCommand(m)).toBeNull());

  it.each([
    { type: 'live/labels', meetingId: 'm1', speakerRenames: { others: { name: '', origin: 'manual' } } },
    { type: 'live/labels', meetingId: 'm1', speakerRenames: { others: { name: 'A', origin: 'guessed' } } },
    { type: 'live/labels', meetingId: 'm1', speakerRenames: { everyone: { name: 'A', origin: 'manual' } } },
    { type: 'live/labels', speakerRenames: {} },
    { type: 'live/segment-updated', segment: { ...namedSegment, captionSelf: 'yes' } },
    { type: 'live/segment-updated', segment: { ...namedSegment, captionName: 3 } },
    { type: 'live/segment-updated', segment: { ...namedSegment, schemaVersion: 3 } },
    { type: 'live/segment', segment: { ...namedSegment, labelPending: 'yes' } },
    {
      type: 'live/snapshot',
      meeting: { ...v2Meeting, speakerRenames: 'none' },
      segments: [],
      partials: [],
      status: initialStatus(),
    },
    {
      type: 'live/snapshot',
      meeting: { ...meeting, schemaVersion: 3 },
      segments: [],
      partials: [],
      status: initialStatus(),
    },
  ])('rejects live event %o', (m) => expect(parseLive(m)).toBeNull());
});

describe('malformed or unknown messages are rejected', () => {
  it.each([
    null,
    undefined,
    42,
    'meeting/start',
    {},
    { type: 'meeting/explode' },
    { type: 'meeting/start' },
    { type: 'meeting/start', tabId: '7', language: { kind: 'auto' } },
    { type: 'meeting/start', tabId: 7, language: { kind: 'fixed' } },
    { type: 'meeting/start', tabId: 7, language: { kind: 'sometimes' } },
  ])('command %o', (m) => expect(parseCommand(m)).toBeNull());

  it.each([
    { type: 'offscreen/begin', meetingId: 'm1' },
    { type: 'offscreen/begin', ...internal[0], keyterms: [1] },
    { type: 'offscreen/begin', ...internal[0], source: { url: 'https://x' } },
    { type: 'offscreen/begin', ...internal[0], source: undefined },
    { type: 'offscreen/end', reason: 'bored' },
    { type: 'meeting/stop' },
  ])('internal %o', (m) => expect(parseInternal(m)).toBeNull());

  it.each([
    { type: 'live/segment', segment: { ...segment, stream: 'speaker' } },
    // Two-session shapes, gone since constitution v1.1.0 (one mixed stream, no own-mic label).
    { type: 'live/segment', segment: { ...segment, stream: 'tab' } },
    { type: 'live/segment', segment: { ...segment, labelSource: 'self' } },
    { type: 'live/partial', stream: 'mic', text: 'hel' },
    {
      type: 'live/status',
      status: {
        ...initialStatus(),
        transcription: { mic: initialStatus().transcription, tab: initialStatus().transcription },
      },
    },
    { type: 'live/segment', segment: { ...segment, text: 3 } },
    { type: 'live/partial', stream: 'tab' },
    { type: 'live/status' },
    { type: 'live/snapshot', meeting, segments: 'all', partials: [], status: initialStatus() },
  ])('live %o', (m) => expect(parseLive(m)).toBeNull());
});

describe('no key or token ever travels in a message', () => {
  it.each([
    { type: 'meeting/stop', apiKey: 'x' },
    { type: 'settings/validate-key', key: 'x' },
    { type: 'settings/validate-key', elevenLabsApiKey: 'x' },
    { type: 'meeting/stop', token: 'sutkn_x' },
    { type: 'meeting/stop', nested: { authorization: 'Bearer x' } },
  ])('command %o is rejected', (m) => expect(parseCommand(m)).toBeNull());

  it('rejects a key-like field nested in an internal message', () => {
    expect(parseInternal({ ...internal[0], extra: { xiApiKey: 'x' } })).toBeNull();
  });

  it('still accepts keyterms (not a key)', () => {
    expect(parseInternal(internal[0])).not.toBeNull();
  });
});

describe('offscreen → service worker credential requests', () => {
  it.each([{ type: 'credentials/transcription-token' }, { type: 'credentials/status' }])('accepts %o', (m) =>
    expect(parseOffscreenRequest(m)).toEqual(m),
  );

  it.each([{ type: 'meeting/stop' }, { type: 'credentials/key' }, { type: 'credentials/status', apiKey: 'x' }, 'x'])(
    'rejects %o',
    (m) => expect(parseOffscreenRequest(m)).toBeNull(),
  );

  it('reads a token reply only in its exact shape', () => {
    const credential = { token: 'sutkn_fixture_1', expiresAt: 5 };
    expect(parseTokenReply({ ok: true, credential })).toEqual({ ok: true, credential });
    expect(parseTokenReply({ ok: false, kind: 'invalid' })).toEqual({ ok: false, kind: 'invalid' });
    expect(parseTokenReply({ ok: false, kind: 'boom' })).toBeNull();
    expect(parseTokenReply({ ok: true, credential: { token: 3, expiresAt: 5 } })).toBeNull();
    expect(parseTokenReply(undefined)).toBeNull();
  });
});

describe('offscreen → service worker notice that the meeting ended by itself', () => {
  it.each(['failed', 'user-stop', 'call-ended'])('accepts reason %s', (reason) =>
    expect(parseOffscreenNotice({ type: 'offscreen/ended', reason })).toEqual({ type: 'offscreen/ended', reason }),
  );
  it.each([
    { type: 'offscreen/ended' },
    { type: 'offscreen/ended', reason: 'bored' },
    { type: 'offscreen/end', reason: 'failed' },
  ])('rejects %o', (m) => expect(parseOffscreenNotice(m)).toBeNull());
});

describe('createReceiver', () => {
  it('counts dropped messages instead of throwing', () => {
    const receiver = createReceiver(parseCommand);
    expect(receiver.accept({ type: 'meeting/stop' })).toEqual({ type: 'meeting/stop' });
    expect(receiver.accept({ type: 'nope' })).toBeNull();
    expect(receiver.accept(null)).toBeNull();
    expect(receiver.dropped()).toBe(2);
  });
});

// Red-team 2026-10-08 (001 T109, FR-003a): the key hint reaches the panel from the service worker, validated.
describe('parseKeyHintReply', () => {
  it('accepts a hint of at most four characters, or null', () => {
    expect(parseKeyHintReply({ hint: 'a1b2' })).toEqual({ hint: 'a1b2' });
    expect(parseKeyHintReply({ hint: null })).toEqual({ hint: null });
  });

  it.each([undefined, null, 'a1b2', {}, { hint: 5 }, { hint: 'sk_full_key_value' }])('reads %o as no key', (reply) =>
    expect(parseKeyHintReply(reply)).toEqual({ hint: null }),
  );
});

// 013 T022/T023 (contracts/captions-capture.md "Live port"): the panel is told that a meeting has kept captions, and
// nothing about them.
describe('live/captions-kept (013)', () => {
  it('round-trips', () => {
    const e = { type: 'live/captions-kept', meetingId: 'm1' };
    expect(parseLive(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it('is rebuilt from its meeting id alone: no text, name or count travels with it', () => {
    const parsed = parseLive({
      type: 'live/captions-kept',
      meetingId: 'm1',
      text: 'An invented caption sentence.',
      speakerName: 'Emma Jones',
      turns: 3,
    });
    expect(parsed).toEqual({ type: 'live/captions-kept', meetingId: 'm1' });
  });

  it.each([{ type: 'live/captions-kept' }, { type: 'live/captions-kept', meetingId: 7 }])('rejects %o', (m) =>
    expect(parseLive(m)).toBeNull(),
  );

  it('a snapshot carries the mark on its meeting, and only as true', () => {
    const snapshot = (hasCaptions: unknown) => ({
      type: 'live/snapshot',
      meeting: { ...v2Meeting, hasCaptions },
      segments: [],
      partials: [],
      status: initialStatus(),
    });
    expect(parseLive(snapshot(true))).toMatchObject({ meeting: { hasCaptions: true } });
    expect(parseLive(snapshot(false))).toBeNull();
    expect(parseLive(snapshot('An invented caption sentence.'))).toBeNull();
    expect(parseLive(snapshot(['An invented caption sentence.']))).toBeNull();
  });
});
