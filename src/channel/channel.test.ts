import { describe, expect, it } from "vitest";
import {
  runChannel,
  DEFAULT_AIRTIME,
  type ChannelProfile,
  type ChannelSend,
} from "./channel";

/**
 * Example tests for the seeded simulated channel.
 *
 * These pin behaviour a person would describe in words. The universal rules
 * (determinism, delivery-time floor) are pinned by `channel.prop.test.ts`
 * (properties P4 and P5).
 *
 * **Validates: Requirement 3.2** — overlapping frames collide for both parties
 * and neither is delivered. Boundary cases follow the half-open collision
 * definition recorded in `docs/RESULTS.md` (open design point 3): intervals that
 * merely touch at an endpoint do not collide.
 */

const CLEAN: ChannelProfile = { minDelay: 1, maxDelay: 1, dropProb: 0, bitFlipProb: 0 };

function send(partial: Partial<ChannelSend> & Pick<ChannelSend, "sender" | "recipient" | "sendTime">): ChannelSend {
  return {
    payload: Uint8Array.of(1, 2, 3),
    ...partial,
  };
}

describe("runChannel — collisions (Req 3.2)", () => {
  it("emits a collision to both parties and delivers neither when airtimes overlap", () => {
    const sends: ChannelSend[] = [
      send({ sender: "dispatch", recipient: "field", sendTime: 10, airtime: 4 }),
      // Starts inside the first frame's airtime window [10, 14).
      send({ sender: "field", recipient: "dispatch", sendTime: 12, airtime: 4 }),
    ];

    const events = runChannel(123, CLEAN, sends);

    // Exactly two events, both collisions; no received, no garbled.
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.kind === "collision")).toBe(true);
    expect(events.some((e) => e.kind === "received")).toBe(false);
    expect(events.some((e) => e.kind === "garbled")).toBe(false);

    // One collision surfaced to each party's send.
    const bySender = events.map((e) => ({ sender: e.sender, recipient: e.recipient }));
    expect(bySender).toContainEqual({ sender: "dispatch", recipient: "field" });
    expect(bySender).toContainEqual({ sender: "field", recipient: "dispatch" });

    // Collisions carry no payload.
    expect(events.every((e) => e.payload === undefined)).toBe(true);
  });

  it("does not collide when airtimes only touch at an endpoint (half-open boundary)", () => {
    const sends: ChannelSend[] = [
      // [10, 14): ends exactly where the next begins.
      send({ sender: "dispatch", recipient: "field", sendTime: 10, airtime: 4 }),
      // [14, 18): touches but does not overlap.
      send({ sender: "field", recipient: "dispatch", sendTime: 14, airtime: 4 }),
    ];

    const events = runChannel(123, CLEAN, sends);

    expect(events.every((e) => e.kind === "received")).toBe(true);
    expect(events.some((e) => e.kind === "collision")).toBe(false);
  });

  it("collides all three when a chain of sends overlaps, delivering none", () => {
    const sends: ChannelSend[] = [
      send({ sender: "a", recipient: "b", sendTime: 0, airtime: 3 }),
      send({ sender: "b", recipient: "a", sendTime: 2, airtime: 3 }),
      send({ sender: "c", recipient: "a", sendTime: 4, airtime: 3 }),
    ];

    const events = runChannel(7, CLEAN, sends);

    expect(events).toHaveLength(3);
    expect(events.every((e) => e.kind === "collision")).toBe(true);
  });
});

describe("runChannel — clean delivery", () => {
  it("delivers an isolated send intact with the original payload", () => {
    const payload = Uint8Array.of(9, 8, 7, 6);
    const sends: ChannelSend[] = [
      send({ sender: "dispatch", recipient: "field", sendTime: 5, payload }),
    ];

    const events = runChannel(42, CLEAN, sends);

    expect(events).toHaveLength(1);
    const [e] = events;
    expect(e.kind).toBe("received");
    expect(e.sender).toBe("dispatch");
    expect(e.recipient).toBe("field");
    expect(e.payload).toEqual(payload);
    // minDelay == maxDelay == 1 here, so delivery is exactly sendTime + 1.
    expect(e.simTime).toBe(6);
  });

  it("uses the default airtime so distinct integer send times never spuriously collide", () => {
    const sends: ChannelSend[] = [
      // No explicit airtime: each occupies a single unit [t, t+1).
      send({ sender: "a", recipient: "b", sendTime: 1 }),
      send({ sender: "a", recipient: "b", sendTime: 2 }),
    ];
    expect(DEFAULT_AIRTIME).toBe(1);

    const events = runChannel(1, CLEAN, sends);
    expect(events.every((e) => e.kind === "received")).toBe(true);
  });

  it("reports identical send times as a collision under the default airtime", () => {
    const sends: ChannelSend[] = [
      send({ sender: "a", recipient: "b", sendTime: 3 }),
      send({ sender: "b", recipient: "a", sendTime: 3 }),
    ];

    const events = runChannel(1, CLEAN, sends);
    expect(events.every((e) => e.kind === "collision")).toBe(true);
  });
});

describe("runChannel — drop and garble", () => {
  it("drops every frame (no events) when dropProb is 1", () => {
    const profile: ChannelProfile = { ...CLEAN, dropProb: 1 };
    const sends: ChannelSend[] = [
      send({ sender: "a", recipient: "b", sendTime: 0 }),
      send({ sender: "a", recipient: "b", sendTime: 5 }),
    ];

    const events = runChannel(99, profile, sends);
    expect(events).toHaveLength(0);
  });

  it("garbles a frame (no valid payload) when a payload bit flips in transit", () => {
    // bitFlipProb 1 flips every payload bit, guaranteeing corruption.
    const profile: ChannelProfile = { ...CLEAN, bitFlipProb: 1 };
    const sends: ChannelSend[] = [
      send({ sender: "a", recipient: "b", sendTime: 0, payload: Uint8Array.of(1, 2, 3) }),
    ];

    const events = runChannel(5, profile, sends);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("garbled");
    expect(events[0].payload).toBeUndefined();
  });
});
