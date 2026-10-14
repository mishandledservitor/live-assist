import { describe, expect, it } from 'vitest';
import { GenericAdapter } from '@/core/platform/generic-adapter';
import type { CaptionsCapability, MuteCapability } from '@/core/platform/adapter';
import {
  MUTE_CHECKING_REASON,
  MUTE_UNREADABLE_REASON,
  MUTE_UNKNOWN_REASON,
  MUTED_REASON,
  initialStatus,
  reduceStatus,
  type StatusEvent,
  type StatusSnapshot,
  type StreamState,
} from '@/core/status/status';

const apply = (s: StatusSnapshot, ...events: StatusEvent[]) => events.reduce(reduceStatus, s);

describe('initialStatus', () => {
  it('starts idle on every dependency', () => {
    const s = initialStatus();
    expect(s.capture).toEqual({ state: 'idle' });
    // One mixed stream, one transcription status (constitution v1.1.0).
    expect(s.transcription).toEqual({ state: 'idle', reconnects: 0 });
    expect(s.mic.state).toBe('off');
  });

  it('speaker names start idle, with no reason (006 D3, FR-009)', () => {
    expect(initialStatus().speakerNames).toEqual({ state: 'idle', reason: '' });
  });

  it('the adapter and captions events move speaker names out of idle', () => {
    const generic = new GenericAdapter();
    expect(
      apply(initialStatus(), { type: 'adapter', captions: generic.captions, mute: generic.mute }).speakerNames.state,
    ).toBe('unavailable');
    expect(apply(initialStatus(), { type: 'adapter', captions: meetCaptions, mute: meetMute }).speakerNames).toEqual({
      state: 'starting',
      reason: 'Turning on Meet captions…',
    });
    expect(apply(initialStatus(), { type: 'captions', state: { state: 'on' } }).speakerNames.state).toBe('active');
  });

  it('has a truthful retention summary with a help link and no zero-retention claim', () => {
    const { retention } = initialStatus();
    expect(retention.provider).toBe('elevenlabs');
    // 006 R16: the opt-out is stated in full beside it (copy-review K15), so the summary no longer repeats it.
    expect(retention.summary).toBe(
      "Audio is sent to ElevenLabs for transcription. ElevenLabs may keep audio and transcripts under your account's settings and may use them to improve its models.",
    );
    expect(retention.summary.toLowerCase()).not.toMatch(/zero[- ]retention|never (stored|retained|kept)/);
    expect(retention.helpUrl).toMatch(/^https:\/\//);
  });
});

describe('adapter event', () => {
  it('generic adapter → speaker names unavailable with the adapter reason, mute not followed', () => {
    const adapter = new GenericAdapter();
    const s = apply(initialStatus(), { type: 'adapter', captions: adapter.captions, mute: adapter.mute });
    expect(s.speakerNames).toEqual({
      state: 'unavailable',
      reason: adapter.captions.supported ? '' : adapter.captions.reason,
    });
    expect(s.mic.muteFollowed).toBe(false);
  });
});

describe('mic status (FR-021)', () => {
  it('active mic without mute following says the mic is being sent', () => {
    const adapter = new GenericAdapter();
    const s = apply(
      initialStatus(),
      { type: 'adapter', captions: adapter.captions, mute: adapter.mute },
      { type: 'mic', state: 'active' },
    );
    expect(s.mic).toEqual({ state: 'active', reason: MUTE_UNKNOWN_REASON, muteFollowed: false });
    expect(MUTE_UNKNOWN_REASON).toBe('sent even while muted');
  });

  it('unavailable mic keeps its own reason', () => {
    const s = apply(initialStatus(), { type: 'mic', state: 'unavailable', reason: 'Microphone permission needed' });
    expect(s.mic.state).toBe('unavailable');
    expect(s.mic.reason).toBe('Microphone permission needed');
  });
});

describe('capture transitions', () => {
  it('idle → starting → active → stopped', () => {
    const s = apply(
      initialStatus(),
      { type: 'capture', state: 'starting' },
      { type: 'capture', state: 'active' },
      { type: 'capture', state: 'stopped', reason: 'Stopped by you' },
    );
    expect(s.capture).toEqual({ state: 'stopped', reason: 'Stopped by you' });
  });

  it('ignores an invalid transition (idle → active)', () => {
    const s = apply(initialStatus(), { type: 'capture', state: 'active' });
    expect(s.capture.state).toBe('idle');
  });
});

describe('transcription transitions (data-model.md)', () => {
  const to = (state: StreamState, reason?: string): StatusEvent =>
    reason === undefined ? { type: 'transcription', state } : { type: 'transcription', state, reason };

  it('idle → connecting → active', () => {
    const s = apply(initialStatus(), to('connecting'), to('active'));
    expect(s.transcription).toEqual({ state: 'active', reconnects: 0 });
  });

  it('active → reconnecting counts a reconnect; reconnecting → active keeps the count', () => {
    const s = apply(
      initialStatus(),
      to('connecting'),
      to('active'),
      to('reconnecting'),
      to('active'),
      to('reconnecting'),
    );
    expect(s.transcription).toEqual({ state: 'reconnecting', reconnects: 2 });
  });

  it('connecting → reconnecting: a session that drops before it started is retried too', () => {
    const s = apply(initialStatus(), to('connecting'), to('reconnecting', 'lost'), to('active'));
    expect(s.transcription).toEqual({ state: 'active', reconnects: 1 });
  });

  it('reconnecting → failed carries the reason', () => {
    const s = apply(initialStatus(), to('connecting'), to('active'), to('reconnecting'), to('failed', 'No network'));
    expect(s.transcription).toEqual({ state: 'failed', reason: 'No network', reconnects: 1 });
  });

  it.each<StreamState>(['connecting', 'active', 'reconnecting'])('%s → failed is allowed', (from) => {
    const path: StatusEvent[] =
      from === 'connecting'
        ? [to('connecting')]
        : from === 'active'
          ? [to('connecting'), to('active')]
          : [to('connecting'), to('active'), to('reconnecting')];
    const s = apply(initialStatus(), ...path, to('failed', 'Key rejected'));
    expect(s.transcription.state).toBe('failed');
  });

  it('any state → stopped', () => {
    for (const path of [[], [to('connecting')], [to('connecting'), to('active')]]) {
      expect(apply(initialStatus(), ...path, to('stopped')).transcription.state).toBe('stopped');
    }
  });

  it('ignores invalid transitions (idle → active, failed → active)', () => {
    expect(apply(initialStatus(), to('active')).transcription.state).toBe('idle');
    const failed = apply(initialStatus(), to('connecting'), to('failed', 'x'));
    expect(reduceStatus(failed, to('active')).transcription.state).toBe('failed');
  });

  it('reset returns to idle streams and capture but keeps adapter-derived fields', () => {
    const adapter = new GenericAdapter();
    const s = apply(
      initialStatus(),
      { type: 'adapter', captions: adapter.captions, mute: adapter.mute },
      to('connecting'),
      { type: 'reset' },
    );
    expect(s.transcription.state).toBe('idle');
    expect(s.capture.state).toBe('idle');
    expect(s.speakerNames.state).toBe('unavailable');
  });
});

// 002 data-model.md "Status snapshot — changes".
const meetCaptions: CaptionsCapability = {
  supported: true,
  enable: () => Promise.resolve(),
  restore: () => Promise.resolve(),
  subscribe: () => () => undefined,
  subscribeState: () => () => undefined,
  subscribeText: () => () => undefined,
};
const meetMute: MuteCapability = {
  supported: true,
  current: () => ({ muted: null, observedAt: 0 }),
  subscribe: () => () => undefined,
};
const meet = (): StatusSnapshot =>
  apply(initialStatus(), { type: 'adapter', captions: meetCaptions, mute: meetMute }, { type: 'mic', state: 'active' });

describe('speaker names follow the captions state (002)', () => {
  it('a Meet adapter starts as starting: "Turning on Meet captions…"', () => {
    expect(meet().speakerNames).toEqual({ state: 'starting', reason: 'Turning on Meet captions…' });
  });

  it.each([
    [
      { state: 'starting', reason: 'Join the call to get speaker names' },
      { state: 'starting', reason: 'Join the call to get speaker names' },
    ],
    [{ state: 'on' }, { state: 'active', reason: '' }],
    [
      { state: 'unavailable', reason: "Couldn't turn on Meet captions" },
      { state: 'degraded', reason: "Couldn't turn on Meet captions" },
    ],
    [
      { state: 'off-by-user', reason: 'Captions were turned off' },
      { state: 'degraded', reason: 'Captions were turned off' },
    ],
  ] as const)('captions %o → speaker names %o', (captions, expected) => {
    expect(apply(meet(), { type: 'captions', state: captions }).speakerNames).toEqual(expected);
  });

  it('recovers from degraded to active', () => {
    const s = apply(
      meet(),
      { type: 'captions', state: { state: 'unavailable', reason: 'x' } },
      { type: 'captions', state: { state: 'on' } },
    );
    expect(s.speakerNames).toEqual({ state: 'active', reason: '' });
  });
});

describe('mic follows Meet’s mute state (002 FR-014)', () => {
  it('muted reading → muted, not sent', () => {
    expect(apply(meet(), { type: 'mute', muted: true }).mic).toEqual({
      state: 'muted',
      reason: MUTED_REASON,
      muteFollowed: true,
    });
    expect(MUTED_REASON).toBe('Muted in Meet — not sent');
  });

  it('unmuted reading → active, following mute', () => {
    expect(apply(meet(), { type: 'mute', muted: true }, { type: 'mute', muted: false }).mic).toEqual({
      state: 'active',
      muteFollowed: true,
    });
  });

  it('no reading → back to 001’s unknown wording', () => {
    expect(apply(meet(), { type: 'mute', muted: false }, { type: 'mute', muted: null }).mic).toEqual({
      state: 'active',
      reason: MUTE_UNKNOWN_REASON,
      muteFollowed: false,
    });
  });

  // T094, design decision 34: on Meet an unreadable mute state keeps the mic silenced and says why.
  it("gate can't read Meet's mute state → muted, not sent, with the reason", () => {
    expect(apply(meet(), { type: 'mute', muted: false }, { type: 'mute-unreadable' }).mic).toEqual({
      state: 'muted',
      reason: MUTE_UNREADABLE_REASON,
      muteFollowed: true,
    });
    expect(MUTE_UNREADABLE_REASON).toBe("Not sent — can't see Meet's mute button");
    expect(apply(meet(), { type: 'mute-unreadable' }, { type: 'mute', muted: false }).mic).toEqual({
      state: 'active',
      muteFollowed: true,
    });
  });

  it('gate awaiting the first reading or holding a stale mute → muted, checking', () => {
    expect(apply(meet(), { type: 'mute-checking' }).mic).toEqual({
      state: 'muted',
      reason: MUTE_CHECKING_REASON,
      muteFollowed: true,
    });
    expect(MUTE_CHECKING_REASON).toBe("Checking Meet's mute state — not sent");
  });

  it('an unavailable mic stays unavailable whatever Meet says', () => {
    const s = apply(
      initialStatus(),
      { type: 'adapter', captions: meetCaptions, mute: meetMute },
      { type: 'mic', state: 'unavailable', reason: 'Microphone permission needed' },
      { type: 'mute', muted: true },
      { type: 'mute-checking' },
      { type: 'mute', muted: false },
    );
    expect(s.mic).toMatchObject({ state: 'unavailable', reason: 'Microphone permission needed' });
  });

  it('reset turns a muted mic off', () => {
    const s = apply(meet(), { type: 'mute', muted: true }, { type: 'reset' });
    expect(s.mic.state).toBe('off');
    expect(s.speakerNames.state).toBe('starting');
  });
});

describe('purity', () => {
  it('does not mutate the previous snapshot', () => {
    const before = initialStatus();
    const snapshot = JSON.stringify(before);
    reduceStatus(before, { type: 'transcription', state: 'connecting' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
