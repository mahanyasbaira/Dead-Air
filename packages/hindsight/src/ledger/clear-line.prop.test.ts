import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ledgerArb, participantIds } from "./arbitraries";
import { clearLine, gainAt } from "./clear-line";
import { knownAt } from "./ledger";

const time = fc.integer({ min: 0, max: 45 });

// Feature: seance-replay, Property 10: A clear line only adds knowledge
describe("Property 10: A clear line only adds knowledge", () => {
  it("knownAt only grows, gainAt is exactly the difference, and the line is idempotent", () => {
    // **Validates: Requirements 3.1**
    fc.assert(
      fc.property(ledgerArb, participantIds, time, (l, p, t) => {
        const cleared = clearLine(l);
        const before = knownAt(l, p, t);
        const after = knownAt(cleared, p, t);
        for (const id of before) expect(after.has(id)).toBe(true);
        expect(gainAt(l, p, t)).toEqual([...after].filter((id) => !before.has(id)).sort());
        expect(clearLine(cleared)).toEqual(cleared);
      }),
      { numRuns: 200 },
    );
  });

  it("every gained id was sent to the participant at or before t", () => {
    // **Validates: Requirements 3.1**
    fc.assert(
      fc.property(ledgerArb, participantIds, time, (l, p, t) => {
        for (const id of gainAt(l, p, t)) {
          expect(
            l.events.some((e) => e.kind === "sent" && e.messageId === id && e.recipient === p && e.simTime <= t),
          ).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("arrivals, sends and learned events are unchanged", () => {
    // **Validates: Requirements 3.1**
    fc.assert(
      fc.property(ledgerArb, (l) => {
        const cleared = clearLine(l);
        for (const kind of ["arrival", "sent", "learned", "readback"] as const) {
          expect(cleared.events.filter((e) => e.kind === kind)).toEqual(l.events.filter((e) => e.kind === kind));
        }
      }),
      { numRuns: 200 },
    );
  });
});
