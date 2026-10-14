// 003: since the service worker listens for the `chat` port, it also receives every other port (the panel's `live`,
// Meet's) — a port reaches every onConnect listener. Disconnecting one end closes the port for its opener, and the
// opener sees the port close only when every receiver has let go. So the service worker lets go of a port meant for
// the offscreen document only when that document is not there (it was the only receiver), and when it closes.
import { describe, expect, it, vi } from 'vitest';
import { createForeignPorts } from '@/entrypoints/background/foreign-ports';

function fakePort() {
  const disconnectListeners: (() => void)[] = [];
  const disconnect = vi.fn();
  return {
    name: 'live',
    postMessage: vi.fn(),
    disconnect,
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: (l: () => void) => disconnectListeners.push(l) },
    drop: () => disconnectListeners.forEach((l) => l()),
  };
}

describe('createForeignPorts', () => {
  it('lets go at once when no offscreen document is open', async () => {
    const ports = createForeignPorts({ offscreenOpen: () => Promise.resolve(false) });
    const port = fakePort();
    await ports.hold(port);
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps holding while the offscreen document is open, so the opener stays connected to it', async () => {
    const ports = createForeignPorts({ offscreenOpen: () => Promise.resolve(true) });
    const port = fakePort();
    await ports.hold(port);
    expect(port.disconnect).not.toHaveBeenCalled();
  });

  it('lets go of every held port once the offscreen document has closed', async () => {
    const ports = createForeignPorts({ offscreenOpen: () => Promise.resolve(true) });
    const a = fakePort();
    const b = fakePort();
    await ports.hold(a);
    await ports.hold(b);
    ports.releaseAll();
    expect(a.disconnect).toHaveBeenCalledTimes(1);
    expect(b.disconnect).toHaveBeenCalledTimes(1);
    ports.releaseAll();
    expect(a.disconnect).toHaveBeenCalledTimes(1);
  });

  it('forgets a port its opener closed', async () => {
    const ports = createForeignPorts({ offscreenOpen: () => Promise.resolve(true) });
    const port = fakePort();
    await ports.hold(port);
    port.drop();
    ports.releaseAll();
    expect(port.disconnect).not.toHaveBeenCalled();
  });

  it('a port that arrives while the document is closing is still let go', async () => {
    let resolve: (open: boolean) => void = () => undefined;
    const ports = createForeignPorts({ offscreenOpen: () => new Promise((r) => (resolve = r)) });
    const port = fakePort();
    const holding = ports.hold(port);
    ports.releaseAll();
    resolve(true);
    await holding;
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });
});
