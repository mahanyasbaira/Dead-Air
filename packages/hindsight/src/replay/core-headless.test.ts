import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => {
  throw new Error("core must not load react");
});

const EXPECTED = [
  "DEFAULT_AIRTIME",
  "HABIT_WHY",
  "Prng",
  "allEvents",
  "appendChannelEvent",
  "buildDebrief",
  "buildLedger",
  "checkScenario",
  "clearLine",
  "closedFates",
  "computeHabits",
  "createClock",
  "createPrng",
  "emptyChannelLog",
  "eventsForRole",
  "gainAt",
  "inTransitAt",
  "initialState",
  "knownAt",
  "ledgerFromChannel",
  "lostAt",
  "messageTimings",
  "nextSimTime",
  "orderEvents",
  "orphanOutcomes",
  "parseBrief",
  "printBrief",
  "profileLoss",
  "reduce",
  "replay",
  "replayChannelLog",
  "runChannel",
  "timelineSteps",
  "toChannelLogEntry",
  "validateScenario",
  "visibleToRole",
];

describe("core entry is headless", () => {
  it("loads with react unavailable and exports no replay view", async () => {
    const core = await import("../index");
    expect(Object.keys(core).sort()).toEqual([...EXPECTED].sort());
    expect(Object.keys(core)).not.toContain("ReplayView");
    expect(Object.keys(core)).not.toContain("layoutReplay");
  });
});
