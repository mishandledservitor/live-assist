// Answers the offscreen document's credential requests (protocol OffscreenRequest). The key stays here: only a
// single-use token, or an error kind, goes back — as the direct reply to the offscreen document, never broadcast.
import type { CredentialStatusReply, OffscreenRequest, TokenReply } from '../../core/messaging/protocol';
import { CredentialError } from '../../providers/credentials/credential-source';
import { LocalKeyCredentialSource } from '../../providers/credentials/local-key-source';
import { SettingsStore } from '../../storage/settings-store';
import { OFFSCREEN_PATH } from './meeting-control';

/** Only our own offscreen document may ask. */
export function isOffscreenSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL(OFFSCREEN_PATH);
}

function localSource(): LocalKeyCredentialSource {
  const store = SettingsStore.fromChrome();
  return new LocalKeyCredentialSource({
    readKey: () => store.readApiKey(),
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
  });
}

export async function answerCredentialRequest(request: OffscreenRequest): Promise<TokenReply | CredentialStatusReply> {
  const source = localSource();
  if (request.type === 'credentials/status') return source.status();
  try {
    return { ok: true, credential: await source.getTranscriptionToken() };
  } catch (e) {
    return { ok: false, kind: e instanceof CredentialError ? e.kind : 'unknown' };
  }
}
