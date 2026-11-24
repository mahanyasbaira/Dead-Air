import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { runChannel } from "../index";
import type { ChannelProfile, ChannelSend } from "../index";
import { replayChannelLog } from "../engine/channel-log";
import { threeParty } from "../engine/fixtures/three-party";
import { replay } from "../engine/reducer";
import type { PlayLog } from "../engine/types";
import { ledgerFromChannel } from "./from-channel";
import { buildLedger, inTransitAt, knownAt } from "./ledger";
import type { LedgerEvent } from "./ledger";

const ids = fc.constantFrom("p1", "p2", "p3");
const profile: fc.Arbitrary<ChannelProfile> = fc
  .tuple(fc.nat(5), fc.nat(5), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 0.05, noNaN: true }))
  .map(([a, b, dropProb, bitFlipProb]) => ({
    minDelay: Math.min(a, b),
    maxDelay: Math.max(a, b),
    dropProb,
    bitFlipProb,
  }));
const sendsArb: fc.Arbitrary<ChannelSend[]> = fc
  .array(
    fc.record({
      sender: ids,
      recipient: ids,
      sendTime: fc.nat(30),
      payload: fc.uint8Array({ maxLength: 8 }),
    }),
    { maxLength: 12 },
  )
  .map((xs) => xs.map((x, i) => ({ ...x, id: `m${i}` })));

const ledgerEvents: fc.Arbitrary<LedgerEvent[]> = fc.array(
  fc.oneof(
    fc.record({ kind: fc.constant("learned" as const), participant: ids, factId: fc.constantFrom("f1", "f2", "f3"), simTime: fc.nat(20) }),
    fc.record({ kind: fc.constant("sent" as const), messageId: fc.constantFrom("m1", "m2", "m3"), sender: ids, recipient: ids, simTime: fc.nat(20) }),
    fc.record({
      kind: fc.constant("outcome" as const),
      messageId: fc.constantFrom("m1", "m2", "m3"),
      outcome: fc.constantFrom("received" as const, "garbled" as const, "collision" as const),
      simTime: fc.nat(20),
    }),
  ),
  { maxLength: 20 },
);

function pipeline(seed: number, p: ChannelProfile, sends: ChannelSend[], play: PlayLog) {
  const log = replayChannelLog(runChannel(seed, p, sends));
  const state = replay(threeParty, play);
  const ledger = buildLedger(ledgerFromChannel(sends as { id: string; sender: string; recipient: string; sendTime: number }[], log));
  return { log, state, ledger };
}

describe("ledger properties", () => {
  // Feature: skeleton, Property 2: Replay determinism
  // **Validates: Requirements 3.1**
  it("Property 2: the whole pipeline is deterministic", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        profile,
        sendsArb,
        fc.array(fc.record({ role: ids, optionId: fc.constantFrom("a", "b", "zzz"), recordedAtSimTime: fc.nat(10) }), { maxLength: 5 }),
        (seed, p, sends, decisions) => {
          const play: PlayLog = { scenarioId: threeParty.id, decisions };
          expect(pipeline(seed, p, sends, play)).toEqual(pipeline(seed, p, sends, play));
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: skeleton, Property 3: Known set only grows
  // **Validates: Requirements 3.2**
  it("Property 3: knownAt only gains members as time grows", () => {
    fc.assert(
      fc.property(ledgerEvents, ids, fc.nat(25), fc.nat(25), (evs, p, a, b) => {
        const l = buildLedger(evs);
        const [t1, t2] = a <= b ? [a, b] : [b, a];
        const later = knownAt(l, p, t2);
        for (const x of knownAt(l, p, t1)) expect(later.has(x)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: skeleton, Property 4: Only intact, arrived messages are known
  // **Validates: Requirements 3.3**
  it("Property 4: known iff recipient is p and a received event has simTime <= t", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), profile, sendsArb, ids, fc.nat(45), (seed, p, sends, who, t) => {
        const events = runChannel(seed, p, sends);
        const l = buildLedger(
          ledgerFromChannel(sends as { id: string; sender: string; recipient: string; sendTime: number }[], replayChannelLog(events)),
        );
        const expected = new Set(
          events.filter((e) => e.kind === "received" && e.recipient === who && e.simTime <= t).map((e) => e.id as string),
        );
        const known = knownAt(l, who, t);
        expect([...known].sort()).toEqual([...expected].sort());
        const transit = inTransitAt(l, who, t);
        for (const id of transit) {
          expect(known.has(id)).toBe(false);
          const s = sends.find((x) => x.id === id)!;
          expect(s.recipient).toBe(who);
          expect(s.sendTime).toBeLessThanOrEqual(t);
        }
      }),
      { numRuns: 100 },
    );
  });
});
