import { describe, expect, it } from "vitest";
import { inTransitAt, knownAt } from "hindsight";
import { layoutReplay } from "hindsight/replay";
import { applyAction, foldNight } from "./night";
import { toLedger, toReplayScenario } from "./replay-input";
import { emptyLog, fixtureScenario, fixtureScript } from "./fixtures";

function played() {
  let log = emptyLog();
  for (const id of ["read", "go", "text"]) {
    const r = applyAction(fixtureScript, log, id);
    if (!r.ok) throw new Error(r.error.message);
    log = r.value;
  }
  const s = foldNight(fixtureScript, log);
  if (!s.ok) throw new Error(s.error.message);
  return { log, state: s.value };
}

describe("toLedger", () => {
  it("shows delivered items as known and a missed call as still in transit", () => {
    const { log } = played();
    const ledger = toLedger(fixtureScript, log);
    expect(knownAt(ledger, "ra", 11).has("i3")).toBe(true);
    expect(knownAt(ledger, "ra", 10).has("i3")).toBe(false);
    expect(inTransitAt(ledger, "ra", 12).has("i2")).toBe(true);
    expect(knownAt(ledger, "ra", 100).has("i2")).toBe(false);
  });

  it("does not mutate the log", () => {
    const { log } = played();
    const copy = JSON.stringify(log);
    toLedger(fixtureScript, log);
    expect(JSON.stringify(log)).toBe(copy);
  });
});

describe("toReplayScenario", () => {
  it("adds one decision event per entry and leaves the input alone", () => {
    const { state } = played();
    const before = JSON.stringify(fixtureScenario);
    const sc = toReplayScenario(fixtureScenario, fixtureScript, state);
    const decisions = sc.events.filter((e) => e.type === "decision");
    expect(decisions.map((d) => [d.id, d.simTime, d.title, d.actor])).toEqual([
      ["d1", 0, "Read the message", "ra"],
      ["d2", 5, "Go to the room", "ra"],
      ["d3", 11, "Reply by text", "ra"],
    ]);
    expect(sc.events).toHaveLength(fixtureScenario.events.length + 3);
    expect(JSON.stringify(fixtureScenario)).toBe(before);
  });

  it("lays out one row per role, with decision ticks on the player's row", () => {
    const { log, state } = played();
    const layout = layoutReplay(toLedger(fixtureScript, log), toReplayScenario(fixtureScenario, fixtureScript, state));
    expect(layout.rows.map((r) => r.participant)).toEqual(["ra", "phone", "chat", "door", "staff"]);
    const ra = layout.rows[0];
    expect(ra.ticks.filter((t) => t.kind === "decision")).toHaveLength(3);
    expect(ra.ticks.some((t) => t.kind === "knowledge" && t.id === "i3")).toBe(true);
  });
});
