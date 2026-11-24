import { describe, it } from "vitest";
import fc from "fast-check";
import { timelineSteps } from "hindsight";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import { appendSend, appendWire, deriveState, emptyLog, recordDecision } from "./log";
import { restore, serialize } from "./persist";
import type { ConsoleLogEntry, TransportEvent } from "./types";

const scenario = staticOnChannel9;
const steps = timelineSteps(scenario);
const roles = Object.keys(scenario.decisionPrompts);

const wireArb: fc.Arbitrary<TransportEvent> = fc.oneof(
  fc.record({
    kind: fc.constant("received" as const),
    simTime: fc.constantFrom(...steps),
    sender: fc.constantFrom("dispatch", "field"),
    recipient: fc.constantFrom("dispatch", "field"),
    payload: fc.uint8Array({ maxLength: 64 }),
  }),
  fc.record({
    kind: fc.constantFrom("garbled" as const, "collision" as const),
    simTime: fc.constantFrom(...steps),
    sender: fc.constantFrom("dispatch", "field"),
    recipient: fc.constantFrom("dispatch", "field"),
  }),
);

const sendArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  sender: fc.constantFrom("dispatch", "field"),
  recipient: fc.constantFrom("dispatch", "field"),
  sendTime: fc.constantFrom(...steps),
  bytes: fc.nat({ max: 64 }),
});
const stepArb = fc.oneof(
  wireArb.map((e) => ({ wire: e }) as const),
  sendArb.map((send) => ({ send }) as const),
  fc
    .tuple(fc.constantFrom(...roles), fc.nat({ max: 2 }), fc.constantFrom(...steps))
    .map(([role, i, t]) => ({ decision: { role, i, t } }) as const),
);

describe("persist", () => {
  // Feature: consoles, Property 7: A run restores exactly from its persisted log
  // **Validates: Requirements 6.1**
  it("restores exactly the log and the state it was saved from", () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 15 }), fc.integer(), (ops, seed) => {
        let log: ConsoleLogEntry[] = [...emptyLog];
        for (const op of ops) {
          if ("wire" in op) log = appendWire(log, op.wire);
          else if ("send" in op) log = appendSend(log, op.send);
          else {
            const options = scenario.decisionPrompts[op.decision.role].options;
            const r = recordDecision(scenario, log, {
              role: op.decision.role,
              optionId: options[op.decision.i % options.length].id,
              recordedAtSimTime: op.decision.t,
            });
            if (r.ok) log = r.log;
          }
        }
        const run = { version: 1 as const, scenarioId: scenario.id, seed, mode: "solo" as const, log };
        const r = restore(serialize(run));
        if (!r.ok) return false;
        return (
          JSON.stringify(r.run.log.map(norm)) === JSON.stringify(log.map(norm)) &&
          r.run.seed === seed &&
          JSON.stringify(r.state) === JSON.stringify(deriveState(scenario, log))
        );
      }),
      { numRuns: 100 },
    );
  });
});

/** Make Uint8Array comparable as plain JSON. */
function norm(e: ConsoleLogEntry): unknown {
  if (e.kind === "decision" || e.kind === "send") return e;
  const { payload, ...rest } = e.event;
  return { ...e, event: payload ? { ...rest, payload: Array.from(payload) } : rest };
}
