import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { foldHistory, TOWER_HISTORY_LIMIT } from "./history";

describe("foldHistory properties", () => {
  // Feature: consoles, Property 4: Tower keeps exactly the last 8 messages in order
  it("keeps min(8, count) most recent arrivals in arrival order", () => {
    // **Validates: Requirements 3.2**
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 40 }), (arrivals) => {
        const result = arrivals.reduce<number[]>((h, a) => foldHistory(h, a), []);
        expect(result.length).toBe(Math.min(TOWER_HISTORY_LIMIT, arrivals.length));
        expect(result).toEqual(arrivals.slice(-TOWER_HISTORY_LIMIT));
      }),
      { numRuns: 100 },
    );
  });
});
