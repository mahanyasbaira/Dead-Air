import { describe, expect, it } from "vitest";
import { runChannel } from "../index";
import { replayChannelLog } from "../engine/channel-log";
import type { ChannelLog } from "../engine/channel-log";
import { ledgerFromChannel } from "./from-channel";
import { buildLedger, closedFates, inTransitAt, knownAt, lostAt, orphanOutcomes } from "./ledger";
import type { LedgerEvent } from "./ledger";

const arrival = (
  id: string,
  outcome: "received" | "garbled" | "collision",
  at: number,
): LedgerEvent => ({ kind: "arrival", messageId: id, sender: "p1", recipient: "p2", outcome, simTime: at });
const sent = (id: string, at = 0, extra: Partial<Extract<LedgerEvent, { kind: "sent" }>> = {}): LedgerEvent => ({
  kind: "sent",
  messageId: id,
  sender: "p1",
  recipient: "p2",
  simTime: at,
  ...extra,
});
const out = (id: string, outcome: "received" | "garbled" | "collision", at: number): LedgerEvent => ({
  kind: "outcome",
  messageId: id,
  outcome,
  simTime: at,
});

describe("arrivals", () => {
  it("an arrival is known from its time and has no send", () => {
    const l = buildLedger([arrival("a", "received", 7)]);
    expect(knownAt(l, "p2", 6).has("a")).toBe(false);
    expect(knownAt(l, "p2", 7).has("a")).toBe(true);
    expect(knownAt(l, "p1", 9).has("a")).toBe(false);
    expect(inTransitAt(l, "p2", 9).size).toBe(0);
    expect(closedFates(l).size).toBe(0);
    expect(orphanOutcomes(l)).toBe(0);
  });

  it("a garbled arrival is lost and not known", () => {
    const l = buildLedger([arrival("a", "garbled", 3), arrival("b", "collision", 4)]);
    expect(knownAt(l, "p2", 99).size).toBe(0);
    expect(lostAt(l, "p2", 3).has("a")).toBe(true);
    expect(lostAt(l, "p2", 3).has("b")).toBe(false);
    expect([...lostAt(l, "p2", 4)].sort()).toEqual(["a", "b"]);
    expect(lostAt(l, "p1", 99).size).toBe(0);
  });

  it("a collided send is lost for its recipient from the outcome time", () => {
    const l = buildLedger([sent("c"), out("c", "collision", 2)]);
    expect(lostAt(l, "p2", 1).size).toBe(0);
    expect(lostAt(l, "p2", 2).has("c")).toBe(true);
    expect(knownAt(l, "p2", 2).has("c")).toBe(false);
  });

  it("a dropped send is in transit until the record closes, then never arrived", () => {
    const l = buildLedger([sent("d", 1), sent("r", 1), out("r", "received", 4), sent("g", 1), out("g", "garbled", 2)]);
    expect(inTransitAt(l, "p2", 50).has("d")).toBe(true);
    expect(lostAt(l, "p2", 50).has("d")).toBe(false);
    expect(Object.fromEntries(closedFates(l))).toEqual({
      d: "never-arrived",
      r: "received",
      g: "garbled",
    });
  });

  it("a send with bytes and airtime keeps both through buildLedger", () => {
    const l = buildLedger([sent("m", 2, { bytes: 12, airtime: 5 })]);
    expect(l.events[0]).toMatchObject({ kind: "sent", bytes: 12, airtime: 5 });
  });

  it("a readback event is kept and does not change what is known", () => {
    const l = buildLedger([
      { kind: "readback", participant: "p2", messageId: "m", simTime: 3 },
      sent("m"),
      out("m", "received", 2),
    ]);
    expect(l.events.map((e) => e.kind)).toEqual(["sent", "outcome", "readback"]);
    expect([...knownAt(l, "p2", 9)]).toEqual(["m"]);
  });

  it("ledgerFromChannel makes an arrival for an id with no send and carries bytes and airtime", () => {
    const sends = [{ id: "m1", sender: "p1", recipient: "p2", sendTime: 0, bytes: 4, airtime: 3 }];
    const log: ChannelLog = [
      { id: "m1", outcome: "received", simTime: 5, sender: "p1", recipient: "p2" },
      { id: "x9", outcome: "garbled", simTime: 6, sender: "p2", recipient: "p1" },
      { outcome: "received", simTime: 7, sender: "p2", recipient: "p1" },
    ];
    const events = ledgerFromChannel(sends, log);
    expect(events).toEqual([
      { kind: "sent", messageId: "m1", sender: "p1", recipient: "p2", simTime: 0, bytes: 4, airtime: 3 },
      { kind: "outcome", messageId: "m1", outcome: "received", simTime: 5 },
      { kind: "arrival", messageId: "x9", sender: "p2", recipient: "p1", outcome: "garbled", simTime: 6 },
    ]);
    const l = buildLedger(events);
    expect(lostAt(l, "p1", 6).has("x9")).toBe(true);
    expect(orphanOutcomes(l)).toBe(0);
  });

  it("ledgerFromChannel on the real channel still gives the same known set", () => {
    const sends = [{ id: "m1", sender: "p1", recipient: "p2", sendTime: 0, payload: new Uint8Array([1]) }];
    const log = replayChannelLog(runChannel(1, { minDelay: 2, maxDelay: 2, dropProb: 0, bitFlipProb: 0 }, sends));
    expect([...knownAt(buildLedger(ledgerFromChannel(sends, log)), "p2", 2)]).toEqual(["m1"]);
  });
});
