import { describe, it } from "vitest";
import fc from "fast-check";
import { timelineSteps } from "hindsight";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import { appendWire, deriveState, emptyLog, recordDecision } from "./log";

const scenario = staticOnChannel9;
const steps = timelineSteps(scenario);

describe("decision lock", () => {
  // Feature: consoles, Property 5: A recorded decision locks after the next beat begins
  // **Validates: Requirements 4.1**
  it("rejects a later change once the next beat begins and keeps the original", () => {
    // Only steps that have a later step can lock.
    const lockable = steps.slice(0, -1);
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(scenario.decisionPrompts)),
        fc.integer({ min: 0, max: lockable.length - 1 }),
        fc.nat({ max: 2 }),
        fc.nat({ max: 2 }),
        (role, stepIdx, firstIdx, laterIdx) => {
          const options = scenario.decisionPrompts[role].options;
          const t = lockable[stepIdx];
          const next = steps[stepIdx + 1];
          const original = { role, optionId: options[firstIdx % options.length].id, recordedAtSimTime: t };
          const first = recordDecision(scenario, emptyLog, original);
          if (!first.ok) return false;
          const advanced = appendWire(first.log, {
            kind: "received",
            simTime: next,
            sender: "a",
            recipient: "b",
            payload: new Uint8Array(),
          });
          const change = {
            role,
            optionId: options[laterIdx % options.length].id,
            recordedAtSimTime: next,
          };
          const r = recordDecision(scenario, advanced, change);
          const stored = deriveState(scenario, advanced).decisions.find((d) => d.role === role);
          return (
            !r.ok &&
            r.reason === "locked" &&
            JSON.stringify(r.kept) === JSON.stringify(original) &&
            JSON.stringify(stored) === JSON.stringify(original)
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
