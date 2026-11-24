import { describe, expect, it } from "vitest";
import { staticOnChannel9 } from "../../scenarios/static-on-channel-9";
import { appendWire, deriveState, emptyLog, recordDecision } from "./log";
import { STORAGE_KEY, clear, load, restore, save, serialize } from "./persist";
import type { ConsoleLogEntry, PersistedRun } from "./types";

const scenario = staticOnChannel9;

function realRun(): PersistedRun {
  let log: ConsoleLogEntry[] = appendWire(emptyLog, {
    kind: "received",
    simTime: 1,
    sender: "dispatch",
    recipient: "field",
    id: "m1",
    payload: new Uint8Array([0, 72, 105, 255]),
  });
  log = appendWire(log, { kind: "garbled", simTime: 2, sender: "field", recipient: "dispatch" });
  const d = recordDecision(scenario, log, { role: "dispatch", optionId: "d-hold", recordedAtSimTime: 2 });
  if (!d.ok) throw new Error("decision rejected");
  log = appendWire(d.log, { kind: "collision", simTime: 3, sender: "dispatch", recipient: "field" });
  return { version: 1, scenarioId: scenario.id, seed: 9, mode: "solo", log };
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

const tweak = (f: (o: Record<string, unknown>) => void): string => {
  const o = JSON.parse(serialize(realRun())) as Record<string, unknown>;
  f(o);
  return JSON.stringify(o);
};

describe("persist", () => {
  it("round-trips a real run through storage, bytes included", () => {
    const run = realRun();
    const storage = memoryStorage();
    expect(save(storage, run)).toEqual({ ok: true });
    const r = load(storage);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run).toEqual(run);
    expect(r.run.log[0]).toEqual(run.log[0]);
    expect(r.state).toEqual(deriveState(scenario, run.log));
    clear(storage);
    expect(load(storage)).toEqual({ ok: false, reason: "empty" });
  });

  it("discards bad JSON without throwing", () => {
    expect(restore("{not json")).toEqual({ ok: false, reason: "bad-json" });
    expect(restore("[1]")).toMatchObject({ ok: false, reason: "bad-shape" });
  });

  it("discards an unknown version", () => {
    expect(restore(tweak((o) => (o.version = 2)))).toEqual({ ok: false, reason: "unknown-version" });
  });

  it("discards an unknown scenarioId", () => {
    expect(restore(tweak((o) => (o.scenarioId = "nope")))).toEqual({
      ok: false,
      reason: "unknown-scenario",
    });
    expect(restore(tweak((o) => (o.scenarioId = "__proto__")))).toMatchObject({ ok: false });
  });

  it("discards a malformed entry and names its index", () => {
    const bad = tweak((o) => ((o.log as unknown[])[1] = { kind: "wire", event: { kind: "received" } }));
    expect(restore(bad)).toEqual({ ok: false, reason: "bad-entry", detail: "entry 1" });
    const badBytes = tweak((o) => {
      const e = (o.log as { event: { payload: string } }[])[0];
      e.event.payload = "***";
    });
    expect(restore(badBytes)).toMatchObject({ ok: false, reason: "bad-entry" });
    for (const role of ["constructor", "__proto__", "toString"]) {
      const badRole = tweak((o) => {
        const e = (o.log as { decision?: { role: string } }[])[2];
        if (e.decision) e.decision.role = role;
      });
      expect(restore(badRole)).toMatchObject({ ok: false, reason: "bad-entry" });
    }
    const badOption = tweak((o) => {
      const e = (o.log as { decision?: { optionId: string } }[])[2];
      if (e.decision) e.decision.optionId = "no-such-option";
    });
    expect(restore(badOption)).toMatchObject({ ok: false, reason: "bad-entry" });
  });

  it("returns a value when Storage throws", () => {
    const boom = () => {
      throw new Error("denied");
    };
    expect(save({ setItem: boom }, realRun())).toEqual({ ok: false, reason: "storage-error" });
    expect(load({ getItem: boom })).toEqual({ ok: false, reason: "storage-error" });
    expect(() => clear({ removeItem: boom })).not.toThrow();
  });

  it("uses one storage key", () => {
    const storage = memoryStorage();
    save(storage, realRun());
    expect(storage.length).toBe(1);
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

describe("send entries", () => {
  const withLog = (log: unknown[]) =>
    JSON.stringify({ version: 1, scenarioId: scenario.id, seed: 9, mode: "solo", log });
  const good = { kind: "send", send: { id: "dispatch-0", sender: "dispatch", recipient: "field", sendTime: 2, bytes: 5 } };

  it("restores a log with a send entry, and leaves the state as it was without it", () => {
    const r = restore(withLog([good]));
    if (!r.ok) throw new Error(r.reason);
    expect(r.run.log).toEqual([good]);
    expect(r.state).toEqual(deriveState(scenario, []));
  });

  it("still restores a save that has no send entries, at version 1", () => {
    const run = realRun();
    expect(JSON.parse(serialize(run)).version).toBe(1);
    expect(restore(serialize(run)).ok).toBe(true);
  });

  it.each([
    ["a missing id", { ...good.send, id: undefined }],
    ["a text sendTime", { ...good.send, sendTime: "2" }],
    ["a negative size", { ...good.send, bytes: -1 }],
    ["a fractional size", { ...good.send, bytes: 1.5 }],
  ])("rejects a send entry with %s", (_n, send) => {
    expect(restore(withLog([{ kind: "send", send }]))).toMatchObject({ ok: false, reason: "bad-entry" });
  });

  it("round-trips an optional airtime at version 1 and still restores a send without one", () => {
    const withAir = { kind: "send", send: { ...good.send, airtime: 4 } };
    const r = restore(withLog([withAir, good]));
    if (!r.ok) throw new Error(r.reason);
    expect(r.run.log).toEqual([withAir, good]);
    expect(JSON.parse(serialize(r.run)).version).toBe(1);
  });

  it.each([["text", "4"], ["negative", -1], ["not finite", null]])("rejects a send with a %s airtime", (_n, airtime) => {
    expect(restore(withLog([{ kind: "send", send: { ...good.send, airtime } }]))).toMatchObject({ ok: false, reason: "bad-entry" });
  });

  it("keeps an unknown version as unknown-version, not as an empty run", () => {
    expect(restore(JSON.stringify({ version: 2, log: [good] }))).toEqual({ ok: false, reason: "unknown-version" });
  });
});
