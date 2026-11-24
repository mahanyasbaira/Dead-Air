import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cursorArb, focusArb, worldlineInputArb } from "./arbitraries";
import { timelineText, type TimelineKind } from "./timeline";
import { layoutWorldlines } from "./worldlines";

const FATE_WORDS = [
  "on its way",
  "arrived",
  "arrived damaged",
  "lost in a collision",
  "did not arrive",
  "not yet settled",
];

// Feature: seance-replay, Property 12: The text timeline says what the diagram shows
describe("text timeline", () => {
  // Fact marks use the factId as id, one mark per participant and fact (seed 1213005758:
  // learned(p1,f1,0) and learned(p2,f1,0)), so fact ids are unique per participant line.
  it("has one entry per decision, signal, arrival and fact, in time order, each signal naming its fate", () => {
    // **Validates: Requirements 4.3**
    fc.assert(
      fc.property(worldlineInputArb, cursorArb, focusArb, (input, at, focus) => {
        const layout = layoutWorldlines(input, { at, focus });
        const entries = timelineText(layout);

        const expected: Record<TimelineKind, string[]> = {
          decision: layout.decisions.map((d) => d.id),
          fact: layout.knowledge.map((k) => k.id),
          signal: layout.signals.map((s) => s.id),
          arrival: layout.arrivals.map((a) => a.id),
        };
        expect(entries.length).toBe(
          expected.decision.length + expected.fact.length + expected.signal.length + expected.arrival.length,
        );
        for (const kind of Object.keys(expected) as TimelineKind[]) {
          const own = entries.filter((e) => e.kind === kind);
          const ids = own.map((e) => e.id);
          expect([...ids].sort()).toEqual([...expected[kind]].sort());
          // Unique per kind, and for facts per participant line (one mark per participant and fact).
          const keys =
            kind === "fact"
              ? layout.knowledge.map((k) => `${k.participant}\u0000${k.id}`)
              : ids;
          expect(new Set(keys).size).toBe(keys.length);
        }

        for (let i = 1; i < entries.length; i++) {
          expect(entries[i]!.time).toBeGreaterThanOrEqual(entries[i - 1]!.time);
        }

        for (const e of entries) {
          expect(e.text.length).toBeGreaterThan(0);
          if (e.kind === "signal") {
            expect(FATE_WORDS.some((w) => e.text.includes(w))).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
