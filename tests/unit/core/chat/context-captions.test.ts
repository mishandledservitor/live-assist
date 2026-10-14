// 013 T050 (decision 72, FR-008, research R10): a pinning test, expected green. Ask never sees Meet's kept captions:
// a question's context is built from the meeting, its transcript lines and earlier turns, and nothing else has a way
// in. The meeting below has kept captions holding the marker sentence; the request holds none of it.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { buildContext, buildRequest } from '@/core/chat/context';
import type { ChatRequest } from '@/core/chat/provider';
import { turnId, type ChatTurn } from '@/core/chat/turn';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK, expectNoMarker, holdsMarker } from '../../../support/caption-marker';
import { meetingWithCaptions, spokenBy, storedCaptionTurn, storedSegment } from '../../../support/stored-meetings';

const meeting = meetingWithCaptions({ id: 'm1' });
const segments = [
  storedSegment('m1', 0, { ...spokenBy('Sarah Brown'), text: 'Pricing stays at the current tier.' }),
  storedSegment('m1', 1, { text: 'Agreed.' }),
];
/** What the meeting's caption store holds. Nothing below is given it. */
const captionStore = [
  storedCaptionTurn('m1', 1, { text: CAPTION_MARKER }),
  storedCaptionTurn('m1', 2, { speakerName: 'You', self: true, text: CAPTION_MARKER_GREEK }),
];

describe("Ask's context and Meet's kept captions", () => {
  it('the request for a first question holds no caption text', () => {
    expect(holdsMarker(captionStore)).toBe(true);
    const built = buildContext(meeting, segments, []);
    const request = buildRequest({
      model: 'claude-sonnet-5-5',
      earlier: [],
      context: built.contextBlock,
      question: 'What was decided about pricing?',
    });
    expectNoMarker(built);
    expectNoMarker(request);
    expect(JSON.stringify(request)).toContain('Pricing stays at the current tier.');
  });

  it('nor does a later question that replays earlier turns', () => {
    const first = buildContext(meeting, segments, []);
    const earlier: ChatTurn = {
      id: turnId('m1', 0),
      meetingId: 'm1',
      seq: 0,
      question: 'What was decided about pricing?',
      askedAt: 1,
      contextBlock: first.contextBlock,
      sentLines: first.sentLines,
      transcriptUntilMs: first.transcriptUntilMs,
      provider: 'anthropic',
      requestedModel: 'claude-sonnet-5-5',
      answeredBy: 'claude-sonnet-5-5',
      answer: 'It stays [00:00].',
      status: 'complete',
      error: null,
      updatedAt: 2,
      schemaVersion: 1,
    };
    const more = [...segments, storedSegment('m1', 2, { text: 'Next topic.' })];
    const built = buildContext(meeting, more, [earlier]);
    const request = buildRequest({
      model: 'claude-sonnet-5-5',
      earlier: [earlier],
      context: built.contextBlock,
      question: 'And then?',
    });
    expectNoMarker(request);
    expect(request.turns).toHaveLength(3);
  });

  it('the context builder and the request have no parameter that could carry caption turns', () => {
    expectTypeOf<Parameters<typeof buildContext>['length']>().toEqualTypeOf<3>();
    expectTypeOf<Parameters<typeof buildRequest>[0]>().not.toHaveProperty('captionTurns');
    expectTypeOf<Parameters<typeof buildContext>[0]>().not.toHaveProperty('hasCaptions');
    expectTypeOf<ChatRequest['turns'][number]>().not.toHaveProperty('captions');
  });
});
