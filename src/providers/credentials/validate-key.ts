// FR-002 key check (contracts/extension-messages.md `settings/validate-key`): mint one token with the pending
// candidate key; promote the candidate on success, discard it on failure. The token is thrown away.
import type { ValidateKeyResult } from '../../core/messaging/protocol';
import type { SettingsStore } from '../../storage/settings-store';
import { CredentialError } from './credential-source';
import { LocalKeyCredentialSource, type LocalKeyDeps } from './local-key-source';

export interface ValidateKeyDeps {
  store: SettingsStore;
  fetch: LocalKeyDeps['fetch'];
  now: () => number;
}

export async function validatePendingKey(deps: ValidateKeyDeps): Promise<ValidateKeyResult> {
  const pending = await deps.store.readPendingKey();
  const source = new LocalKeyCredentialSource({
    readKey: () => Promise.resolve(pending),
    fetch: deps.fetch,
    now: deps.now,
  });
  try {
    await source.getTranscriptionToken();
  } catch (error) {
    await deps.store.discardPendingKey();
    return { ok: false, kind: error instanceof CredentialError ? error.kind : 'unknown' };
  }
  await deps.store.promotePendingKey();
  return { ok: true, hint: (await deps.store.keyHint()) ?? '' };
}
