// A WebSocket stand-in that replays a recorded ElevenLabs sequence (fixture.ts format) on timers and records
// outbound messages. Used by tests (on fake timers) and by FakeTranscriptionProvider in e2e builds.
import type { FixtureLine } from '../fixture';
import { WS_CLOSED, WS_CONNECTING, WS_OPEN, type WebSocketCtor, type WebSocketLike } from '../socket';

/** Script sentinel: the connection fails before opening (error, then close 1006). */
export const REFUSE = Symbol('refuse');
export type Script = FixtureLine[] | typeof REFUSE;

export class ReplaySocket implements WebSocketLike {
  readyState = WS_CONNECTING;
  onopen: WebSocketLike['onopen'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  onerror: WebSocketLike['onerror'] = null;
  onclose: WebSocketLike['onclose'] = null;
  readonly sent: unknown[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    readonly url: string,
    readonly script: Script,
  ) {
    if (script === REFUSE) {
      this.later(0, () => this.refuse());
      return;
    }
    // Times are relative to the open event, which fires at t=0; timers with equal delay run in insertion order.
    this.later(0, () => this.open());
    for (const line of script) {
      if (line.dir === 'in') this.later(line.at, () => this.onmessage?.({ data: JSON.stringify(line.msg) }));
      if (line.dir === 'close') this.later(line.at, () => this.serverClose(line.msg.code));
    }
  }

  send(data: string): void {
    if (this.readyState !== WS_OPEN) throw new Error('ReplaySocket.send while not open');
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === WS_CLOSED) return;
    this.cancelAll();
    this.readyState = WS_CLOSED;
    this.later(0, () => this.onclose?.({ code, wasClean: true, reason }));
  }

  /** Outbound messages of a given message_type. */
  sentOfType(type: string): Record<string, unknown>[] {
    return this.sent.filter((m) => (m as { message_type?: string }).message_type === type) as Record<string, unknown>[];
  }

  private open(): void {
    this.readyState = WS_OPEN;
    this.onopen?.({});
  }

  private refuse(): void {
    this.readyState = WS_CLOSED;
    this.onerror?.({});
    this.onclose?.({ code: 1006, wasClean: false, reason: '' });
  }

  private serverClose(code: number): void {
    if (this.readyState === WS_CLOSED) return;
    this.cancelAll();
    this.readyState = WS_CLOSED;
    this.onclose?.({ code, wasClean: code === 1000, reason: '' });
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private cancelAll(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}

/** Hands one script to each successive connection. */
export class ReplaySocketServer {
  readonly sockets: ReplaySocket[] = [];
  readonly WebSocket: WebSocketCtor;

  constructor(scripts: readonly Script[] | ((index: number) => Script | undefined)) {
    const scriptFor = typeof scripts === 'function' ? scripts : (i: number) => scripts[i];
    const sockets = this.sockets;
    this.WebSocket = class extends ReplaySocket {
      constructor(url: string) {
        const script = scriptFor(sockets.length);
        if (script === undefined) throw new Error(`ReplaySocketServer: no script for connection ${sockets.length + 1}`);
        super(url, script);
        sockets.push(this);
      }
    };
  }
}
