import { describe, expect, it } from "vitest";
import { initialState } from "hindsight";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import type { ConsoleLogEntry, TransportEvent } from "./types";
import { appendWire, applyEntry, deriveState, emptyLog, recordDecision } from "./log";

const scenario = staticOnChannel9; // steps 0,1,2,3,5,6
const wire = (simTime: number, kind: TransportEvent["kind"] = "received"): TransportEvent => ({
  kind,
  simTime,
  sender: "dispatch",
  recipient: "field",
  ...(kind === "received" ? { payload: new Uint8Array([1, 2]) } : {}),
});

function ok(r: ReturnType<typeof recordDecision>): ConsoleLogEntry[] {
  if (!r.ok) throw new Error("expected accepted");
  return r.log;
}

describe("appendWire", () => {
  it("keeps order and never mutates the input", () => {
    const a = appendWire(emptyLog, wire(1));
    const frozen = Object.freeze([...a]);
    const b = appendWire(frozen, wire(2, "collision"));
    expect(frozen).toHaveLength(1);
    expect(b.map((e) => (e.kind === "wire" ? e.event.simTime : -1))).toEqual([1, 2]);
    expect(b[0]).toBe(a[0]);
  });
});

describe("recordDecision", () => {
  it("records role, option and sim-time", () => {
    const r = recordDecision(scenario, emptyLog, {
      role: "dispatch",
      optionId: "d-hold",
      recordedAtSimTime: 3,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.decisions).toEqual([
        { role: "dispatch", optionId: "d-hold", recordedAtSimTime: 3 },
      ]);
      expect(r.log).toHaveLength(1);
    }
  });

  it("accepts a change before the next beat begins (reducer replaces)", () => {
    let log = ok(recordDecision(scenario, emptyLog, { role: "dispatch", optionId: "d-hold", recordedAtSimTime: 3 }));
    log = appendWire(log, wire(3)); // cursor 3, next beat is 5
    const r = recordDecision(scenario, log, { role: "dispatch", optionId: "d-ask", recordedAtSimTime: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.decisions[0].optionId).toBe("d-ask");
  });

  it("rejects a change after the next beat and keeps the original", () => {
    let log = ok(recordDecision(scenario, emptyLog, { role: "dispatch", optionId: "d-hold", recordedAtSimTime: 3 }));
    log = appendWire(log, wire(5)); // next beat begins
    const r = recordDecision(scenario, log, { role: "dispatch", optionId: "d-ask", recordedAtSimTime: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("locked");
      expect(r.kept).toEqual({ role: "dispatch", optionId: "d-hold", recordedAtSimTime: 3 });
    }
    expect(deriveState(scenario, log).decisions[0]).toEqual({
      role: "dispatch",
      optionId: "d-hold",
      recordedAtSimTime: 3,
    });
  });

  it("does not lock another role's decision", () => {
    let log = ok(recordDecision(scenario, emptyLog, { role: "dispatch", optionId: "d-hold", recordedAtSimTime: 3 }));
    log = appendWire(log, wire(6));
    const r = recordDecision(scenario, log, { role: "field", optionId: "f-pause", recordedAtSimTime: 6 });
    expect(r.ok).toBe(true);
  });
});

describe("deriveState", () => {
  it("equals incremental application, including a late decision in the log", () => {
    const log: ConsoleLogEntry[] = [
      { kind: "wire", event: wire(1) },
      { kind: "decision", decision: { role: "field", optionId: "f-watch", recordedAtSimTime: 1 } },
      { kind: "wire", event: wire(3, "garbled") },
      { kind: "decision", decision: { role: "field", optionId: "f-radio", recordedAtSimTime: 3 } }, // locked
      { kind: "wire", event: wire(5, "collision") },
    ];
    let incremental = initialState(scenario);
    for (const e of log) incremental = applyEntry(incremental, e);
    const replayed = deriveState(scenario, log);
    expect(replayed).toEqual(incremental);
    expect(replayed.cursorSimTime).toBe(5);
    expect(replayed.decisions).toEqual([
      { role: "field", optionId: "f-watch", recordedAtSimTime: 1 },
    ]);
  });

  it("never moves the cursor backwards", () => {
    const s = deriveState(scenario, [
      { kind: "wire", event: wire(5) },
      { kind: "wire", event: wire(2) },
    ]);
    expect(s.cursorSimTime).toBe(5);
  });
});

describe("send entries", () => {
  it("leave the engine state and the cursor untouched", () => {
    const send: ConsoleLogEntry = {
      kind: "send",
      send: { id: "dispatch-0", sender: "dispatch", recipient: "field", sendTime: 5, bytes: 3 },
    };
    const base = appendWire(emptyLog, wire(2));
    expect(deriveState(scenario, [...base, send])).toEqual(deriveState(scenario, base));
    expect(applyEntry(initialState(scenario), send)).toEqual(initialState(scenario));
  });
});
