import { describe, expect, it } from "vitest";
import { layoutReplay } from "hindsight/replay";
import { applyAction, foldNight } from "../../src/model/night";
import { toLedger, toReplayScenario } from "../../src/model/replay-input";
import type { NightLog } from "../../src/model/types";
import { findNight } from "../../src/nights";

const night = findNight("loud-music-harlow-3")!;
const { script, scenario } = night;

const path = [
  "check-note",
  "wait",
  "text-priya", // busy 3 to 6: the floor chat sent at 5 waits until 6
  "go-306", // away 6 to 12: the knock at 11 is missed
  "answer-chat",
  "wait",
  "wait",
  "call-priya",
  "wait",
  "wait",
  "wait",
  "wait",
  "wait",
  "wait",
  "call-staff",
  "talk-dev",
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

describe("loud-music-harlow-3, played", () => {
  it("is registered second, with seven items at distinct minutes", () => {
    expect(night).toBeDefined();
    expect(script.items).toHaveLength(7);
    expect(script.items.some((i) => i.needsProfessional === true)).toBe(true);
  });

  it("queues the chat message, misses the knock, and ends with a decision per action", () => {
    const log = play();
    const folded = foldNight(script, log);
    expect(folded.ok).toBe(true);
    if (!folded.ok) return;
    const state = folded.value;
    expect(state.ended).toBe(true);
    expect(state.delivered.find((d) => d.id === "c1")).toMatchObject({ sentAt: 5, deliveredAt: 6 });
    expect(state.missed.map((m) => [m.id, m.sentAt, m.reason])).toEqual([["d1", 11, "away"]]);
    expect(state.staffCalledAt).toBe(32);

    const replay = toReplayScenario(scenario, script, state);
    expect(replay.events.filter((e) => e.type === "decision")).toHaveLength(path.length);
    const layout = layoutReplay(toLedger(script, log), replay);
    expect(layout.rows.map((r) => r.participant)).toEqual(["ra", "phone", "chat", "door", "staff"]);
  });
});
