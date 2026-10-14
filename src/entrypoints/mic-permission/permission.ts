// One-time microphone permission (research R5): offscreen documents cannot show the permission prompt, so this
// visible extension page asks once; the grant belongs to the extension origin and the offscreen document then gets
// the mic without a prompt.

export type MicPermissionResult = 'granted' | 'denied' | 'no-device' | 'busy' | 'error';

export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

export async function requestMicPermission(mediaDevices: MediaDevicesLike): Promise<MicPermissionResult> {
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    for (const track of stream.getTracks()) track.stop();
    return 'granted';
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
    if (name === 'NotReadableError') return 'busy';
    return 'error';
  }
}

export const MIC_PERMISSION_TEXT = {
  title: 'Microphone access for live-assist',
  why: 'live-assist transcribes your microphone together with the meeting audio. Chrome asks once; the microphone is used only while you are transcribing a meeting.',
  result: {
    granted: 'Microphone allowed. You can close this tab and go back to the side panel.',
    denied:
      'Microphone blocked. Click the icon at the left of the address bar, open Site settings, set Microphone to Allow, then press "Ask again". Until then only the meeting audio is transcribed.',
    'no-device':
      'No microphone was found. Connect one (or check System Settings → Sound → Input), then press "Ask again".',
    busy: 'The microphone is in use by another app or could not be started. Close the other app, then press "Ask again".',
    error: 'Chrome could not open the microphone. Try again; if it keeps failing, restart Chrome.',
  } satisfies Record<MicPermissionResult, string>,
} as const;
