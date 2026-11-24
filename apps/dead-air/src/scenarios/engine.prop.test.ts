import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  allEvents,
  buildDebrief,
  eventsForRole,
  initialState,
  reduce,
  replay,
  timelineSteps,
  type Action,
  type RecordedDecision,
} from "hindsight";
import { staticOnChannel9 as scenario } from "./static-on-channel-9";

const steps = timelineSteps(scenario);
const roles = scenario.roles.map((r) => r.id);

const decisionArb: fc.Arbitrary<RecordedDecision> = fc
  .constantFrom(...roles)
  .chain((role) =>
    fc.record({
      role: fc.constant(role),
      optionId: fc.constantFrom(...scenario.decisionPrompts[role].options.map((o) => o.id)),
      recordedAtSimTime: fc.constantFrom(...steps),
    }),
  );

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.constant<Action>({ type: "advance" }),
  fc.constantFrom(...steps).map((simTime): Action => ({ type: "jumpTo", simTime })),
  decisionArb.map((decision): Action => ({ type: "recordDecision", decision })),
);

describe("engine properties", () => {
  it("replay and debrief are deterministic and independent of log order", () => {
    fc.assert(
      fc.property(fc.array(decisionArb, { maxLength: 8 }), (decisions) => {
        const a = replay(scenario, { scenarioId: scenario.id, decisions });
        const b = replay(scenario, { scenarioId: scenario.id, decisions: [...decisions].reverse() });
        // Same-role duplicates legitimately resolve by position; compare only unique-role logs.
        const uniqueRoles = new Set(decisions.map((d) => d.role)).size === decisions.length;
        expect(replay(scenario, { scenarioId: scenario.id, decisions })).toEqual(a);
        expect(buildDebrief(a)).toEqual(buildDebrief(replay(scenario, { scenarioId: scenario.id, decisions })));
        if (uniqueRoles) expect(b).toEqual(a);
      }),
      { seed: 20261117, numRuns: 100 },
    );
  });

  it("a delivered message is invisible to its recipient before delivery and visible from delivery on", () => {
    const delivered = scenario.events.filter((e) => e.type === "message_delivered");
    expect(delivered.length).toBeGreaterThan(0);
    fc.assert(
      fc.property(fc.integer({ min: -1, max: steps[steps.length - 1] + 2 }), (t) => {
        for (const d of delivered) {
          for (const role of roles) {
            const sees = eventsForRole(scenario.events, role, t).some((e) => e.id === d.id);
            const allowed = d.audience === "all" || d.audience === role;
            expect(sees).toBe(allowed && t >= d.simTime);
          }
        }
      }),
      { seed: 20261117 },
    );
  });

  it("visible events are always sorted by sim-time and role views never exceed the facilitator view", () => {
    fc.assert(
      fc.property(fc.constantFrom(...roles), fc.constantFrom(...steps), (role, t) => {
        const view = eventsForRole(scenario.events, role, t);
        const times = view.map((e) => e.simTime);
        expect(times).toEqual([...times].sort((x, y) => x - y));
        const all = new Set(allEvents(scenario.events, t).map((e) => e.id));
        for (const e of view) expect(all.has(e.id)).toBe(true);
      }),
      { seed: 20261117 },
    );
  });

  it("reset returns the initial state after any sequence of actions", () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 20 }), (actions) => {
        const after = actions.reduce(reduce, initialState(scenario));
        expect(reduce(after, { type: "reset" })).toEqual(initialState(scenario));
      }),
      { seed: 20261117 },
    );
  });
});
