// 005: what the account line needs, behind one interface so the component is tested with a fake. The service worker
// holds the key and calls ElevenLabs; the panel receives only the derived fields, validated here (FR-009).
import type { AccountUsageReply } from '../../core/account/usage';
import { parseAccountUsageReply, type Command } from '../../core/messaging/protocol';

export interface AccountApi {
  usage(): Promise<AccountUsageReply>;
}

export interface AccountApiDeps {
  sendCommand(command: Command): Promise<unknown>;
}

export function createAccountApi(deps: AccountApiDeps): AccountApi {
  return {
    async usage() {
      try {
        return (
          parseAccountUsageReply(await deps.sendCommand({ type: 'account/usage' })) ?? { ok: false, kind: 'unknown' }
        );
      } catch {
        return { ok: false, kind: 'unknown' };
      }
    },
  };
}

export function chromeAccountApi(): AccountApi {
  return createAccountApi({ sendCommand: (command) => chrome.runtime.sendMessage(command) });
}
