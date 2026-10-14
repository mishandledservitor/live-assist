// What the panel says when Start fails (spec edge cases, FR-022). Plain language, each with the next step.
import type { StartError } from '../../core/messaging/protocol';

export function startErrorMessage(error: StartError, runningTabTitle?: string): string {
  switch (error) {
    case 'settings-incomplete':
      return 'Finish setup first: add your name and a working ElevenLabs key in Settings.';
    case 'not-invoked':
      // Research R5 (revised after T012): capture works only on the tab where the toolbar icon was last clicked.
      return 'live-assist cannot hear this tab yet. Click the live-assist icon in the Chrome toolbar while you are on the meeting tab, then press Start again.';
    case 'tab-not-capturable':
      return "This tab can't be captured. Go to your meeting tab, click the live-assist icon there, then press Start.";
    case 'already-running':
      return `Already transcribing ${runningTabTitle ? `“${runningTabTitle}”` : 'another tab'}.`;
    case 'offscreen-failed':
      return "Transcription couldn't start because the audio capture failed. Press Start to try again; if it keeps failing, reload live-assist in chrome://extensions.";
  }
}
