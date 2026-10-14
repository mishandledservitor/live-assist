import { describe, expect, it, vi } from 'vitest';
import { MIC_PERMISSION_TEXT, requestMicPermission } from '@/entrypoints/mic-permission/permission';

function track() {
  return { stop: vi.fn() };
}

function devices(result: { tracks?: ReturnType<typeof track>[]; error?: { name: string } }) {
  return {
    getUserMedia: vi.fn((_c: MediaStreamConstraints) =>
      result.error
        ? Promise.reject(Object.assign(new Error(result.error.name), { name: result.error.name }))
        : Promise.resolve({ getTracks: () => result.tracks ?? [] } as unknown as MediaStream),
    ),
  };
}

describe('requestMicPermission', () => {
  it('asks for audio only, stops every track straight away and reports granted', async () => {
    const tracks = [track(), track()];
    const d = devices({ tracks });
    expect(await requestMicPermission(d)).toBe('granted');
    expect(d.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    for (const t of tracks) expect(t.stop).toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['OverconstrainedError', 'no-device'],
    ['NotReadableError', 'busy'],
    ['AbortError', 'error'],
  ] as const)('maps %s to %s', async (name, result) => {
    expect(await requestMicPermission(devices({ error: { name } }))).toBe(result);
  });
});

describe('MIC_PERMISSION_TEXT', () => {
  it('explains why the mic is needed and what to do for every outcome', () => {
    // 006 R26: one mixed stream (decisions 28/29); names come from captions, not from a separate mic stream.
    expect(MIC_PERMISSION_TEXT.why).toBe(
      'live-assist transcribes your microphone together with the meeting audio. Chrome asks once; the microphone is used only while you are transcribing a meeting.',
    );
    expect(MIC_PERMISSION_TEXT.result.granted).toMatch(/close this tab/i);
    expect(MIC_PERMISSION_TEXT.result.denied).toMatch(/site settings|address bar/i);
    expect(MIC_PERMISSION_TEXT.result['no-device']).toMatch(/no microphone/i);
    expect(MIC_PERMISSION_TEXT.result.busy).toMatch(/another app/i);
    expect(MIC_PERMISSION_TEXT.result.error).toMatch(/try again/i);
  });
});
