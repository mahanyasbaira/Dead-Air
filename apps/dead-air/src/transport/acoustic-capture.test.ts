import { describe, expect, it } from "vitest";
import { BurstCapture } from "./acoustic-capture";
import { modulate } from "../modem/fsk";
import { frame } from "../modem/frame";

const SR = 44100;

function feed(cap: BurstCapture, samples: Float32Array, chunk: number): Float32Array[] {
  const bursts: Float32Array[] = [];
  for (let i = 0; i < samples.length; i += chunk) {
    const b = cap.push(samples.subarray(i, Math.min(samples.length, i + chunk)));
    if (b) bursts.push(b);
  }
  return bursts;
}

describe("BurstCapture", () => {
  it("emits one burst containing the whole tone, in 128-sample blocks", () => {
    const tone = modulate(frame(Uint8Array.of(1, 2, 3)), SR);
    const stream = new Float32Array(2000 + tone.length + SR / 5);
    stream.set(tone, 2000);
    const bursts = feed(new BurstCapture({ sampleRate: SR }), stream, 128);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].length).toBeGreaterThanOrEqual(tone.length);
    expect(bursts[0].length).toBeLessThan(tone.length + 2 * 128 + 0.06 * SR);
  });

  it("emits nothing for silence", () => {
    expect(feed(new BurstCapture({ sampleRate: SR }), new Float32Array(SR), 128)).toHaveLength(0);
  });

  it("reset drops a partial burst", () => {
    const cap = new BurstCapture({ sampleRate: SR });
    cap.push(new Float32Array(128).fill(0.5));
    expect(cap.capturing).toBe(true);
    cap.reset();
    expect(cap.capturing).toBe(false);
  });
});
