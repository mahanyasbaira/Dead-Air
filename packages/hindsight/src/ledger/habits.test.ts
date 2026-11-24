import { describe, expect, it } from "vitest";
import { computeHabits, HABIT_WHY } from "./habits";
import type { HabitParticipant } from "./habits";
import { buildLedger } from "./ledger";
import type { LedgerEvent } from "./ledger";

const both: HabitParticipant[] = [
  { id: "a", history: "complete" },
  { id: "b", history: "complete" },
];

const send = (
  messageId: string,
  sender: string,
  recipient: string,
  simTime: number,
  extra: { bytes?: number; airtime?: number } = {},
): LedgerEvent => ({ kind: "sent", messageId, sender, recipient, simTime, ...extra });
const outcome = (messageId: string, o: "received" | "garbled" | "collision", simTime: number): LedgerEvent => ({
  kind: "outcome",
  messageId,
  outcome: o,
  simTime,
});

describe("computeHabits", () => {
  it("counts transmissions, means and collisions for two roles, in participant order", () => {
    const l = buildLedger([
      send("m1", "a", "b", 0, { bytes: 10, airtime: 4 }),
      send("m2", "b", "a", 2, { bytes: 20, airtime: 4 }),
      outcome("m1", "collision", 6),
      outcome("m2", "collision", 6),
      send("m3", "a", "b", 20, { bytes: 30, airtime: 2 }),
      outcome("m3", "received", 22),
    ]);
    const rows = computeHabits(l, [], both);
    expect(rows.map((r) => r.participant)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({
      transmissions: 2,
      meanBytes: 20,
      meanAirtime: 3,
      collisionsInvolved: 1,
      collisionsCaused: 0,
      readBack: null,
    });
    expect(rows[1]).toMatchObject({
      transmissions: 1,
      meanBytes: 20,
      meanAirtime: 4,
      collisionsInvolved: 1,
      collisionsCaused: 1,
    });
  });

  it("counts both roles as second when they began at the same time", () => {
    const l = buildLedger([
      send("m1", "a", "b", 5, { airtime: 3 }),
      send("m2", "b", "a", 5, { airtime: 3 }),
      outcome("m1", "collision", 8),
      outcome("m2", "collision", 8),
    ]);
    expect(computeHabits(l, [], both).map((r) => r.collisionsCaused)).toEqual([1, 1]);
  });

  it("does not count messages whose airtimes do not overlap, and gives null when airtime is missing", () => {
    const apart = buildLedger([
      send("m1", "a", "b", 0, { airtime: 2 }),
      send("m2", "b", "a", 10, { airtime: 2 }),
      outcome("m1", "collision", 2),
      outcome("m2", "collision", 12),
    ]);
    expect(computeHabits(apart, [], both).map((r) => r.collisionsCaused)).toEqual([0, 0]);
    const missing = buildLedger([
      send("m1", "a", "b", 0, { airtime: 2 }),
      send("m2", "b", "a", 1),
      outcome("m1", "collision", 2),
      outcome("m2", "collision", 3),
    ]);
    const rows = computeHabits(missing, [], both);
    expect(rows.map((r) => r.collisionsInvolved)).toEqual([1, 1]);
    expect(rows.map((r) => r.collisionsCaused)).toEqual([null, null]);
    expect(rows.map((r) => r.meanAirtime)).toEqual([2, null]);
    expect(rows.map((r) => r.meanBytes)).toEqual([null, null]);
  });

  it("counts a read-back before the next decision and not one after it", () => {
    const l = buildLedger([
      send("m3", "a", "b", 20),
      outcome("m3", "received", 22),
      { kind: "readback", participant: "b", messageId: "m3", simTime: 25 },
      send("m4", "a", "b", 40),
      outcome("m4", "received", 41),
      { kind: "readback", participant: "b", messageId: "m4", simTime: 60 },
    ]);
    const decisions = [
      { actor: "b", simTime: 30 },
      { actor: "b", simTime: 50 },
    ];
    expect(computeHabits(l, decisions, both, { readBackRecorded: true })[1]?.readBack).toEqual({ read: 1, received: 2 });
    expect(computeHabits(l, decisions, both)[1]?.readBack).toBeNull();
  });

  it("reports every figure as null for an arrivals-only participant", () => {
    const l = buildLedger([
      send("m1", "a", "b", 0, { bytes: 5, airtime: 1 }),
      send("m2", "b", "a", 1, { bytes: 5, airtime: 1 }),
      { kind: "arrival", messageId: "x", sender: "b", recipient: "a", outcome: "received", simTime: 3 },
    ]);
    const rows = computeHabits(l, [], [both[0] as HabitParticipant, { id: "b", history: "arrivals-only" }], {
      readBackRecorded: true,
    });
    expect(rows[1]).toEqual({
      participant: "b",
      transmissions: null,
      meanBytes: null,
      meanAirtime: null,
      collisionsInvolved: null,
      collisionsCaused: null,
      readBack: null,
    });
    expect(rows[0]?.transmissions).toBe(1);
  });

  it("has a one-line reason for every column and no judgement words", () => {
    for (const line of Object.values(HABIT_WHY)) {
      expect(line).not.toMatch(/\b(score|rank|best|worst|good|bad|should|mistake|wrong)\b/i);
    }
  });
});
