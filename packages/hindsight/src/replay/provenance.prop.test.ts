import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildLedger } from "../ledger/ledger";
import type { LedgerEvent } from "../ledger/ledger";
import { cursorArb, participantsArb, scenarioArb, worldlineInputArb } from "./arbitraries";
import type { WorldlineInput } from "./types";
import { layoutWorldlines } from "./worldlines";

const IDS = ["p1", "p2", "p3"] as const;
const RUNS = { numRuns: 200 };

type Outcome = "received" | "garbled" | "collision";
type Shape = "sent-only" | "sent-outcome" | "arrival-only" | "sent-arrival";

interface Msg {
  sender: string;
  recipient: string;
  at: number;
  delay: number;
  outcome: Outcome;
  shape: Shape;
}

const msgArb: fc.Arbitrary<Msg> = fc.record({
  sender: fc.constantFrom(...IDS),
  recipient: fc.constantFrom(...IDS),
  at: fc.integer({ min: 0, max: 30 }),
  delay: fc.integer({ min: 0, max: 10 }),
  outcome: fc.constantFrom<Outcome>("received", "garbled", "collision"),
  shape: fc.constantFrom<Shape>("sent-only", "sent-outcome", "arrival-only", "sent-arrival"),
});

function eventsOf(msgs: readonly Msg[]): LedgerEvent[] {
  const events: LedgerEvent[] = [];
  msgs.forEach((m, i) => {
    const id = `m${i}`;
    const sent: LedgerEvent = { kind: "sent", messageId: id, sender: m.sender, recipient: m.recipient, simTime: m.at };
    const arrival: LedgerEvent = {
      kind: "arrival",
      messageId: id,
      sender: m.sender,
      recipient: m.recipient,
      outcome: m.outcome,
      simTime: m.at + m.delay,
    };
    if (m.shape === "sent-only") events.push(sent);
    else if (m.shape === "sent-outcome")
      events.push(sent, { kind: "outcome", messageId: id, outcome: m.outcome, simTime: m.at + m.delay });
    else if (m.shape === "arrival-only") events.push(arrival);
    else events.push(sent, arrival);
  });
  return events;
}

const scenarioInputArb = fc
  .tuple(fc.array(msgArb, { maxLength: 10 }), scenarioArb, participantsArb, cursorArb)
  .chain(([msgs, scenario, participants, at]) =>
    fc.shuffledSubarray(eventsOf(msgs), { minLength: 0 }).map((events) => ({
      msgs,
      events,
      input: { ledger: buildLedger(events), scenario, participants } as WorldlineInput,
      at,
    })),
  );

describe("Property 6: Nothing is drawn that the log cannot know", () => {
  // Feature: seance-replay, Property 6: Nothing is drawn that the log cannot know
  it("draws no line from an arrivals-only sender, one tick per arrival, one notice, and only real sends", () => {
    fc.assert(
      fc.property(scenarioInputArb, ({ events, input, at }) => {
        const layout = layoutWorldlines(input, { at });
        const limited = new Set(input.participants?.filter((p) => p.history === "arrivals-only").map((p) => p.id));
        const sends = new Map(
          events.flatMap((e) => (e.kind === "sent" ? ([[e.messageId, e]] as const) : [])),
        );

        // No diagonal, stub or lost line from an arrivals-only sender.
        for (const s of layout.signals) expect(limited.has(s.from)).toBe(false);

        // Every drawn signal has a real sent event behind it.
        for (const s of layout.signals) {
          const send = sends.get(s.id);
          expect(send).toBeDefined();
          expect(send?.sender).toBe(s.from);
          expect(send?.recipient).toBe(s.to);
          expect(send?.simTime).toBe(s.sentAt);
        }

        // Every arrival from an arrivals-only sender becomes exactly one tick.
        const expected = new Set<string>();
        for (const m of events) {
          if (m.kind === "outcome" || m.kind === "arrival") {
            const sender = m.kind === "arrival" ? m.sender : sends.get(m.messageId)?.sender;
            if (sender !== undefined && limited.has(sender)) expected.add(m.messageId);
          }
        }
        const ticks = layout.arrivals.filter((a) => limited.has(a.from)).map((a) => a.id);
        expect(new Set(ticks).size).toBe(ticks.length);
        expect(new Set(ticks)).toEqual(expected);

        // The limit notice appears exactly once with ticks, never without.
        if (expected.size > 0) {
          expect(layout.limits).toHaveLength(1);
          expect(new Set(layout.limits[0]?.participants)).toEqual(
            new Set(layout.arrivals.filter((a) => limited.has(a.from)).map((a) => a.from)),
          );
        } else {
          expect(layout.limits).toHaveLength(0);
        }
      }),
      RUNS,
    );
  });

  it("holds for arbitrary ledgers with repeated ids and contradictory events", () => {
    fc.assert(
      fc.property(worldlineInputArb, cursorArb, (input, at) => {
        const layout = layoutWorldlines(input, { at });
        const limited = new Set(input.participants?.filter((p) => p.history === "arrivals-only").map((p) => p.id));
        const sentIds = new Set(input.ledger.events.flatMap((e) => (e.kind === "sent" ? [e.messageId] : [])));
        for (const s of layout.signals) {
          expect(limited.has(s.from)).toBe(false);
          expect(sentIds.has(s.id)).toBe(true);
        }
        const hasTicks = layout.arrivals.some((a) => limited.has(a.from));
        expect(layout.limits).toHaveLength(hasTicks ? 1 : 0);
      }),
      RUNS,
    );
  });
});
