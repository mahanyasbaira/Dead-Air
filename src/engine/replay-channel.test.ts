import { describe, expect, it } from "vitest";
import {
  appendChannelEvent,
  emptyChannelLog,
  replayChannelLog,
  toChannelLogEntry,
  type ChannelOutcome,
} from "./channel-log";
import type { ChannelEvent } from "../channel/channel";
import type { TransportEvent } from "../transport/types";

// Boundary contract (compile-time): the channel's ChannelEvent and the
// transport's TransportEvent are structurally assignable to ChannelOutcome, so a
// transport listener hands its event straight to the engine adapter with no
// reshaping. The import direction is not violated: these are type-only imports in
// a TEST file; the production module `channel-log.ts` imports nothing outward.
const _channelEventFits: (e: ChannelEvent) => ChannelOutcome = (e) => e;
const _transportEventFits: (e: TransportEvent) => ChannelOutcome = (e) => e;
void _channelEventFits;
void _transportEventFits;

// A6 example tests (requirement 5.1): a transport hands the engine exactly one
// appended event per outcome, each carrying sim-time, sender, recipient and the
// outcome kind. These pin the human-describable behaviour; the universal rule is
// pinned by the P6 property test in replay-channel.prop.test.ts.

const received: ChannelOutcome = {
  kind: "received",
  simTime: 5,
  sender: "dispatch",
  recipient: "field",
  payload: Uint8Array.from([0x57, 0x49, 0x4e, 0x44]),
};
const garbled: ChannelOutcome = {
  kind: "garbled",
  simTime: 7,
  sender: "field",
  recipient: "dispatch",
};
const collision: ChannelOutcome = {
  kind: "collision",
  simTime: 3,
  sender: "dispatch",
  recipient: "field",
};

describe("one appended engine event per channel outcome (Req 5.1)", () => {
  it("appends exactly one entry for a received outcome", () => {
    const log = appendChannelEvent(emptyChannelLog, received);
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual({
      outcome: "received",
      simTime: 5,
      sender: "dispatch",
      recipient: "field",
      payload: Uint8Array.from([0x57, 0x49, 0x4e, 0x44]),
    });
  });

  it("appends exactly one entry for a garbled outcome, with no payload", () => {
    const log = appendChannelEvent(emptyChannelLog, garbled);
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual({
      outcome: "garbled",
      simTime: 7,
      sender: "field",
      recipient: "dispatch",
    });
    expect(log[0].payload).toBeUndefined();
  });

  it("appends exactly one entry for a collision outcome, with no payload", () => {
    const log = appendChannelEvent(emptyChannelLog, collision);
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual({
      outcome: "collision",
      simTime: 3,
      sender: "dispatch",
      recipient: "field",
    });
    expect(log[0].payload).toBeUndefined();
  });

  it("appends one entry per outcome and preserves recorded order", () => {
    let log = emptyChannelLog;
    for (const e of [received, garbled, collision]) log = appendChannelEvent(log, e);
    expect(log).toHaveLength(3);
    expect(log.map((e) => e.outcome)).toEqual(["received", "garbled", "collision"]);
    expect(log.map((e) => e.simTime)).toEqual([5, 7, 3]);
  });

  it("carries the payload only on a received outcome", () => {
    // A received outcome without a payload still appends exactly one entry.
    const receivedNoPayload: ChannelOutcome = {
      kind: "received",
      simTime: 2,
      sender: "field",
      recipient: "dispatch",
    };
    expect(toChannelLogEntry(receivedNoPayload).payload).toBeUndefined();
    // A collision that happens to carry a payload still drops it on append.
    const collisionWithPayload = {
      ...collision,
      payload: Uint8Array.from([1, 2, 3]),
    } as ChannelOutcome;
    expect(toChannelLogEntry(collisionWithPayload).payload).toBeUndefined();
  });

  it("copies the payload so later mutation of the source cannot change the log", () => {
    const payload = Uint8Array.from([9, 9, 9]);
    const log = appendChannelEvent(emptyChannelLog, {
      kind: "received",
      simTime: 1,
      sender: "dispatch",
      recipient: "field",
      payload,
    });
    payload[0] = 0;
    expect(Array.from(log[0].payload!)).toEqual([9, 9, 9]);
  });

  it("does not mutate the input log when appending", () => {
    const first = appendChannelEvent(emptyChannelLog, received);
    const second = appendChannelEvent(first, garbled);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(emptyChannelLog).toHaveLength(0);
  });
});

describe("replay reaches the same log (Req 5.2 example)", () => {
  it("replaying the same outcomes twice yields equal logs", () => {
    const events = [received, garbled, collision];
    expect(replayChannelLog(events)).toEqual(replayChannelLog(events));
  });

  it("a fold step-by-step equals the batch replay", () => {
    const events = [collision, received, garbled];
    let folded = emptyChannelLog;
    for (const e of events) folded = appendChannelEvent(folded, e);
    expect(folded).toEqual(replayChannelLog(events));
  });
});
