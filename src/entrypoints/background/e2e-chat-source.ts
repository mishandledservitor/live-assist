// e2e builds only (003 T033): chat answers come from the scripted fixture provider, never the network. A provider
// counts as configured when the test seeded a key for it; the scenario is the test's `e2eScenario` storage value and
// `e2eChatDelayMs` paces the deltas so a test can press Stop mid-answer. Imported dynamically under MODE === 'e2e',
// so production bundles do not contain it.
import type { ChatCredentialSource, ChatProvider, ChatProviderId } from '../../core/chat/provider';
import { createFixtureChatProvider } from '../../providers/chat/fixture-provider';
import type { SettingsStore } from '../../storage/settings-store';

/** The key check in e2e builds: the fixture provider's `checkKey` for the stored scenario (default: the key works). */
export async function e2eChatKeyChecker(
  area: chrome.storage.StorageArea,
): Promise<(provider: ChatProviderId) => ChatProvider> {
  const { e2eKeyScenario } = await area.get('e2eKeyScenario');
  const scenario = typeof e2eKeyScenario === 'string' ? e2eKeyScenario : 'complete';
  return (provider) => createFixtureChatProvider({ id: provider, scenario });
}

/**
 * 003 FR-018a: the first-text limit in e2e builds is the test's `e2eChatFirstTextMs`, so a test of a question that
 * gets no answer does not wait 45 s; without that value it is the real limit.
 */
export async function e2eFirstTextLimitMs(area: chrome.storage.StorageArea, fallback: number): Promise<number> {
  const { e2eChatFirstTextMs } = await area.get('e2eChatFirstTextMs');
  return typeof e2eChatFirstTextMs === 'number' ? e2eChatFirstTextMs : fallback;
}

export function e2eChatSource(store: SettingsStore, area: chrome.storage.StorageArea): ChatCredentialSource {
  const configured = async (provider: ChatProviderId) => (await store.readChatKey(provider)) !== null;
  return {
    id: 'local-key',
    async status(provider) {
      const key = await store.readChatKey(provider);
      return key ? { configured: true, hint: key.slice(-4) } : { configured: false };
    },
    async providerFor(provider) {
      if (!(await configured(provider))) return null;
      const { e2eScenario, e2eChatDelayMs } = await area.get(['e2eScenario', 'e2eChatDelayMs']);
      return createFixtureChatProvider({
        id: provider,
        scenario: typeof e2eScenario === 'string' ? e2eScenario : 'complete',
        delayMs: typeof e2eChatDelayMs === 'number' ? e2eChatDelayMs : 0,
        // 008: what each request carried, for e2e assertions (notes block per user turn, then the transcript block).
        onRequest: (request) =>
          void area.set({
            e2eLastChatRequest: request.turns
              .filter((t) => t.role === 'user')
              .map((t) => ({ notes: t.notes ?? null, context: t.context })),
          }),
      });
    },
  };
}
