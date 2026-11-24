import { describe, expect, it } from "vitest";
import { emptyLog, fixtureScript } from "./fixtures";
import { habitRows, habits } from "./habits";
import { applyAction, foldNight } from "./night";
import type { DeskScript, NightLog, NightState } from "./types";

function play(script: DeskScript, steps: { id: string; facts?: string[]; itemId?: string }[]): { log: NightLog; state: NightState } {
  let log = emptyLog(script);
  for (const s of steps) {
    const r = applyAction(script, log, s.id, { facts: s.facts, itemId: s.itemId });
    if (!r.ok) throw new Error(r.error.message);
    log = r.value;
  }
  const f = foldNight(script, log);
  if (!f.ok) throw new Error(f.error.message);
  return { log, state: f.value };
}

// i8 is the marked call, sent at minute 19. "wait" costs 1 minute.
const waits = (n: number) => Array.from({ length: n }, () => ({ id: "wait" }));
const noMarks: DeskScript = { ...fixtureScript, items: fixtureScript.items.map(({ needsProfessional: _n, ...i }) => i) };

describe("habits", () => {
  it("gives the minutes from the marked moment to the call", () => {
    const { state } = play(fixtureScript, [...waits(21), { id: "call-staff" }]);
    const d = state.delivered.find((x) => x.id === "i8");
    expect(d).toBeDefined();
    const h = habits(fixtureScript, state);
    expect(h.professional).toEqual({ minutes: 21 - (d?.deliveredAt ?? 0), moments: 1 });
  });

  it("says no call was made when a marked moment has no call", () => {
    const { state } = play(fixtureScript, waits(25));
    const h = habits(fixtureScript, state);
    expect(h.professional).toEqual({ minutes: null, moments: 1 });
    expect(habitRows(h)[2].figure).toBe("No call was made.");
  });

  it("says there was no such moment when none is marked, not zero minutes", () => {
    const { state } = play(noMarks, waits(25));
    const h = habits(noMarks, state);
    expect(h.professional).toEqual({ minutes: null, moments: 0 });
    expect(habitRows(h)[2].figure).toBe("This night had no such moment.");
  });

  it("measures acknowledgement from delivery to the first entry naming the item", () => {
    const { state } = play(fixtureScript, [...waits(3), { id: "read" }]);
    const h = habits(fixtureScript, state);
    // i1 arrives at 0 and is acted on at minute 3.
    expect(h.acknowledgement.longestMinutes).toBe(3);
    expect(h.acknowledgement.unacknowledged).toBe(state.delivered.length - 1);
  });

  it("gives null, not 0, when nothing was acted on", () => {
    const { state } = play(fixtureScript, waits(2));
    const h = habits(fixtureScript, state);
    expect(h.acknowledgement.meanMinutes).toBeNull();
    expect(h.acknowledgement.longestMinutes).toBeNull();
  });

  it("counts written facts against known items", () => {
    const { state } = play(fixtureScript, [...waits(1), { id: "log", facts: ["i1"] }, { id: "log", facts: ["i1"] }]);
    const h = habits(fixtureScript, state);
    expect(h.written.written).toBe(1);
    expect(h.written.known).toBe(state.delivered.length);
    expect(h.written.unwritten).not.toContain("i1");
  });

  it("pairs every figure with a fixed line", () => {
    const { state } = play(fixtureScript, waits(2));
    const rows = habitRows(habits(fixtureScript, state));
    expect(rows.map((r) => r.id)).toEqual(["acknowledgement", "written", "professional"]);
    for (const r of rows) expect(r.why.length).toBeGreaterThan(0);
  });
});
