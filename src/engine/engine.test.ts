import { describe, expect, it } from "vitest";
import { eventsForRole, allEvents, orderEvents } from "./audience";
import {
  buildDebrief,
  initialState,
  messageTimings,
  reduce,
  replay,
  timelineSteps,
} from "./reducer";
import { staticOnChannel9 } from "./scenario";
import type { PlayLog, RecordedDecision } from "./types";

const scenario = staticOnChannel9;

describe("deterministic replay", () => {
  it("produces identical final state and debrief for the same log", () => {
    const log: PlayLog = {
      scenarioId: scenario.id,
      decisions: [
        { role: "dispatch", optionId: "d-hold", recordedAtSimTime: 3 },
        { role: "field", optionId: "f-watch", recordedAtSimTime: 3 },
      ],
    };
    const a = replay(scenario, log);
    const b = replay(scenario, log);
    expect(a).toEqual(b);
    expect(buildDebrief(a)).toEqual(buildDebrief(b));
  });

  it("is order-independent for the decision log", () => {
    const d1: RecordedDecision = { role: "dispatch", optionId: "d-hold", recordedAtSimTime: 3 };
    const d2: RecordedDecision = { role: "field", optionId: "f-watch", recordedAtSimTime: 5 };
    const forward = replay(scenario, { scenarioId: scenario.id, decisions: [d1, d2] });
    const reverse = replay(scenario, { scenarioId: scenario.id, decisions: [d2, d1] });
    expect(forward).toEqual(reverse);
  });

  it("reaches the end of the timeline on replay", () => {
    const steps = timelineSteps(scenario);
    const end = steps[steps.length - 1];
    const state = replay(scenario, { scenarioId: scenario.id, decisions: [] });
    expect(state.cursorSimTime).toBe(end);
  });
});

describe("role filtering", () => {
  it("shows a field-only event to field but not dispatch", () => {
    const upTo = 1;
    const fieldView = eventsForRole(scenario.events, "field", upTo).map((e) => e.id);
    const dispatchView = eventsForRole(scenario.events, "dispatch", upTo).map((e) => e.id);
    expect(fieldView).toContain("evt-02-field-note");
    expect(dispatchView).not.toContain("evt-02-field-note");
  });

  it("shows a dispatch-only created message to dispatch but not field", () => {
    const upTo = 2;
    const dispatchView = eventsForRole(scenario.events, "dispatch", upTo).map((e) => e.id);
    const fieldView = eventsForRole(scenario.events, "field", upTo).map((e) => e.id);
    expect(dispatchView).toContain("msg-created-wind");
    expect(fieldView).not.toContain("msg-created-wind");
  });

  it("facilitator view reveals both perspectives", () => {
    const everything = allEvents(scenario.events, 2).map((e) => e.id);
    expect(everything).toContain("evt-02-field-note");
    expect(everything).toContain("msg-created-wind");
  });
});

describe("delayed-message ordering (dead air)", () => {
  it("creates the wind note before it is delivered", () => {
    const timings = messageTimings(scenario);
    const wind = timings.find((t) => t.messageId === "msg-created-wind");
    expect(wind).toBeDefined();
    expect(wind!.createdAtSimTime).toBe(2);
    expect(wind!.deliveredAtSimTime).toBe(5);
    expect(wind!.gapSimTime).toBe(3);
  });

  it("the field role cannot see the wind note until delivery sim-time", () => {
    const beforeDelivery = eventsForRole(scenario.events, "field", 4).map((e) => e.id);
    const atDelivery = eventsForRole(scenario.events, "field", 5).map((e) => e.id);
    expect(beforeDelivery).not.toContain("msg-delivered-wind");
    expect(atDelivery).toContain("msg-delivered-wind");
  });

  it("orders events deterministically by simTime then id", () => {
    const shuffled = [...scenario.events].reverse();
    const ordered = orderEvents(shuffled).map((e) => e.simTime);
    const sorted = [...ordered].sort((a, b) => a - b);
    expect(ordered).toEqual(sorted);
  });
});

describe("reset", () => {
  it("returns to the initial state after advancing and recording", () => {
    let state = initialState(scenario);
    state = reduce(state, { type: "advance" });
    state = reduce(state, {
      type: "recordDecision",
      decision: { role: "field", optionId: "f-pause", recordedAtSimTime: 1 },
    });
    expect(state.decisions.length).toBe(1);
    state = reduce(state, { type: "reset" });
    expect(state).toEqual(initialState(scenario));
    expect(state.decisions.length).toBe(0);
  });

  it("recording a second decision for the same role replaces the first", () => {
    let state = initialState(scenario);
    state = reduce(state, {
      type: "recordDecision",
      decision: { role: "field", optionId: "f-pause", recordedAtSimTime: 1 },
    });
    state = reduce(state, {
      type: "recordDecision",
      decision: { role: "field", optionId: "f-watch", recordedAtSimTime: 3 },
    });
    expect(state.decisions.length).toBe(1);
    expect(state.decisions[0].optionId).toBe("f-watch");
  });
});
