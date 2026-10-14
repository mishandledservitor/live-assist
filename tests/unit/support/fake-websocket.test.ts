import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFixture } from '@/providers/transcription/fixture';
import { FakeSocketServer, REFUSE, loadFixture } from '../../support/fake-websocket';

describe('parseFixture', () => {
  it('parses JSONL lines and skips blanks', () => {
    const lines = parseFixture(
      '{"at":0,"dir":"in","msg":{"message_type":"session_started"}}\n\n{"at":5,"dir":"close","msg":{"code":1006}}\n',
    );
    expect(lines).toEqual([
      { at: 0, dir: 'in', msg: { message_type: 'session_started' } },
      { at: 5, dir: 'close', msg: { code: 1006 } },
    ]);
  });

  it('rejects malformed lines with the line number', () => {
    expect(() => parseFixture('{"at":0,"dir":"sideways","msg":{}}')).toThrow(/line 1/);
    expect(() => parseFixture('not json')).toThrow(/line 1/);
  });

  it('loads every committed fixture', () => {
    for (const name of [
      'happy-path',
      'drop-mid-partial',
      'time-limit',
      'auth-error',
      'quota-error',
      'no-detail-after-commit',
      'unknown-message',
    ]) {
      expect(loadFixture(name).length).toBeGreaterThan(0);
    }
  });
});

describe('FakeSocketServer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens, replays inbound lines on the fake clock and records outbound messages', () => {
    const server = new FakeSocketServer([loadFixture('happy-path')]);
    const ws = new server.WebSocket('wss://example.test/x?token=t');
    const received: unknown[] = [];
    let opened = false;
    ws.onopen = () => (opened = true);
    ws.onmessage = (e) => received.push(JSON.parse(e.data));
    expect(ws.readyState).toBe(0);

    vi.advanceTimersByTime(0);
    expect(opened).toBe(true);
    expect(ws.readyState).toBe(1);
    expect(received).toHaveLength(1);

    ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: 'AA==' }));
    expect(server.sockets[0]?.sent).toEqual([{ message_type: 'input_audio_chunk', audio_base_64: 'AA==' }]);
    expect(server.sockets[0]?.url).toBe('wss://example.test/x?token=t');

    vi.advanceTimersByTime(3_000);
    expect(received.map((m) => (m as { message_type: string }).message_type)).toContain('committed_transcript');
  });

  it('closes from the script with the given code', () => {
    const server = new FakeSocketServer([loadFixture('drop-mid-partial')]);
    const ws = new server.WebSocket('wss://x');
    const closes: { code: number; wasClean: boolean }[] = [];
    ws.onclose = (e) => closes.push({ code: e.code, wasClean: e.wasClean });
    vi.advanceTimersByTime(10_000);
    expect(closes).toEqual([{ code: 1006, wasClean: false }]);
    expect(ws.readyState).toBe(3);
  });

  it('client close() stops the replay and fires one clean close', () => {
    const server = new FakeSocketServer([loadFixture('happy-path')]);
    const ws = new server.WebSocket('wss://x');
    const received: unknown[] = [];
    const closes: number[] = [];
    ws.onmessage = (e) => received.push(e.data);
    ws.onclose = (e) => closes.push(e.code);
    vi.advanceTimersByTime(0);
    ws.close();
    ws.close();
    vi.advanceTimersByTime(10_000);
    expect(received).toHaveLength(1);
    expect(closes).toEqual([1000]);
  });

  it('uses one script per connection and can refuse a connection', () => {
    const server = new FakeSocketServer([REFUSE, loadFixture('auth-error')]);
    const first = new server.WebSocket('wss://1');
    const events: string[] = [];
    first.onopen = () => events.push('open');
    first.onerror = () => events.push('error');
    first.onclose = (e) => events.push(`close:${e.code}`);
    vi.advanceTimersByTime(100);
    expect(events).toEqual(['error', 'close:1006']);

    const second = new server.WebSocket('wss://2');
    vi.advanceTimersByTime(100);
    expect(second.readyState).toBe(3);
    expect(server.sockets).toHaveLength(2);
  });

  it('throws when more connections are made than scripted', () => {
    const server = new FakeSocketServer([]);
    expect(() => new server.WebSocket('wss://x')).toThrow(/no script/);
  });
});
