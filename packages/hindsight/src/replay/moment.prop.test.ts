import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ledgerArb, participantIds } from "../ledger/arbitraries";
import { inTransitAt, knownAt, lostAt } from "../ledger/ledger";
import { missingAt } from "./moment";

function isSortedUnique(xs: readonly string[]): boolean {
  return xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);
}

// Feature: seance-replay, Property 9: What was missing is the complement of what was known
describe("missingAt", () => {
  it("returns sorted, unique, pairwise disjoint lists, disjoint from knownAt, matching the ledger", () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(ledgerArb, participantIds, fc.integer({ min: -5, max: 45 }), (ledger, f, t) => {
        const m = missingAt(ledger, f, t);
        const known = knownAt(ledger, f, t);
        const lists = [m.inTransit, m.lost, m.elsewhere];
        for (const list of lists) {
          expect(isSortedUnique(list)).toBe(true);
          for (const id of list) expect(known.has(id)).toBe(false);
        }
        for (let i = 0; i < lists.length; i++) {
          for (let j = i + 1; j < lists.length; j++) {
            const other = new Set(lists[j]);
            for (const id of lists[i] as readonly string[]) expect(other.has(id)).toBe(false);
          }
        }
        expect(m.inTransit).toEqual([...inTransitAt(ledger, f, t)].sort());
        expect(m.lost).toEqual([...lostAt(ledger, f, t)].sort());
      }),
      { numRuns: 300 },
    );
  });
});
