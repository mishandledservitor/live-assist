// Capturing a tab mutes it for the user; routing the stream to a device-rate context keeps it audible
// with untouched quality (FR-009, SC-006, research R5).

/** The parts of AudioContext this module and capture.ts use. */
export interface AudioNodeLike {
  connect(destination: never, output?: number, input?: number): unknown;
  disconnect(): void;
}

export interface AudioContextLike {
  readonly sampleRate: number;
  readonly destination: unknown;
  readonly audioWorklet: { addModule(url: string): Promise<void> };
  createMediaStreamSource(stream: MediaStream): AudioNodeLike;
  /** Puts tab and mic on separate channels of the mix worklet (capture.ts captureMixed). */
  createChannelMerger(inputs: number): AudioNodeLike;
  close(): Promise<void>;
}

export type CreateAudioContext = (options?: AudioContextOptions) => AudioContextLike;

export interface Playback {
  stop(): Promise<void>;
}

export function startPlayback(stream: MediaStream, createAudioContext: CreateAudioContext): Playback {
  const context = createAudioContext();
  const source = context.createMediaStreamSource(stream);
  source.connect(context.destination as never);
  let stopped = false;
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      source.disconnect();
      await context.close();
    },
  };
}
