import { describe, expect, it } from "vitest";
import { runChannel } from "../index";
import { replayChannelLog } from "../engine/channel-log";
import { ledgerFromChannel } from "./from-channel";
import { buildLedger, closedFates, contradictedIds, inTransitAt, knownAt, lostAt, orphanOutcomes } from "./ledger";
import type { LedgerEvent } from "./ledger";

const sent = (id: string, to = "p2", at = 0): LedgerEvent => ({
  kind: "sent",
  messageId: id,
  sender: "p1",
  recipient: to,
  simTime: at,
});
const out = (id: string, outcome: "received" | "garbled" | "collision", at: number): LedgerEvent => ({
  kind: "outcome",
  messageId: id,
  outcome,
  simTime: at,
});

describe("ledger", () => {
  it("a delivered message is known from its outcome time", () => {
    const l = buildLedger([out("m1", "received", 5), sent("m1")]);
    expect(knownAt(l, "p2", 4).has("m1")).toBe(false);
    expect(inTransitAt(l, "p2", 4).has("m1")).toBe(true);
    expect(knownAt(l, "p2", 5).has("m1")).toBe(true);
    expect(inTransitAt(l, "p2", 5).size).toBe(0);
    expect(knownAt(l, "p1", 9).has("m1")).toBe(false);
  });
  it("garbled and collided messages are never known", () => {
    const l = buildLedger([sent("g"), out("g", "garbled", 2), sent("c"), out("c", "collision", 0)]);
    expect(knownAt(l, "p2", 99).size).toBe(0);
    expect(inTransitAt(l, "p2", 99).size).toBe(0);
  });
  it("a dropped message has no outcome, is never known, and stays in transit", () => {
    const l = buildLedger([sent("d")]);
    expect(knownAt(l, "p2", 99).size).toBe(0);
    expect(inTransitAt(l, "p2", 99).has("d")).toBe(true);
    expect(inTransitAt(l, "p2", -1).size).toBe(0);
  });
  it("learned facts are known from their time", () => {
    const l = buildLedger([{ kind: "learned", participant: "p1", factId: "f", simTime: 3 }]);
    expect(knownAt(l, "p1", 2).size).toBe(0);
    expect([...knownAt(l, "p1", 3)]).toEqual(["f"]);
  });
  it("counts and ignores an outcome with no sent event", () => {
    const l = buildLedger([out("x", "received", 1), sent("m"), out("m", "received", 2)]);
    expect(orphanOutcomes(l)).toBe(1);
    expect([...knownAt(l, "p2", 9)]).toEqual(["m"]);
  });
  it("an unknown participant knows and awaits nothing", () => {
    const l = buildLedger([sent("m"), out("m", "received", 1)]);
    expect(knownAt(l, "nobody", 9).size).toBe(0);
    expect(inTransitAt(l, "nobody", 9).size).toBe(0);
  });
  it("a message already received through an arrival is not in transit", () => {
    const arrival = (to: string): LedgerEvent => ({
      kind: "arrival",
      messageId: "m2",
      sender: "p1",
      recipient: to,
      outcome: "received",
      simTime: 0,
    });
    for (const to of ["p1", "p2"]) {
      const l = buildLedger([sent("m2", to, 0), arrival(to)]);
      expect(knownAt(l, to, 0).has("m2")).toBe(true);
      expect(inTransitAt(l, to, 0).has("m2")).toBe(false);
    }
  });
  it("a message that arrived damaged through an arrival is lost, not in transit", () => {
    const l = buildLedger([
      sent("m4", "p1", 0),
      { kind: "arrival", messageId: "m4", sender: "p1", recipient: "p1", outcome: "collision", simTime: 0 },
    ]);
    expect(lostAt(l, "p1", 0).has("m4")).toBe(true);
    expect(inTransitAt(l, "p1", 0).has("m4")).toBe(false);
  });
  it("ignores an outcome earlier than its send (Property 8, seed 496442121)", () => {
    const l = buildLedger([out("m5", "received", 0), sent("m5", "p2", 1), out("m5", "received", 1)]);
    expect(knownAt(l, "p2", 0).has("m5")).toBe(false);
    expect(knownAt(l, "p2", 1).has("m5")).toBe(true);
    const early = buildLedger([out("m6", "garbled", 0), sent("m6", "p2", 1)]);
    expect(lostAt(early, "p2", 5).has("m6")).toBe(false);
    expect(inTransitAt(early, "p2", 5).has("m6")).toBe(true);
    expect(closedFates(early).get("m6")).toBe("never-arrived");
  });
  it("ignores an arrival earlier than its send (Property 7, seed 1613359026; Property 8, seed 971708861)", () => {
    const arrival = (id: string, outcome: "received" | "garbled", at: number): LedgerEvent => ({
      kind: "arrival",
      messageId: id,
      sender: "p1",
      recipient: "p2",
      outcome,
      simTime: at,
    });
    const l = buildLedger([arrival("m5", "received", 0), sent("m5", "p2", 1)]);
    expect(knownAt(l, "p2", 0).has("m5")).toBe(false);
    expect(knownAt(l, "p2", 5).has("m5")).toBe(false);
    expect(inTransitAt(l, "p2", 5).has("m5")).toBe(true);
    expect(closedFates(l).get("m5")).toBe("never-arrived");
    expect(contradictedIds(l)).toEqual(new Set(["m5"]));
    const damaged = buildLedger([arrival("m4", "garbled", 0), sent("m4", "p2", 1)]);
    expect(lostAt(damaged, "p2", 5).has("m4")).toBe(false);
    expect(inTransitAt(damaged, "p2", 5).has("m4")).toBe(true);
  });
  it("still counts an arrival for an id with no send at all", () => {
    const l = buildLedger([
      { kind: "arrival", messageId: "a1", sender: "p1", recipient: "p2", outcome: "received", simTime: 0 },
    ]);
    expect(knownAt(l, "p2", 0).has("a1")).toBe(true);
    expect(contradictedIds(l).size).toBe(0);
  });
  it("sorts into a canonical order regardless of input order", () => {
    const a = [sent("m"), out("m", "received", 1)];
    expect(buildLedger(a)).toEqual(buildLedger([...a].reverse()));
  });
  it("builds a ledger from the real channel", () => {
    const sends = [{ id: "m1", sender: "p1", recipient: "p2", sendTime: 0, payload: new Uint8Array([1]) }];
    const log = replayChannelLog(
      runChannel(1, { minDelay: 2, maxDelay: 2, dropProb: 0, bitFlipProb: 0 }, sends),
    );
    const l = buildLedger(ledgerFromChannel(sends, log));
    expect([...knownAt(l, "p2", 2)]).toEqual(["m1"]);
  });
});
