// Real Web Audio / media wiring for capture.ts, used by the offscreen document. Kept apart from capture.ts so
// the latter stays testable with fakes; real-device behaviour is covered by e2e and the manual check.
import type { CaptureDeps } from './capture';
import workletUrl from './pcm16-worklet.ts?worker&url';

export function browserCaptureDeps(): CaptureDeps {
  return {
    mediaDevices: navigator.mediaDevices,
    createAudioContext: (options) => new AudioContext(options),
    createWorkletNode: (context, name, options) => new AudioWorkletNode(context as AudioContext, name, options),
    workletUrl,
  };
}
