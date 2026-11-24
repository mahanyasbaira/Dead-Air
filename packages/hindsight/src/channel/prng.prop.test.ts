import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Prng } from "./prng";

/**
 * Property tests for the seeded PRNG.
 *
 * **Validates: Requirements 3.1** — determinism under a fixed seed is the backbone
 * of property P4 (the channel is reproducible). These properties pin the PRNG half
 * of that guarantee: same seed ⇒ identical stream, and a stream is reproducible
 * after re-seeding.
 *
 * On failure, fast-check prints the seed and the counterexample; paste any
 * counterexample into `prng.test.ts` once fixed (testing steering).
 */
describe("Prng properties", () => {
  it("same seed produces an identical stream", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 256 }), (seed, n) => {
        const a = new Prng(seed);
        const b = new Prng(seed);
        for (let i = 0; i < n; i++) {
          expect(b.nextUint32()).toBe(a.nextUint32());
        }
      }),
    );
  });

  it("stream is reproducible after re-seeding with the same seed", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 256 }), (seed, n) => {
        const prng = new Prng(seed);
        const first = Array.from({ length: n }, () => prng.nextUint32());
        prng.reseed(seed);
        const second = Array.from({ length: n }, () => prng.nextUint32());
        expect(second).toEqual(first);
      }),
    );
  });

  it("re-seeding to a different generator's start reproduces its stream", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), fc.integer({ min: 1, max: 64 }), (s1, s2, n) => {
        const target = new Prng(s2);
        const expected = Array.from({ length: n }, () => target.nextUint32());

        const prng = new Prng(s1);
        prng.nextUint32(); // advance to a different position first
        prng.reseed(s2);
        const got = Array.from({ length: n }, () => prng.nextUint32());
        expect(got).toEqual(expected);
      }),
    );
  });

  it("nextFloat always lands in [0, 1)", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 256 }), (seed, n) => {
        const prng = new Prng(seed);
        for (let i = 0; i < n; i++) {
          const f = prng.nextFloat();
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f).toBeLessThan(1);
        }
      }),
    );
  });

  it("nextBool is deterministic for the same seed and probability", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 1, max: 128 }),
        (seed, p, n) => {
          const a = new Prng(seed);
          const b = new Prng(seed);
          for (let i = 0; i < n; i++) {
            expect(b.nextBool(p)).toBe(a.nextBool(p));
          }
        },
      ),
    );
  });

  it("nextUint32 output is always an unsigned 32-bit integer", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 256 }), (seed, n) => {
        const prng = new Prng(seed);
        for (let i = 0; i < n; i++) {
          const v = prng.nextUint32();
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(0xffffffff);
        }
      }),
    );
  });
});
