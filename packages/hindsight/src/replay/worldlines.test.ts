import { describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { buildLedger, knownAt, receivedAt } from "../ledger/ledger";
import type { LedgerEvent } from "../ledger/ledger";
import { spreadLabels } from "./declutter";
import { formatLimit } from "./participants";
import type { ReplayParticipant } from "./types";
import { VIEW } from "./types";
import { layoutWorldlines, timeToY } from "./worldlines";

const scenario = (ids: string[], decisions: { id: string; actor: string; at: number }[] = []): Scenario => ({
  ...buildParticipantsFixture(ids),
  events: decisions.map((d) => ({
    id: d.id,
    type: "decision" as const,
    simTime: d.at,
    audience: d.actor,
    title: `Title ${d.id}`,
    body: "",
    actor: d.actor,
  })),
});
const two: ReplayParticipant[] = [
  { id: "a", label: "Ann" },
  { id: "b", label: "Bo" },
];
const send = (id: string, from: string, to: string, simTime: number): LedgerEvent => ({
  kind: "sent",
  messageId: id,
  sender: from,
  recipient: to,
  simTime,
});
const out = (id: string, outcome: "received" | "garbled" | "collision", simTime: number): LedgerEvent => ({
  kind: "outcome",
  messageId: id,
  outcome,
  simTime,
});
const lay = (events: LedgerEvent[], participants = two, at?: number | null) =>
  layoutWorldlines({ ledger: buildLedger(events), scenario: scenario(["a", "b"]), participants }, { at });

describe("layoutWorldlines", () => {
  it("gives a delivered message a vertical span of its delay times the scale", () => {
    const l = lay([send("m", "a", "b", 10), out("m", "received", 15), send("z", "a", "b", 30)]);
    const scale = (l.time.bottom - l.time.top) / (l.time.end - l.time.start);
    const s = l.signals.find((x) => x.id === "m")!;
    expect(s.y2 - s.y1).toBeCloseTo(5 * scale, 9);
    expect(s.fate).toBe("received");
    expect(s.spanIsDelay).toBe(true);
    expect(s.x2).toBe(l.lines[1]!.x);
    expect(s.dotted).toBe(false);
  });

  it("ends a collided message short of the receiver, dotted, with the delay span kept", () => {
    const l = lay([send("m", "a", "b", 0), out("m", "collision", 10)]);
    const s = l.signals[0]!;
    expect(l.lines[1]!.x - s.x2).toBeGreaterThanOrEqual(VIEW.gap);
    expect(s.dotted).toBe(true);
    expect(s.tone).toBe("loss");
    expect(s.spanIsDelay).toBe(true);
    expect(s.y2).toBeCloseTo(timeToY(l.time, 10), 9);
  });

  it("shows a dropped message as a stub only when the record is closed", () => {
    const events = [send("m", "a", "b", 5), send("z", "a", "b", 40), out("z", "received", 40)];
    const closed = lay(events).signals.find((s) => s.id === "m")!;
    expect(closed.fate).toBe("never-arrived");
    expect(closed.spanIsDelay).toBe(false);
    expect(closed.dotted).toBe(true);
    const mid = lay(events, two, 20).signals.find((s) => s.id === "m")!;
    expect(mid.fate).toBe("in-transit");
    expect(mid.open).toBe(true);
    expect(mid.dotted).toBe(false);
  });

  it("cuts a message at the cursor when the cursor is inside its delay", () => {
    const l = lay([send("m", "a", "b", 0), out("m", "received", 40)], two, 10);
    const s = l.signals[0]!;
    expect(s.open).toBe(true);
    expect(s.y2).toBeCloseTo(timeToY(l.time, 10), 9);
    expect(s.x2).toBeGreaterThan(s.x1);
    expect(s.x2).toBeLessThan(l.lines[1]!.x);
  });

  it("fades a message sent after the cursor and draws it whole", () => {
    const l = lay([send("m", "a", "b", 30), out("m", "received", 35), send("e", "a", "b", 0)], two, 10);
    const s = l.signals.find((x) => x.id === "m")!;
    expect(s.tone).toBe("faded");
    expect(s.open).toBe(false);
  });

  it("draws ticks, no diagonal and one notice for an arrivals-only partner", () => {
    const partners: ReplayParticipant[] = [
      { id: "a", label: "Ann" },
      { id: "b", label: "Bo", history: "arrivals-only", limitNote: "Their sends happen elsewhere." },
    ];
    const events: LedgerEvent[] = [
      { kind: "arrival", messageId: "m1", sender: "b", recipient: "a", outcome: "received", simTime: 4 },
      { kind: "arrival", messageId: "m2", sender: "b", recipient: "a", outcome: "garbled", simTime: 9 },
    ];
    const l = lay(events, partners);
    expect(l.signals).toHaveLength(0);
    expect(l.arrivals.map((a) => [a.id, a.dotted, a.tone])).toEqual([
      ["m1", false, "ink"],
      ["m2", true, "loss"],
    ]);
    expect(l.arrivals[0]!.x).toBe(l.lines[0]!.x);
    expect(l.limits).toHaveLength(1);
    expect(l.limits[0]!.text.split("Bo")).toHaveLength(3);
    expect(l.limits[0]!.text).toContain("Their sends happen elsewhere.");
  });

  it("returns no notice when the arrivals-only participant has no arrivals", () => {
    const l = lay([send("m", "a", "b", 1)], [two[0]!, { id: "b", label: "Bo", history: "arrivals-only" }]);
    expect(l.limits).toEqual([]);
  });

  it("ignores a send from an arrivals-only sender and draws its outcome as an arrival", () => {
    const partners: ReplayParticipant[] = [{ id: "a", label: "Ann" }, { id: "b", label: "Bo", history: "arrivals-only" }];
    const l = lay([send("m", "b", "a", 2), out("m", "received", 6), send("d", "b", "a", 3)], partners);
    expect(l.signals).toEqual([]);
    expect(l.arrivals.map((a) => a.id)).toEqual(["m"]);
    expect(l.limits).toHaveLength(1);
  });

  it("places a message at the same time the ledger says it was known (seed 821586344)", () => {
    const partners: ReplayParticipant[] = [{ id: "p1", label: "P1" }, { id: "p2", label: "P2", history: "arrivals-only" }];
    const events: LedgerEvent[] = [
      send("m3", "p2", "p2", 0),
      { kind: "arrival", messageId: "m3", sender: "p2", recipient: "p2", outcome: "received", simTime: 0 },
      out("m3", "received", 1),
      send("z", "p1", "p2", 5),
    ];
    const ledger = buildLedger(events);
    const l = layoutWorldlines({ ledger, scenario: scenario(["p1", "p2"]), participants: partners }, {});
    const mark = l.arrivals.find((a) => a.id === "m3")!;
    expect(receivedAt(ledger, "m3", "p2")).toBe(0);
    expect(knownAt(ledger, "p2", 0).has("m3")).toBe(true);
    expect(mark.arrivedAt).toBe(0);
    expect(mark.y).toBeCloseTo(timeToY(l.time, 0), 9);
  });

  it("draws one role plus four sources as five lines, sources in the source style", () => {
    const people: ReplayParticipant[] = [
      { id: "ra", label: "Player" },
      ...["s1", "s2", "s3", "s4"].map((id) => ({ id, label: id, kind: "source" as const })),
    ];
    const l = layoutWorldlines(
      { ledger: buildLedger([send("m", "s1", "ra", 1), out("m", "received", 3)]), scenario: scenario([]), participants: people },
      {},
    );
    expect(l.lines.map((x) => x.id)).toEqual(["ra", "s1", "s2", "s3", "s4"]);
    expect(l.lines.slice(1).every((x) => x.style.strokeWidth === 1 && x.style.colour === "grey-1")).toBe(true);
    expect(l.lines[0]!.style.strokeWidth).toBe(1.5);
  });

  it("separates two roles by weight and dash and not by colour", () => {
    const l = lay([]);
    const [a, b] = l.lines.map((x) => x.style);
    expect(a!.strokeWidth).not.toBe(b!.strokeWidth);
    expect(a!.dash).not.toBe(b!.dash);
    expect(a!.labelWeight).not.toBe(b!.labelWeight);
    expect(a!.colour).toBe(b!.colour);
  });

  it("lists only the styles present in the legend", () => {
    expect(lay([]).legend).toEqual([]);
    const delivered = lay([send("m", "a", "b", 0), out("m", "received", 3)]);
    expect(delivered.legend.map((k) => k.id)).toEqual(["signal"]);
    const lost = lay([send("m", "a", "b", 0)]);
    expect(lost.legend.map((k) => k.id)).toEqual(["lost"]);
    expect(lost.legend[0]!.text).toContain("not a delay");
  });

  it("returns an empty layout for an empty ledger and no participants", () => {
    const l = layoutWorldlines({ ledger: buildLedger([]), scenario: buildParticipantsFixture([]) });
    expect(l.lines).toEqual([]);
    expect(l.signals).toEqual([]);
    expect(l.arrivals).toEqual([]);
    expect(l.knowledge).toEqual([]);
    expect(l.decisions).toEqual([]);
    expect(l.limits).toEqual([]);
    expect(l.legend).toEqual([]);
    expect([l.time.start, l.time.end]).toEqual([0, 0]);
  });

  it("lists an id in skipped when an outcome comes before its send", () => {
    const l = lay([out("m", "received", 2), send("m", "a", "b", 5)]);
    expect(l.skipped).toEqual(["m"]);
    expect(l.signals).toEqual([]);
  });

  it("places decisions at their time and keeps their labels apart", () => {
    const s = scenario(["a", "b"], [
      { id: "d1", actor: "a", at: 10 },
      { id: "d2", actor: "a", at: 11 },
      { id: "d3", actor: "a", at: 12 },
    ]);
    const l = layoutWorldlines({ ledger: buildLedger([send("m", "a", "b", 0), out("m", "received", 40)]), scenario: s, participants: two });
    expect(l.decisions.map((d) => d.id)).toEqual(["d1", "d2", "d3"]);
    const ys = l.decisions.map((d) => d.labelY);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(VIEW.minLabelGap);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(VIEW.minLabelGap);
    expect(l.decisions[0]!.y).toBeCloseTo(timeToY(l.time, 10), 9);
  });
});

describe("layoutWorldlines with conflicting parties", () => {
  const three = [
    { id: "a", label: "Ann" },
    { id: "b", label: "Bo" },
    { id: "c", label: "Cy" },
  ];

  it("skips a message id whose sends name different recipients", () => {
    // Property 8 counterexample, seed -628715833.
    const events = [send("m1", "a", "a", 0), send("m1", "a", "c", 0), out("m1", "received", 0), send("z", "a", "b", 5)];
    const l = layoutWorldlines(
      { ledger: buildLedger(events), scenario: scenario(["a", "b", "c"]), participants: three },
      { at: 0, focus: "c" },
    );
    expect(l.skipped).toEqual(["m1"]);
    expect([...l.signals, ...l.arrivals].map((m) => m.id)).toEqual(["z"]);
  });

  it("skips a message id whose send and arrival name different recipients", () => {
    // Property 8 counterexample, seed -238909455.
    const arrival: LedgerEvent = {
      kind: "arrival",
      messageId: "m2",
      sender: "a",
      recipient: "c",
      outcome: "received",
      simTime: 0,
    };
    const events = [send("m2", "a", "a", 0), arrival, send("z", "a", "b", 5)];
    const l = layoutWorldlines({ ledger: buildLedger(events), scenario: scenario(["a", "b", "c"]), participants: three });
    expect(l.skipped).toEqual(["m2"]);
    expect([...l.signals, ...l.arrivals].map((m) => m.id)).toEqual(["z"]);
  });
});

describe("formatLimit and spreadLabels", () => {
  it("names the labels in both sentences", () => {
    const t = formatLimit(["Ann", "Bo", "Cy"]);
    expect(t.split("Ann, Bo and Cy")).toHaveLength(3);
    expect(formatLimit([])).toBe("");
  });

  // Replaces the 2026-11-23 stop-hook example (seed 971708861), which asserted that an arrival
  // logged before its send is inked for the recipient. Superseded by the well-formedness rule.
  it("ignores an arrival logged before its send and lists the id in skipped (seeds 971708861, 1613359026)", () => {
    for (const [id, seed] of [["m4", 971708861], ["m5", 1613359026]] as const) {
      const arrival: LedgerEvent = {
        kind: "arrival",
        messageId: id,
        sender: "a",
        recipient: "b",
        outcome: "received",
        simTime: 0,
      };
      const ledger = buildLedger([arrival, send(id, "a", "b", 1)]);
      const l = layoutWorldlines(
        { ledger, scenario: scenario(["a", "b"]), participants: two },
        { at: 0, focus: "b" },
      );
      expect(knownAt(ledger, "b", 0).has(id), `seed ${seed}`).toBe(false);
      expect(l.skipped).toEqual([id]);
      expect([...l.signals, ...l.arrivals]).toEqual([]);
    }
  });

  it("still draws an arrival for an id with no send", () => {
    const arrival: LedgerEvent = {
      kind: "arrival",
      messageId: "m9",
      sender: "a",
      recipient: "b",
      outcome: "received",
      simTime: 0,
    };
    const l = layoutWorldlines({ ledger: buildLedger([arrival]), scenario: scenario(["a", "b"]), participants: two });
    expect(l.skipped).toEqual([]);
    expect(l.arrivals.map((a) => a.id)).toEqual(["m9"]);
  });

  it("keeps a message drawn when a valid outcome remains next to a contradictory one", () => {
    const l = lay([out("m", "garbled", 1), send("m", "a", "b", 5), out("m", "received", 7)]);
    expect(l.skipped).toEqual([]);
    expect(l.signals.map((s) => s.id)).toEqual(["m"]);
  });
  it("spreads crowded labels apart in order and inside the range", () => {
    const out = spreadLabels([100, 100, 100, 100], 16, 56, 536);
    expect(out).toEqual([100, 116, 132, 148]);
    expect(spreadLabels([536, 536], 16, 56, 536)).toEqual([520, 536]);
  });
});
