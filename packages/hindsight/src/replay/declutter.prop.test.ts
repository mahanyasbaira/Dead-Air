import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { spreadLabels } from "./declutter";
import { VIEW } from "./types";

// Feature: seance-replay, Property 14: Decision labels do not overlap
// **Validates: Requirements 2.1**
//
// Design conflict: the design says the minimum gap holds "for any set of decisions".
// `spreadLabels` cannot do that once (n - 1) * minLabelGap exceeds the range; it then
// spreads labels evenly (gap < minLabelGap). Order and bounds hold for every input.
// The gap is therefore asserted only where it is satisfiable.

const EPS = 1e-9;

const range = fc
  .record({ min: fc.integer({ min: 0, max: 200 }), span: fc.integer({ min: 0, max: 800 }) })
  .map(({ min, span }) => ({ min, max: min + span }));

const wanted = fc
  .array(fc.double({ min: -100, max: 1100, noNaN: true }), { maxLength: 45 })
  .map((a) => a.sort((x, y) => x - y));

const gap = VIEW.minLabelGap;

describe("Property 14: decision labels do not overlap", () => {
  it("keeps order and stays inside the range for every input", () => {
    fc.assert(
      fc.property(wanted, range, (ys, { min, max }) => {
        const out = spreadLabels(ys, gap, min, max);
        expect(out).toHaveLength(ys.length);
        for (const y of out) {
          expect(y).toBeGreaterThanOrEqual(min - EPS);
          expect(y).toBeLessThanOrEqual(max + EPS);
        }
        for (let i = 1; i < out.length; i++) expect(out[i]!).toBeGreaterThanOrEqual(out[i - 1]! - EPS);
      }),
      { numRuns: 200 },
    );
  });

  it("keeps at least minLabelGap between neighbours whenever they fit", () => {
    fc.assert(
      fc.property(wanted, range, (ys, { min, max }) => {
        fc.pre((ys.length - 1) * gap <= max - min);
        const out = spreadLabels(ys, gap, min, max);
        for (let i = 1; i < out.length; i++) expect(out[i]! - out[i - 1]!).toBeGreaterThanOrEqual(gap - EPS);
      }),
      { numRuns: 200 },
    );
  });

  it("when labels cannot fit, spreads them evenly instead (the design's gap guarantee does not hold)", () => {
    const min = 56;
    const max = 536;
    const ys = Array.from({ length: 40 }, () => 100);
    const out = spreadLabels(ys, gap, min, max);
    expect(out[1]! - out[0]!).toBeCloseTo((max - min) / 39, 9);
    expect(out[1]! - out[0]!).toBeLessThan(gap);
  });
});
