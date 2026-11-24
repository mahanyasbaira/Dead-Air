import { describe, expect, it } from "vitest";
import {
  ScriptedTransport,
  createScriptedTransport,
  runScripted,
  NOMINAL_AIRTIME,
  type ScriptedSend,
} from "./scripted";
import type { ChannelProfile } from "hindsight";
import type { Transport, TransportEvent } from "./types";

/**
 * Example tests for the scripted (solo-partner) transport.
 *
 * - **Validates: Requirement 4.1** — `ScriptedTransport` satisfies the one
 *   `Transport` interface (implements `send`, `on`, `mode`, `close` and emits
 *   `received | garbled | collision`).
 * - **Validates: Requirement 2.3** — half-duplex: while the local device
 *   transmits it does not decode inbound audio; an inbound outcome landing in
 *   the local send's airtime window is suppressed, but a `collision` is still
 *   surfaced.
 *
 * The pure core (`runScripted`) is driven directly so no audio or
 * `BroadcastChannel` is needed; determinism is inherited from the A4 channel.
 */

const CLEAN: ChannelProfile = { minDelay: 1, maxDelay: 1, dropProb: 0, bitFlipProb: 0 };

function collect(transport: Transport): TransportEvent[] {
  const events: TransportEvent[] = [];
  transport.on((e) => events.push(e));
  return events;
}

describe("ScriptedTransport — Transport interface (Req 4.1)", () => {
  it("implements the interface and emits a received event for a partner send", () => {
    const schedule: ScriptedSend[] = [
      { sender: "partner", recipient: "me", sendTime: 2, payload: Uint8Array.of(1, 2, 3) },
    ];
    const transport = createScriptedTransport({ seed: 7, profile: CLEAN, schedule, localId: "me" });

    // Satisfies the interface shape.
    expect(typeof transport.send).toBe("function");
    expect(typeof transport.on).toBe("function");
    expect(typeof transport.close).toBe("function");
    expect(transport.mode).toBe("idle");

    const events = collect(transport);
    transport.resolve();

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("received");
    expect(events[0].sender).toBe("partner");
    expect(events[0].recipient).toBe("me");
    expect(events[0].payload).toEqual(Uint8Array.of(1, 2, 3));
    // minDelay == 1 so delivery is at sendTime + 1.
    expect(events[0].simTime).toBe(3);

    transport.close();
  });

  it("carries the local device's own send through the channel to the partner", () => {
    const transport = createScriptedTransport({ seed: 7, profile: CLEAN, schedule: [], localId: "me" });
    const events = collect(transport);

    transport.send({ sender: "me", recipient: "partner", sendTime: 5, payload: Uint8Array.of(9) });
    transport.resolve();

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("received");
    expect(events[0].sender).toBe("me");
    expect(events[0].recipient).toBe("partner");
  });

  it("emits a garbled event (no payload) when the profile flips every bit", () => {
    const profile: ChannelProfile = { ...CLEAN, bitFlipProb: 1 };
    const schedule: ScriptedSend[] = [
      { sender: "partner", recipient: "me", sendTime: 0, payload: Uint8Array.of(1, 2, 3) },
    ];
    const transport = createScriptedTransport({ seed: 5, profile, schedule, localId: "me" });
    const events = collect(transport);

    transport.resolve();

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("garbled");
    expect(events[0].payload).toBeUndefined();
  });
});

describe("ScriptedTransport — half-duplex (Req 2.3)", () => {
  it("marks the device transmitting after a local send", () => {
    const transport = createScriptedTransport({ seed: 1, profile: CLEAN, schedule: [], localId: "me" });
    expect(transport.mode).toBe("idle");
    transport.send({ sender: "me", recipient: "partner", sendTime: 10, payload: Uint8Array.of(1) });
    expect(transport.mode).toBe("transmitting");
    transport.resolve();
    expect(transport.mode).toBe("idle");
  });

  it("suppresses an inbound received that lands inside the local transmit window", () => {
    // Partner delivers to `me` at sim-time 11 (sendTime 10 + minDelay 1), which
    // falls inside the local send's airtime window [10, 10 + NOMINAL_AIRTIME).
    const schedule: ScriptedSend[] = [
      { sender: "partner", recipient: "me", sendTime: 10, payload: Uint8Array.of(7), airtime: 1 },
    ];
    const transport = createScriptedTransport({ seed: 3, profile: CLEAN, schedule, localId: "me" });
    const events = collect(transport);

    // Local device transmits over [10, 10 + NOMINAL_AIRTIME): it must not decode
    // the inbound delivery at 11.
    expect(NOMINAL_AIRTIME).toBeGreaterThan(1);
    transport.send({ sender: "me", recipient: "partner", sendTime: 10, payload: Uint8Array.of(1), airtime: NOMINAL_AIRTIME });
    transport.resolve();

    // The partner send collided with the local send (both airtimes overlap), so
    // both see a collision and no received is delivered to `me`.
    expect(events.some((e) => e.kind === "received" && e.recipient === "me")).toBe(false);
  });

  it("still surfaces a collision to the local device while it transmits", () => {
    // Overlapping sends at the same time collide; the collision must reach `me`
    // even though it was transmitting.
    const schedule: ScriptedSend[] = [
      { sender: "partner", recipient: "me", sendTime: 10, payload: Uint8Array.of(7), airtime: NOMINAL_AIRTIME },
    ];
    const transport = createScriptedTransport({ seed: 3, profile: CLEAN, schedule, localId: "me" });
    const events = collect(transport);

    transport.send({ sender: "me", recipient: "partner", sendTime: 11, payload: Uint8Array.of(1), airtime: NOMINAL_AIRTIME });
    transport.resolve();

    const collisionToMe = events.filter((e) => e.kind === "collision" && e.recipient === "me");
    expect(collisionToMe.length).toBeGreaterThanOrEqual(1);
  });

  it("delivers an inbound received that lands outside the local transmit window", () => {
    // Partner delivers to `me` at sim-time 21, well after the local send's
    // airtime window [0, NOMINAL_AIRTIME): decoding is not suppressed.
    const schedule: ScriptedSend[] = [
      { sender: "partner", recipient: "me", sendTime: 20, payload: Uint8Array.of(7), airtime: 1 },
    ];
    const transport = createScriptedTransport({ seed: 3, profile: CLEAN, schedule, localId: "me" });
    const events = collect(transport);

    transport.send({ sender: "me", recipient: "partner", sendTime: 0, payload: Uint8Array.of(1), airtime: NOMINAL_AIRTIME });
    transport.resolve();

    expect(events.some((e) => e.kind === "received" && e.recipient === "me" && e.simTime === 21)).toBe(true);
  });
});

describe("runScripted — determinism", () => {
  it("is deterministic: same inputs yield the same event list", () => {
    const input = {
      seed: 42,
      profile: { minDelay: 1, maxDelay: 6, dropProb: 0.3, bitFlipProb: 0.05 },
      schedule: [
        { sender: "partner", recipient: "me", sendTime: 2, payload: Uint8Array.of(1, 2, 3) },
        { sender: "partner", recipient: "me", sendTime: 30, payload: Uint8Array.of(4, 5) },
      ],
      localSends: [
        { sender: "me", recipient: "partner", sendTime: 15, payload: Uint8Array.of(9), airtime: NOMINAL_AIRTIME },
      ],
      localId: "me",
    };
    const first = runScripted(input);
    const second = runScripted(input);
    expect(second).toEqual(first);
  });
});

describe("ScriptedTransport — lifecycle", () => {
  it("stops emitting after close()", () => {
    const schedule: ScriptedSend[] = [
      { sender: "partner", recipient: "me", sendTime: 1, payload: Uint8Array.of(1) },
    ];
    const transport = new ScriptedTransport({ seed: 1, profile: CLEAN, schedule, localId: "me" });
    const events = collect(transport);
    transport.close();
    transport.send({ sender: "me", recipient: "partner", sendTime: 5, payload: Uint8Array.of(2) });
    const emitted = transport.resolve();
    expect(emitted).toEqual([]);
    expect(events).toHaveLength(0);
  });
});

describe("ScriptedTransport — link status and ids", () => {
  it("reports ended once, with reason closed, when closed", () => {
    const t = createScriptedTransport({ seed: 1, profile: CLEAN, schedule: [], localId: "me" });
    const seen: { kind: string; reason: string }[] = [];
    t.onStatus((s) => seen.push(s));
    t.close();
    t.close();
    expect(seen).toEqual([{ kind: "ended", reason: "closed" }]);
  });

  it("carries schedule and frame ids onto the outcomes", () => {
    const schedule: ScriptedSend[] = [
      { id: "partner-s0", sender: "partner", recipient: "me", sendTime: 2, payload: Uint8Array.of(1) },
    ];
    const t = createScriptedTransport({ seed: 1, profile: CLEAN, schedule, localId: "me" });
    t.send({ id: "me-0", sender: "me", recipient: "partner", sendTime: 20, payload: Uint8Array.of(2) });
    const ids = t.resolve().map((e) => e.id).sort();
    expect(ids).toEqual(["me-0", "partner-s0"]);
  });
});
