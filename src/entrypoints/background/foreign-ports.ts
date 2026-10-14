// Ports the service worker receives but are not for it (003). It listens for the side panel's `chat` port, so it also
// receives every other port opened with chrome.runtime.connect: the panel's `live` port and Meet's port, both meant for
// the offscreen document. A port reaches every onConnect listener; disconnecting any receiving end closes it for the
// opener, and the opener sees it close by itself only when every receiver has let go. So this end must not disconnect
// while the offscreen document holds the other end, and must let go when the document is absent or closes — otherwise
// the panel would wait on a `live` port with no meeting behind it.
import type { ChatPortLike } from './chat-session';

type Port = Pick<ChatPortLike, 'disconnect' | 'onDisconnect'>;

export interface ForeignPorts {
  /** Holds the port while the offscreen document is open; lets go at once when it is not. */
  hold(port: Port): Promise<void>;
  /** The offscreen document closed: let go of everything held. */
  releaseAll(): void;
}

export function createForeignPorts(deps: { offscreenOpen(): Promise<boolean> }): ForeignPorts {
  const held = new Set<Port>();
  const release = (port: Port) => {
    if (!held.delete(port)) return;
    try {
      port.disconnect();
    } catch {
      // Already closed.
    }
  };
  return {
    async hold(port) {
      held.add(port);
      port.onDisconnect.addListener(() => held.delete(port));
      if (!(await deps.offscreenOpen())) release(port);
    },
    releaseAll() {
      for (const port of [...held]) release(port);
    },
  };
}
