import { describe, expect, it } from "vitest";
import {
  LoopbackTransport,
  createLoopbackTransport,
  resolveInbound,
  deriveSendSeed,
  type BroadcastChannelLike,
  type LoopbackMessage,
} from "./loopback";
import { NOMINAL_AIRTIME } from "./scripted";
import type { ChannelProfile } from "hindsight";
import type { Transport, TransportEvent } from "./types";

/**
 * Example tests for the loopback (two-tab) transport.
 *
 * - **Validates: Requirement 4.1** — `LoopbackTransport` satisfies the same
 *   `Transport` interface as the scripted transport (implements `send`, `on`,
 *   `mode`, `close` and emits `received | garbled | collision`).
 * - **Validates: Requirement 2.3** — half-duplex: while a tab transmits it does
 *   not decode an inbound send landing in its own airtime window; a `collision`
 *   is still surfaced.
 *
 * `BroadcastChannel` is not available in Node/Vitest, so these tests drive the
 * channel core through a minimal in-memory `BroadcastChannelLike` double that
 * fans a posted message out to every other channel on the same bus.
 */

const CLEAN: ChannelProfile = { minDelay: 1, maxDelay: 1, dropProb: 0, bitFlipProb: 0 };

/**
 * In-memory stand-in for the browser `BroadcastChannel`. A shared `Bus` connects
 * channels; posting on one delivers to every *other* channel synchronously,
 * mirroring the browser's "not echoed to self" behaviour.
 */
class Bus {
  private readonly channels = new Set<FakeBroadcastChannel>();
  register(ch: FakeBroadcastChannel): void {
    this.channels.add(ch);
  }
  unregister(ch: FakeBroadcastChannel): void {
    this.channels.delete(ch);
  }
  publish(from: FakeBroadcastChannel, message: unknown): void {
    for (const ch of this.channels) {
      if (ch === from) continue;
      ch.onmessage?.({ data: message });
    }
  }
}

class FakeBroadcastChannel implements BroadcastChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  constructor(private readonly bus: Bus) {
    bus.register(this);
  }
  postMessage(message: unknown): void {
    this.bus.publish(this, message);
  }
  close(): void {
    this.bus.unregister(this);
  }
}

function collect(transport: Transport): TransportEvent[] {
  const events: TransportEvent[] = [];
  transport.on((e) => events.push(e));
  return events;
}

function message(partial: Partial<LoopbackMessage> & Pick<LoopbackMessage, "sender" | "recipient" | "sendTime">): LoopbackMessage {
  return {
    airtime: NOMINAL_AIRTIME,
    seq: 0,
    payload: [1, 2, 3],
    ...partial,
  };
}

describe("LoopbackTransport — Transport interface + two-tab delivery (Req 4.1)", () => {
  it("delivers a frame sent by one tab to the other tab as received", () => {
    const bus = new Bus();
    const aliceChannel = new FakeBroadcastChannel(bus);
    const bobChannel = new FakeBroadcastChannel(bus);

    const alice = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "alice", channel: aliceChannel });
    const bob = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "bob", channel: bobChannel });

    // Both satisfy the interface shape.
    for (const t of [alice, bob]) {
      expect(typeof t.send).toBe("function");
      expect(typeof t.on).toBe("function");
      expect(typeof t.close).toBe("function");
      expect(t.mode).toBe("idle");
    }

    const bobEvents = collect(bob);
    const aliceEvents = collect(alice);

    alice.send({ sender: "alice", recipient: "bob", sendTime: 4, payload: Uint8Array.of(1, 2, 3) });

    // Bob (the other tab) receives it; Alice does not get her own echo.
    expect(bobEvents).toHaveLength(1);
    expect(bobEvents[0].kind).toBe("received");
    expect(bobEvents[0].sender).toBe("alice");
    expect(bobEvents[0].recipient).toBe("bob");
    expect(bobEvents[0].payload).toEqual(Uint8Array.of(1, 2, 3));
    expect(aliceEvents).toHaveLength(0);

    alice.close();
    bob.close();
  });

  it("does not deliver a frame addressed to a different recipient", () => {
    const bus = new Bus();
    const aliceChannel = new FakeBroadcastChannel(bus);
    const bobChannel = new FakeBroadcastChannel(bus);
    const alice = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "alice", channel: aliceChannel });
    const bob = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "bob", channel: bobChannel });
    const bobEvents = collect(bob);

    alice.send({ sender: "alice", recipient: "carol", sendTime: 1, payload: Uint8Array.of(5) });

    expect(bobEvents).toHaveLength(0);
    alice.close();
    bob.close();
  });
});

describe("LoopbackTransport — half-duplex (Req 2.3)", () => {
  it("marks the tab transmitting after a local send", () => {
    const bus = new Bus();
    const channel = new FakeBroadcastChannel(bus);
    const t = createLoopbackTransport({ seed: 1, profile: CLEAN, localId: "alice", channel });
    expect(t.mode).toBe("idle");
    t.send({ sender: "alice", recipient: "bob", sendTime: 10, payload: Uint8Array.of(1) });
    expect(t.mode).toBe("transmitting");
    t.endTransmit();
    expect(t.mode).toBe("idle");
    t.close();
  });

  it("suppresses an inbound received that lands inside the local transmit window", () => {
    const bus = new Bus();
    const aliceChannel = new FakeBroadcastChannel(bus);
    const bobChannel = new FakeBroadcastChannel(bus);
    const alice = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "alice", channel: aliceChannel });
    const bob = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "bob", channel: bobChannel });
    const bobEvents = collect(bob);

    // Bob is transmitting over [10, 10 + NOMINAL_AIRTIME) with a long airtime so
    // decode is suppressed, but send to carol so his own send does not locally
    // collide with Alice's inbound to bob.
    bob.send({ sender: "bob", recipient: "carol", sendTime: 10, payload: Uint8Array.of(9), airtime: NOMINAL_AIRTIME });
    // Alice delivers to bob at sim-time 11 (sendTime 10 + minDelay 1), inside
    // bob's transmit window. Give it airtime 1 so it does not collide with bob's
    // own on-air send geometry.
    alice.send({ sender: "alice", recipient: "bob", sendTime: 10, payload: Uint8Array.of(1), airtime: 1 });

    // Either suppressed by half-duplex or reported as a collision; never a clean
    // received while bob transmits.
    expect(bobEvents.some((e) => e.kind === "received")).toBe(false);

    alice.close();
    bob.close();
  });

  it("reports a collision to the receiving tab when an inbound send overlaps its own on-air send", () => {
    const bus = new Bus();
    const aliceChannel = new FakeBroadcastChannel(bus);
    const bobChannel = new FakeBroadcastChannel(bus);
    const alice = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "alice", channel: aliceChannel });
    const bob = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "bob", channel: bobChannel });
    const bobEvents = collect(bob);

    // Bob has a send on the air over [10, 10 + NOMINAL_AIRTIME).
    bob.send({ sender: "bob", recipient: "alice", sendTime: 10, payload: Uint8Array.of(9), airtime: NOMINAL_AIRTIME });
    // Alice's inbound to bob overlaps that window.
    alice.send({ sender: "alice", recipient: "bob", sendTime: 11, payload: Uint8Array.of(1), airtime: NOMINAL_AIRTIME });

    const collisionToBob = bobEvents.filter((e) => e.kind === "collision" && e.recipient === "bob");
    expect(collisionToBob.length).toBe(1);
    expect(bobEvents.some((e) => e.kind === "received")).toBe(false);

    alice.close();
    bob.close();
  });
});

describe("resolveInbound — pure core", () => {
  it("returns a received event for a clean inbound send", () => {
    const event = resolveInbound({
      runSeed: 7,
      profile: CLEAN,
      message: message({ sender: "alice", recipient: "bob", sendTime: 4 }),
      localActive: [],
    });
    expect(event?.kind).toBe("received");
    expect(event?.simTime).toBe(5);
  });

  it("returns a collision when the inbound overlaps a local on-air send", () => {
    const event = resolveInbound({
      runSeed: 7,
      profile: CLEAN,
      message: message({ sender: "alice", recipient: "bob", sendTime: 10, airtime: 4 }),
      localActive: [{ sendTime: 12, airtime: 4 }],
    });
    expect(event?.kind).toBe("collision");
  });

  it("returns null when the channel drops the inbound send", () => {
    const event = resolveInbound({
      runSeed: 7,
      profile: { ...CLEAN, dropProb: 1 },
      message: message({ sender: "alice", recipient: "bob", sendTime: 4 }),
      localActive: [],
    });
    expect(event).toBeNull();
  });

  it("is deterministic in its per-send seed", () => {
    expect(deriveSendSeed(7, "alice", 3)).toBe(deriveSendSeed(7, "alice", 3));
    expect(deriveSendSeed(7, "alice", 3)).not.toBe(deriveSendSeed(7, "bob", 3));
    expect(deriveSendSeed(7, "alice", 3)).not.toBe(deriveSendSeed(7, "alice", 4));
  });
});

describe("LoopbackTransport — lifecycle", () => {
  it("stops delivering after close()", () => {
    const bus = new Bus();
    const aliceChannel = new FakeBroadcastChannel(bus);
    const bobChannel = new FakeBroadcastChannel(bus);
    const alice = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "alice", channel: aliceChannel });
    const bob = new LoopbackTransport({ seed: 7, profile: CLEAN, localId: "bob", channel: bobChannel });
    const bobEvents = collect(bob);

    bob.close();
    alice.send({ sender: "alice", recipient: "bob", sendTime: 1, payload: Uint8Array.of(1) });

    expect(bobEvents).toHaveLength(0);
    alice.close();
  });
});

describe("loopback close", () => {
  it("closes the underlying channel once however often close is called", () => {
    let closes = 0;
    const channel = { postMessage() {}, onmessage: null, close: () => void closes++ };
    const t = createLoopbackTransport({ seed: 1, profile: CLEAN, localId: "a", channel });
    t.close();
    t.close();
    expect(closes).toBe(1);
  });
});

describe("LoopbackTransport — link status and ids", () => {
  it("reports an error on messageerror and ended once on close", () => {
    const channel = new FakeBroadcastChannel(new Bus());
    const t = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "alice", channel });
    const seen: { kind: string; reason: string }[] = [];
    t.onStatus((s) => seen.push(s));
    channel.onmessageerror?.({});
    t.close();
    t.close();
    expect(seen).toEqual([
      { kind: "error", reason: "message-error" },
      { kind: "ended", reason: "closed" },
    ]);
  });

  it("carries a frame id onto the outcome, including a collision", () => {
    const bus = new Bus();
    const alice = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "alice", channel: new FakeBroadcastChannel(bus) });
    const bob = createLoopbackTransport({ seed: 7, profile: CLEAN, localId: "bob", channel: new FakeBroadcastChannel(bus) });
    const bobEvents = collect(bob);
    alice.send({ id: "alice-0", sender: "alice", recipient: "bob", sendTime: 4, payload: Uint8Array.of(1) });
    expect(bobEvents[0].id).toBe("alice-0");
    bob.send({ sender: "bob", recipient: "alice", sendTime: 20, payload: Uint8Array.of(2) });
    alice.send({ id: "alice-1", sender: "alice", recipient: "bob", sendTime: 21, payload: Uint8Array.of(3) });
    expect(bobEvents[1]).toMatchObject({ kind: "collision", id: "alice-1" });
  });
});
