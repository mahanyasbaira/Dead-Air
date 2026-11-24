import { describe, expect, it } from "vitest";
import { clearLine, gainAt } from "./clear-line";
import { buildLedger, knownAt } from "./ledger";
import type { LedgerEvent } from "./ledger";

const sent = (messageId: string, sender: string, recipient: string, simTime: number): LedgerEvent => ({
  kind: "sent",
  messageId,
  sender,
  recipient,
  simTime,
});

describe("clear line", () => {
  it("a dropped message to a role appears in the gain at a later decision", () => {
    const l = buildLedger([sent("m1", "a", "b", 5)]);
    expect(knownAt(l, "b", 20).has("m1")).toBe(false);
    expect(gainAt(l, "b", 20)).toEqual(["m1"]);
    expect(gainAt(l, "b", 4)).toEqual([]);
  });

  it("a garbled message appears in the gain too", () => {
    const l = buildLedger([
      sent("m1", "a", "b", 5),
      { kind: "outcome", messageId: "m1", outcome: "garbled", simTime: 9 },
    ]);
    expect(gainAt(l, "b", 20)).toEqual(["m1"]);
  });

  it("an arrival is untouched, and no send is added for a sender known only by arrivals", () => {
    const arrival: LedgerEvent = {
      kind: "arrival",
      messageId: "x1",
      sender: "partner",
      recipient: "b",
      outcome: "collision",
      simTime: 7,
    };
    const l = buildLedger([sent("m1", "a", "b", 5), arrival]);
    const cleared = clearLine(l);
    expect(cleared.events).toContainEqual(arrival);
    expect(cleared.events.filter((e) => e.kind === "sent").map((e) => (e as { sender: string }).sender)).toEqual(["a"]);
    expect(cleared.events.filter((e) => e.kind === "arrival")).toEqual([arrival]);
    expect(gainAt(l, "b", 20)).toEqual(["m1"]);
  });

  it("a message id reused for two recipients is gained only by a recipient it was sent to by then", () => {
    const l = buildLedger([sent("m1", "a", "c", 5), sent("m1", "a", "b", 20)]);
    expect(gainAt(l, "b", 5)).toEqual([]);
    expect(gainAt(l, "b", 20)).toEqual(["m1"]);
  });

  it("a ledger with no loss gives an empty gain", () => {
    const l = buildLedger([
      sent("m1", "a", "b", 5),
      { kind: "outcome", messageId: "m1", outcome: "received", simTime: 8 },
      { kind: "learned", participant: "b", factId: "f1", simTime: 2 },
    ]);
    expect(gainAt(l, "b", 20)).toEqual([]);
  });
});
