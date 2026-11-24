import { describe, expect, it } from "vitest";
import { inTransitAt, knownAt } from "hindsight";
import { layoutWorldlines } from "hindsight/replay";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import { deriveState } from "./log";
import { restore, serialize } from "./persist";
import { LIMIT_NOTE, toLedger, toParticipants, toReplayScenario } from "./replay-input";
import type { ConsoleLogEntry, SendRecord, TransportEvent } from "./types";

const scenario = staticOnChannel9;
const ledgerOf = (log: ConsoleLogEntry[]) => toLedger(scenario, log, deriveState(scenario, log));
const send = (id: string, sendTime: number, sender = "dispatch", recipient = "field"): ConsoleLogEntry => ({
  kind: "send",
  send: { id, sender, recipient, sendTime, bytes: 3 },
});
const wire = (e: Partial<TransportEvent> & Pick<TransportEvent, "kind" | "simTime">): ConsoleLogEntry => ({
  kind: "wire",
  event: { sender: "dispatch", recipient: "field", ...e },
});
const received = (id: string, simTime: number): ConsoleLogEntry =>
  wire({ kind: "received", id, simTime, payload: Uint8Array.of(1, 2, 3) });

describe("toLedger with sends", () => {
  it("shows a send at 2 received at 5 in transit at 4 and known at 5", () => {
    const l = ledgerOf([send("dispatch-0", 2), received("dispatch-0", 5)]);
    expect([...inTransitAt(l, "field", 4)]).toEqual(["dispatch-0"]);
    expect([...inTransitAt(l, "field", 5)]).toEqual([]);
    expect(knownAt(l, "field", 4).has("dispatch-0")).toBe(false);
    expect(knownAt(l, "field", 5).has("dispatch-0")).toBe(true);
  });

  it("keeps a send with no outcome in transit to the end", () => {
    const l = ledgerOf([send("dispatch-0", 2)]);
    expect([...inTransitAt(l, "field", 1000)]).toEqual(["dispatch-0"]);
    expect(knownAt(l, "field", 1000).has("dispatch-0")).toBe(false);
  });

  it("treats a garbled outcome as an outcome but not knowledge", () => {
    const l = ledgerOf([send("dispatch-0", 2), wire({ kind: "garbled", id: "dispatch-0", simTime: 5 })]);
    expect(knownAt(l, "field", 9).has("dispatch-0")).toBe(false);
    expect([...inTransitAt(l, "field", 9)]).toEqual([]);
  });

  it("treats a collision as an outcome but not knowledge", () => {
    const l = ledgerOf([send("dispatch-0", 2), wire({ kind: "collision", id: "dispatch-0", simTime: 2 })]);
    expect(knownAt(l, "field", 9).has("dispatch-0")).toBe(false);
  });

  it("turns an old log with no send entries into arrivals, with no invented sends", () => {
    const old: ConsoleLogEntry[] = [
      wire({ kind: "received", simTime: 3, sender: "field", recipient: "dispatch", payload: Uint8Array.of(9) }),
      wire({ kind: "garbled", simTime: 5 }),
    ];
    const l = ledgerOf(old);
    expect(l.events.filter((e) => e.kind === "sent")).toEqual([]);
    expect(l.events.filter((e) => e.kind === "arrival")).toEqual([
      { kind: "arrival", messageId: "Message 1 from field", sender: "field", recipient: "dispatch", outcome: "received", simTime: 3 },
      { kind: "arrival", messageId: "Message 2 from dispatch", sender: "dispatch", recipient: "field", outcome: "garbled", simTime: 5 },
    ]);
  });

  it("makes an outcome whose id matches no send, or precedes its send, an arrival", () => {
    const l = ledgerOf([send("dispatch-0", 8), received("dispatch-0", 5), received("elsewhere", 6)]);
    expect(l.events.filter((e) => e.kind === "sent").map((e) => e.simTime)).toEqual([8]);
    expect(l.events.filter((e) => e.kind === "arrival").map((e) => e.simTime)).toEqual([5, 6]);
    expect(l.events.filter((e) => e.kind === "outcome")).toEqual([]);
  });

  it("passes the send's byte count to the ledger", () => {
    const sent = ledgerOf([send("dispatch-0", 2)]).events.find((e) => e.kind === "sent");
    expect(sent).toMatchObject({ bytes: 3 });
  });

  it("round-trips send entries through persistence", () => {
    const log: ConsoleLogEntry[] = [send("dispatch-0", 2), received("dispatch-0", 5), send("dispatch-1", 6)];
    const r = restore(serialize({ version: 1, scenarioId: scenario.id, seed: 9, mode: "solo", log }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.run.log.filter((e) => e.kind === "send").map((e) => (e as { send: SendRecord }).send)).toEqual([
      { id: "dispatch-0", sender: "dispatch", recipient: "field", sendTime: 2, bytes: 3 },
      { id: "dispatch-1", sender: "dispatch", recipient: "field", sendTime: 6, bytes: 3 },
    ]);
    expect(toLedger(scenario, r.run.log, r.state)).toEqual(ledgerOf(log));
  });
});

describe("toParticipants and the layout it feeds", () => {
  const layoutOf = (log: ConsoleLogEntry[], mode: "solo" | "loopback" | "acoustic") => {
    const state = deriveState(scenario, log);
    return layoutWorldlines(
      {
        ledger: toLedger(scenario, log, state),
        scenario: toReplayScenario(scenario, state),
        participants: toParticipants(scenario, log, { mode, localRole: "dispatch" }),
      },
      {},
    );
  };
  const partnerReceived = wire({ kind: "received", id: "field-0", simTime: 4, sender: "field", recipient: "dispatch", payload: Uint8Array.of(1) });

  it("marks the partner arrivals-only in two tabs, with the note, and draws ticks", () => {
    const log = [send("dispatch-0", 2), received("dispatch-0", 5), partnerReceived];
    const ps = toParticipants(scenario, log, { mode: "loopback", localRole: "dispatch" });
    expect(ps.find((p) => p.id === "dispatch")?.history).toBeUndefined();
    expect(ps.find((p) => p.id === "field")).toMatchObject({ history: "arrivals-only", limitNote: LIMIT_NOTE });
    const l = layoutOf(log, "loopback");
    expect(l.arrivals.map((a) => a.id)).toEqual(["Message 2 from field"]);
    expect(l.signals.map((s) => s.id)).toEqual(["dispatch-0"]);
    expect(l.limits).toHaveLength(1);
  });

  it("keeps the partner arrivals-only in acoustic mode", () => {
    const ps = toParticipants(scenario, [], { mode: "acoustic", localRole: "dispatch" });
    expect(ps.find((p) => p.id === "field")).toMatchObject({ history: "arrivals-only" });
  });

  it("shows complete lines with diagonals in solo", () => {
    const log = [send("field-0", 1, "field", "dispatch"), wire({ kind: "received", id: "field-0", simTime: 4, sender: "field", recipient: "dispatch", payload: Uint8Array.of(1) })];
    const l = layoutOf(log, "solo");
    expect(l.limits).toEqual([]);
    expect(l.signals.map((s) => [s.id, s.fate])).toEqual([["field-0", "received"]]);
    expect(l.arrivals).toEqual([]);
  });

  it("shows ticks and no diagonals for an old solo save (outcomes only)", () => {
    const l = layoutOf([partnerReceived], "solo");
    expect(l.signals).toEqual([]);
    expect(l.arrivals).toHaveLength(1);
    expect(l.limits).toHaveLength(1);
  });

  it("shows a dropped solo partner message as a never-arrived line", () => {
    const l = layoutOf([send("field-0", 1, "field", "dispatch")], "solo");
    expect(l.signals.map((s) => [s.id, s.fate])).toEqual([["field-0", "never-arrived"]]);
    expect(l.limits).toEqual([]);
  });

  it("treats the partner as complete in solo when it neither sent nor arrived", () => {
    const ps = toParticipants(scenario, [], { mode: "solo", localRole: "dispatch" });
    expect(ps.every((p) => p.history === undefined)).toBe(true);
  });
});
