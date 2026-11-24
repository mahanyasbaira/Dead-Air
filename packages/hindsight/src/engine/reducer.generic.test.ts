import { describe, expect, it } from "vitest";
import { allEvents, eventsForRole } from "./audience";
import { threeParty } from "./fixtures/three-party";
import { buildDebrief, initialState, messageTimings, reduce, replay, timelineSteps } from "./reducer";
import type { PlayLog, RecordedDecision } from "./types";

const d1: RecordedDecision = { role: "p1", optionId: "a", recordedAtSimTime: 2 };
const d2: RecordedDecision = { role: "p2", optionId: "b", recordedAtSimTime: 6 };
const d3: RecordedDecision = { role: "p3", optionId: "zzz", recordedAtSimTime: 7 };

describe("reduce on a three-party fixture", () => {
  it("starts at the first step and advances through every step", () => {
    let s = initialState(threeParty);
    const seen = [s.cursorSimTime];
    for (let i = 0; i < 20; i++) {
      s = reduce(s, { type: "advance" });
      if (s.cursorSimTime !== seen[seen.length - 1]) seen.push(s.cursorSimTime);
    }
    expect(seen).toEqual(timelineSteps(threeParty));
  });

  it("keeps one decision per participant, sorted by id, and reset clears them", () => {
    let s = initialState(threeParty);
    s = reduce(s, { type: "recordDecision", decision: d2 });
    s = reduce(s, { type: "recordDecision", decision: d1 });
    s = reduce(s, { type: "recordDecision", decision: { ...d2, optionId: "a" } });
    expect(s.decisions.map((d) => [d.role, d.optionId])).toEqual([["p1", "a"], ["p2", "a"]]);
    expect(reduce(s, { type: "reset" }).decisions).toEqual([]);
  });
});

describe("replay on a three-party fixture", () => {
  it("is deterministic and independent of decision order", () => {
    const a: PlayLog = { scenarioId: "three-party", decisions: [d1, d2, d3] };
    const b: PlayLog = { scenarioId: "three-party", decisions: [d3, d1, d2] };
    expect(replay(threeParty, a)).toEqual(replay(threeParty, b));
    expect(replay(threeParty, a).cursorSimTime).toBe(8);
  });
});

describe("eventsForRole on a three-party fixture", () => {
  it("shows shared and own events only, and nothing from the future", () => {
    expect(eventsForRole(threeParty.events, "p1", 8).map((e) => e.id)).toEqual(["e1", "e2", "e3", "e7"]);
    expect(eventsForRole(threeParty.events, "p2", 8).map((e) => e.id)).toEqual(["e1", "e5", "e7"]);
    expect(eventsForRole(threeParty.events, "p3", 8).map((e) => e.id)).toEqual(["e1", "e4", "e6", "e7"]);
    expect(eventsForRole(threeParty.events, "p2", 5).map((e) => e.id)).toEqual(["e1"]);
  });

  it("treats an unknown participant as seeing only shared events", () => {
    expect(eventsForRole(threeParty.events, "p9", 8).map((e) => e.id)).toEqual(["e1", "e7"]);
    expect(allEvents(threeParty.events, 8)).toHaveLength(threeParty.events.length);
  });
});

describe("buildDebrief on a three-party fixture", () => {
  const state = replay(threeParty, { scenarioId: "three-party", decisions: [d1, d3] });
  const debrief = buildDebrief(state);

  it("reports message gaps, including a message never delivered", () => {
    expect(messageTimings(threeParty)).toEqual(debrief.messageTimings);
    expect(debrief.messageTimings.map((m) => m.gapSimTime)).toEqual([4, null]);
  });

  it("labels known options and falls back to the id for unknown ones", () => {
    expect(debrief.decisions.map((d) => d.optionLabel)).toEqual(["Option A", "zzz"]);
    expect(debrief.scenarioId).toBe("three-party");
    expect(debrief.orderedEvents.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4", "e5", "e6", "e7"]);
    expect(debrief.discussionPrompts).toEqual(threeParty.discussionPrompts);
  });
});
