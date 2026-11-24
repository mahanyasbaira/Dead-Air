// Test-only generators for ledger events. Not exported from the kit entries.
import fc from "fast-check";
import { buildLedger } from "./ledger";
import type { Ledger, LedgerEvent } from "./ledger";

export const participantIds = fc.constantFrom("p1", "p2", "p3");
export const messageIds = fc.constantFrom("m1", "m2", "m3", "m4", "m5");
const factIds = fc.constantFrom("f1", "f2", "f3");
const outcomes = fc.constantFrom("received" as const, "garbled" as const, "collision" as const);
const time = fc.integer({ min: 0, max: 40 });

const learned: fc.Arbitrary<LedgerEvent> = fc.record({
  kind: fc.constant("learned" as const),
  participant: participantIds,
  factId: factIds,
  simTime: time,
});

const sent: fc.Arbitrary<LedgerEvent> = fc
  .record({
    kind: fc.constant("sent" as const),
    messageId: messageIds,
    sender: participantIds,
    recipient: participantIds,
    simTime: time,
    bytes: fc.option(fc.nat(64), { nil: undefined }),
    airtime: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
  })
  .map((e) => {
    const { bytes, airtime, ...rest } = e;
    return { ...rest, ...(bytes === undefined ? {} : { bytes }), ...(airtime === undefined ? {} : { airtime }) };
  });

const outcome: fc.Arbitrary<LedgerEvent> = fc.record({
  kind: fc.constant("outcome" as const),
  messageId: messageIds,
  outcome: outcomes,
  simTime: time,
});

const arrival: fc.Arbitrary<LedgerEvent> = fc.record({
  kind: fc.constant("arrival" as const),
  messageId: messageIds,
  sender: participantIds,
  recipient: participantIds,
  outcome: outcomes,
  simTime: time,
});

const readback: fc.Arbitrary<LedgerEvent> = fc.record({
  kind: fc.constant("readback" as const),
  participant: participantIds,
  messageId: messageIds,
  simTime: time,
});

/** Any event kind, a small id pool so ids repeat, drops (sends with no outcome) and shuffled order. */
export const ledgerEventArb: fc.Arbitrary<LedgerEvent> = fc.oneof(learned, sent, outcome, arrival, readback);
export const ledgerEventsArb: fc.Arbitrary<LedgerEvent[]> = fc.array(ledgerEventArb, { maxLength: 24 });
export const ledgerArb: fc.Arbitrary<Ledger> = ledgerEventsArb.map(buildLedger);

/**
 * Sends with unique ids, each with zero or more outcomes at delay 0 to 40 after the send
 * (none means dropped). Shuffled before it is returned.
 */
export const wellFormedEventsArb: fc.Arbitrary<LedgerEvent[]> = fc
  .array(
    fc.record({
      sender: participantIds,
      recipient: participantIds,
      at: time,
      delay: fc.integer({ min: 0, max: 40 }),
      fate: fc.constantFrom("received" as const, "garbled" as const, "collision" as const, "dropped" as const),
    }),
    { maxLength: 10 },
  )
  .chain((xs) => {
    const events: LedgerEvent[] = [];
    xs.forEach((x, i) => {
      const id = `m${i}`;
      events.push({ kind: "sent", messageId: id, sender: x.sender, recipient: x.recipient, simTime: x.at });
      if (x.fate !== "dropped")
        events.push({ kind: "outcome", messageId: id, outcome: x.fate, simTime: x.at + x.delay });
    });
    return fc.shuffledSubarray(events, { minLength: events.length, maxLength: events.length });
  });
