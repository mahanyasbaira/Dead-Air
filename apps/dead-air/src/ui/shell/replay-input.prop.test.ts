import { describe, it } from "vitest";
import fc from "fast-check";
import { timelineSteps } from "hindsight";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import { deriveState } from "./log";
import { toLedger } from "./replay-input";
import type { ConsoleLogEntry } from "./types";

const scenario = staticOnChannel9;
const steps = timelineSteps(scenario);
const role = fc.constantFrom("dispatch", "field");
const time = fc.oneof(fc.constantFrom(...steps), fc.integer({ min: 0, max: 30 }));
const id = fc.constantFrom("a", "b", "c", "d");

const entry: fc.Arbitrary<ConsoleLogEntry> = fc.oneof(
  fc.record({
    kind: fc.constant("send" as const),
    send: fc.record({ id, sender: role, recipient: role, sendTime: time, bytes: fc.nat({ max: 64 }) }),
  }),
  fc.record({
    kind: fc.constant("wire" as const),
    event: fc.record({
      id: fc.option(id, { nil: undefined }),
      kind: fc.constantFrom("received" as const, "garbled" as const, "collision" as const),
      simTime: time,
      sender: role,
      recipient: role,
    }),
  }),
);

describe("toLedger properties", () => {
  // Feature: consoles 11.2 follow-up, replay knows about sends
  // **Validates: Requirements 6.1**
  // Any log, even one with outcomes before their sends or with ids that match
  // nothing: no outcome precedes its send, every outcome has a send, and the
  // same log always gives the same ledger.
  it("never places an outcome before its send, leaves no orphan, and is deterministic", () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 20 }), (log) => {
        const state = deriveState(scenario, log);
        const a = toLedger(scenario, log, state);
        const b = toLedger(scenario, log, state);
        if (JSON.stringify(a) !== JSON.stringify(b)) return false;
        const sentAt = new Map<string, number>();
        for (const e of a.events) if (e.kind === "sent" && !sentAt.has(e.messageId)) sentAt.set(e.messageId, e.simTime);
        for (const e of a.events) {
          if (e.kind !== "outcome") continue;
          const t = sentAt.get(e.messageId);
          if (t === undefined || t > e.simTime) return false;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});
