import { describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { buildLedger } from "../ledger/ledger";
import type { LedgerEvent } from "../ledger/ledger";
import type { ReplayParticipant } from "./types";
import { timelineText } from "./timeline";
import { layoutWorldlines } from "./worldlines";

const scenario: Scenario = {
  ...buildParticipantsFixture(["a", "b"]),
  events: [
    { id: "d1", type: "decision", simTime: 12, audience: "a", title: "Call back", body: "", actor: "a" },
  ],
};
const people: ReplayParticipant[] = [
  { id: "a", label: "Ann" },
  { id: "b", label: "Bo" },
];
const send = (id: string, simTime: number): LedgerEvent => ({
  kind: "sent",
  messageId: id,
  sender: "a",
  recipient: "b",
  simTime,
});
const out = (id: string, outcome: "received" | "garbled" | "collision", simTime: number): LedgerEvent => ({
  kind: "outcome",
  messageId: id,
  outcome,
  simTime,
});
const run = (events: LedgerEvent[], participants = people, at?: number | null, sc = scenario) =>
  timelineText(layoutWorldlines({ ledger: buildLedger(events), scenario: sc, participants }, { at }), {}, (t) => `t${t}`);

describe("timelineText", () => {
  it("reads a delivered message, a dropped message and an arrival with no send time", () => {
    const entries = run(
      [
        send("m1", 10),
        out("m1", "received", 14),
        send("m2", 20),
        { kind: "arrival", messageId: "m3", sender: "b", recipient: "a", outcome: "received", simTime: 30 },
      ],
      [people[0]!, { id: "b", label: "Bo", history: "arrivals-only" }],
    );
    const text = (id: string) => entries.find((e) => e.id === id)!.text;
    expect(text("m1")).toContain("sent at t10, arrived t14");
    expect(text("m2")).toContain("sent at t20, did not arrive");
    expect(text("m3")).toContain("arrived at t30, send time not known");
    expect(text("m3")).not.toContain("sent at");
  });

  it("orders by time and keeps a stable order for ties", () => {
    const events = [send("b2", 5), send("a1", 5), out("a1", "received", 6), out("b2", "received", 6)];
    const first = run(events);
    expect(first.map((e) => e.time)).toEqual([...first.map((e) => e.time)].sort((x, y) => x - y));
    expect(first.filter((e) => e.time === 5).map((e) => e.id)).toEqual(["a1", "b2"]);
    expect(run([...events].reverse())).toEqual(first);
  });

  it("includes decisions and says on its way for a message cut by the cursor", () => {
    const events = [send("m", 0), out("m", "received", 40)];
    const closed = run(events);
    expect(closed.some((e) => e.kind === "decision" && e.text.includes("Ann decided: Call back"))).toBe(true);
    expect(closed.find((e) => e.id === "m")!.text).toContain("arrived t40");
    const mid = run(events, people, 10);
    expect(mid.find((e) => e.id === "m")!.text).toContain("sent at t0, on its way");
  });

  it("uses no judgement word", () => {
    const events = [send("m", 0), out("m", "collision", 4), send("n", 6)];
    const all = run(events)
      .map((e) => e.text)
      .join(" ");
    expect(all).not.toMatch(/\b(should|ought|better|mistake|wrong|correct)\b/i);
  });
});
