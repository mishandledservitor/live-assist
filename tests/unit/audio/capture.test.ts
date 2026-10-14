import { describe, expect, it, vi } from 'vitest';
import { captureMic, captureMixed, captureTab, tabConstraints, type CaptureDeps } from '@/audio/capture';
import { startPlayback } from '@/audio/playback';
import { PCM16_PAIR_PROCESSOR, PCM16_PROCESSOR } from '@/audio/pcm';

class FakeTrack {
  stopped = false;
  constructor(private readonly settings: MediaTrackSettings = {}) {}
  stop() {
    this.stopped = true;
  }
  getSettings() {
    return this.settings;
  }
}

class FakeStream {
  readonly tracks: FakeTrack[];
  constructor(settings?: MediaTrackSettings) {
    this.tracks = [new FakeTrack(settings)];
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}

class FakeNode {
  connectedTo: unknown[] = [];
  disconnected = false;
  connect(n: unknown) {
    this.connectedTo.push(n);
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeMerger extends FakeNode {
  constructor(readonly inputs: number) {
    super();
  }
  /** [source, input] pairs connected into this merger. */
  readonly fed: [unknown, number][] = [];
}

class FakeContext {
  closed = false;
  readonly mergers: FakeMerger[] = [];
  readonly modules: string[] = [];
  readonly sources: { stream: unknown; node: FakeNode }[] = [];
  readonly destination = { kind: 'destination' };
  readonly sampleRate: number;
  readonly audioWorklet = {
    addModule: (url: string) => {
      this.modules.push(url);
      return Promise.resolve();
    },
  };
  constructor(readonly options: AudioContextOptions | undefined) {
    this.sampleRate = options?.sampleRate ?? 48_000;
  }
  createMediaStreamSource(stream: unknown) {
    const node = new FakeNode();
    node.connect = (n: unknown, _out?: number, input?: number) => {
      node.connectedTo.push(n);
      if (n instanceof FakeMerger) n.fed.push([node, input ?? 0]);
      return n;
    };
    this.sources.push({ stream, node });
    return node;
  }
  createChannelMerger(inputs: number) {
    const m = new FakeMerger(inputs);
    this.mergers.push(m);
    return m;
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

class FakeWorkletNode extends FakeNode {
  readonly port: { onmessage: ((e: MessageEvent) => void) | null } = { onmessage: null };
  constructor(
    readonly context: FakeContext,
    readonly name: string,
    readonly options: AudioWorkletNodeOptions | undefined,
  ) {
    super();
  }
}

function setup(micSettings?: MediaTrackSettings) {
  const contexts: FakeContext[] = [];
  const nodes: FakeWorkletNode[] = [];
  const streams: FakeStream[] = [];
  const getUserMedia = vi.fn((_c: MediaStreamConstraints) => {
    const s = new FakeStream(micSettings);
    streams.push(s);
    return Promise.resolve(s as unknown as MediaStream);
  });
  const deps: CaptureDeps = {
    mediaDevices: { getUserMedia },
    createAudioContext: (options) => {
      const c = new FakeContext(options);
      contexts.push(c);
      return c;
    },
    createWorkletNode: (context, name, options) => {
      const n = new FakeWorkletNode(context as FakeContext, name, options);
      nodes.push(n);
      return n;
    },
    workletUrl: 'chrome-extension://id/pcm16-worklet.js',
  };
  return { deps, contexts, nodes, streams, getUserMedia };
}

describe('captureTab', () => {
  it('opens the tab stream with chromeMediaSource tab and the stream id', async () => {
    const { deps, getUserMedia } = setup();
    await captureTab('stream-123', deps, () => undefined);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: 'stream-123' } },
      video: false,
    });
  });

  it('feeds a 16 kHz capture context through the PCM16 worklet and forwards frames', async () => {
    const { deps, contexts, nodes } = setup();
    const frames: Int16Array[] = [];
    await captureTab('s', deps, (f) => frames.push(f));
    const capture = contexts.find((c) => c.options?.sampleRate === 16_000);
    expect(capture).toBeDefined();
    expect(capture?.modules).toEqual(['chrome-extension://id/pcm16-worklet.js']);
    expect(nodes[0]?.name).toBe(PCM16_PROCESSOR);
    expect(nodes[0]?.options).toMatchObject({ numberOfInputs: 1, numberOfOutputs: 0 });
    expect(capture?.sources[0]?.node.connectedTo).toEqual([nodes[0]]);
    const frame = new Int16Array(1600);
    nodes[0]?.port.onmessage?.({ data: frame } as MessageEvent);
    expect(frames).toEqual([frame]);
  });

  // T012 (2026-10-08): Meet tab audio arrives at 24 kHz, YouTube at 48 kHz. Whatever the source rate, frames come
  // from a context pinned at 16 kHz (Chrome resamples the stream to the context rate), and playback stays at the
  // device rate, so neither the transcription format nor what the user hears depends on the site.
  it.each([24_000, 48_000])('transcribes a %i Hz tab through the 16 kHz context only', async (rate) => {
    const { deps, contexts, nodes } = setup({ sampleRate: rate });
    await captureTab('s', deps, () => undefined);
    const capture = contexts.find((c) => c.sources.some((s) => s.node.connectedTo.includes(nodes[0])));
    expect(capture?.sampleRate).toBe(16_000);
    expect(contexts.filter((c) => c.options?.sampleRate !== undefined).map((c) => c.options?.sampleRate)).toEqual([
      16_000,
    ]);
  });

  it('keeps the tab audible through a device-rate playback context', async () => {
    const { deps, contexts, streams } = setup();
    await captureTab('s', deps, () => undefined);
    const playback = contexts.find((c) => c.options?.sampleRate === undefined);
    expect(playback).toBeDefined();
    expect(playback?.sources[0]?.stream).toBe(streams[0]);
    expect(playback?.sources[0]?.node.connectedTo).toEqual([playback?.destination]);
  });

  it('stop() stops every track and closes every context, idempotently', async () => {
    const { deps, contexts, streams, nodes } = setup();
    const handle = await captureTab('s', deps, () => undefined);
    await handle.stop();
    await handle.stop();
    expect(streams.flatMap((s) => s.tracks).every((t) => t.stopped)).toBe(true);
    expect(contexts).toHaveLength(2);
    expect(contexts.every((c) => c.closed)).toBe(true);
    expect(nodes[0]?.port.onmessage).toBeNull();
  });

  it('releases the stream when the capture pipeline fails to start', async () => {
    const { deps, streams, contexts } = setup();
    const failing: CaptureDeps = {
      ...deps,
      createAudioContext: (o) => {
        const c = deps.createAudioContext(o) as FakeContext;
        c.audioWorklet.addModule = () => Promise.reject(new Error('worklet load failed'));
        return c;
      },
    };
    await expect(captureTab('s', failing, () => undefined)).rejects.toThrow('worklet load failed');
    expect(streams[0]?.tracks[0]?.stopped).toBe(true);
    expect(contexts.every((c) => c.closed)).toBe(true);
  });
});

describe('captureMic', () => {
  it('passes mic constraints through and reports the applied settings', async () => {
    const { deps, getUserMedia, contexts } = setup({ echoCancellation: true, sampleRate: 48_000 });
    const constraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const handle = await captureMic(constraints, deps, () => undefined);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: constraints, video: false });
    expect(handle.settings).toEqual({ echoCancellation: true, sampleRate: 48_000 });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.options?.sampleRate).toBe(16_000);
  });

  it('propagates permission errors from getUserMedia', async () => {
    const { deps } = setup();
    const denied: CaptureDeps = {
      ...deps,
      mediaDevices: { getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    };
    await expect(captureMic({}, denied, () => undefined)).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('stop() stops the mic track and closes its context', async () => {
    const { deps, streams, contexts } = setup();
    const handle = await captureMic({}, deps, () => undefined);
    await handle.stop();
    expect(streams[0]?.tracks[0]?.stopped).toBe(true);
    expect(contexts[0]?.closed).toBe(true);
  });
});

// T095 (Phase 11, constitution v1.1.0): tab and mic are captured separately but mixed into one 16 kHz stream, the mic
// mixed in core behind 002's mute gate (T049).
describe('captureMixed', () => {
  const MIC = { echoCancellation: true };
  const opts = { tab: tabConstraints('stream-9'), mic: MIC };

  function failMic(deps: CaptureDeps, error: Error): CaptureDeps {
    return {
      ...deps,
      mediaDevices: {
        getUserMedia: (c) => (c.audio === MIC ? Promise.reject(error) : deps.mediaDevices.getUserMedia(c)),
      },
    };
  }

  it('opens the tab with its stream id and the mic with its constraints', async () => {
    const { deps, getUserMedia } = setup();
    await captureMixed(opts, deps, () => undefined);
    expect(getUserMedia).toHaveBeenNthCalledWith(1, {
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: 'stream-9' } },
      video: false,
    });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: MIC, video: false });
  });

  // 002 T049/T051: the mix moved out of Web Audio. Tab and mic reach one worklet as two channels of one merger and leave
  // it as paired frames, so the mute gate can silence the mic before the mixer (research R8).
  it('feeds tab (channel 0) and mic (channel 1) through one merger into one pair worklet in one 16 kHz context', async () => {
    const { deps, contexts, nodes, streams } = setup();
    const frames: [Int16Array, Int16Array | null][] = [];
    const handle = await captureMixed(opts, deps, (tab, mic) => frames.push([tab, mic]));
    const mix = contexts.filter((c) => c.options?.sampleRate === 16_000);
    expect(mix).toHaveLength(1);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.name).toBe(PCM16_PAIR_PROCESSOR);
    expect(nodes[0]?.options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    });
    const [tabSource, micSource] = mix[0]!.sources;
    expect(tabSource?.stream).toBe(streams[0]);
    expect(micSource?.stream).toBe(streams[1]);
    const merger = mix[0]!.mergers[0]!;
    expect(merger.inputs).toBe(2);
    expect(merger.fed).toEqual([
      [tabSource?.node, 0],
      [micSource?.node, 1],
    ]);
    expect(merger.connectedTo).toEqual([nodes[0]]);
    expect(handle.mic.ok).toBe(true);
    const tab = new Int16Array(1600).fill(1);
    const mic = new Int16Array(1600).fill(2);
    nodes[0]?.port.onmessage?.({ data: { tab, mic } } as MessageEvent);
    expect(frames).toEqual([[tab, mic]]);
  });

  it('has no gate of its own: the mic is gated in core, in front of the mixer', async () => {
    const { deps } = setup();
    const handle = await captureMixed(opts, deps, () => undefined);
    expect('setMicGate' in handle).toBe(false);
  });

  it('runs a tab-only mix and reports the mic error when the mic cannot be opened', async () => {
    const { deps, contexts, nodes } = setup();
    const denied = new DOMException('denied', 'NotAllowedError');
    const frames: [Int16Array, Int16Array | null][] = [];
    const handle = await captureMixed(opts, failMic(deps, denied), (tab, mic) => frames.push([tab, mic]));
    expect(handle.mic).toEqual({ ok: false, error: denied });
    const mix = contexts.find((c) => c.options?.sampleRate === 16_000)!;
    expect(mix.sources).toHaveLength(1);
    expect(mix.mergers[0]?.fed).toEqual([[mix.sources[0]?.node, 0]]);
    expect(mix.mergers[0]?.connectedTo).toEqual([nodes[0]]);
    const tab = new Int16Array(1600);
    nodes[0]?.port.onmessage?.({ data: { tab, mic: new Int16Array(1600) } } as MessageEvent);
    expect(frames).toEqual([[tab, null]]);
  });

  it('rejects when the tab cannot be opened and leaves nothing open', async () => {
    const { deps, contexts } = setup();
    const noTab: CaptureDeps = { ...deps, mediaDevices: { getUserMedia: () => Promise.reject(new Error('no tab')) } };
    await expect(captureMixed(opts, noTab, () => undefined)).rejects.toThrow('no tab');
    expect(contexts.every((c) => c.closed)).toBe(true);
  });

  it('releases both streams when the mixing pipeline fails to start', async () => {
    const { deps, streams } = setup();
    const failing: CaptureDeps = {
      ...deps,
      createAudioContext: (o) => {
        const c = deps.createAudioContext(o) as FakeContext;
        c.audioWorklet.addModule = () => Promise.reject(new Error('worklet load failed'));
        return c;
      },
    };
    await expect(captureMixed(opts, failing, () => undefined)).rejects.toThrow('worklet load failed');
    expect(streams).toHaveLength(2);
    expect(streams.flatMap((s) => s.tracks).every((t) => t.stopped)).toBe(true);
  });

  it('keeps the tab (only) audible through a device-rate playback context', async () => {
    const { deps, contexts, streams } = setup();
    await captureMixed(opts, deps, () => undefined);
    const playback = contexts.filter((c) => c.options?.sampleRate === undefined);
    expect(playback).toHaveLength(1);
    expect(playback[0]?.sources.map((s) => s.stream)).toEqual([streams[0]]);
    expect(playback[0]?.sources[0]?.node.connectedTo).toEqual([playback[0]?.destination]);
  });

  it('stop() stops every track and closes every context, idempotently', async () => {
    const { deps, contexts, streams, nodes } = setup();
    const handle = await captureMixed(opts, deps, () => undefined);
    await handle.stop();
    await handle.stop();
    expect(streams).toHaveLength(2);
    expect(streams.flatMap((s) => s.tracks).every((t) => t.stopped)).toBe(true);
    expect(contexts).toHaveLength(2);
    expect(contexts.every((c) => c.closed)).toBe(true);
    expect(nodes[0]?.port.onmessage).toBeNull();
  });
});

describe('startPlayback', () => {
  it('routes a stream to the destination of a default-rate context and closes it on stop', async () => {
    const { deps, contexts } = setup();
    const stream = new FakeStream() as unknown as MediaStream;
    const playback = startPlayback(stream, deps.createAudioContext);
    expect(contexts[0]?.options).toBeUndefined();
    expect(contexts[0]?.sources[0]?.node.connectedTo).toEqual([contexts[0]?.destination]);
    await playback.stop();
    expect(contexts[0]?.closed).toBe(true);
  });
});
