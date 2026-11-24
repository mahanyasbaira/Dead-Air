import { describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { buildLedger } from "../ledger/ledger";
import type { LedgerEvent } from "../ledger/ledger";
import { missingAt, momentSentences } from "./moment";
import type { ReplayParticipant } from "./types";
import { layoutWorldlines } from "./worldlines";

const scenario: Scenario = { ...buildParticipantsFixture(["a", "b"]), events: [] };
const both: ReplayParticipant[] = [
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
const fmt = (t: number): string => `t${t}`;
const input = (events: LedgerEvent[], participants: ReplayParticipant[] = both) => ({
  ledger: buildLedger(events),
  scenario,
  participants,
});

describe("moment sentences", () => {
  it("lists a message still on its way as not yet arrived", () => {
    const s = momentSentences(input([send("m", "b", "a", 0), out("m", "received", 20)]), "a", 10, fmt);
    expect(s).toContain("Not yet arrived: m.");
    expect(s[0]).toBe("At t10, Ann had nothing yet.");
  });

  it("lists a collided message as lost on the way", () => {
    const s = momentSentences(input([send("m", "b", "a", 0), out("m", "collision", 5)]), "a", 10, fmt);
    expect(s).toContain("Lost on the way: m.");
    expect(s.some((x) => x.startsWith("Not yet arrived"))).toBe(false);
  });

  it("lists a fact known only to the other participant as known elsewhere", () => {
    const events: LedgerEvent[] = [{ kind: "learned", participant: "b", factId: "f", simTime: 1 }];
    const s = momentSentences(input(events), "a", 5, fmt);
    expect(s).toContain("Known elsewhere: f.");
    expect(missingAt(buildLedger(events), "b", 5).elsewhere).toEqual([]);
  });

  it("leaves out the participant's own sends from known elsewhere", () => {
    const events = [send("m", "a", "b", 0), out("m", "received", 2)];
    expect(missingAt(buildLedger(events), "a", 5).elsewhere).toEqual([]);
    expect(missingAt(buildLedger(events), "b", 5).elsewhere).toEqual([]);
  });

  it("makes no not-yet-arrived claim about sends from an arrivals-only counterpart", () => {
    const events = [send("m", "b", "a", 0), out("m", "received", 20)];
    const limited: ReplayParticipant[] = [{ id: "a", label: "Ann" }, { id: "b", label: "Bo", history: "arrivals-only" }];
    const s = momentSentences(input(events, limited), "a", 10, fmt);
    expect(s.some((x) => x.includes("Not yet arrived"))).toBe(false);
  });

  it("uses no advising or judging word", () => {
    const events: LedgerEvent[] = [
      send("m", "b", "a", 0),
      send("n", "b", "a", 1),
      out("n", "garbled", 2),
      { kind: "learned", participant: "b", factId: "f", simTime: 1 },
    ];
    const text = momentSentences(input(events), "a", 5, fmt).join(" ").toLowerCase();
    for (const w of ["should", "ought", "better", "mistake", "wrong", "correct"]) expect(text).not.toContain(w);
  });
});

describe("focus tone", () => {
  const lay = (events: LedgerEvent[], focus: string, at: number) =>
    layoutWorldlines({ ledger: buildLedger(events), scenario, participants: both }, { at, focus });

  it("draws in ink what the focus knew, in loss what settled lost, and fades the rest", () => {
    const events = [
      send("got", "b", "a", 0),
      out("got", "received", 2),
      send("bad", "b", "a", 3),
      out("bad", "garbled", 4),
      send("fly", "b", "a", 5),
      out("fly", "received", 30),
      send("mine", "a", "b", 6),
      out("mine", "received", 40),
    ];
    const l = lay(events, "a", 10);
    const tone = (id: string) => l.signals.find((s) => s.id === id)!.tone;
    expect(tone("got")).toBe("ink");
    expect(tone("bad")).toBe("loss");
    expect(tone("fly")).toBe("faded");
    expect(tone("mine")).toBe("ink");
  });

  it("still fades what the focus did not know when the cursor is at the last time", () => {
    // Found in the browser: a decision at the final time of the record had no visual effect.
    const events: LedgerEvent[] = [
      { kind: "learned", participant: "a", factId: "mine", simTime: 1 },
      { kind: "learned", participant: "b", factId: "theirs", simTime: 5 },
    ];
    const factTone = (l: ReturnType<typeof lay>, id: string) => l.knowledge.find((k) => k.id === id)!.tone;
    const focused = lay(events, "a", 5);
    expect(factTone(focused, "mine")).toBe("ink");
    expect(factTone(focused, "theirs")).toBe("faded");
    const closed = layoutWorldlines({ ledger: buildLedger(events), scenario, participants: both }, { at: 5 });
    expect(factTone(closed, "theirs")).toBe("ink");
  });
});
