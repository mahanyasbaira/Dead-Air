import { describe, expect, it } from "vitest";
import { layoutReplay } from "hindsight/replay";
import { applyAction, foldNight } from "../../src/model/night";
import { toLedger, toReplayScenario } from "../../src/model/replay-input";
import type { NightLog } from "../../src/model/types";
import { findNight } from "../../src/nights";

const night = findNight("leak-ferris-1")!;
const { script, scenario } = night;

const path = [
  "check-note", // 0 to 1
  "wait", // 3
  "wait", // 5
  "answer-chat", // 5 to 7
  "wait", // 9: the text sent at 8 has arrived
  "go-laundry", // away 9 to 15: the knock at 13 is missed
  "wait",
  "wait",
  "wait", // 21: the call at 19 has arrived
  "wait", // 23
  "call-mina", // busy 23 to 25: the floor chat sent at 24 waits until 25
  "wait",
  "call-staff", // starts at 27
  "wait",
  "wait", // 34: Tobin's knock at 33 has arrived
  "talk-tobin",
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

describe("leak-ferris-1, played", () => {
  it("is registered with seven items at distinct minutes and a professional moment", () => {
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
    expect(state.delivered.find((d) => d.id === "c2")).toMatchObject({ sentAt: 24, deliveredAt: 25 });
    expect(state.missed.map((m) => [m.id, m.sentAt, m.reason])).toEqual([["d1", 13, "away"]]);
    expect(state.staffCalledAt).toBe(27);

    const replay = toReplayScenario(scenario, script, state);
    expect(replay.events.filter((e) => e.type === "decision")).toHaveLength(path.length);
    const layout = layoutReplay(toLedger(script, log), replay);
    expect(layout.rows.map((r) => r.participant)).toEqual(["ra", "phone", "chat", "door", "staff"]);
  });
});
