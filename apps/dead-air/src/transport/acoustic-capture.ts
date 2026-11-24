/**
 * Pure burst capture: turns a stream of audio blocks into whole bursts.
 *
 * The B1 demodulator works on a buffer holding one frame, so something has to
 * decide where a burst starts and ends. This is a small energy gate: a block
 * whose RMS reaches `threshold` opens a burst; `hangoverBlocks` consecutive
 * quiet blocks close it. One block of pre-roll is kept so the first symbol is
 * not clipped. Chunk size is free (the AudioWorklet delivers 128 samples).
 *
 * No Web Audio here. The worklet shell feeds blocks in; the transport decodes
 * what comes out.
 */
import { rmsOf } from "./acoustic-metadata";

/** Registered name of the capture processor. */
export const WORKLET_NAME = "dead-air-capture";

export interface BurstCaptureOptions {
  sampleRate: number;
  /** RMS that counts as carrier. Default 0.02 (about -34 dBFS). */
  threshold?: number;
  /** Quiet duration that ends a burst, in seconds. Default 0.05. */
  hangoverSeconds?: number;
  /** Hard cap on one burst, in seconds. Default 5. */
  maxSeconds?: number;
}

export class BurstCapture {
  private readonly threshold: number;
  private readonly hangoverSamples: number;
  private readonly maxSamples: number;
  private pre: Float32Array = new Float32Array(0);
  private chunks: Float32Array[] = [];
  private total = 0;
  private quiet = 0;
  private open = false;

  constructor(options: BurstCaptureOptions) {
    this.threshold = options.threshold ?? 0.02;
    this.hangoverSamples = Math.ceil((options.hangoverSeconds ?? 0.05) * options.sampleRate);
    this.maxSamples = Math.ceil((options.maxSeconds ?? 5) * options.sampleRate);
  }

  /** Whether a burst is currently being collected. */
  get capturing(): boolean {
    return this.open;
  }

  /** Feed one block. Returns a finished burst, or `null` if none ended here. */
  push(block: Float32Array): Float32Array | null {
    const loud = rmsOf(block) >= this.threshold;
    if (!this.open) {
      if (!loud) {
        this.pre = block.slice();
        return null;
      }
      this.open = true;
      this.chunks = [this.pre, block.slice()];
      this.total = this.pre.length + block.length;
      this.quiet = 0;
      this.pre = new Float32Array(0);
      return this.total >= this.maxSamples ? this.finish() : null;
    }
    this.chunks.push(block.slice());
    this.total += block.length;
    this.quiet = loud ? 0 : this.quiet + block.length;
    if (this.quiet >= this.hangoverSamples || this.total >= this.maxSamples) return this.finish();
    return null;
  }

  /** Drop any partial burst (used while the device is transmitting). */
  reset(): void {
    this.pre = new Float32Array(0);
    this.chunks = [];
    this.total = 0;
    this.quiet = 0;
    this.open = false;
  }

  private finish(): Float32Array {
    const out = new Float32Array(this.total);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    this.reset();
    return out;
  }
}
