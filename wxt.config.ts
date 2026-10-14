import { defineConfig } from 'wxt';

// See specs/001-capture-live-transcript/plan.md and research.md R5.
export default defineConfig({
  srcDir: 'src',
  // Explicit imports only: keeps chrome/browser usage visible to the src/core lint boundary.
  imports: false,
  modules: ['@wxt-dev/module-react'],
  manifest: ({ mode }) => ({
    name: 'live-assist',
    description: 'Transcribes your meeting live and names speakers from Google Meet captions.',
    permissions: [
      'sidePanel',
      'tabCapture',
      'offscreen',
      'storage',
      'activeTab',
      // The dev-only spike recorder saves its WAVs, Meet snapshots and alignment traces into Downloads subfolders, and
      // lists tabs by title to pick the meeting tab; production builds never ask for either.
      ...(mode === 'spike' ? ['downloads', 'tabs'] : []),
      // e2e builds cannot click the toolbar icon, so activeTab never reveals the meeting tab's URL there; production
      // reads it through the activeTab grant of that click (002 T005: the Meet bridge needs the URL).
      ...(mode === 'e2e' ? ['tabs'] : []),
    ],
    // ElevenLabs for transcription; the two chat providers for Ask (003 research R10, constitution I). Required, not
    // optional: the service worker calls them with the user's key, exempt from CORS.
    host_permissions: ['https://api.elevenlabs.io/*', 'https://api.anthropic.com/*', 'https://api.openai.com/*'],
    action: { default_title: 'Open live-assist' },
  }),
  // The dev-only spike recorder ships only in `pnpm build:spike` (mode "spike").
  // filterEntrypoints is an allow-list, so exclusion is done in the resolve hook instead.
  hooks: {
    'entrypoints:resolved': (wxt, entrypoints) => {
      if (wxt.config.mode === 'spike') return;
      const kept = entrypoints.filter((e) => e.name !== 'spike-recorder');
      entrypoints.splice(0, entrypoints.length, ...kept);
    },
  },
});
