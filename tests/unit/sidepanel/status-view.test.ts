// 006 T016 (US2, FR-006, FR-007, FR-009; data-model.md "State → text"; copy-review D1–D4, R5–R8, R11, R12, K21, K33).
import { describe, expect, it } from 'vitest';
import {
  CALL_ENDED_REASON,
  MUTE_CHECKING_REASON,
  MUTE_UNKNOWN_REASON,
  MUTE_UNREADABLE_REASON,
  MUTED_REASON,
  initialStatus,
  type StatusSnapshot,
} from '@/core/status/status';
import { statusDots, type StatusDot } from '@/entrypoints/sidepanel/status-view';

type Patch = { [K in keyof StatusSnapshot]?: Partial<StatusSnapshot[K]> };
const snap = (patch: Patch = {}): StatusSnapshot => {
  const s = initialStatus();
  return {
    ...s,
    capture: { ...s.capture, ...patch.capture },
    transcription: { ...s.transcription, ...patch.transcription },
    speakerNames: { ...s.speakerNames, ...patch.speakerNames },
    mic: { ...s.mic, ...patch.mic },
  };
};
const dot = (s: StatusSnapshot, key: StatusDot['key'], running = true) =>
  statusDots(s, { running }).dots.find((d) => d.key === key)!;
const text = (s: StatusSnapshot, key: StatusDot['key'], running = true) => dot(s, key, running).text;

describe('statusDots', () => {
  it('has four dots in order with the K21 labels', () => {
    expect(statusDots(initialStatus(), { running: false }).dots.map((d) => [d.key, d.label])).toEqual([
      ['capture', 'Capture'],
      ['transcription', 'Transcription'],
      ['speakerNames', 'Speaker names'],
      ['mic', 'Microphone'],
    ]);
  });

  it('before any meeting: every dot idle, speaker names Not running, nothing expanded (FR-009, D3)', () => {
    const { dots, problems } = statusDots(initialStatus(), { running: false });
    expect(dots.map((d) => [d.text, d.tone])).toEqual([
      ['Not capturing', 'idle'],
      ['Not running', 'idle'],
      ['Not running', 'idle'],
      ['Off', 'idle'],
    ]);
    expect(problems).toEqual([]);
  });

  it('capture states', () => {
    expect(dot(snap({ capture: { state: 'starting' } }), 'capture')).toMatchObject({ text: 'Starting…', tone: 'busy' });
    expect(dot(snap({ capture: { state: 'active' } }), 'capture')).toMatchObject({
      text: 'Capturing the meeting tab',
      tone: 'ok',
    });
    expect(dot(snap({ capture: { state: 'stopped', reason: 'Tab closed' } }), 'capture')).toMatchObject({
      text: 'Stopped — Tab closed',
      tone: 'idle',
    });
    expect(dot(snap({ capture: { state: 'failed', reason: 'boom' } }), 'capture')).toMatchObject({
      text: 'Failed — boom',
      tone: 'error',
    });
  });

  it('transcription reads Transcribing, with no stream note or reconnect counter (R5, D1, D2)', () => {
    expect(dot(snap({ transcription: { state: 'active', reconnects: 2 } }), 'transcription')).toMatchObject({
      text: 'Transcribing',
      tone: 'ok',
    });
    expect(
      text(snap({ transcription: { state: 'active', reconnects: 0, reason: 'About 3 s lost' } }), 'transcription'),
    ).toBe('Transcribing — About 3 s lost');
    expect(dot(snap({ transcription: { state: 'connecting', reconnects: 0 } }), 'transcription')).toMatchObject({
      text: 'Connecting…',
      tone: 'busy',
    });
    expect(
      dot(
        snap({ transcription: { state: 'reconnecting', reconnects: 1, reason: 'Connection to ElevenLabs lost' } }),
        'transcription',
      ),
    ).toMatchObject({ text: 'Reconnecting… — Connection to ElevenLabs lost', tone: 'busy' });
    expect(
      dot(snap({ transcription: { state: 'failed', reconnects: 0, reason: 'x' } }), 'transcription'),
    ).toMatchObject({
      text: 'Stopped working — x',
      tone: 'error',
    });
    expect(text(snap({ transcription: { state: 'stopped', reconnects: 0 } }), 'transcription')).toBe('Stopped');
  });

  it('speaker names: On, Unavailable, Not available, starting (R6–R8, D4)', () => {
    expect(dot(snap({ speakerNames: { state: 'active', reason: '' } }), 'speakerNames')).toMatchObject({
      text: 'On',
      tone: 'ok',
    });
    expect(
      dot(snap({ speakerNames: { state: 'degraded', reason: "Couldn't turn on Meet captions" } }), 'speakerNames'),
    ).toMatchObject({ text: "Unavailable — Couldn't turn on Meet captions", tone: 'error' });
    expect(
      text(
        snap({ speakerNames: { state: 'unavailable', reason: 'Speaker names work on Google Meet only.' } }),
        'speakerNames',
      ),
    ).toBe('Not available — Speaker names work on Google Meet only.');
    expect(
      dot(snap({ speakerNames: { state: 'starting', reason: 'Turning on Meet captions…' } }), 'speakerNames'),
    ).toMatchObject({ text: 'Turning on Meet captions…', tone: 'busy' });
    for (const d of statusDots(snap({ speakerNames: { state: 'degraded', reason: 'x' } }), { running: true }).dots)
      expect(d.text).not.toMatch(/labelled Others/);
  });

  it('microphone: Live, sent even while muted, muted, off, unavailable with an action (R11, R12, K21, K33)', () => {
    expect(dot(snap({ mic: { state: 'active', muteFollowed: true } }), 'mic')).toMatchObject({
      text: 'Live',
      tone: 'ok',
    });
    expect(text(snap({ mic: { state: 'active', muteFollowed: false, reason: MUTE_UNKNOWN_REASON } }), 'mic')).toBe(
      'Live — sent even while muted',
    );
    expect(text(snap({ mic: { state: 'muted', muteFollowed: true, reason: MUTED_REASON } }), 'mic')).toBe(
      'Muted in Meet — not sent',
    );
    expect(text(snap({ mic: { state: 'muted', muteFollowed: true } }), 'mic')).toBe('Muted — not sent');
    expect(text(snap({ mic: { state: 'muted', muteFollowed: true, reason: MUTE_UNREADABLE_REASON } }), 'mic')).toBe(
      "Not sent — can't see Meet's mute button",
    );
    const unavailable = dot(snap({ mic: { state: 'unavailable', muteFollowed: false, reason: 'No mic' } }), 'mic');
    expect(unavailable).toMatchObject({ text: 'Not available — No mic', tone: 'error', action: 'allow-mic' });
    expect(dot(snap({ mic: { state: 'active', muteFollowed: true } }), 'mic').action).toBeUndefined();
  });

  describe('problems (FR-007)', () => {
    const keys = (s: StatusSnapshot, running = true) => statusDots(s, { running }).problems.map((d) => d.key);

    it('are the error-tone dots, in capture, transcription, speaker names, microphone order', () => {
      const s = snap({
        mic: { state: 'unavailable', muteFollowed: false, reason: 'No mic' },
        capture: { state: 'failed', reason: 'boom' },
        speakerNames: { state: 'degraded', reason: 'Captions were turned off' },
      });
      expect(keys(s)).toEqual(['capture', 'speakerNames', 'mic']);
    });

    it('include speaker names Not available during a meeting, but not before one', () => {
      const s = snap({ speakerNames: { state: 'unavailable', reason: 'Speaker names work on Google Meet only.' } });
      expect(keys(s, true)).toEqual(['speakerNames']);
      expect(keys(s, false)).toEqual([]);
    });

    it("include a Meet mute state that can't be read, with no action (K33, decision 34)", () => {
      const s = snap({ mic: { state: 'muted', muteFollowed: true, reason: MUTE_UNREADABLE_REASON } });
      expect(keys(s)).toEqual(['mic']);
      expect(statusDots(s, { running: true }).problems[0]!.action).toBeUndefined();
    });

    it('include a meeting that stopped because the call ended, after it stopped (K34, decision 36)', () => {
      const s = snap({ capture: { state: 'stopped', reason: CALL_ENDED_REASON } });
      expect(keys(s, false)).toEqual(['capture']);
      expect(text(s, 'capture', false)).toBe('Stopped — the call ended');
      expect(keys(snap({ capture: { state: 'stopped' } }), false)).toEqual([]);
    });

    it('leave out busy, muted and checking states', () => {
      const s = snap({
        transcription: { state: 'reconnecting', reconnects: 1, reason: 'Connection to ElevenLabs lost' },
        mic: { state: 'muted', muteFollowed: true, reason: MUTE_CHECKING_REASON },
        speakerNames: { state: 'starting', reason: 'Turning on Meet captions…' },
      });
      expect(keys(s)).toEqual([]);
      expect(keys(snap({ mic: { state: 'muted', muteFollowed: true, reason: MUTED_REASON } }))).toEqual([]);
    });
  });
});
