import { describe, expect, it } from "vitest";
import { layoutReplay } from "hindsight/replay";
import { applyAction, foldNight } from "../../src/model/night";
import { toLedger, toReplayScenario } from "../../src/model/replay-input";
import type { NightLog } from "../../src/model/types";
import { findNight } from "../../src/nights";

const night = findNight("lockout-marsh-2")!;
const { script, scenario } = night;

const path = [
  "check-note",
  "wait",
  "text-tomas", // busy 3 to 5
  "go-stairs", // away 5 to 11: the knock at 9 is missed
  "answer-chat",
  "wait",
  "call-mei",
  "wait",
  "wait",
  "wait",
  "wait",
  "wait",
  "wait",
  "call-staff",
  "talk-both",
  "wait",
];

function play(): NightLog {
  let log: NightLog = { v: 1, scenarioId: script.id, rev: script.rev, seed: script.seed, entries: [] };
  for (const id of path) {
    const r = applyAction(script, log, id);
    expect(r.ok, id).toBe(true);
    if (r.ok) log = r.value;
  }
  return log;
}

describe("lockout-marsh-2, played", () => {
  it("is registered third, with seven items and one that needs a professional", () => {
    expect(night).toBeDefined();
    expect(script.items).toHaveLength(7);
    expect(script.items.some((i) => i.needsProfessional === true)).toBe(true);
  });

  it("misses the knock, calls staff, and ends with a decision per action", () => {
    const log = play();
    const folded = foldNight(script, log);
    expect(folded.ok).toBe(true);
    if (!folded.ok) return;
    const state = folded.value;
    expect(state.ended).toBe(true);
    expect(state.missed.map((m) => [m.id, m.sentAt, m.reason])).toEqual([["d1", 9, "away"]]);
    expect(state.staffCalledAt).toBe(29);

    const replay = toReplayScenario(scenario, script, state);
    expect(replay.events.filter((e) => e.type === "decision")).toHaveLength(path.length);
    const layout = layoutReplay(toLedger(script, log), replay);
    expect(layout.rows.map((r) => r.participant)).toEqual(["ra", "phone", "chat", "door", "staff"]);
  });
});
