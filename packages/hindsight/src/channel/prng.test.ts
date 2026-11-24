import { describe, expect, it } from "vitest";
import { Prng, createPrng } from "./prng";

/**
 * Known-seed vectors. These pin the exact Mulberry32 output for seed 1 so any
 * accidental change to the algorithm is caught. The values are the generator's
 * own output, captured once and frozen here (testing steering: pin behaviour a
 * person can point at).
 */
const SEED_1_UINT32 = [2693262067, 11749833, 2265367787, 4213581821, 4159151403];

describe("Prng known-seed vector", () => {
  it("produces the frozen uint32 stream for seed 1", () => {
    const prng = new Prng(1);
    const got = Array.from({ length: SEED_1_UINT32.length }, () => prng.nextUint32());
    expect(got).toEqual(SEED_1_UINT32);
  });

  it("emits unsigned 32-bit integers", () => {
    const prng = new Prng(1);
    for (let i = 0; i < 100; i++) {
      const v = prng.nextUint32();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });

  it("maps nextFloat into [0, 1)", () => {
    const prng = new Prng(12345);
    for (let i = 0; i < 100; i++) {
      const f = prng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("treats nextBool boundary probabilities as certain", () => {
    const prng = new Prng(7);
    expect(prng.nextBool(0)).toBe(false);
    expect(prng.nextBool(-1)).toBe(false);
    expect(prng.nextBool(1)).toBe(true);
    expect(prng.nextBool(2)).toBe(true);
  });

  it("createPrng matches the constructor", () => {
    const a = createPrng(99);
    const b = new Prng(99);
    for (let i = 0; i < 20; i++) {
      expect(a.nextUint32()).toBe(b.nextUint32());
    }
  });

  it("coerces equivalent seeds to the same uint32 stream", () => {
    // 0 and 2^32 coerce to the same uint32 state.
    const a = new Prng(0);
    const b = new Prng(2 ** 32);
    expect(a.nextUint32()).toBe(b.nextUint32());
  });
});
