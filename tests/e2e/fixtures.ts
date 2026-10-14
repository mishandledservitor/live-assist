import { chromium, test as base, type BrowserContext } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
export const extensionPath = `${root}.output/chrome-mv3-e2e`;
export const fakeMicPath = `${root}tests/fixtures/audio/speech-like.wav`;

/** Launches Chromium with the e2e build loaded. Pass a directory to keep the profile across restarts; '' = temporary. */
export async function launchExtension(userDataDir = ''): Promise<BrowserContext> {
  if (!existsSync(`${extensionPath}/manifest.json`)) {
    throw new Error(`No e2e build at ${extensionPath}; run \`pnpm build:e2e\` first.`);
  }
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${fakeMicPath}`,
    ],
  });
  // 005: the panel asks for the account status on open; no test may reach ElevenLabs. Specs that need an answer
  // route it themselves (later routes take precedence).
  await context.route('https://api.elevenlabs.io/v1/user/subscription', (route) => route.abort());
  return context;
}

export async function extensionIdOf(context: BrowserContext): Promise<string> {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  return new URL(worker.url()).host;
}

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await launchExtension();
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    await use(await extensionIdOf(context));
  },
});

export const expect = test.expect;
