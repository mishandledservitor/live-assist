// The side panel's view of settings (red-team 2026-10-08, 001 FR-003a, decision 31): it reads settings and may write
// or delete a key, but has no way to read one. The key hint comes from the service worker (`settings/key-hint`).
// ESLint keeps side-panel code from importing the full SettingsStore.
import { PreferencesStore } from './preferences-store';

export type { SettingsPatch, StorageAreaLike } from './preferences-store';

export class PanelSettingsStore extends PreferencesStore {
  static fromChrome(): PanelSettingsStore {
    return new PanelSettingsStore(chrome.storage.local);
  }
}
