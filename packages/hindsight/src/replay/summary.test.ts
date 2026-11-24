import { describe, expect, it } from "vitest";
import { buildParticipantsFixture } from "../engine/fixtures/participants";
import type { Scenario } from "../engine/types";
import { buildLedger } from "../ledger/ledger";
import type { LedgerEvent } from "../ledger/ledger";
import { summarise } from "./summary";
import type { ReplayParticipant } from "./types";

const scenario: Scenario = {
  ...buildParticipantsFixture(["a", "b"]),
  events: [{ id: "d1", type: "decision", simTime: 12, audience: "a", title: "Call back", body: "", actor: "a" }],
};
const people: ReplayParticipant[] = [
  { id: "a", label: "Ann" },
  { id: "b", label: "Bo" },
];
const sent = (id: string, sender: string, recipient: string, simTime: number): LedgerEvent => ({
  kind: "sent",
  messageId: id,
  sender,
  recipient,
  simTime,
});
const out = (id: string, outcome: "received" | "garbled" | "collision", simTime: number): LedgerEvent => ({
  kind: "outcome",
  messageId: id,
  outcome,
  simTime,
});
const events: LedgerEvent[] = [
  sent("m1", "a", "b", 10),
  out("m1", "received", 14),
  sent("m2", "a", "b", 11),
  out("m2", "collision", 12),
  sent("m3", "b", "a", 13),
];
const run = (ev: LedgerEvent[], participants: ReplayParticipant[] = people) =>
  summarise({ ledger: buildLedger(ev), scenario, participants }, (t) => `t${t}`);

describe("summarise", () => {
  it("gives the same paragraph for the same input", () => {
    expect(run(events)).toBe(run([...events].reverse()));
  });

  it("names every participant and counts from the layout", () => {
    const text = run(events);
    expect(text).toContain("Ann");
    expect(text).toContain("Bo");
    expect(text).toContain("3 messages were sent: 1 arrived intact and 2 were lost or never arrived.");
    expect(text).toContain("The longest delay ran from t10 to t14.");
    expect(text).toContain("1 decision was made.");
  });

  it("counts a source's messages for a one-player input", () => {
    const text = summarise(
      { ledger: buildLedger([sent("s1", "phone", "a", 5), out("s1", "received", 6), sent("s2", "door", "a", 7)]),
        scenario: { ...scenario, roles: [{ id: "a", name: "RA" }] } as Scenario,
        participants: [
          { id: "a", label: "RA" },
          { id: "phone", label: "Phone", kind: "source" },
          { id: "door", label: "Door", kind: "source" },
        ],
      },
      (t) => `t${t}`,
    );
    expect(text).toContain("3 participants: RA, Phone and Door.");
    expect(text).toContain("2 messages were sent: 1 arrived intact and 1 was lost or never arrived.");
  });

  it("says sends are not known for an arrivals-only participant and counts no loss for them", () => {
    const text = run(
      [
        { kind: "arrival", messageId: "x1", sender: "b", recipient: "a", outcome: "received", simTime: 8 },
        sent("m1", "a", "b", 10),
        out("m1", "received", 11),
        // Claimed send from an arrivals-only sender: ignored, never counted.
        sent("m9", "b", "a", 9),
      ],
      [
        { id: "a", label: "Ann" },
        { id: "b", label: "Bo", history: "arrivals-only" },
      ],
    );
    expect(text).toContain("Sends are not known for Bo.");
    expect(text).toContain("1 message was sent: 1 arrived intact and 0 were lost or never arrived.");
    expect(text.slice(text.indexOf("Sends are not known"))).not.toMatch(/lost|never arrived|damaged/);
  });

  it("gives no judgement words", () => {
    expect(run(events)).not.toMatch(/\b(should|ought|better|mistake|wrong|correct|score|best|worst)\b/i);
  });
});
