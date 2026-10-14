// AudioWorklet: runs in a 16 kHz AudioContext, turns render quanta into 100 ms PCM16 mono frames and posts them
// (buffer transferred) to the main thread. Thin by design; the conversion logic lives in pcm.ts and is unit-tested.
// Two processors: one mono stream (spike recorder), and tab + mic as paired frames for the meeting mix (002 T049).
import {
  FrameAssembler,
  FramePairAssembler,
  PCM16_PAIR_PROCESSOR,
  PCM16_PROCESSOR,
  downmixToMono,
  floatToInt16,
} from './pcm';

interface WorkletPort {
  postMessage(message: unknown, transfer: Transferable[]): void;
}
declare const AudioWorkletProcessor: {
  prototype: { readonly port: WorkletPort };
  new (): { readonly port: WorkletPort };
};
declare function registerProcessor(name: string, ctor: new () => { readonly port: WorkletPort }): void;

class Pcm16Processor extends AudioWorkletProcessor {
  private readonly assembler = new FrameAssembler();

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (input && input.length > 0) {
      for (const frame of this.assembler.push(floatToInt16(downmixToMono(input)))) {
        this.port.postMessage(frame, [frame.buffer]);
      }
    }
    return true;
  }
}

registerProcessor(PCM16_PROCESSOR, Pcm16Processor);

/** Input channel 0 is the tab, channel 1 the mic (one ChannelMerger, discrete): posts `{ tab, mic }` frame pairs. */
class Pcm16PairProcessor extends AudioWorkletProcessor {
  private readonly pairs = new FramePairAssembler();

  process(inputs: Float32Array[][]): boolean {
    for (const pair of this.pairs.push(inputs[0] ?? [])) {
      this.port.postMessage(pair, [pair.tab.buffer, pair.mic.buffer]);
    }
    return true;
  }
}

registerProcessor(PCM16_PAIR_PROCESSOR, Pcm16PairProcessor);
