import { describe, expect, it } from "vitest";
import { staticOnChannel9 as s } from "../../scenarios/static-on-channel-9";
import { consoleFor, isFinished, partnerSchedule, unreadableSentence, wireFor } from "./RunHost.model";
import { toLedger, toReplayScenario } from "./replay-input";
import { deriveState } from "./log";
import type { ConsoleLogEntry } from "./types";

const ev = (kind: "received" | "collision", simTime: number, sender: string, recipient: string): ConsoleLogEntry => ({
  kind: "wire",
  event: { kind, simTime, sender, recipient, ...(kind === "received" ? { payload: Uint8Array.of(72) } : {}) },
});

describe("RunHost model", () => {
  it("maps the first role to the Booth and the other to the Tower", () => {
    expect(consoleFor(s, "dispatch")).toBe("booth");
    expect(consoleFor(s, "field")).toBe("tower");
  });
  it("scripts the partner from the scenario's own message beat", () => {
    expect(partnerSchedule(s, "dispatch")).toEqual([]);
    const [send] = partnerSchedule(s, "field");
    expect(send).toMatchObject({ sender: "dispatch", recipient: "field", sendTime: 2 });
    expect(new TextDecoder().decode(send.payload)).toMatch(/^Wind picking up/);
  });
  it("shows a role what was addressed to it, and collisions on lines it sent", () => {
    const log = [ev("received", 1, "field", "dispatch"), ev("received", 2, "dispatch", "field"), ev("collision", 3, "dispatch", "field")];
    expect(wireFor(log, "dispatch").map((e) => e.simTime)).toEqual([1, 3]);
  });
  it("is finished at the last step of the timeline", () => {
    expect(isFinished(deriveState(s, []))).toBe(false);
    expect(isFinished(deriveState(s, [ev("received", 6, "field", "dispatch")]))).toBe(true);
  });
  it("names the reason in one sentence", () => {
    expect(unreadableSentence("unknown-version")).toBe(
      "Your saved run could not be opened (it was made by a different version), so this is a new run. The saved run has been kept.",
    );
  });
});

describe("replay adapter", () => {
  it("builds a ledger without touching its input, records an unmatched outcome as an arrival, and adds decisions to the scenario", () => {
    const log: ConsoleLogEntry[] = [
      ev("received", 5, "dispatch", "field"),
      { kind: "decision", decision: { role: "field", optionId: "f-pause", recordedAtSimTime: 5 } },
    ];
    const copy = JSON.stringify(log);
    const state = deriveState(s, log);
    const ledger = toLedger(s, log, state);
    expect(ledger.events.some((e) => e.kind === "arrival" && e.simTime === 5)).toBe(true);
    expect(ledger.events.some((e) => e.kind === "sent")).toBe(false);
    expect(ledger.events.some((e) => e.kind === "learned" && e.participant === "field" && e.factId === "Field sees a gust")).toBe(true);
    const scenario = toReplayScenario(s, state);
    expect(scenario.events.filter((e) => e.type === "decision")).toHaveLength(1);
    expect(s.events.some((e) => e.type === "decision")).toBe(false);
    expect(JSON.stringify(log)).toBe(copy);
  });
});
