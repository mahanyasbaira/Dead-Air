import { describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import { threeParty } from "../engine/fixtures/three-party";
import type { Scenario } from "../engine/types";
import { buildLedger } from "../ledger/ledger";
import { layoutReplay } from "./layout";

describe("layoutReplay", () => {
  it("makes one row per participant with ticks in sim-time order", () => {
    const scenario: Scenario = {
      ...threeParty,
      events: [
        ...threeParty.events,
        { id: "d2", type: "decision", simTime: 5, audience: "p1", title: "Chose B", body: "", actor: "p1" },
        { id: "d1", type: "decision", simTime: 1, audience: "p1", title: "Chose A", body: "", actor: "p1" },
      ],
    };
    const ledger = buildLedger([
      { kind: "learned", participant: "p1", factId: "f2", simTime: 3 },
      { kind: "learned", participant: "p1", factId: "f1", simTime: 1 },
      { kind: "sent", messageId: "m1", sender: "p1", recipient: "p2", simTime: 2 },
      { kind: "outcome", messageId: "m1", outcome: "received", simTime: 6 },
    ]);
    const layout = layoutReplay(ledger, scenario);
    expect(layout.rows.map((r) => r.participant)).toEqual(["p1", "p2", "p3"]);
    const p1 = layout.rows[0]!.ticks;
    expect(p1.map((t) => [t.simTime, t.kind, t.id])).toEqual([
      [1, "decision", "d1"],
      [1, "knowledge", "f1"],
      [3, "knowledge", "f2"],
      [5, "decision", "d2"],
    ]);
    expect(layout.rows[1]!.ticks.map((t) => t.id)).toEqual(["m1"]);
    expect([layout.start, layout.end]).toEqual([1, 6]);
  });

  it("treats adversarial ids as opaque data", () => {
    const ids = ["constructor", "__proto__", "toString"];
    const ledger = buildLedger(
      ids.map((id, i) => ({ kind: "learned" as const, participant: id, factId: id, simTime: i })),
    );
    const layout = layoutReplay(ledger, buildParticipantsFixture(ids));
    expect(layout.rows.map((r) => r.participant)).toEqual(ids);
    for (const r of layout.rows) expect(r.ticks).toHaveLength(1);
  });

  it("returns empty rows and a zero span for an empty scenario and ledger", () => {
    const layout = layoutReplay(buildLedger([]), buildParticipantsFixture([]));
    expect(layout).toEqual({ rows: [], start: 0, end: 0 });
  });
});
