/**
 * Seeded deterministic PRNG for the kit.
 *
 * This is the ONLY source of randomness permitted in `engine`, `channel`
 * and any signal-processing code (tech steering). Unseeded randomness and wall-clock time are banned there,
 * because the whole point of the channel is reproducibility: the same seed must give
 * the same stream of impairment decisions so a run can be replayed and the Séance
 * is deterministic (design "Determinism contract", backs property P4).
 *
 * Algorithm: Mulberry32 — a compact, well-distributed 32-bit generator. State is a
 * single uint32; each step advances the state and mixes it to a uint32 output. It
 * is pure arithmetic with no platform entropy, so it behaves identically in Node
 * (tests) and in the browser.
 */

const UINT32 = 0x1_0000_0000; // 2^32, used to normalise to [0, 1).

export class Prng {
  /** Current 32-bit state. Kept as an unsigned integer via `>>> 0`. */
  private state: number;

  /**
   * @param seed any number; it is coerced to a uint32. The same seed always
   *             produces the same stream.
   */
  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /**
   * Reset the stream to a seed, so a fresh sequence can be reproduced on demand.
   * Re-seeding with the value a generator started from reproduces its stream.
   */
  reseed(seed: number): void {
    this.state = seed >>> 0;
  }

  /** Next value in the stream as an unsigned 32-bit integer in [0, 2^32). */
  nextUint32(): number {
    // Mulberry32.
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return (z ^ (z >>> 14)) >>> 0;
  }

  /** Next value as a float in [0, 1), using the full 32-bit output. */
  nextFloat(): number {
    return this.nextUint32() / UINT32;
  }

  /**
   * Next value as a boolean that is `true` with probability `p`.
   * `p <= 0` is always `false`; `p >= 1` is always `true`.
   */
  nextBool(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.nextFloat() < p;
  }
}

/** Convenience factory mirroring `new Prng(seed)`. */
export function createPrng(seed: number): Prng {
  return new Prng(seed);
}
