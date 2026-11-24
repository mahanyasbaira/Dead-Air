import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createClock } from "./clock";

// Feature: skeleton, Property 1: Clock only moves forward by what it is told
// **Validates: Requirements 2.1**
describe("clock properties", () => {
  it("now() equals start plus the sum of advances, never decreases, and a past advanceTo throws without effect", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.array(fc.integer({ min: 0, max: 1000 }), { maxLength: 50 }),
        fc.integer({ min: 1, max: 1000 }),
        (start, steps, back) => {
          const c = createClock(start);
          let sum = start;
          let prev = c.now();
          for (const s of steps) {
            sum += s;
            expect(c.advance(s)).toBe(sum);
            expect(c.now()).toBe(sum);
            expect(c.now()).toBeGreaterThanOrEqual(prev);
            prev = c.now();
            expect(() => c.advanceTo(c.now() - back)).toThrow(RangeError);
            expect(c.now()).toBe(sum);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
