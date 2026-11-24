import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ledgerArb, participantIds, wellFormedEventsArb } from "./arbitraries";
import { buildLedger, knownAt } from "./ledger";
import type { Ledger } from "./ledger";

const time = fc.integer({ min: 0, max: 45 });

/**
 * Independent statement of the rule. An outcome belongs to the recipient of its
 * message; when an id was sent more than once, the last send in ledger order names it.
 */
function expectedKnown(l: Ledger, p: string, t: number): string[] {
  const out = new Set<string>();
  for (const e of l.events) {
    if (e.simTime > t) continue;
    if (e.kind === "learned" && e.participant === p) out.add(e.factId);
    if (e.kind === "arrival" && e.recipient === p && e.outcome === "received") {
      // Corrected 2026-11-23 (second time): the same rule applies to an arrival. It is ignored when
      // it is earlier than the first send of its id; with no send at all it stands (arrivals-only).
      const firstSend = l.events.find((s) => s.kind === "sent" && s.messageId === e.messageId);
      if (firstSend === undefined || e.simTime >= firstSend.simTime) out.add(e.messageId);
    }
    if (e.kind === "outcome" && e.outcome === "received") {
      const sends = l.events.filter((s) => s.kind === "sent" && s.messageId === e.messageId);
      const last = sends[sends.length - 1];
      // Corrected 2026-11-23: a message cannot be known before it was sent, so a received
      // outcome earlier than the message's first send contradicts the log and is ignored.
      // The earlier oracle counted it, which encoded the old, wrong rule.
      const first = sends[0];
      const afterSend = first !== undefined && e.simTime >= first.simTime;
      if (afterSend && last && last.kind === "sent" && last.recipient === p) out.add(e.messageId);
    }
  }
  return [...out].sort();
}

// Feature: seance-replay, Property 1: The known set is exactly what was delivered intact or observed
describe("Property 1: The known set is exactly what was delivered intact or observed", () => {
  it("knownAt equals the learned facts plus intact deliveries and arrivals at or before t", () => {
    // **Validates: Requirements 1.1**
    fc.assert(
      fc.property(ledgerArb, participantIds, time, (l, p, t) => {
        expect([...knownAt(l, p, t)].sort()).toEqual(expectedKnown(l, p, t));
      }),
      { numRuns: 300 },
    );
  });

  it("with unique message ids, a message is known iff addressed to p and received by t", () => {
    // **Validates: Requirements 1.1**
    fc.assert(
      fc.property(wellFormedEventsArb, participantIds, time, (events, p, t) => {
        const l = buildLedger(events);
        const expected = new Set<string>();
        for (const e of l.events) {
          if (e.kind !== "outcome" || e.outcome !== "received" || e.simTime > t) continue;
          const s = l.events.find((x) => x.kind === "sent" && x.messageId === e.messageId);
          if (s && s.kind === "sent" && s.recipient === p) expected.add(e.messageId);
        }
        expect([...knownAt(l, p, t)].sort()).toEqual([...expected].sort());
      }),
      { numRuns: 200 },
    );
  });
});
