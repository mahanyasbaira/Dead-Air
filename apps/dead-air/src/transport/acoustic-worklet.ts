/**
 * AudioWorklet shell. The only file that touches AudioWorkletGlobalScope.
 *
 * It does no DSP of its own: it hands each 128-sample input block to the pure
 * {@link BurstCapture} and posts finished bursts to the main thread, where the
 * transport runs the B1 demodulator. Messages in: `{ type: "listen", on }`.
 * Messages out: `{ type: "burst", samples, sampleRate }`.
 *
 * Load with `audioContext.audioWorklet.addModule(url)` where `url` is the
 * bundled URL of this file, then `new AudioWorkletNode(ctx, WORKLET_NAME)`.
 */
import { BurstCapture, WORKLET_NAME } from "./acoustic-capture";

// Minimal declarations: TypeScript's DOM lib omits the worklet global scope.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(
  name: string,
  ctor: new () => AudioWorkletProcessor,
): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly capture = new BurstCapture({ sampleRate });
  private listening = true;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; on?: boolean };
      if (data.type === "listen") {
        this.listening = data.on === true;
        if (!this.listening) this.capture.reset();
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const block = inputs[0]?.[0];
    if (!block || !this.listening) return true;
    const burst = this.capture.push(block);
    if (burst) {
      this.port.postMessage({ type: "burst", samples: burst, sampleRate }, [burst.buffer]);
    }
    return true;
  }
}

registerProcessor(WORKLET_NAME, CaptureProcessor);
