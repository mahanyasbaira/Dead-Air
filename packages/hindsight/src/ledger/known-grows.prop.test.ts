import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { ledgerArb, participantIds } from "./arbitraries";
import { knownAt } from "./ledger";

describe("known set growth", () => {
  // Feature: seance-replay, Property 2: Known sets only grow
  // **Validates: Requirements 1.2**
  it("Property 2: knownAt(l, p, t1) is a subset of knownAt(l, p, t2) for t1 <= t2", () => {
    fc.assert(
      fc.property(
        ledgerArb,
        participantIds,
        fc.integer({ min: -5, max: 50 }),
        fc.integer({ min: -5, max: 50 }),
        (l, p, a, b) => {
          const [t1, t2] = a <= b ? [a, b] : [b, a];
          const later = knownAt(l, p, t2);
          for (const x of knownAt(l, p, t1)) expect(later.has(x)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});
