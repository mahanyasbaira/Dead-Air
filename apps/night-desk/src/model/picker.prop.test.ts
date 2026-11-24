import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { filterNights } from "./picker";

// Small alphabet with mixed case and spaces so queries often hit.
const text = fc.string({ unit: fc.constantFrom("a", "b", "A", "B", " ", "c"), maxLength: 6 });
const night = fc.record({
  scenario: fc.record({ title: text }),
  script: fc.record({ tags: fc.array(text, { maxLength: 3 }) }),
});
// Distinct identity per night so subsequence order is checkable.
const nightsArb = fc.array(night, { maxLength: 12 }).map((l) => l.map((n, i) => ({ ...n, i })));

describe("Property 10: the picker filter returns only matching nights, in order", () => {
  /** Feature: night-desk, Property 10. Validates: Requirements 5.3 */
  it("returns an ordered subsequence whose members contain the query; empty returns all", () => {
    fc.assert(
      fc.property(nightsArb, text, (list, query) => {
        const out = filterNights(list, query);
        const idx = out.map((n) => n.i);
        expect(idx).toEqual([...idx].sort((a, b) => a - b));
        expect(new Set(idx).size).toBe(idx.length);
        for (const n of out) expect(list[n.i]).toBe(n);
        const q = query.trim().toLowerCase();
        for (const n of out) {
          const hit =
            n.scenario.title.toLowerCase().includes(q) || n.script.tags.some((t) => t.toLowerCase().includes(q));
          expect(hit).toBe(true);
        }
        // Completeness: nothing matching is left out.
        const expected = list.filter(
          (n) => q === "" || n.scenario.title.toLowerCase().includes(q) || n.script.tags.some((t) => t.toLowerCase().includes(q)),
        );
        expect(out).toEqual(expected);
        if (q === "") expect(out).toEqual(list);
      }),
      { numRuns: 200 },
    );
  });
});
