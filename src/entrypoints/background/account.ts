// 005: answers the panel's `account/usage` command. The key is read and used here only; the reply carries derived
// fields or an error kind (specs/005-account-usage/contracts/account-messages.md).
import type { AccountUsageReply } from '../../core/account/usage';
import { createLogger } from '../../core/log';
import { fetchAccountUsage, type AccountDeps } from '../../providers/account/elevenlabs-subscription';
import type { SettingsStore } from '../../storage/settings-store';

const log = createLogger('account');

export function answerAccountUsage(deps: {
  store: SettingsStore;
  fetch: AccountDeps['fetch'];
}): Promise<AccountUsageReply> {
  return fetchAccountUsage({ readKey: () => deps.store.readApiKey(), fetch: deps.fetch, log });
}
