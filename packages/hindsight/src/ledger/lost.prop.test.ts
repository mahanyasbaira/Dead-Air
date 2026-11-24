import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { buildLedger, inTransitAt, knownAt, lostAt } from "./ledger";
import { ledgerEventsArb, participantIds, wellFormedEventsArb } from "./arbitraries";

describe("lost messages", () => {
  // Feature: seance-replay, Property 3: Lost messages are excluded and listed, and every message is in exactly one group
  // **Validates: Requirements 1.3**
  it("Property 3: lostAt lists exactly the garbled or collided, is disjoint from known, and partitions sent messages", () => {
    fc.assert(
      fc.property(wellFormedEventsArb, participantIds, fc.integer({ min: 0, max: 90 }), (events, p, t) => {
        const l = buildLedger(events);
        const known = knownAt(l, p, t);
        const transit = inTransitAt(l, p, t);
        const lost = lostAt(l, p, t);

        // Independent oracle: ids addressed to p with a bad outcome by t and no received one by t.
        const sentTo = new Map<string, string>();
        for (const e of events) if (e.kind === "sent") sentTo.set(e.messageId, e.recipient);
        const bad = new Set<string>();
        const good = new Set<string>();
        for (const e of events) {
          if (e.kind !== "outcome" || e.simTime > t || sentTo.get(e.messageId) !== p) continue;
          (e.outcome === "received" ? good : bad).add(e.messageId);
        }
        const expected = [...bad].filter((id) => !good.has(id)).sort();
        expect([...lost].sort()).toEqual(expected);

        for (const id of lost) expect(known.has(id)).toBe(false);

        const sentByT = [...sentTo.keys()].filter((id) => {
          const s = events.find((e) => e.kind === "sent" && e.messageId === id);
          return sentTo.get(id) === p && s !== undefined && s.simTime <= t;
        });
        for (const id of sentByT) {
          const groups = [known.has(id), transit.has(id), lost.has(id)].filter(Boolean).length;
          expect(groups).toBe(1);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: seance-replay, Property 3: Lost messages are excluded and listed, and every message is in exactly one group
  // **Validates: Requirements 1.3**
  it("Property 3: lost is disjoint from known for arbitrary event soup", () => {
    fc.assert(
      fc.property(ledgerEventsArb, participantIds, fc.integer({ min: 0, max: 90 }), (events, p, t) => {
        const l = buildLedger(events);
        const known = knownAt(l, p, t);
        for (const id of lostAt(l, p, t)) expect(known.has(id)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
