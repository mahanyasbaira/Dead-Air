import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ledgerEventsArb } from "../ledger/arbitraries";
import { buildLedger } from "../ledger/ledger";
import type { Ledger } from "../ledger/ledger";
import { layoutOptionsArb, participantsArb, scenarioArb } from "./arbitraries";
import { layoutWorldlines } from "./worldlines";

const clearLineArb = fc.boolean();

const caseArb = ledgerEventsArb.chain((events) =>
  fc.record({
    events: fc.constant(events),
    shuffled: fc.shuffledSubarray(events, { minLength: events.length, maxLength: events.length }),
    scenario: scenarioArb,
    participants: participantsArb,
    options: layoutOptionsArb,
    clearLine: clearLineArb,
  }),
);

// Feature: seance-replay, Property 4: The layout is deterministic
describe("layout determinism", () => {
  it("same input twice, a shuffled rebuild, and a JSON round trip give deeply equal geometry", () => {
    // **Validates: Requirements 2.4**
    fc.assert(
      fc.property(caseArb, ({ events, shuffled, scenario, participants, options, clearLine }) => {
        const opts = { ...options, clearLine };
        const ledger = buildLedger(events);
        const base = layoutWorldlines({ ledger, scenario, participants }, opts);

        expect(layoutWorldlines({ ledger, scenario, participants }, opts)).toEqual(base);

        const reshuffled = buildLedger(shuffled);
        expect(layoutWorldlines({ ledger: reshuffled, scenario, participants }, opts)).toEqual(base);

        const roundTripped = JSON.parse(JSON.stringify(ledger)) as Ledger;
        expect(layoutWorldlines({ ledger: roundTripped, scenario, participants }, opts)).toEqual(base);
      }),
      { numRuns: 200 },
    );
  });
});
